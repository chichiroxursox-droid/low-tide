# Brand Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Check a brand" mode to Low Tide: a shopper types a brand name or link, and sees the brand's own green claims next to what independent sources say, with every quote checked word for word against the page it came from.

**Architecture:** Two Gemini calls per brand. Call 1 uses Google Search only to find source links (its text is discarded). The server downloads those pages itself, then Call 2 (no tools, structured output) picks claims and evidence and quotes them from the text we hand it. A pure guard (`guardBrand`) checks each quote against the page it cites. Each surviving claim then gets the existing Green Guides reading. Samples are saved fixtures, like the claim samples.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind 4, `ai` 7.0.116, `@ai-sdk/google` 4.0.82 (`google.tools.googleSearch`), `zod` 4, `node --test`.

**Spec:** `docs/superpowers/specs/2026-09-26-brand-mode-design.md`

## Global Constraints

- No new dependencies. `package.json` dependencies stay exactly as they are.
- Model is `MODEL` from `lib/check.ts` (`gemini-2.5-flash`). Never hardcode another model.
- AI SDK v7 has no `generateObject`. Structured output is `generateText({ output: Output.object({ schema }) })`. On 2.5 Flash, `tools` and `output` cannot be in the same call.
- Files in `lib/` and `scripts/` import each other with relative paths ending in `.ts`, and JSON with `with { type: "json" }`, so `node` runs them directly. Files in `app/` import with `@/lib/...`.
- The words illegal, violation and lawsuit never appear in UI copy. The regex that lists them lives only in `lib/guard.ts` (plus the existing model prompts in `lib/check.ts`).
- No em dashes in UI copy, README, or DEVPOST.md. In code, write the character as `—` if it is ever needed.
- Footer text stays exactly: "Low Tide reads your claim against the FTC Green Guides (16 CFR Part 260). It is not legal advice. Every quote is checked word for word against the Guides before it is shown." In brand mode only, append: " Brand and source quotes are checked word for word against the page they came from."
- Every API path returns JSON, never a 500.
- Claim mode must look and behave exactly as in `v1`.
- Tests: `npm test > .tmp/test.txt 2>&1; tail -5 .tmp/test.txt`, then read failures only. `.tmp/` is disposable (create it if missing; it is not committed: add `.tmp/` to `.gitignore` in Task 1).
- Every commit message ends with a blank line then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A link typed without a scheme ("patagonia.com/sustainability") is treated as a link and fetched over https, while "H&M" or "Patagonia: Worn Wear" stay brand names. Pinned by the `parseBrandInput` test in Task 2.
2. Sources that are PDFs, 404s, redirects, near-empty pages, or multi-megabyte pages are skipped or capped and never crash the check. Pinned by the `readPage` local-server test in Task 2.
3. Gemini cites ids sloppily ("[S1]", "s1", " S2 "); they still match. Pinned by the sloppy-ids test in Task 2.
4. A brand nobody has written about gets "Couldn't find enough about X to check", never invented cards. Pinned by the empty-ownSites unit test in Task 2 and the made-up-brand curl in Task 4.
5. Sample names typed in any case ("h&m", "PATAGONIA") are served from the fixture with no API call. Pinned by the curl checks in Task 4.

## Spec deltas (decided while planning)

- The removal reason "notIndependent" is named `wrongSite`: it covers evidence from the brand's own site and a claim quoted from a site that isn't the brand's.
- `removedWhy` gains `guides`: Guides quotes dropped by `guardFindings` at serve time.
- `checkBrand` stores the raw Guides findings from `askGemini`; the route runs `guardFindings` on them at serve time for both live and sample results, exactly like the claim route.

## File map

| File | Change | Responsibility |
|---|---|---|
| `lib/guard.ts` | modify | Add `BANNED`, `soften`, `Shown`, `present` (shared by both routes) |
| `lib/guard.test.ts` | modify | Tests for the new helpers |
| `app/api/check/route.ts` | modify | Use `present` from `lib/guard.ts`; behavior unchanged |
| `lib/brand.ts` | create | Brand pipeline: input parsing, page reading, guard, Gemini calls, `checkBrand` |
| `lib/brand.test.ts` | create | Pure-function and local-server tests |
| `scripts/seed-brands.ts` | create | Writes `fixtures/brands.json` from a real run |
| `fixtures/brands.json` | create (generated) | Saved Patagonia and H&M results |
| `app/api/brand/route.ts` | create | POST endpoint, samples, offline path, serve-time Guides guard |
| `app/page.tsx` | modify | Mode switch, brand form, brand cards, `FindingCard` extraction, footer sentence |
| `.gitignore` | modify | Add `.tmp/` |

---

### Task 1: Shared helpers in `lib/guard.ts`

**Files:**
- Modify: `lib/guard.ts` (append after `guardFindings`)
- Modify: `lib/guard.test.ts` (append tests, extend import)
- Modify: `app/api/check/route.ts` (remove local `soften`, use `present`)
- Modify: `.gitignore` (append `.tmp/`)

**Interfaces:**
- Consumes: `Finding`, `Guide`, `locateQuote` already in `lib/guard.ts`.
- Produces: `BANNED: RegExp` (no `g` flag), `soften(s: string): string`, `type Shown = Finding & { title: string; url: string; context: ReturnType<typeof locateQuote> }`, `present(findings: Finding[], guides: Guide[]): Shown[]`.

- [ ] **Step 1: Write the failing tests.** Change the import line of `lib/guard.test.ts` to:

```ts
import { verifyQuote, guardFindings, locateQuote, BANNED, soften, present, type Finding } from "./guard.ts";
```

and append:

```ts
test("BANNED catches the three words and keeps no state between calls", () => {
  assert.equal(BANNED.test("They face a lawsuit"), true);
  assert.equal(BANNED.test("They face a lawsuit"), true);
  assert.equal(BANNED.test("a clear Violation of trust"), true);
  assert.equal(BANNED.test("sold illegally"), true);
  assert.equal(BANNED.test("lawful and legal"), false);
});

test("soften leaves none of the banned words behind", () => {
  const out = soften("Illegal, illegally, violations and a lawsuit");
  assert.equal(BANNED.test(out), false);
  assert.equal(soften("an illegal claim"), "an not allowed claim");
});

test("present adds the section title, url and highlight, and softens why", () => {
  const [shown] = present(
    [{ phrase: "biodegradable", section: "260.8", verdict: "needs_qualification", why: "This is illegal.", quote: REAL }],
    guides,
  );
  assert.equal(shown.title, guides.find((g) => g.section === "260.8")!.title);
  assert.ok(shown.url.startsWith("https://"));
  assert.equal(shown.context?.match, REAL);
  assert.equal(BANNED.test(shown.why), false);
});
```

- [ ] **Step 2: Run tests to verify they fail.** `mkdir -p .tmp && npm test > .tmp/test.txt 2>&1; tail -5 .tmp/test.txt`. Expected: FAIL, `BANNED`/`soften`/`present` not exported.

- [ ] **Step 3: Implement.** Append to `lib/guard.ts`:

```ts
// The words the UI must never show (CLAUDE.md hard rules). No g flag, so .test() keeps no lastIndex state.
export const BANNED = /\b(illegal(ly)?|violations?|lawsuits?)\b/i;

// Safety net for model prose, in case it slips.
export const soften = (s: string) =>
  s
    .replace(/\billegally\b/gi, "improperly")
    .replace(/\billegal\b/gi, "not allowed")
    .replace(/\bviolations?\b/gi, "problem")
    .replace(/\blawsuits?\b/gi, "dispute");

export type Shown = Finding & { title: string; url: string; context: ReturnType<typeof locateQuote> };

// What the page needs for each verified finding: section title and link, the highlight, and softened prose.
export function present(findings: Finding[], guides: Guide[]): Shown[] {
  return findings.map((f) => {
    const g = guides.find((x) => x.section === f.section);
    return {
      ...f,
      why: soften(f.why),
      title: g?.title ?? "",
      url: g?.url ?? "",
      context: g ? locateQuote(f.quote, g.text) : null,
    };
  });
}
```

In `app/api/check/route.ts`: delete the `soften` const and its comment; change the guard import to `import { guardFindings, present, type Finding } from "@/lib/guard";` (drop `locateQuote`); replace the `findings: findings.map((f) => { ... })` block with `findings: present(findings, guides),`. Append `.tmp/` on its own line to `.gitignore`.

- [ ] **Step 4: Run tests and type check.** `npm test > .tmp/test.txt 2>&1; tail -5 .tmp/test.txt` (expected: all pass, 10 tests) and `npx tsc --noEmit` (expected: no output).

- [ ] **Step 5: Commit.**

```bash
git add lib/guard.ts lib/guard.test.ts app/api/check/route.ts .gitignore
git commit -m "Share banned-word guard and finding presenter across routes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `lib/brand.ts` pure parts and page reader

**Files:**
- Create: `lib/brand.ts`
- Create: `lib/brand.test.ts`

**Interfaces:**
- Consumes: `BANNED`, `verifyQuote`, `type Finding` from `./guard.ts`.
- Produces (exported from `lib/brand.ts`):
  - `type Page = { url: string; host: string; text: string }`
  - `type SourcePage = Page & { id: string }` (id is `"S1"`, `"S2"`, ...)
  - `type Stance = "backs" | "pushes_back"`
  - `type Picked = { ownSites: string[]; claims: { claim: string; sourceId: string; quote: string; evidence: { stance: Stance; sourceId: string; quote: string }[] }[] }`
  - `type Evidence = { stance: Stance; quote: string; url: string; host: string }`
  - `type BrandClaim = { claim: string; quote: string; url: string; host: string; evidence: Evidence[] }`
  - `type Removed = { mismatch: number; wrongSite: number; banned: number }`
  - `type BrandCheck = { brand: string; pagesFound: number; pagesRead: number; claims: (BrandClaim & { findings: Finding[] })[]; removed: Removed }`
  - `type BrandInput = { name: string; url?: URL }`
  - `htmlToText(html: string): string`
  - `isSafeUrl(input: string): URL | null`
  - `parseBrandInput(input: string): BrandInput | null` (null means "looks like a link but is not safe")
  - `readPage(url: string): Promise<Page | null>`
  - `guardBrand(picked: Picked, pages: SourcePage[]): { claims: BrandClaim[]; removed: Removed }`

- [ ] **Step 1: Write the failing tests.** Create `lib/brand.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { htmlToText, isSafeUrl, parseBrandInput, readPage, guardBrand, type Picked, type SourcePage } from "./brand.ts";
import { verifyQuote } from "./guard.ts";

const CLAIM = "We repair more than 100,000 items a year so our clothes stay in use for as long as possible";
const BACKS = "An independent audit found the repair program kept more garments in use than any other retailer it surveyed";
const PUSH = "Critics say a repair program cannot offset the emissions from making millions of new jackets every single year";
const LEGAL = "The company settled a lawsuit over how it marketed recycled materials in its outdoor clothing line";

const page = (id: string, host: string, text: string): SourcePage => ({
  id,
  url: `https://${host}/${id}`,
  host,
  text: `Intro text here. ${text}. Closing text here.`,
});
const PAGES = [
  page("S1", "brand.example", CLAIM),
  page("S2", "news.example", BACKS),
  page("S3", "ngo.example", PUSH),
  page("S4", "brand.example", BACKS), // the brand's own host, but not listed in ownSites
  page("S5", "law.example", LEGAL),
];
type Claim = Picked["claims"][number];
const pick = (evidence: Claim["evidence"], over: Partial<Claim> = {}, ownSites = ["S1"]): Picked => ({
  ownSites,
  claims: [{ claim: "Repairs keep clothes in use", sourceId: "S1", quote: CLAIM, evidence, ...over }],
});

test("htmlToText drops scripts, styles, nav, footer and comments, and decodes entities", () => {
  const html = `<html><head><style>p { color: red }</style><script>var hidden = "do not show this";</script></head>
<body><nav>Menu Shop Stories</nav><!-- a comment --><p>We&rsquo;re cutting   emissions &amp; waste</p>
<p>across&nbsp;every store we run, starting this year &#8212; and &#x2019;next&#x2019;.</p><footer>Footer links</footer></body></html>`;
  const text = htmlToText(html);
  for (const gone of ["do not show", "Menu Shop", "a comment", "Footer links", "color: red", "<p>"]) {
    assert.ok(!text.includes(gone), gone);
  }
  assert.ok(text.includes("—"));
  assert.equal(verifyQuote("We’re cutting emissions & waste across every store we run, starting this year", text), true);
});

test("guardBrand keeps a real claim and its real evidence", () => {
  const { claims, removed } = guardBrand(
    pick([
      { stance: "backs", sourceId: "S2", quote: BACKS },
      { stance: "pushes_back", sourceId: "S3", quote: PUSH },
    ]),
    PAGES,
  );
  assert.deepEqual(removed, { mismatch: 0, wrongSite: 0, banned: 0 });
  assert.equal(claims.length, 1);
  assert.equal(claims[0].url, "https://brand.example/S1");
  assert.equal(claims[0].host, "brand.example");
  assert.deepEqual(
    claims[0].evidence.map((e) => [e.stance, e.host]),
    [
      ["backs", "news.example"],
      ["pushes_back", "ngo.example"],
    ],
  );
});

test("guardBrand drops a claim quote with one word changed, evidence and all", () => {
  const { claims, removed } = guardBrand(
    pick([{ stance: "backs", sourceId: "S2", quote: BACKS }], { quote: CLAIM.replace("repair", "recycle") }),
    PAGES,
  );
  assert.equal(claims.length, 0);
  assert.deepEqual(removed, { mismatch: 1, wrongSite: 0, banned: 0 });
});

test("guardBrand drops evidence that cites a source id that doesn't exist", () => {
  const { claims, removed } = guardBrand(pick([{ stance: "backs", sourceId: "S9", quote: BACKS }]), PAGES);
  assert.equal(claims[0].evidence.length, 0);
  assert.equal(removed.mismatch, 1);
});

test("guardBrand drops evidence from the brand's own sites and claims from other sites", () => {
  const own = guardBrand(
    pick([
      { stance: "backs", sourceId: "S1", quote: CLAIM }, // listed in ownSites
      { stance: "backs", sourceId: "S4", quote: BACKS }, // same host as the claim
    ]),
    PAGES,
  );
  assert.equal(own.claims[0].evidence.length, 0);
  assert.equal(own.removed.wrongSite, 2);
  const notTheirs = guardBrand(pick([], { sourceId: "S2", quote: BACKS }), PAGES);
  assert.equal(notTheirs.claims.length, 0);
  assert.equal(notTheirs.removed.wrongSite, 1);
});

test("guardBrand drops quotes that use a banned word", () => {
  const { claims, removed } = guardBrand(pick([{ stance: "pushes_back", sourceId: "S5", quote: LEGAL }]), PAGES);
  assert.equal(claims[0].evidence.length, 0);
  assert.equal(removed.banned, 1);
});

test("guardBrand accepts sloppy source ids", () => {
  const { claims } = guardBrand(
    pick([{ stance: "backs", sourceId: " S2 ", quote: BACKS }], { sourceId: "[S1]" }, ["s1"]),
    PAGES,
  );
  assert.equal(claims.length, 1);
  assert.equal(claims[0].evidence.length, 1);
});

test("guardBrand returns nothing when no source belongs to the brand", () => {
  const { claims, removed } = guardBrand(pick([{ stance: "backs", sourceId: "S2", quote: BACKS }], {}, []), PAGES);
  assert.equal(claims.length, 0);
  assert.equal(removed.wrongSite, 1);
});

test("guardBrand keeps at most 3 claims and 2 evidence items each", () => {
  const ev = [
    { stance: "backs" as const, sourceId: "S2", quote: BACKS },
    { stance: "pushes_back" as const, sourceId: "S3", quote: PUSH },
    { stance: "backs" as const, sourceId: "S2", quote: BACKS },
  ];
  const one = pick(ev).claims[0];
  const { claims } = guardBrand({ ownSites: ["S1"], claims: [one, one, one, one] }, PAGES);
  assert.equal(claims.length, 3);
  assert.equal(claims[0].evidence.length, 2);
});

test("isSafeUrl allows public web pages and refuses everything else", () => {
  assert.equal(isSafeUrl("https://example.com/x")?.href, "https://example.com/x");
  assert.equal(isSafeUrl("patagonia.com/sustainability")?.href, "https://patagonia.com/sustainability");
  for (const bad of [
    "http://127.0.0.1",
    "http://localhost:3000",
    "file:///etc/passwd",
    "ftp://x.com",
    "http://[::1]/",
    "http://2130706433/",
    "https://printer.local",
    "http://metadata.google.internal",
    "Patagonia",
  ]) {
    assert.equal(isSafeUrl(bad), null, bad);
  }
});

test("parseBrandInput tells brand names from links", () => {
  assert.deepEqual(parseBrandInput("H&M"), { name: "H&M" });
  assert.deepEqual(parseBrandInput("  Patagonia: Worn Wear "), { name: "Patagonia: Worn Wear" });
  const link = parseBrandInput("www.patagonia.com/our-footprint")!;
  assert.equal(link.name, "patagonia.com");
  assert.equal(link.url?.href, "https://www.patagonia.com/our-footprint");
  assert.equal(parseBrandInput("http://127.0.0.1/admin"), null);
});

test("readPage reads HTML, follows redirects, and skips PDFs, errors, thin and huge pages", async () => {
  const body = `<p>${"Real sentence about recycled fabric in our jackets. ".repeat(20)}</p>`;
  const server = http.createServer((req, res) => {
    if (req.url === "/page") res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(body);
    else if (req.url === "/moved") res.writeHead(302, { location: "/page" }).end();
    else if (req.url === "/report.pdf") res.writeHead(200, { "content-type": "application/pdf" }).end("%PDF-1.4 ".repeat(200));
    else if (req.url === "/thin") res.writeHead(200, { "content-type": "text/html" }).end("<p>Too short.</p>");
    else if (req.url === "/huge") res.writeHead(200, { "content-type": "text/html" }).end(`<p>${"word ".repeat(1_000_000)}</p>`);
    else res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const ok = await readPage(`${base}/page`);
    assert.ok(ok?.text.includes("recycled fabric"));
    assert.equal(ok?.host, "127.0.0.1");
    assert.equal((await readPage(`${base}/moved`))?.url, `${base}/page`);
    assert.equal(await readPage(`${base}/report.pdf`), null);
    assert.equal(await readPage(`${base}/thin`), null);
    assert.equal(await readPage(`${base}/missing`), null);
    const huge = await readPage(`${base}/huge`);
    assert.ok(huge && huge.text.length <= 20_000);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});
```

- [ ] **Step 2: Run tests to verify they fail.** `npm test > .tmp/test.txt 2>&1; tail -5 .tmp/test.txt`. Expected: FAIL, cannot find module `./brand.ts`.

- [ ] **Step 3: Implement.** Create `lib/brand.ts`:

```ts
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
```

- [ ] **Step 4: Run tests and type check.** `npm test > .tmp/test.txt 2>&1; tail -5 .tmp/test.txt` (expected: all pass, 22 tests) and `npx tsc --noEmit` (expected: no output).

- [ ] **Step 5: Commit.**

```bash
git add lib/brand.ts lib/brand.test.ts
git commit -m "Brand mode: input parsing, page reader and quote guard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Gemini calls, `checkBrand`, and the brand fixtures

**Files:**
- Modify: `lib/brand.ts` (add imports at top; append functions)
- Create: `scripts/seed-brands.ts`
- Create (generated): `fixtures/brands.json`

**Interfaces:**
- Consumes: `askGemini(claim: string): Promise<Finding[]>` and `MODEL` from `./check.ts`; `readPage`, `guardBrand`, types from Task 2.
- Produces: `findSources(query: string): Promise<string[]>`, `pickQuotes(brand: string, pages: SourcePage[]): Promise<Picked>`, `checkBrand(input: BrandInput): Promise<BrandCheck>`; `fixtures/brands.json` shaped `{ model: string, savedOn: "YYYY-MM-DD", brands: { "Patagonia": BrandCheck, "H&M": BrandCheck } }`.

No unit test: these call Gemini. They are verified by the seed run below and by the route checks in Task 4.

- [ ] **Step 1: Add imports** at the top of `lib/brand.ts`, above the existing guard import:

```ts
import { generateText, Output } from "ai";
import { google, type GoogleProviderMetadata } from "@ai-sdk/google";
import { z } from "zod";
import { askGemini, MODEL } from "./check.ts";
```

- [ ] **Step 2: Append the Gemini calls and pipeline** to `lib/brand.ts`:

```ts
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
```

- [ ] **Step 3: Type check and rerun unit tests.** `npx tsc --noEmit` (expected: no output; if the `providerMetadata` cast is rejected, cast through `unknown`) and `npm test > .tmp/test.txt 2>&1; tail -5 .tmp/test.txt` (expected: 22 pass).

- [ ] **Step 4: Create `scripts/seed-brands.ts`:**

```ts
// Saves a real brand check for the sample chips so brand mode works with no API key.
// Run: node --env-file=.env.local scripts/seed-brands.ts
import fs from "node:fs";
import { checkBrand, parseBrandInput } from "../lib/brand.ts";
import { MODEL } from "../lib/check.ts";

const SAMPLES = ["Patagonia", "H&M"];

const brands: Record<string, unknown> = {};
for (const name of SAMPLES) {
  const r = await checkBrand(parseBrandInput(name)!);
  const evidence = r.claims.reduce((n, c) => n + c.evidence.length, 0);
  console.log(`${name}: read ${r.pagesRead}/${r.pagesFound} pages, ${r.claims.length} claims, ${evidence} evidence, removed`, r.removed);
  brands[name] = r;
}
fs.writeFileSync(
  "fixtures/brands.json",
  JSON.stringify({ model: MODEL, savedOn: new Date().toISOString().slice(0, 10), brands }, null, 2) + "\n",
);
```

- [ ] **Step 5: Run the seed (paid, about 10 Gemini calls).** `node --env-file=.env.local scripts/seed-brands.ts 2>&1 | grep -v ExperimentalWarning`. Expected: both brands report at least 2 claims and at least 2 evidence items in total. If a brand comes back thinner than that, run the seed once more. If it is still thin, stop and report the numbers; do not edit the fixture by hand, and do not run it a third time.

- [ ] **Step 6: Inspect the fixture.** Confirm `fixtures/brands.json` has `savedOn` equal to today, both brand keys, claim quotes from brand-owned hosts, evidence from other hosts, and that `grep -ciE 'illegal|violation|lawsuit' fixtures/brands.json` prints 0 outside Guides `why` text (the route softens `why`; quotes must be clean).

- [ ] **Step 7: Commit.**

```bash
git add lib/brand.ts scripts/seed-brands.ts fixtures/brands.json
git commit -m "Brand mode: Gemini search and pick calls, saved Patagonia and H&M samples

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `/api/brand` route

**Files:**
- Create: `app/api/brand/route.ts`

**Interfaces:**
- Consumes: `checkBrand`, `parseBrandInput`, `type BrandCheck` from `@/lib/brand`; `guardFindings`, `present` from `@/lib/guard`; `MODEL` from `@/lib/check`; `@/fixtures/brands.json`; `@/lib/guides.json`.
- Produces: `POST /api/brand` with body `{ brand: string }`, response `{ model, brand?, source?: "sample" | "live", savedOn?: string, pagesFound, pagesRead, claims: (BrandClaim & { findings: Shown[] })[], removed: number, removedWhy: { mismatch, wrongSite, banned, guides }, error?: string }`.

- [ ] **Step 1: Create `app/api/brand/route.ts`:**

```ts
import { z } from "zod";
import guides from "@/lib/guides.json";
import fixtures from "@/fixtures/brands.json";
import { MODEL } from "@/lib/check";
import { checkBrand, parseBrandInput, type BrandCheck } from "@/lib/brand";
import { guardFindings, present } from "@/lib/guard";

const Body = z.object({ brand: z.string().trim().min(2).max(300) });

const samples = fixtures.brands as unknown as Record<string, BrandCheck>;
const NONE = { mismatch: 0, wrongSite: 0, banned: 0, guides: 0 };

const reply = (data: object, status = 200) =>
  Response.json({ model: MODEL, claims: [], removed: 0, removedWhy: NONE, pagesFound: 0, pagesRead: 0, ...data }, { status });

export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return reply({ error: "Type a brand name or a link, 2 to 300 characters." }, 400);
    const text = parsed.data.brand;
    const input = parseBrandInput(text);
    if (!input) return reply({ error: "That link can't be checked. Use a public http or https page." }, 400);

    let raw: BrandCheck;
    let source: "sample" | "live";
    const hit = Object.keys(samples).find((k) => k.toLowerCase() === text.toLowerCase());
    if (hit) {
      raw = samples[hit];
      source = "sample";
    } else if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return reply({ brand: input.name, error: "Live checks are offline right now. The sample brands still work." });
    } else {
      raw = await checkBrand(input);
      source = "live";
    }

    const found = { brand: raw.brand, source, pagesFound: raw.pagesFound, pagesRead: raw.pagesRead };
    if (!raw.claims.length) {
      return reply({ ...found, error: `Couldn't find enough about ${raw.brand} to check. Try a link to their sustainability page.` });
    }

    let guidesRemoved = 0;
    const claims = raw.claims.map((c) => {
      const { findings, removed } = guardFindings(c.findings, guides);
      guidesRemoved += removed;
      return { ...c, findings: present(findings, guides) };
    });
    const removedWhy = { ...raw.removed, guides: guidesRemoved };
    return reply({
      ...found,
      savedOn: source === "sample" ? fixtures.savedOn : undefined,
      claims,
      removed: removedWhy.mismatch + removedWhy.wrongSite + removedWhy.banned + removedWhy.guides,
      removedWhy,
    });
  } catch (err) {
    console.error("brand check failed", err);
    return reply({ error: "Gemini didn't answer that time. Try again, or pick a sample brand." });
  }
}
```

- [ ] **Step 2: Build and start locally.** `npx tsc --noEmit && npm run build > .tmp/build.txt 2>&1; tail -15 .tmp/build.txt`, then start `npm start` in the background (port 3000; `.env.local` supplies the key).

- [ ] **Step 3: Curl checks (free).** Each must match:

```bash
B=http://localhost:3000/api/brand
curl -s -X POST $B -H 'content-type: application/json' -d '{"brand":"h&m"}' | node -e 'const r=JSON.parse(require("fs").readFileSync(0));console.log(r.source,r.brand,r.claims.length,r.savedOn,r.error??"")'
# expect: sample H&M <n≥2> 2026-09-26
curl -s -X POST $B -H 'content-type: application/json' -d '{"brand":"PATAGONIA"}' | node -e 'const r=JSON.parse(require("fs").readFileSync(0));console.log(r.source,r.brand,r.claims.length)'
# expect: sample Patagonia <n≥2>
curl -s -o /dev/null -w "%{http_code}\n" -X POST $B -H 'content-type: application/json' -d '{"brand":"x"}'                     # expect 400
curl -s -o /dev/null -w "%{http_code}\n" -X POST $B -H 'content-type: application/json' -d '{"brand":"http://127.0.0.1/admin"}' # expect 400
curl -s -o /dev/null -w "%{http_code}\n" -X POST $B -H 'content-type: application/json' -d '{"brand":"file:///etc/passwd"}'    # expect 400
curl -s -o /dev/null -w "%{http_code}\n" -X POST $B -H 'content-type: application/json' -d 'not json'                          # expect 400
curl -s -X POST http://localhost:3000/api/check -H 'content-type: application/json' -d '{"claim":"Biodegradable plastic bag"}' | node -e 'const r=JSON.parse(require("fs").readFileSync(0));console.log(r.source,r.findings.length,r.findings[0].title)'
# expect: sample 1 <260.8 title>  (claim route unchanged)
```

- [ ] **Step 4: Live checks (paid, about 10 Gemini calls).** Time each:

```bash
time curl -s -X POST $B -H 'content-type: application/json' -d '{"brand":"Allbirds"}' > .tmp/live.json; node -e 'const r=require("./.tmp/live.json");console.log(r.source,r.pagesRead+"/"+r.pagesFound,r.claims.length,r.removed,r.error??"")'
# expect: live, claims ≥ 1, under 60s, no error
time curl -s -X POST $B -H 'content-type: application/json' -d '{"brand":"Zqxv Widget Company"}' | node -e 'const r=JSON.parse(require("fs").readFileSync(0));console.log(r.claims.length,r.error)'
# expect: 0 "Couldn't find enough about Zqxv Widget Company to check. ..."
```

- [ ] **Step 5: Stop the server and commit.**

```bash
git add app/api/brand/route.ts
git commit -m "Brand mode: /api/brand with samples, offline path and serve-time Guides guard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Brand mode UI in `app/page.tsx`

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `POST /api/brand` response (Task 4), `type Shown` from `@/lib/guard`, `@/fixtures/brands.json` keys for chips.
- Produces: the user-facing brand mode. Claim mode unchanged.

- [ ] **Step 1: Types, imports and helpers.** Replace the top of the file through the `VERDICT` const: import `brandFixtures from "@/fixtures/brands.json"` and `type Shown` from `@/lib/guard` (delete the local `Shown` type), keep `Result`, and add:

```tsx
type Stance = "backs" | "pushes_back";
type BrandCard = {
  claim: string;
  quote: string;
  url: string;
  host: string;
  evidence: { stance: Stance; quote: string; url: string; host: string }[];
  findings: Shown[];
};
type BrandResult = {
  brand: string;
  claims: BrandCard[];
  removed: number;
  removedWhy: { mismatch: number; wrongSite: number; banned: number; guides: number };
  pagesFound: number;
  pagesRead: number;
  source?: "sample" | "live";
  savedOn?: string;
  model: string;
  error?: string;
};

const BRAND_SAMPLES = Object.keys(brandFixtures.brands);

const STANCE = {
  backs: { label: "Backs it up", tone: "bg-glass" },
  pushes_back: { label: "Pushes back", tone: "bg-buoy" },
};

const savedDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function removedLine(w: BrandResult["removedWhy"]) {
  const n = w.mismatch + w.wrongSite + w.banned + w.guides;
  const parts = [
    w.mismatch && `${w.mismatch} didn’t match the page they cite`,
    w.wrongSite && `${w.wrongSite} came from the wrong site`,
    w.banned && `${w.banned} used legal wording Low Tide doesn’t show`,
    w.guides && `${w.guides} didn’t match the Guides`,
  ].filter(Boolean);
  return `${n} ${n === 1 ? "quote" : "quotes"} removed: ${parts.join(", ")}.`;
}
```

Change `post` to take the path: `async function post(path: string, body: object)` using `fetch(path, ...)`; update both claim-mode callers to `post("/api/check", ...)`.

- [ ] **Step 2: Extract `FindingCard`.** Move the existing `<article>` body from `result.findings.map` into a component with the exact same markup and classes; the tamper button renders only when `onTamper` is given:

```tsx
function FindingCard({ f, onTamper }: { f: Shown; onTamper?: () => void }) {
  const v = VERDICT[f.verdict];
  return (
    <article className="border-t border-deep/15 py-7">
      {/* ...existing badge row, why, not_covered paragraph or figure, unchanged... */}
      {/* inside the figure, replace the tamper <button> with: */}
      {onTamper && (
        <button type="button" onClick={onTamper} className="mt-4 text-sm text-deep/70 underline underline-offset-2 hover:text-deep">
          Tamper test: change one word
        </button>
      )}
    </article>
  );
}
```

The claim-mode list becomes `{result.findings.map((f, i) => <FindingCard key={`${f.phrase}-${f.section}`} f={f} onTamper={() => runTamper(i)} />)}`. Claim mode must render identically to `v1`.

- [ ] **Step 3: Brand card component:**

```tsx
function Label({ children }: { children: ReactNode }) {
  return <p className="mt-7 text-sm font-semibold uppercase tracking-[0.08em] text-deep/60">{children}</p>;
}

function BrandClaimCard({ c }: { c: BrandCard }) {
  return (
    <article className="border-t-2 border-deep/25 py-9">
      <h3 className="text-2xl font-semibold tracking-[-0.01em]">{c.claim}</h3>
      <Label>They say</Label>
      <figure className="mt-3 rounded-md bg-white/65 p-4 sm:p-6">
        <blockquote className="font-serif text-[1.08rem] leading-[1.7]">
          <mark className="bg-sun text-deep">{c.quote}</mark>
        </blockquote>
        <figcaption className="mt-3 flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <a href={c.url} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">
            {c.host}
          </a>
          <span className="text-deep/65">Quote checked word for word against their page</span>
        </figcaption>
      </figure>
      {c.findings.length > 0 && (
        <>
          <Label>Green Guides reading</Label>
          {c.findings.map((f) => (
            <FindingCard key={`${f.phrase}-${f.section}`} f={f} />
          ))}
        </>
      )}
      <Label>Others say</Label>
      {c.evidence.length ? (
        c.evidence.map((e) => (
          <figure key={`${e.url}-${e.quote.slice(0, 24)}`} className="mt-3 rounded-md border border-deep/15 p-4 sm:p-6">
            <figcaption className="flex flex-wrap items-center gap-3 text-sm">
              <span className={`rounded-full px-3 py-1 font-semibold ${STANCE[e.stance].tone}`}>{STANCE[e.stance].label}</span>
              <a href={e.url} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">
                {e.host}
              </a>
            </figcaption>
            <blockquote className="mt-3 font-serif text-[1.08rem] leading-[1.7]">{e.quote}</blockquote>
          </figure>
        ))
      ) : (
        <p className="mt-3 max-w-[65ch] text-deep/70">No independent source we could verify talks about this claim.</p>
      )}
    </article>
  );
}
```

- [ ] **Step 4: State, handler, switch, form, result, footer** in `Home`:

```tsx
const [mode, setMode] = useState<"claim" | "brand">("claim");
const [brand, setBrand] = useState("");
const [brandResult, setBrandResult] = useState<BrandResult | null>(null);

async function checkBrand(text: string) {
  setBrand(text);
  setBusy(true);
  try {
    setBrandResult(await post("/api/brand", { brand: text }));
  } catch {
    setBrandResult({
      brand: text, claims: [], removed: 0, removedWhy: { mismatch: 0, wrongSite: 0, banned: 0, guides: 0 },
      pagesFound: 0, pagesRead: 0, model: "", error: "Couldn't reach Low Tide. Check your connection and try again.",
    });
  } finally {
    setBusy(false);
    setRuns((n) => n + 1);
  }
}
```

Between `</header>` and the claim `<form>`, add the switch; the claim form's `className` changes from `mt-10` to `mt-6`, and it renders only when `mode === "claim"`:

```tsx
<div role="group" aria-label="What to check" className="mt-10 inline-flex rounded-full border border-deep/30 p-1">
  {(["claim", "brand"] as const).map((m) => (
    <button
      key={m}
      type="button"
      aria-pressed={mode === m}
      disabled={busy}
      onClick={() => setMode(m)}
      className={`rounded-full px-4 py-1.5 font-semibold transition-colors ${mode === m ? "bg-deep text-flat" : "text-deep/75 hover:text-deep"}`}
    >
      {m === "claim" ? "A claim" : "A brand"}
    </button>
  ))}
</div>
```

When `mode === "brand"`, render instead:

```tsx
<form
  className="mt-6"
  onSubmit={(e) => {
    e.preventDefault();
    if (brand.trim().length >= 2) checkBrand(brand.trim());
  }}
>
  <p className="max-w-[58ch] leading-relaxed text-deep/80">
    Type a brand. Gemini 2.5 Flash searches the web for what the brand says about itself and what others found, and Low Tide
    checks every quote word for word against the page it came from.
  </p>
  <label htmlFor="brand" className="sr-only">
    Brand name or link
  </label>
  <input
    id="brand"
    type="text"
    maxLength={300}
    value={brand}
    onChange={(e) => setBrand(e.target.value)}
    placeholder="Brand name or link to their sustainability page"
    className="mt-4 w-full rounded-md border border-deep/25 bg-white/70 p-4 text-lg placeholder:text-deep/45 focus:border-deep focus:outline-none"
  />
  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
    <button type="submit" disabled={busy || brand.trim().length < 2} className="rounded-md bg-deep px-5 py-2.5 font-semibold text-flat transition-opacity disabled:opacity-40">
      {busy ? "Researching…" : "Check brand"}
    </button>
    <span className="text-deep/70">or try a sample:</span>
    {BRAND_SAMPLES.map((s) => (
      <button key={s} type="button" disabled={busy} onClick={() => checkBrand(s)} className="rounded-full border border-deep/30 px-3 py-1.5 text-sm transition-colors hover:bg-deep hover:text-flat disabled:opacity-40">
        {s}
      </button>
    ))}
  </div>
  {busy && <p className="mt-3 text-deep/70">Searching the web and reading sources. This takes about 20 seconds.</p>}
</form>
```

The claim `<section>` renders only when `mode === "claim"`; otherwise render:

```tsx
<section aria-live="polite" className="min-h-24">
  {!brandResult && <p className="text-deep/60">Pick a sample brand or type one. The answer shows up here.</p>}
  {brandResult?.error && <p className="text-lg">{brandResult.error}</p>}
  {brandResult && !brandResult.error && (
    <>
      <h2 className="font-serif text-3xl leading-snug sm:text-4xl">What {brandResult.brand} says, and what others found</h2>
      <p className="mt-3 text-sm text-deep/65">
        {brandResult.source === "sample" && brandResult.savedOn
          ? `Saved answer from ${modelName(brandResult.model)} with Google Search, checked against these pages on ${savedDate(brandResult.savedOn)}.`
          : `Researched live by ${modelName(brandResult.model)} with Google Search.`}{" "}
        Read {brandResult.pagesRead} of {brandResult.pagesFound} sources found.
      </p>
      <div className="mt-8">
        {brandResult.claims.map((c) => (
          <BrandClaimCard key={c.quote.slice(0, 40)} c={c} />
        ))}
      </div>
      {brandResult.removed > 0 && <p className="mt-2 font-semibold">{removedLine(brandResult.removedWhy)}</p>}
    </>
  )}
</section>
```

In the footer, after the existing text (unchanged), add `{mode === "brand" && " Brand and source quotes are checked word for word against the page they came from."}`.

- [ ] **Step 5: Verify.** `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` all clean. Start `npm start` and drive the page with the global Playwright the same way `scripts/record-demo.mjs` imports it (script in `.tmp/`, not committed). At 390x844 and 1280x800: (a) claim mode, click "Biodegradable plastic bag", screenshot; it must match `v1` (badge, 260.8 highlight, tamper link); (b) switch to "A brand", click "H&M", screenshot the full page; (c) click "Patagonia", screenshot; (d) type "zzzz" in brand mode and submit is disabled below 2 chars only (so "zz" allowed); (e) `document.documentElement.scrollWidth <= innerWidth` at 390px in both modes; (f) no console errors. Look at every screenshot. Fix what looks wrong (spacing of the nested `FindingCard` under "Green Guides reading" may need its top border removed there; do it with an optional `className` prop only if it looks broken).

- [ ] **Step 6: Copy scan.** `grep -nE '—' app/page.tsx` prints nothing; `grep -niE 'illegal|violation|lawsuit' app/page.tsx` prints nothing.

- [ ] **Step 7: Commit.**

```bash
git add app/page.tsx
git commit -m "Brand mode UI: claim/brand switch, brand cards, shared FindingCard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Deploy and prove it on prod (B1 + B2 logs)

Done by the main session, not a subagent: it changes production env vars.

- [ ] **Step 1:** `git push origin main`, then `vercel --prod`. Prod URL returns 200.
- [ ] **Step 2:** Playwright on https://low-tide-nine.vercel.app: both brand samples render; one live brand name (e.g. "Allbirds") returns cards in under 60s; one live link (e.g. `patagonia.com/our-footprint`) returns cards or the honest "Couldn't find enough" line; claim mode demo path still works, tamper test still shows "1 finding removed". No horizontal scroll at 390px.
- [ ] **Step 3:** Offline proof: remove `GOOGLE_GENERATIVE_AI_API_KEY` from Vercel production, redeploy, confirm both brand samples still render and a live brand shows "Live checks are offline right now. The sample brands still work.", then restore the key, redeploy, and confirm a live brand works again.
- [ ] **Step 4:** Append B1 and B2 entries to `STATE.md` in the existing log format; commit and push.

### Task 7: Docs, video, tag (B3)

- [ ] **Step 1:** README: add a brand mode section (what it does, the two-call flow, how quotes are checked against fetched pages) and the new limitations (pages change after samples are saved; source quality varies; sites that block downloads or render with JavaScript are skipped; "own site" is the model's call backed by a same-host check; hostname-only link safety check). No em dashes, no banned words.
- [ ] **Step 2:** DEVPOST.md: add brand mode and Google Search grounding; keep under 700 words (`wc -w`).
- [ ] **Step 3:** CLAUDE.md: replace "Sample claims are generic. No brand names" with "Claim samples are generic. Brand samples are real companies, shown only through verified quotes."; add the brand-mode footer sentence to the footer rule; add the new files to Files; note `google.tools.googleSearch` in Stack; replace the demo path with: Biodegradable chip, Ocean plastic chip, H&M brand sample, live claim, tamper test.
- [ ] **Step 4:** Update `scripts/record-demo.mjs` to the new demo path, re-record to `~/Desktop/low-tide-demo.mp4` (H.264, under 90s), and check frames.
- [ ] **Step 5:** `STATE.md` B3 entry, `tasks/todo.md` updated, commit, `git tag v2`, `git push origin main --tags`, final `vercel --prod`.
