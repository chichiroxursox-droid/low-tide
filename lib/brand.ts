import { generateText, Output } from "ai";
import { google, type GoogleProviderMetadata } from "@ai-sdk/google";
import { z } from "zod";
import { askGemini, MODEL } from "./check.ts";
import { BANNED, soften, verifyQuote, type Finding } from "./guard.ts";

export type Page = { url: string; host: string; text: string };
export type SourcePage = Page & { id: string };
export type Stance = "backs" | "pushes_back";
export type Picked = {
  ownSites: string[];
  claims: { claim: string; sourceId: string; quote: string; evidence: { stance: Stance; sourceId: string; quote: string }[] }[];
};
export type Evidence = { stance: Stance; quote: string; url: string; host: string };
export type BrandClaim = { claim: string; quote: string; url: string; host: string; evidence: Evidence[] };
export type Removed = { mismatch: number; wrongSite: number; banned: number };
export type BrandCheck = {
  brand: string;
  pagesFound: number;
  pagesRead: number;
  claims: (BrandClaim & { findings: Finding[] })[];
  removed: Removed;
};
export type BrandInput = { name: string; url?: URL };

const ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", hellip: "…",
};

// Plain text of a page, close enough to what a reader sees that a copied sentence is a substring of it.
// Every pattern runs in linear time: an unclosed comment or element runs to the end of the page instead of
// being retried from every later "<", which let a hostile 2 MB page hang the function for minutes.
export function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?(?:-->|$)/g, " ")
    .replace(/<(script|style|noscript|svg|nav|footer|template)(?=[\s/>])[\s\S]*?(?:<\/\1\s*>|$)/gi, " ")
    .replace(/<[^<>]*>/g, " ")
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] !== "#") return ENTITIES[e.toLowerCase()] ?? m;
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

const SCHEME = /^[a-z][a-z\d+.-]*:\/\//i;
const DOMAINISH = /^[\w-]+(\.[\w-]+)+(:\d+)?([/?#]\S*)?$/;

// ponytail: hostname check only. A public name that resolves to a private IP, or a redirect to one,
// still gets fetched. Fine on Vercel functions (no private network); add a DNS check if this ever runs next to internal services.
export function isSafeUrl(input: string): URL | null {
  const s = input.trim();
  if (!SCHEME.test(s) && !DOMAINISH.test(s)) return null;
  let u: URL;
  try {
    u = new URL(SCHEME.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  // A trailing dot ("localhost.") is the same host to DNS, so it must not dodge the checks below.
  const h = u.hostname.toLowerCase().replace(/\.+$/, "");
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!h.includes(".") || /^[\d.]+$/.test(h) || h.startsWith("[")) return null;
  if (/(^|\.)(localhost|localdomain|local|internal)$/.test(h)) return null;
  return u;
}

// A brand name stays a name. Anything that looks like a link must be a safe one, or the input is refused (null).
export function parseBrandInput(input: string): BrandInput | null {
  const s = input.trim();
  if (!SCHEME.test(s) && !DOMAINISH.test(s)) return { name: s };
  const url = isSafeUrl(s);
  return url ? { name: url.hostname.replace(/^www\./, ""), url } : null;
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const MAX_BYTES = 2_000_000;
const MAX_CHARS = 20_000;
const MIN_CHARS = 500;

// Downloads one page as plain text. Anything that isn't a readable HTML or text page comes back null.
export async function readPage(url: string): Promise<Page | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
      headers: { "user-agent": UA, accept: "text/html,text/plain;q=0.9" },
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !res.body || !/text\/(html|plain)|xhtml/i.test(type)) {
      await res.body?.cancel();
      return null;
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    await reader.cancel().catch(() => {});
    // ponytail: charset from the header only. A page that declares it only in a <meta> tag is read as UTF-8.
    let decoder: TextDecoder;
    try {
      decoder = new TextDecoder(/charset="?([\w-]+)/i.exec(type)?.[1] ?? "utf-8");
    } catch {
      decoder = new TextDecoder();
    }
    // stream: true keeps Node off its one-shot latin1 fast path, which reads windows-1252 curly quotes and
    // dashes (0x80-0x9f) as control characters, so quotes containing them would never verify.
    const raw = decoder.decode(Buffer.concat(chunks), { stream: true });
    const text = (/html/i.test(type) ? htmlToText(raw) : raw.replace(/\s+/g, " ").trim()).slice(0, MAX_CHARS);
    if (text.length < MIN_CHARS) return null;
    const final = new URL(res.url || url);
    return { url: final.href, host: final.hostname.replace(/^www\./, ""), text };
  } catch {
    return null;
  }
}

const sid = (s: string) => s.match(/S\d+/i)?.[0].toUpperCase() ?? "";

// Keeps only quotes that are really on the page they cite. Claims must come from the brand's own sites,
// evidence from anyone else. A dropped claim takes its evidence with it (one removal).
export function guardBrand(picked: Picked, pages: SourcePage[]): { claims: BrandClaim[]; removed: Removed } {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const own = new Set(picked.ownSites.map(sid));
  // ponytail: exact host or subdomain of a brand host. A sibling like patagonia.com.hk vs patagonia.com only counts
  // if the model lists it; catching those needs a public-suffix list.
  const ownHosts = pages.filter((p) => own.has(p.id)).map((p) => p.host);
  const onOwnHost = (host: string) => ownHosts.some((h) => host === h || host.endsWith(`.${h}`));
  const removed: Removed = { mismatch: 0, wrongSite: 0, banned: 0 };
  const check = (quote: string, id: string, fromBrand: boolean): SourcePage | keyof Removed => {
    const page = byId.get(sid(id));
    if (!page || !verifyQuote(quote, page.text)) return "mismatch";
    if (fromBrand ? !own.has(page.id) : onOwnHost(page.host)) return "wrongSite";
    if (BANNED.test(quote) || BANNED.test(page.host)) return "banned";
    return page;
  };

  const claims: BrandClaim[] = [];
  for (const c of picked.claims.slice(0, 3)) {
    const page = check(c.quote, c.sourceId, true);
    if (typeof page === "string") {
      removed[page]++;
      continue;
    }
    const evidence: Evidence[] = [];
    for (const e of c.evidence.slice(0, 2)) {
      const src = check(e.quote, e.sourceId, false);
      if (typeof src === "string") removed[src]++;
      else evidence.push({ stance: e.stance, quote: e.quote, url: src.url, host: src.host });
    }
    claims.push({ claim: soften(c.claim), quote: c.quote, url: page.url, host: page.host, evidence });
  }
  return { claims, removed };
}

// Call 1. Search only finds links. Gemini's text is thrown away, and the links come from the
// SDK's sources, never from text the model wrote (it garbles Google's long redirect links).
export async function findSources(query: string): Promise<string[]> {
  const r = await generateText({
    model: google(MODEL),
    tools: { google_search: google.tools.googleSearch({}) },
    prompt: `Search the web for: (a) the official sustainability or environment page of the brand "${query}", and (b) 4 to 6 independent sources that evaluate that brand's environmental claims. Prefer news outlets, NGO reports, certifiers, and regulators over blogs and marketing sites. Briefly describe what each source says.`,
    temperature: 0,
    maxRetries: 1,
  });
  const meta = r.providerMetadata?.google as GoogleProviderMetadata | undefined;
  const urls = [
    ...r.sources.flatMap((s) => (s.sourceType === "url" ? [s.url] : [])),
    ...(meta?.groundingMetadata?.groundingChunks ?? []).flatMap((c) => (c.web?.uri ? [c.web.uri] : [])),
  ];
  return [...new Set(urls)].slice(0, 8);
}

const quoteField = z.string().describe("One continuous passage of 10 to 40 words, copied character for character from that source");
const pickSchema = z.object({
  ownSites: z.array(z.string()).describe('Ids like "S1" of every source that belongs to the brand itself'),
  claims: z.array(
    z.object({
      claim: z.string().describe("Short label for the claim, 3 to 8 words"),
      sourceId: z.string().describe('Id of the brand-owned source quoted, like "S1"'),
      quote: quoteField,
      evidence: z.array(
        z.object({
          stance: z.enum(["backs", "pushes_back"]),
          sourceId: z.string().describe('Id of an independent source, like "S3"'),
          quote: quoteField,
        }),
      ),
    }),
  ),
});

const PICK_SYSTEM = `You compare a brand's environmental claims with independent sources, for a shopper deciding whether to buy from it. You get numbered source pages (S1, S2, ...).

ownSites: the ids of every source that belongs to the brand itself: its main site, group or corporate site, regional sites, and its own reports.
claims: up to 3 distinct environmental claims the brand makes about itself, each quoted from one of its own sources. claim is a short label of 3 to 8 words.
evidence: for each claim, up to 2 passages from sources NOT in ownSites that back that claim up or push back on it. Only use a passage that talks about that specific claim or topic. An empty list is fine.
Every quote is one continuous passage of 10 to 40 words copied character for character from the source you name. No ellipses, no paraphrase, no stitching sentences together.
If none of the sources belongs to the brand, return empty ownSites and claims. Never use the words illegal, violation, or lawsuit.`;

// Call 2. No tools, so structured output works. Gemini only picks and quotes from text we fetched.
export async function pickQuotes(brand: string, pages: SourcePage[]): Promise<Picked> {
  const { output } = await generateText({
    model: google(MODEL),
    system: PICK_SYSTEM,
    prompt: `Brand: ${brand}\n\n` + pages.map((p) => `=== ${p.id} ${p.host} ===\n${p.text}`).join("\n\n"),
    output: Output.object({ schema: pickSchema }),
    temperature: 0,
    providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
    maxRetries: 1,
  });
  return output;
}

const NONE: Removed = { mismatch: 0, wrongSite: 0, banned: 0 };

// The whole brand check. Guides findings come back raw: the route guards them at serve time, like the claim route.
export async function checkBrand(input: BrandInput): Promise<BrandCheck> {
  const [first, found] = await Promise.all([input.url ? readPage(input.url.href) : null, findSources(input.name)]);
  const read = await Promise.all(found.map(readPage));
  const pages: SourcePage[] = [first, ...read]
    .filter((p): p is Page => p !== null)
    .filter((p, i, all) => all.findIndex((q) => q.url === p.url) === i)
    .map((p, i) => ({ ...p, id: `S${i + 1}` }));
  const base = { brand: input.name, pagesFound: found.length + (input.url ? 1 : 0), pagesRead: pages.length };
  if (!pages.length) return { ...base, claims: [], removed: { ...NONE } };

  const { claims, removed } = guardBrand(await pickQuotes(input.name, pages), pages);
  // ponytail: a failed Guides call leaves that card without a Guides reading instead of failing the whole check.
  const withGuides = await Promise.all(
    claims.map(async (c) => ({ ...c, findings: await askGemini(c.quote).catch((): Finding[] => []) })),
  );
  return { ...base, claims: withGuides, removed };
}
