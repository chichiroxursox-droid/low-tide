import { BANNED, verifyQuote, type Finding } from "./guard.ts";

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
export function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|nav|footer|template)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
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
  const h = u.hostname.toLowerCase();
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!h.includes(".") || /^[\d.]+$/.test(h) || h.startsWith("[")) return null;
  if (/(^|\.)(localhost|local|internal)$/.test(h)) return null;
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
    const raw = Buffer.concat(chunks).toString("utf8");
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
  const removed: Removed = { mismatch: 0, wrongSite: 0, banned: 0 };
  const check = (quote: string, id: string, fromBrand: boolean, claimHost?: string): SourcePage | keyof Removed => {
    const page = byId.get(sid(id));
    if (!page || !verifyQuote(quote, page.text)) return "mismatch";
    if (own.has(page.id) !== fromBrand || (claimHost !== undefined && page.host === claimHost)) return "wrongSite";
    if (BANNED.test(quote)) return "banned";
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
      const src = check(e.quote, e.sourceId, false, page.host);
      if (typeof src === "string") removed[src]++;
      else evidence.push({ stance: e.stance, quote: e.quote, url: src.url, host: src.host });
    }
    claims.push({ claim: c.claim, quote: c.quote, url: page.url, host: page.host, evidence });
  }
  return { claims, removed };
}
