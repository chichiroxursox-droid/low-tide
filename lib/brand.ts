import { generateText, Output } from "ai";
import { google, type GoogleProviderMetadata } from "@ai-sdk/google";
import { z } from "zod";
import { MODEL } from "./check.ts";
import { BANNED, soften, verifyQuote } from "./guard.ts";

export type Page = { url: string; host: string; text: string };
export type SourcePage = Page & { id: string };
export const CHECKS = ["certifications", "climate", "labor", "ratings", "watchdogs"] as const;
export type CheckKey = (typeof CHECKS)[number];
export type Sign = "good" | "red";
export type Mark = "good" | "red" | "both" | "not_found";
export type Verdict = "strong" | "mixed" | "red_flags" | "not_enough";
export type Picked = {
  checks: { check: CheckKey; findings: { sign: Sign; sourceId: string; quote: string; note: string }[] }[];
};
export type Signal = { sign: Sign; quote: string; note: string; url: string; host: string; own: boolean; known: boolean };
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

// Publishers Low Tide quotes first. A site matches its own address or any address under it.
// ponytail: a hand-kept list. A reputable publisher missing from it is still read, as a lesser-known site.
const KNOWN = `
  reuters.com apnews.com bbc.com bbc.co.uk theguardian.com nytimes.com washingtonpost.com wsj.com ft.com bloomberg.com
  economist.com npr.org pbs.org cnbc.com cnn.com nbcnews.com cbsnews.com abcnews.go.com time.com fortune.com axios.com
  politico.com politico.eu theatlantic.com newyorker.com vox.com theverge.com wired.com businessinsider.com
  fastcompany.com latimes.com usatoday.com aljazeera.com dw.com france24.com euronews.com lemonde.fr spiegel.de nrk.no
  abc.net.au cbc.ca independent.co.uk telegraph.co.uk thetimes.co.uk scmp.com japantimes.co.jp straitstimes.com
  voguebusiness.com businessoffashion.com wwd.com just-style.com edie.net trellis.net greenbiz.com esgtoday.com esgdive.com grist.org
  insideclimatenews.org carbonbrief.org theconversation.com
  bcorporation.net fairtrade.net fairtradeamerica.org fairtradecertified.org fairtrade.org.uk bluesign.com fsc.org
  c2ccertified.org global-standard.org oeko-tex.com textileexchange.org fairwear.org fairlabor.org rainforest-alliance.org
  sa-intl.org wrapcompliance.org onepercentfortheplanet.org leatherworkinggroup.com regenorganic.org greenseal.org
  goodonyou.eco fashionrevolution.org cdp.net sciencebasedtargets.org knowthechain.org remakeworld.org ethicalconsumer.org
  worldbenchmarkingalliance.org influencemap.org newclimate.org carbonmarketwatch.org stand.earth changingmarkets.org
  sustainalytics.com msci.com ecovadis.com ceres.org asyousow.org planet-tracker.org climateaction100.org
  transitionpathwayinitiative.org fashionchecker.org baptistworldaid.org.au
  hrw.org amnesty.org business-humanrights.org cleanclothes.org workersrights.org laborrights.org antislavery.org
  walkfree.org ethicaltrade.org labourbehindthelabel.org somo.nl globalwitness.org earthsight.org.uk greenpeace.org
  wwf.org worldwildlife.org panda.org foe.org foe.co.uk sierraclub.org nrdc.org edf.org wri.org wrap.org.uk
  ellenmacarthurfoundation.org ucsusa.org canopyplanet.org mightyearth.org
  ilo.org un.org ohchr.org oecd.org unep.org unicef.org
  canada.ca forbrukertilsynet.no acm.nl agcm.it asa.org.uk konsumentverket.se kkv.fi forbrugerombudsmanden.dk
`.trim().split(/\s+/);
// Governments, regulators and universities, by the address they're registered under: ftc.gov, gov.uk, gouv.fr,
// europa.eu, harvard.edu, ox.ac.uk.
const OFFICIAL = /(^|\.)(gov|mil|edu|europa\.eu|gc\.ca|admin\.ch)$|(^|\.)(gov|gouv|gob|govt|mil|edu|ac)\.[a-z]{2}$/;
// Sites anyone can post to, shops, and essay mills. Never read.
const JUNK = `
  reddit.com quora.com medium.com substack.com pinterest.com facebook.com instagram.com tiktok.com x.com twitter.com
  threads.net youtube.com linkedin.com tumblr.com blogspot.com wordpress.com wixsite.com weebly.com sites.google.com
  fandom.com answers.com amazon.com amazon.co.uk ebay.com etsy.com aliexpress.com alibaba.com temu.com trustpilot.com
  glassdoor.com indeed.com yelp.com sitejabber.com studocu.com coursehero.com bartleby.com ipl.org gradesfixer.com
  ukessays.com studymoose.com edubirdie.com papersowl.com ivypanda.com scribd.com slideshare.net brainly.com chegg.com
  123helpme.com quizlet.com
`.trim().split(/\s+/);

export type Tier = "known" | "other" | "junk";
// Where a page comes from: a known publisher, junk, or any other site.
export function sourceTier(host: string): Tier {
  const h = host.toLowerCase().replace(/\.+$/, "");
  const under = (site: string) => h === site || h.endsWith(`.${site}`);
  if (JUNK.some(under)) return "junk";
  return OFFICIAL.test(h) || KNOWN.some(under) ? "known" : "other";
}
// The brand's own site first, since shops and social sites can be a brand's own (Amazon, Temu).
const kindOf = (host: string, brand: string) => (hostNamesBrand(host, brand) ? "own" : sourceTier(host));

const sid = (s: string) => s.match(/S\d+/i)?.[0].toUpperCase() ?? "";

// Certifications only ever count for a brand (holding none is not a finding), watchdog findings only against it.
const SIGNS: Record<CheckKey, Sign[]> = {
  certifications: ["good"],
  climate: ["good", "red"],
  labor: ["good", "red"],
  ratings: ["good", "red"],
  watchdogs: ["red"],
};
// A brand can't vouch for itself on these: a good sign has to come from a site it doesn't own.
const INDEPENDENT_GOOD: CheckKey[] = ["certifications", "labor", "ratings"];

// Keeps only findings whose quote is really on the page they cite, then marks each of the five checks.
export function guardChecks(picked: Picked, pages: SourcePage[], brand: string): { checks: CheckResult[]; removed: Removed } {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const removed: Removed = { mismatch: 0, offCheck: 0, wrongSite: 0, banned: 0 };

  const checks = CHECKS.map((check): CheckResult => {
    const signals: Signal[] = [];
    for (const f of picked.checks.find((c) => c.check === check)?.findings.slice(0, 3) ?? []) {
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
      const known = sourceTier(page.host) === "known";
      signals.push({ sign: f.sign, quote: f.quote, note: soften(f.note), url: page.url, host: page.host, own: mine, known });
    }
    // Known sources first: a lesser-known site speaks for a check only when no known source does. The brand's own
    // site stays either way, under its own rules above.
    const kept = (signals.some((s) => s.known) ? signals.filter((s) => s.known || s.own) : signals).slice(0, 2);
    const good = kept.some((s) => s.sign === "good");
    const red = kept.some((s) => s.sign === "red");
    return { check, mark: good && red ? "both" : good ? "good" : red ? "red" : "not_found", signals: kept };
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
  certifications: (b) => `Which third-party sustainability certifications does the brand "${b}" hold (B Corp, bluesign, FSC, Cradle to Cradle, GOTS, OEKO-TEX)? Prefer the certifier's own pages and news coverage.`,
  climate: (b) => `Does the brand "${b}" have a climate target validated by the Science Based Targets initiative, and does it publish its greenhouse gas emissions? Include any reports of targets missed or dropped.`,
  labor: (b) => `Have news outlets, audits, or labor rights groups reported child labor, forced labor, unpaid wages, or unsafe factories in the supply chain of the brand "${b}"? How do labor rankings such as KnowTheChain, and accreditations such as Fair Trade, Fair Wear, or the Fair Labor Association, rate how it treats the workers who make its products?`,
  ratings: (b) => `How do independent sustainability ratings score the brand "${b}" (Good On You, CDP, Fashion Transparency Index, or similar)?`,
  watchdogs: (b) => `Has any regulator, consumer authority, or watchdog group acted on or investigated the environmental claims of the brand "${b}"?`,
};
const PREFER = "Prefer regulators, established news outlets, and recognized certifiers, raters, and rights groups. Skip blogs, forums, social media, and shops.";

const LINKS = 4;
const MAX_PAGES = 15;

// Call 1, once per check in parallel. Search only finds links: Gemini's text is thrown away, and the links come
// from the SDK's sources, never from text the model wrote (it garbles Google's long redirect links).
export async function findSources(brand: string, onSearch?: (check: CheckKey, links: number) => void): Promise<string[]> {
  const lists = await Promise.all(
    CHECKS.map(async (check) => {
      const r = await generateText({
        model: google(MODEL),
        tools: { google_search: google.tools.googleSearch({}) },
        prompt: `Search the web. ${SEARCHES[check](brand)} ${PREFER} Briefly describe what each source says.`,
        temperature: 0,
        maxRetries: 1,
      });
      const meta = r.providerMetadata?.google as GoogleProviderMetadata | undefined;
      const urls = [
        ...r.sources.flatMap((s) => (s.sourceType === "url" ? [s.url] : [])),
        ...(meta?.groundingMetadata?.groundingChunks ?? []).flatMap((c) => (c.web?.uri ? [c.web.uri] : [])),
      ];
      return [...new Set(urls)].slice(0, LINKS);
    })
      .map((p) => p.catch((): string[] => [])) // ponytail: a failed search just brings no links for that check
      .map((p, i) => p.then((links) => (onSearch?.(CHECKS[i], links.length), links))),
  );
  // Interleave so every check gets a share of the pages.
  const urls: string[] = [];
  for (let i = 0; i < LINKS; i++) for (const list of lists) if (list[i]) urls.push(list[i]);
  return [...new Set(urls)];
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

Each source is marked as a known source (a regulator, government, university, established news outlet, or recognized certifier, rater, or rights group), the brand's own site, or an other site. For each check, quote known sources first. Quote an other site only for a check that no known source speaks to.

checks: one entry for each check below that at least one source speaks to, with up to 3 findings each, best first.
- certifications: third-party sustainability certifications the brand holds (B Corp, bluesign, FSC, Cradle to Cradle, GOTS, OEKO-TEX). Only good findings: a source confirming a current certification. Not holding a certification is not a finding.
- climate: good if a source shows a climate target validated by the Science Based Targets initiative, or published greenhouse gas emissions; red if a source reports targets missed or dropped, or emissions rising.
- labor: how the people who make the brand's products are treated. red if a source reports child labor, forced labor, unpaid or withheld wages, unsafe factories, or workers punished for organizing in the brand's supply chain; good if a source shows Fair Trade certified production, Fair Wear or Fair Labor Association accreditation, or a high labor ranking such as KnowTheChain.
- ratings: independent sustainability ratings (Good On You, CDP, Fashion Transparency Index, or similar). good for a high rating, red for a low one. Quote the passage that states the rating.
- watchdogs: red if a regulator, consumer authority, or watchdog group acted on or criticized the brand's environmental claims. Only red findings.
Each finding: its sign, the id of the source, a quote, and a note. The quote is one continuous passage of 10 to 40 words copied character for character from that source: no ellipses, no paraphrase, no stitching sentences together. The note is one plain sentence a shopper can follow. It says only what the quote says, with every number and name paired as the quote pairs them.
Only include a finding when the quoted passage itself shows it. The absence of news is not a finding. Never use the words illegal, violation, or lawsuit, and never quote a passage that contains them.`;

const LABEL = { own: "the brand's own site", known: "known source", other: "other site", junk: "other site" };

// Call 2. No tools, so structured output works. Gemini only picks and quotes from text we fetched.
// name is the one the source rules match (ruleName), for telling the brand's own site apart.
export async function pickQuotes(brand: string, pages: SourcePage[], name = brand): Promise<Picked> {
  const { output } = await generateText({
    model: google(MODEL),
    system: PICK_SYSTEM,
    prompt: `Brand: ${brand}\n\n` + pages.map((p) => `=== ${p.id} ${p.host} (${LABEL[kindOf(p.host, name)]}) ===\n${p.text}`).join("\n\n"),
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
const words = (s: string) =>
  s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/&/g, " & ").replace(/[^a-z0-9&]+/g, " ").trim().split(" ").filter(Boolean);

// The brand's name with the spaces squeezed out, in each spelling a page or an address may use: "&" as "and" or left
// out, and a possessive "'s" kept or dropped. "Ben & Jerry's" is benandjerrys, benjerrys, benandjerry or benjerry.
function keys(brand: string): string[] {
  const name = brand.replace(SUFFIXES, "");
  const squashed = [name, name.replace(/['’]s$/i, "")].map((n) => words(n).join(""));
  return [...new Set(squashed.flatMap((k) => [k.replace(/&/g, "and"), k.replace(/&/g, "")]))].filter(Boolean);
}

// Whole words anywhere on the page, read with the spaces between them squeezed out, so "The North Face" names a
// link's "thenorthface" and "Marks and Spencer" names "Marks & Spencer".
// ponytail: a name that is also a common word ("Gap") passes most pages; the pick prompt still asks for passages
// about the brand itself.
export function namesBrand(text: string, brand: string): boolean {
  const ks = keys(brand);
  const longest = Math.max(0, ...ks.map((k) => k.length));
  const t = words(text);
  return ["and", ""].some((amp) =>
    t.some((_, i) => {
      for (let j = i, run = ""; j < t.length && run.length < longest; j++) {
        run += t[j] === "&" ? amp : t[j];
        if (ks.includes(run)) return true;
      }
      return false;
    }),
  );
}

// A site is the brand's own when a label of its address starts with the brand's name ("patagoniaworks.com",
// "allbirds.com.kw", "levi.com" for "Levi's"), "the" or "about" allowed in front ("thenorthface.com",
// "aboutamazon.com"). A name under 4 letters must be the whole label, a company word aside ("hmgroup.com"), so
// "hmrc.gov.uk", "msci.com" and "handmade.com" don't count.
// ponytail: a parent company's site (unilever.com for Dove) is not recognized; that needs an ownership list.
export function hostNamesBrand(host: string, brand: string): boolean {
  const ks = keys(brand);
  if (!ks.length) return false;
  const any = ks.join("|");
  const own = new RegExp(ks.some((k) => k.length < 4) ? `^(${any})(${CORP})?$` : `^(the|about)?(${any})`);
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

// What the loading screen shows, sent as each real step of a live check finishes.
export type Stage =
  | { stage: "search"; check: CheckKey; links: number }
  | { stage: "read"; found: number; read: number }
  | { stage: "named"; pages: number; known: number }
  | { stage: "picked"; findings: number }
  | { stage: "checked"; kept: number; removed: number };

// The whole brand check. The verdict is left to verdictFor, which the route runs at serve time.
export async function checkBrand(input: BrandInput, onStage: (s: Stage) => void = () => {}): Promise<BrandCheck> {
  const [first, found] = await Promise.all([
    input.url ? readPage(input.url.href) : null,
    findSources(input.name, (check, links) => onStage({ stage: "search", check, links })),
  ]);
  const read = await Promise.all(found.map(readPage));
  const pagesFound = found.length + (input.url ? 1 : 0);
  onStage({ stage: "read", found: pagesFound, read: read.filter(Boolean).length + (first ? 1 : 0) });
  // A page that never names the brand can't be evidence about it (a made-up brand otherwise collects generic
  // pages about other companies), and a junk site is never read. The link the shopper pasted is exempt.
  // Known sources and the brand's own site go first, so the page cap never drops them for a lesser-known site.
  const name = ruleName(input);
  const lesser = (p: Page) => Number(kindOf(p.host, name) === "other");
  const pages: SourcePage[] = [first, ...read.filter((p) => p && namesBrand(p.text, name) && kindOf(p.host, name) !== "junk")]
    .filter((p): p is Page => p !== null)
    .filter((p, i, all) => all.findIndex((q) => q.url === p.url) === i)
    .sort((a, b) => lesser(a) - lesser(b))
    .slice(0, MAX_PAGES)
    .map((p, i) => ({ ...p, id: `S${i + 1}` }));
  onStage({ stage: "named", pages: pages.length, known: pages.filter((p) => kindOf(p.host, name) === "known").length });
  const base = { brand: input.name, pagesFound, pagesRead: pages.length };
  if (!pages.length) return { ...base, ...guardChecks({ checks: [] }, [], name) };
  const picked = await pickQuotes(input.name, pages, name);
  onStage({ stage: "picked", findings: picked.checks.reduce((n, c) => n + c.findings.length, 0) });
  const guarded = guardChecks(picked, pages, name);
  const { mismatch, offCheck, wrongSite, banned } = guarded.removed;
  onStage({
    stage: "checked",
    kept: guarded.checks.reduce((n, c) => n + c.signals.length, 0),
    removed: mismatch + offCheck + wrongSite + banned,
  });
  return { ...base, ...guarded };
}
