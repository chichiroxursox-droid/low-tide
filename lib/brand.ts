import { generateText, Output } from "ai";
import { google, type GoogleProviderMetadata } from "@ai-sdk/google";
import { z } from "zod";
import { MODEL } from "./check.ts";
import { BANNED, soften, verifyQuote } from "./guard.ts";

export type Page = { url: string; host: string; text: string };
export type SourcePage = Page & { id: string };
export const CHECKS = ["certifications", "climate", "ratings", "watchdogs"] as const;
export type CheckKey = (typeof CHECKS)[number];
export type Sign = "good" | "red";
export type Mark = "good" | "red" | "both" | "not_found";
export type Verdict = "strong" | "mixed" | "red_flags" | "not_enough";
export type Picked = {
  checks: { check: CheckKey; findings: { sign: Sign; sourceId: string; quote: string; note: string }[] }[];
};
export type Signal = { sign: Sign; quote: string; note: string; url: string; host: string; own: boolean };
export type CheckResult = { check: CheckKey; mark: Mark; signals: Signal[] };
export type Removed = { mismatch: number; offCheck: number; wrongSite: number; banned: number };
export type BrandCheck = { brand: string; pagesFound: number; pagesRead: number; checks: CheckResult[]; removed: Removed };
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

// A brand name stays a name. Without a scheme, only "www." or a path makes it a link, so "L.L.Bean" and "J.Crew"
// stay names (a bare "patagonia.com" is searched as a name too). Anything that looks like a link must be a safe one,
// or the input is refused (null).
export function parseBrandInput(input: string): BrandInput | null {
  const s = input.trim();
  if (!SCHEME.test(s) && !(DOMAINISH.test(s) && /^www\.|[/?#]/i.test(s))) return { name: s };
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

// Certifications only ever count for a brand (holding none is not a finding), watchdog findings only against it.
const SIGNS: Record<CheckKey, Sign[]> = { certifications: ["good"], climate: ["good", "red"], ratings: ["good", "red"], watchdogs: ["red"] };
// A brand can't vouch for itself on these: a good sign has to come from a site it doesn't own.
const INDEPENDENT_GOOD: CheckKey[] = ["certifications", "ratings"];

// Keeps only findings whose quote is really on the page they cite, then marks each of the four checks.
export function guardChecks(picked: Picked, pages: SourcePage[], brand: string): { checks: CheckResult[]; removed: Removed } {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const removed: Removed = { mismatch: 0, offCheck: 0, wrongSite: 0, banned: 0 };

  const checks = CHECKS.map((check): CheckResult => {
    const signals: Signal[] = [];
    for (const f of picked.checks.find((c) => c.check === check)?.findings.slice(0, 2) ?? []) {
      const page = byId.get(sid(f.sourceId));
      if (!page || !verifyQuote(f.quote, page.text)) {
        removed.mismatch++;
        continue;
      }
      if (!SIGNS[check].includes(f.sign)) {
        removed.offCheck++;
        continue;
      }
      const mine = hostNamesBrand(page.host, brand);
      if (mine && f.sign === "good" && INDEPENDENT_GOOD.includes(check)) {
        removed.wrongSite++;
        continue;
      }
      // A host joins words with no break between them ("aboutlawsuits.com"), so it is searched without word boundaries.
      if (BANNED.test(f.quote) || /illegal|violation|lawsuit/i.test(page.host)) {
        removed.banned++;
        continue;
      }
      signals.push({ sign: f.sign, quote: f.quote, note: soften(f.note), url: page.url, host: page.host, own: mine });
    }
    const good = signals.some((s) => s.sign === "good");
    const red = signals.some((s) => s.sign === "red");
    return { check, mark: good && red ? "both" : good ? "good" : red ? "red" : "not_found", signals };
  });
  return { checks, removed };
}

// The verdict is a rule over the marks, never the model's opinion.
export function verdictFor(checks: CheckResult[]): { verdict: Verdict; good: number; red: number } {
  const count = (m: Mark) => checks.filter((c) => c.mark === m).length;
  const good = count("good");
  const red = count("red");
  const both = count("both");
  const evidence = checks.length - count("not_found");
  const verdict: Verdict =
    evidence < 2 ? "not_enough" : red > 0 && red >= good ? "red_flags" : good >= 3 && red === 0 && both === 0 ? "strong" : "mixed";
  return { verdict, good, red };
}

const SEARCHES: Record<CheckKey, (brand: string) => string> = {
  certifications: (b) => `Which third-party sustainability certifications does the brand "${b}" hold (B Corp, Fair Trade, bluesign, FSC, Cradle to Cradle, GOTS)? Prefer the certifier's own pages and news coverage.`,
  climate: (b) => `Does the brand "${b}" have a climate target validated by the Science Based Targets initiative, and does it publish its greenhouse gas emissions? Include any reports of targets missed or dropped.`,
  ratings: (b) => `How do independent sustainability ratings score the brand "${b}" (Good On You, CDP, Fashion Transparency Index, or similar)?`,
  watchdogs: (b) => `Has any regulator, consumer authority, or watchdog group acted on or investigated the environmental claims of the brand "${b}"?`,
};

// Call 1, once per check in parallel. Search only finds links: Gemini's text is thrown away, and the links come
// from the SDK's sources, never from text the model wrote (it garbles Google's long redirect links).
export async function findSources(brand: string): Promise<string[]> {
  const lists = await Promise.all(
    CHECKS.map(async (check) => {
      const r = await generateText({
        model: google(MODEL),
        tools: { google_search: google.tools.googleSearch({}) },
        prompt: `Search the web. ${SEARCHES[check](brand)} Briefly describe what each source says.`,
        temperature: 0,
        maxRetries: 1,
      });
      const meta = r.providerMetadata?.google as GoogleProviderMetadata | undefined;
      const urls = [
        ...r.sources.flatMap((s) => (s.sourceType === "url" ? [s.url] : [])),
        ...(meta?.groundingMetadata?.groundingChunks ?? []).flatMap((c) => (c.web?.uri ? [c.web.uri] : [])),
      ];
      return [...new Set(urls)].slice(0, 4);
    }).map((p) => p.catch((): string[] => [])), // ponytail: a failed search just brings no links for that check
  );
  // Interleave so every check gets a share of the 12 pages.
  const urls: string[] = [];
  for (let i = 0; i < 4; i++) for (const list of lists) if (list[i]) urls.push(list[i]);
  return [...new Set(urls)].slice(0, 12);
}

const quoteField = z.string().describe("One continuous passage of 10 to 40 words, copied character for character from that source");
const pickSchema = z.object({
  checks: z.array(
    z.object({
      check: z.enum(CHECKS),
      findings: z.array(
        z.object({
          sign: z.enum(["good", "red"]),
          sourceId: z.string().describe('Id of the source quoted, like "S3"'),
          quote: quoteField,
          note: z.string().describe("One plain sentence for a shopper on what this passage shows"),
        }),
      ),
    }),
  ),
});

const PICK_SYSTEM = `You check whether a brand's sustainability holds up, for a shopper deciding whether to buy from it. You get numbered source pages (S1, S2, ...). Use only what these pages say. Every finding must be about the brand named in the prompt: a passage about another company, or about the topic in general, is not a finding.

checks: one entry for each check below that at least one source speaks to, with up to 2 findings each.
- certifications: third-party sustainability certifications the brand holds (B Corp, Fair Trade, bluesign, FSC, Cradle to Cradle, GOTS). Only good findings: a source confirming a current certification. Not holding a certification is not a finding.
- climate: good if a source shows a climate target validated by the Science Based Targets initiative, or published greenhouse gas emissions; red if a source reports targets missed or dropped, or emissions rising.
- ratings: independent sustainability ratings (Good On You, CDP, Fashion Transparency Index, or similar). good for a high rating, red for a low one. Quote the passage that states the rating.
- watchdogs: red if a regulator, consumer authority, or watchdog group acted on or criticized the brand's environmental claims. Only red findings.
Each finding: its sign, the id of the source, a quote, and a note. The quote is one continuous passage of 10 to 40 words copied character for character from that source: no ellipses, no paraphrase, no stitching sentences together. The note is one plain sentence a shopper can follow.
Only include a finding when the quoted passage itself shows it. The absence of news is not a finding. Never use the words illegal, violation, or lawsuit.`;

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

const CORP = "inc|co|company|corp|corporation|ltd|llc|plc|group|gmbh";
// A company word at the end of the name only, with the "&" or comma before it: "Levi Strauss & Co." but not "Co-op".
const SUFFIXES = new RegExp(`[\\s,&]*\\b(${CORP})\\b\\.?$`, "i");
// Lowercased words, accents and punctuation stripped. "&" stays a word of its own, so "H&M" and "H & M" match.
const words = (s: string) => ` ${s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/&/g, " & ").replace(/[^a-z0-9&]+/g, " ").trim()} `;

// ponytail: whole-word match anywhere on the page, so a name that is also a common word ("Gap") passes most pages;
// the pick prompt still asks for passages about the brand itself.
export function namesBrand(text: string, brand: string): boolean {
  const name = words(brand.replace(SUFFIXES, ""));
  return name.trim() !== "" && words(text).includes(name);
}

// A site is the brand's own when a label of its address starts with the brand's name ("patagoniaworks.com",
// "allbirds.com.kw"), "the" or "about" allowed in front ("thenorthface.com", "aboutamazon.com"). A name under
// 4 letters must be the whole label, a company word aside ("hmgroup.com"), so "hmrc.gov.uk" and "msci.com" don't count.
// ponytail: a parent company's site (unilever.com for Dove) is not recognized; that needs an ownership list.
export function hostNamesBrand(host: string, brand: string): boolean {
  const key = words(brand.replace(SUFFIXES, "")).replace(/[^a-z0-9]/g, "");
  if (!key) return false;
  const own = new RegExp(key.length < 4 ? `^${key}(${CORP})?$` : `^(the|about)?${key}`);
  return host
    .toLowerCase()
    .split(".")
    .some((label) => own.test(label.replace(/-/g, "")));
}

// The name the source rules match. A link, or a bare domain typed as a name, is named by the label its site is
// registered under: "www2.hm.com" is "hm", "corporate.walmart.com" is "walmart", "coop.co.uk" is "coop".
// ponytail: a name counts as a domain when it ends in a 2 or 3 letter part, so "L.L.Bean" and "J.Crew" stay names
// but "Dr.Oz" would be read as a domain. A site registered under another word ("aboutamazon.com") keeps that word as the name.
export function ruleName(input: BrandInput): string {
  const host = input.url?.hostname ?? (/^[\w-]+(\.[\w-]+)*\.[a-z]{2,3}$/i.test(input.name) ? input.name : "");
  if (!host) return input.name;
  const labels = host.toLowerCase().replace(/\.+$/, "").split(".");
  const tld = labels.pop()!;
  if (tld.length === 2 && labels.length > 1 && /^(co|com|org|net|ac|gov|edu)$/.test(labels.at(-1)!)) labels.pop();
  return labels.at(-1)!;
}

// The whole brand check. The verdict is left to verdictFor, which the route runs at serve time.
export async function checkBrand(input: BrandInput): Promise<BrandCheck> {
  const [first, found] = await Promise.all([input.url ? readPage(input.url.href) : null, findSources(input.name)]);
  const read = await Promise.all(found.map(readPage));
  // A page that never names the brand can't be evidence about it (a made-up brand otherwise collects generic
  // pages about other companies). The link the shopper pasted is exempt.
  const name = ruleName(input);
  const pages: SourcePage[] = [first, ...read.filter((p) => p && namesBrand(p.text, name))]
    .filter((p): p is Page => p !== null)
    .filter((p, i, all) => all.findIndex((q) => q.url === p.url) === i)
    .map((p, i) => ({ ...p, id: `S${i + 1}` }));
  const base = { brand: input.name, pagesFound: found.length + (input.url ? 1 : 0), pagesRead: pages.length };
  if (!pages.length) return { ...base, ...guardChecks({ checks: [] }, [], name) };
  return { ...base, ...guardChecks(await pickQuotes(input.name, pages), pages, name) };
}
