# Brand Verdict Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn brand mode from "claims vs other sites" into "is this brand sustainable?": four checks, each backed by verified quotes, and a verdict computed by a rule in code.

**Architecture:** Keep `v2`'s input parsing, link safety, `readPage`, and `verifyQuote`. Replace the search prompt with four parallel per-check searches, replace the pick schema with per-check findings, replace `guardBrand` with `guardChecks` (pure) plus `verdictFor` (pure), and drop the Guides calls from brand mode. The route computes the verdict at serve time for live and sample results.

**Tech Stack:** Next.js 15, TypeScript, Tailwind 4, `ai` 7 + `@ai-sdk/google` 4 (`google.tools.googleSearch`), `zod` 4, `node --test`.

**Spec:** `docs/superpowers/specs/2026-09-26-brand-verdict-design.md` (read it; it is short)

## Global Constraints

- No new dependencies. Model is `MODEL` from `lib/check.ts`.
- On 2.5 Flash, `tools` and `output` cannot share a call. Structured output is `generateText({ output: Output.object({ schema }) })`.
- `lib/` and `scripts/` import with relative `.ts` paths (JSON with `with { type: "json" }`); `app/` imports with `@/lib/...`.
- Never show the words illegal, violation or lawsuit. No em dashes in UI copy, README, DEVPOST.md.
- Footer stays exactly as it is, plus in brand mode only: " In brand mode, every quote is checked word for word against the page it came from."
- Every API path returns JSON, never a 500. Claim mode must not change.
- Fixtures are unedited seed output. Never hand-edit `fixtures/brands.json`.
- Tests: `npm test > .tmp/test.txt 2>&1; tail -9 .tmp/test.txt`, read failures only.
- Every commit message ends with a blank line then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push, never run vercel.

## Review Focus

1. A brand quoting its own "we're a certified B Corp" or its own rating must not earn a good sign, including from a subdomain of its site. Pinned by the self-vouching test in Task 1.
2. A check where both a good and a red quote survive shows "Both" and blocks Strong. Pinned by the marks and verdict tests in Task 1.
3. One of the four searches failing must not fail the whole check. Pinned by the `.catch` in `findSources` and the made-up-brand curl in Task 3.
4. The verdict must follow the current rule even for saved samples. Pinned by the route calling `verdictFor` at serve time (Task 3 curl).
5. Model returns an unknown check name or a check twice: unknown names are ignored, the first entry wins. Pinned by the enum schema and the `find` in `guardChecks` (Task 1 test).

---

### Task 1: Checklist guard, verdict rule, per-check search and pick

**Files:**
- Modify: `lib/brand.ts`
- Modify: `lib/brand.test.ts`

**Interfaces:**
- Keeps: `Page`, `SourcePage`, `BrandInput`, `htmlToText`, `isSafeUrl`, `parseBrandInput`, `readPage`, the private `sid` helper.
- Removes: `Stance`, `Evidence`, `BrandClaim`, old `Picked`, `guardBrand`, old `pickSchema`/`PICK_SYSTEM`, the `askGemini` import.
- Produces:
  - `CHECKS = ["certifications", "climate", "ratings", "watchdogs"] as const`, `type CheckKey`
  - `type Sign = "good" | "red"`, `type Mark = "good" | "red" | "both" | "not_found"`, `type Verdict = "strong" | "mixed" | "red_flags" | "not_enough"`
  - `type Picked = { ownSites: string[]; checks: { check: CheckKey; findings: { sign: Sign; sourceId: string; quote: string; note: string }[] }[] }`
  - `type Signal = { sign: Sign; quote: string; note: string; url: string; host: string; own: boolean }`
  - `type CheckResult = { check: CheckKey; mark: Mark; signals: Signal[] }`
  - `type Removed = { mismatch: number; wrongSite: number; banned: number }`
  - `type BrandCheck = { brand: string; pagesFound: number; pagesRead: number; checks: CheckResult[]; removed: Removed }`
  - `guardChecks(picked: Picked, pages: SourcePage[]): { checks: CheckResult[]; removed: Removed }` (always returns all four checks, in `CHECKS` order)
  - `verdictFor(checks: CheckResult[]): { verdict: Verdict; good: number; red: number }`
  - `findSources(brand: string): Promise<string[]>`, `pickQuotes(brand: string, pages: SourcePage[]): Promise<Picked>`, `checkBrand(input: BrandInput): Promise<BrandCheck>`

- [ ] **Step 1: Replace the guard tests.** In `lib/brand.test.ts`, change the import to:

```ts
import {
  htmlToText, isSafeUrl, parseBrandInput, readPage, guardChecks, verdictFor, CHECKS,
  type Picked, type SourcePage, type CheckKey, type CheckResult, type Mark,
} from "./brand.ts";
import { verifyQuote, BANNED } from "./guard.ts";
```

Delete the old `CLAIM`/`BACKS`/`PUSH`/`LEGAL` constants, `PAGES`, `Claim`, `pick`, and every `guardBrand ...` test (keep the `page` helper, both `htmlToText` tests, `isSafeUrl`, `parseBrandInput`, `readPage`). Add:

```ts
const CERT = "The company has been a certified B Corporation since 2011 and was recertified with a score of 151.4 this year";
const CLIMATE = "The brand publishes its full scope 1, 2 and 3 greenhouse gas emissions every year in its impact report";
const RATING = "Our rating for the brand is Good, based on its use of lower impact materials and its supplier code of conduct";
const LOW = "Our rating for the brand is Not Good Enough because it discloses almost nothing about its supply chain emissions";
const WATCH = "The consumer authority found the sustainability claims on its website were vague and could mislead shoppers";
const LEGAL = "The company settled a lawsuit over how it marketed recycled materials in its outdoor clothing line";

const PAGES = [
  page("S1", "brand.example", `${CERT}. ${CLIMATE}`), // the brand's own site
  page("S2", "bcorp.example", CERT),
  page("S3", "rater.example", `${RATING}. ${LOW}`),
  page("S4", "regulator.example", WATCH),
  page("S5", "shop.brand.example", RATING), // a subdomain of the brand's site
  page("S6", "law.example", LEGAL),
];
type Raw = Picked["checks"][number]["findings"][number];
const f = (sign: Raw["sign"], sourceId: string, quote: string, note = "A plain note."): Raw => ({ sign, sourceId, quote, note });
const pick = (checks: Partial<Record<CheckKey, Raw[]>>, ownSites = ["S1"]): Picked => ({
  ownSites,
  checks: Object.entries(checks).map(([check, findings]) => ({ check: check as CheckKey, findings: findings! })),
});
const marks = (r: { checks: CheckResult[] }) => Object.fromEntries(r.checks.map((c) => [c.check, c.mark]));

test("guardChecks keeps verified findings and marks every check, in order", () => {
  const r = guardChecks(
    pick({
      certifications: [f("good", "S2", CERT)],
      climate: [f("good", "S1", CLIMATE)],
      ratings: [f("good", "S3", RATING), f("red", "S3", LOW)],
      watchdogs: [f("red", "S4", WATCH)],
    }),
    PAGES,
  );
  assert.deepEqual(r.checks.map((c) => c.check), [...CHECKS]);
  assert.deepEqual(marks(r), { certifications: "good", climate: "good", ratings: "both", watchdogs: "red" });
  assert.deepEqual(r.removed, { mismatch: 0, wrongSite: 0, banned: 0 });
  assert.equal(r.checks[1].signals[0].own, true);
  assert.equal(r.checks[0].signals[0].own, false);
  assert.equal(r.checks[0].signals[0].url, "https://bcorp.example/S2");
});

test("a check with no surviving quote is not found", () => {
  const r = guardChecks(pick({ certifications: [f("good", "S2", CERT.replace("151.4", "160"))] }), PAGES);
  assert.deepEqual(marks(r), { certifications: "not_found", climate: "not_found", ratings: "not_found", watchdogs: "not_found" });
  assert.equal(r.removed.mismatch, 1);
});

test("the brand can't vouch for its own certification or rating, subdomains included", () => {
  const r = guardChecks(pick({ certifications: [f("good", "S1", CERT)], ratings: [f("good", "S5", RATING)] }), PAGES);
  assert.equal(marks(r).certifications, "not_found");
  assert.equal(marks(r).ratings, "not_found");
  assert.equal(r.removed.wrongSite, 2);
});

test("the brand's own site can back climate action and can show a red flag", () => {
  const r = guardChecks(pick({ climate: [f("good", "S1", CLIMATE)], certifications: [f("red", "S1", CERT)] }), PAGES);
  assert.equal(marks(r).climate, "good");
  assert.equal(marks(r).certifications, "red");
  assert.equal(r.removed.wrongSite, 0);
});

test("missing source ids and banned words are dropped", () => {
  const r = guardChecks(pick({ watchdogs: [f("red", "S9", WATCH), f("red", "S6", LEGAL)] }), PAGES);
  assert.equal(marks(r).watchdogs, "not_found");
  assert.deepEqual(r.removed, { mismatch: 1, wrongSite: 0, banned: 1 });
});

test("sloppy source ids still match", () => {
  const r = guardChecks(pick({ certifications: [f("good", " S2 ", CERT)], climate: [f("good", "[S1]", CLIMATE)] }, ["s1"]), PAGES);
  assert.equal(marks(r).certifications, "good");
  assert.equal(marks(r).climate, "good");
  assert.equal(r.checks[1].signals[0].own, true);
});

test("at most 2 findings per check, first entry wins for a repeated check, notes softened", () => {
  const picked: Picked = {
    ownSites: ["S1"],
    checks: [
      { check: "ratings", findings: [f("good", "S3", RATING, "This is illegal."), f("good", "S3", RATING), f("red", "S3", LOW)] },
      { check: "ratings", findings: [f("red", "S3", LOW)] },
    ],
  };
  const r = guardChecks(picked, PAGES);
  assert.equal(r.checks[2].signals.length, 2);
  assert.equal(marks(r).ratings, "good");
  assert.equal(BANNED.test(r.checks[2].signals[0].note), false);
});

const mk = (...ms: Mark[]): CheckResult[] => ms.map((mark, i) => ({ check: CHECKS[i], mark, signals: [] }));

test("verdictFor follows the rule on every branch", () => {
  const v = (...ms: Mark[]) => verdictFor(mk(...ms)).verdict;
  assert.equal(v("good", "not_found", "not_found", "not_found"), "not_enough");
  assert.equal(v("not_found", "not_found", "not_found", "not_found"), "not_enough");
  assert.equal(v("good", "good", "good", "not_found"), "strong");
  assert.equal(v("good", "good", "good", "both"), "mixed");
  assert.equal(v("good", "good", "red", "not_found"), "mixed");
  assert.equal(v("good", "good", "not_found", "not_found"), "mixed");
  assert.equal(v("both", "good", "not_found", "not_found"), "mixed");
  assert.equal(v("good", "red", "not_found", "not_found"), "red_flags");
  assert.equal(v("red", "red", "not_found", "not_found"), "red_flags");
  assert.deepEqual(verdictFor(mk("good", "good", "red", "both")), { verdict: "mixed", good: 2, red: 1 });
});
```

- [ ] **Step 2: Run tests to verify they fail.** Expected: FAIL, `guardChecks`/`verdictFor`/`CHECKS` not exported.

- [ ] **Step 3: Implement.** In `lib/brand.ts`:
  - Imports: drop `askGemini` (keep `MODEL`): `import { MODEL } from "./check.ts";` and `import { BANNED, soften, verifyQuote } from "./guard.ts";`.
  - Replace the type block (everything from `export type Stance` through the old `BrandCheck`) with:

```ts
export const CHECKS = ["certifications", "climate", "ratings", "watchdogs"] as const;
export type CheckKey = (typeof CHECKS)[number];
export type Sign = "good" | "red";
export type Mark = "good" | "red" | "both" | "not_found";
export type Verdict = "strong" | "mixed" | "red_flags" | "not_enough";
export type Picked = {
  ownSites: string[];
  checks: { check: CheckKey; findings: { sign: Sign; sourceId: string; quote: string; note: string }[] }[];
};
export type Signal = { sign: Sign; quote: string; note: string; url: string; host: string; own: boolean };
export type CheckResult = { check: CheckKey; mark: Mark; signals: Signal[] };
export type Removed = { mismatch: number; wrongSite: number; banned: number };
export type BrandCheck = { brand: string; pagesFound: number; pagesRead: number; checks: CheckResult[]; removed: Removed };
```

  (keep `Page`, `SourcePage`, `BrandInput` as they are.)
  - Replace `guardBrand` (and its comment) with:

```ts
// A brand can't vouch for itself on these: a good sign has to come from a site it doesn't own.
const INDEPENDENT_GOOD: CheckKey[] = ["certifications", "ratings"];

// Keeps only findings whose quote is really on the page they cite, then marks each of the four checks.
export function guardChecks(picked: Picked, pages: SourcePage[]): { checks: CheckResult[]; removed: Removed } {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const own = new Set(picked.ownSites.map(sid));
  // ponytail: exact host or subdomain of a brand-owned page. A sibling domain only counts if the model lists it.
  const ownHosts = pages.filter((p) => own.has(p.id)).map((p) => p.host);
  const isOwn = (p: SourcePage) => own.has(p.id) || ownHosts.some((h) => p.host === h || p.host.endsWith(`.${h}`));
  const removed: Removed = { mismatch: 0, wrongSite: 0, banned: 0 };

  const checks = CHECKS.map((check): CheckResult => {
    const signals: Signal[] = [];
    for (const f of picked.checks.find((c) => c.check === check)?.findings.slice(0, 2) ?? []) {
      const page = byId.get(sid(f.sourceId));
      if (!page || !verifyQuote(f.quote, page.text)) {
        removed.mismatch++;
        continue;
      }
      const mine = isOwn(page);
      if (mine && f.sign === "good" && INDEPENDENT_GOOD.includes(check)) {
        removed.wrongSite++;
        continue;
      }
      if (BANNED.test(f.quote) || BANNED.test(page.host)) {
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
```

  - Replace `findSources` with:

```ts
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
```

  - Replace `pickSchema`, `PICK_SYSTEM` and the body of `pickQuotes` (keep `quoteField`):

```ts
const pickSchema = z.object({
  ownSites: z.array(z.string()).describe('Ids like "S1" of every source that belongs to the brand itself'),
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

const PICK_SYSTEM = `You check whether a brand's sustainability holds up, for a shopper deciding whether to buy from it. You get numbered source pages (S1, S2, ...). Use only what these pages say.

ownSites: the ids of every source that belongs to the brand itself: its main site, group or corporate site, regional sites, and its own reports.
checks: one entry for each check below that at least one source speaks to, with up to 2 findings each.
- certifications: third-party sustainability certifications the brand holds (B Corp, Fair Trade, bluesign, FSC, Cradle to Cradle, GOTS). good if a source confirms a current certification; red if one was lost, suspended, or refused.
- climate: good if a source shows a climate target validated by the Science Based Targets initiative, or published greenhouse gas emissions; red if a source reports targets missed or dropped, or emissions rising.
- ratings: independent sustainability ratings (Good On You, CDP, Fashion Transparency Index, or similar). good for a high rating, red for a low one. Quote the passage that states the rating.
- watchdogs: red if a regulator, consumer authority, or watchdog group acted on or criticized the brand's environmental claims; good only if one explicitly cleared them.
Each finding: its sign, the id of the source, a quote, and a note. The quote is one continuous passage of 10 to 40 words copied character for character from that source: no ellipses, no paraphrase, no stitching sentences together. The note is one plain sentence a shopper can follow.
Only include a finding when the quoted passage itself shows it. The absence of news is not a finding. Never use the words illegal, violation, or lawsuit.`;
```

  (the `pickQuotes` function body is unchanged: same `generateText` call with `system: PICK_SYSTEM`, the page prompt, `Output.object({ schema: pickSchema })`.)
  - Replace `NONE` and `checkBrand` with:

```ts
const NONE: Removed = { mismatch: 0, wrongSite: 0, banned: 0 };

// The whole brand check. The verdict is left to verdictFor, which the route runs at serve time.
export async function checkBrand(input: BrandInput): Promise<BrandCheck> {
  const [first, found] = await Promise.all([input.url ? readPage(input.url.href) : null, findSources(input.name)]);
  const read = await Promise.all(found.map(readPage));
  const pages: SourcePage[] = [first, ...read]
    .filter((p): p is Page => p !== null)
    .filter((p, i, all) => all.findIndex((q) => q.url === p.url) === i)
    .map((p, i) => ({ ...p, id: `S${i + 1}` }));
  const base = { brand: input.name, pagesFound: found.length + (input.url ? 1 : 0), pagesRead: pages.length };
  if (!pages.length) return { ...base, ...guardChecks({ ownSites: [], checks: [] }, []) };
  return { ...base, ...guardChecks(await pickQuotes(input.name, pages), pages) };
}
```

- [ ] **Step 4: Run tests and type check.** `npm test` (expected: all pass; count = 25 minus the 10 removed guardBrand tests plus 8 new = 23) and `npx tsc --noEmit`. `tsc` will report errors in `app/api/brand/route.ts`, `app/page.tsx` and `scripts/seed-brands.ts`, which still use the old shape: those are Tasks 2 and 3. `lib/` itself must be clean: `npx tsc --noEmit 2>&1 | grep "^lib/"` prints nothing.

- [ ] **Step 5: Commit.** `git add lib/brand.ts lib/brand.test.ts` and commit "Brand verdict: checklist guard, verdict rule, per-check search".

---

### Task 2: Seed script and new samples (paid)

**Files:** Modify `scripts/seed-brands.ts`; regenerate `fixtures/brands.json`.

- [ ] **Step 1: Update the log line** in `scripts/seed-brands.ts` (import `verdictFor` too):

```ts
import { checkBrand, parseBrandInput, verdictFor } from "../lib/brand.ts";
// ...
for (const name of SAMPLES) {
  const r = await checkBrand(parseBrandInput(name)!);
  const { verdict } = verdictFor(r.checks);
  console.log(`${name}: read ${r.pagesRead}/${r.pagesFound} pages, verdict ${verdict},`, r.checks.map((c) => `${c.check}=${c.mark}(${c.signals.length})`).join(" "), "removed", r.removed);
  brands[name] = r;
}
```

- [ ] **Step 2: Run the seed (paid, about 10 Gemini calls).** `node --env-file=.env.local scripts/seed-brands.ts 2>&1 | grep -v ExperimentalWarning`. Gate: each brand has at least 2 checks that are not `not_found`. If a brand fails the gate, run the seed once more. If it still fails, stop, report the numbers, and return status "blocked". Never edit the fixture by hand.

- [ ] **Step 3: Inspect** `fixtures/brands.json`: `savedOn` is today, both keys present, every signal's `host`/`url` looks like the source it claims, no good certification or rating signal has `own: true`, and `grep -ciE 'illegal|violation|lawsuit' fixtures/brands.json` prints 0.

- [ ] **Step 4: Commit** `scripts/seed-brands.ts fixtures/brands.json`: "Brand verdict: re-seed Patagonia and H&M".

---

### Task 3: Route and page

**Files:** Modify `app/api/brand/route.ts`, `app/page.tsx`.

- [ ] **Step 1: Route.** Replace the imports and everything from `const samples` down with:

```ts
import { z } from "zod";
import fixtures from "@/fixtures/brands.json";
import { MODEL } from "@/lib/check";
import { checkBrand, parseBrandInput, verdictFor, type BrandCheck } from "@/lib/brand";

const Body = z.object({ brand: z.string().trim().min(2).max(300) });

const samples = fixtures.brands as unknown as Record<string, BrandCheck>;
const NONE = { mismatch: 0, wrongSite: 0, banned: 0 };

const reply = (data: object, status = 200) =>
  Response.json({ model: MODEL, checks: [], removed: 0, removedWhy: NONE, pagesFound: 0, pagesRead: 0, ...data }, { status });

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
    if (!raw.pagesRead) {
      return reply({ ...found, error: `Couldn't find enough about ${raw.brand} to check. Try a link to its site.` });
    }
    const { mismatch, wrongSite, banned } = raw.removed;
    return reply({
      ...found,
      savedOn: source === "sample" ? fixtures.savedOn : undefined,
      ...verdictFor(raw.checks),
      checks: raw.checks,
      removed: mismatch + wrongSite + banned,
      removedWhy: raw.removed,
    });
  } catch (err) {
    console.error("brand check failed", err);
    return reply({ error: "Gemini didn't answer that time. Try again, or pick a sample brand." });
  }
}
```

- [ ] **Step 2: Page types and helpers.** In `app/page.tsx`, delete `Stance`, `BrandCard`, `STANCE`, `Label`, `BrandClaimCard`, and the old `BrandResult` and `removedLine`. Add:

```tsx
type CheckKey = "certifications" | "climate" | "ratings" | "watchdogs";
type Mark = "good" | "red" | "both" | "not_found";
type Signal = { sign: "good" | "red"; quote: string; note: string; url: string; host: string; own: boolean };
type Check = { check: CheckKey; mark: Mark; signals: Signal[] };
type BrandResult = {
  brand: string;
  verdict?: "strong" | "mixed" | "red_flags" | "not_enough";
  good?: number;
  red?: number;
  checks: Check[];
  removed: number;
  removedWhy: { mismatch: number; wrongSite: number; banned: number };
  pagesFound: number;
  pagesRead: number;
  source?: "sample" | "live";
  savedOn?: string;
  model: string;
  error?: string;
};

const BRAND_VERDICT = {
  strong: { label: "Strong record", tone: "bg-glass" },
  mixed: { label: "Mixed record", tone: "bg-sun" },
  red_flags: { label: "Red flags", tone: "bg-buoy" },
  not_enough: { label: "Not enough evidence", tone: "border border-dashed border-deep/50" },
};
const CHECK_TITLE: Record<CheckKey, string> = {
  certifications: "Certifications",
  climate: "Climate action",
  ratings: "Independent ratings",
  watchdogs: "Regulator and watchdog findings",
};
const MARK: Record<Mark, { label: string; tone: string }> = {
  good: { label: "Good sign", tone: "bg-glass" },
  red: { label: "Red flag", tone: "bg-buoy" },
  both: { label: "Both", tone: "bg-sun" },
  not_found: { label: "Not found", tone: "border border-dashed border-deep/50" },
};

function ruleLine(r: BrandResult) {
  const good = r.good ?? 0;
  const red = r.red ?? 0;
  const both = r.checks.filter((c) => c.mark === "both").length;
  const parts = [`${good} good ${good === 1 ? "sign" : "signs"}`, `${red} red ${red === 1 ? "flag" : "flags"}`];
  if (both) parts.push(`${both} with both`);
  return `${parts.join(", ")} across ${r.checks.length} checks.`;
}

function removedLine(w: BrandResult["removedWhy"]) {
  const n = w.mismatch + w.wrongSite + w.banned;
  const parts = [
    w.mismatch && `${w.mismatch} didn’t match the page they cite`,
    w.wrongSite && `${w.wrongSite} came from the brand’s own site`,
    w.banned && `${w.banned} used legal wording Low Tide doesn’t show`,
  ].filter(Boolean);
  return `${n} ${n === 1 ? "quote" : "quotes"} removed: ${parts.join(", ")}.`;
}

function CheckCard({ c }: { c: Check }) {
  const m = MARK[c.mark];
  return (
    <article className="border-t border-deep/15 py-7">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-xl font-semibold">{CHECK_TITLE[c.check]}</h3>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${m.tone}`}>{m.label}</span>
      </div>
      {c.signals.length ? (
        c.signals.map((s) => (
          <figure key={`${s.url}-${s.quote.slice(0, 24)}`} className="mt-4 rounded-md bg-white/65 p-4 sm:p-6">
            <p className="max-w-[65ch] leading-relaxed">{s.note}</p>
            <blockquote className="mt-3 font-serif text-[1.08rem] leading-[1.7]">
              <mark className="bg-sun text-deep">{s.quote}</mark>
            </blockquote>
            <figcaption className="mt-3 flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span>
                <a href={s.url} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">
                  {s.host}
                </a>
                {s.own && <span className="ml-2 text-deep/65">their own site</span>}
              </span>
              <span className="text-deep/65">Quote checked word for word against this page</span>
            </figcaption>
          </figure>
        ))
      ) : (
        <p className="mt-3 max-w-[65ch] text-deep/70">
          Low Tide couldn&rsquo;t find a source it could verify for this. That isn&rsquo;t the same as a no.
        </p>
      )}
    </article>
  );
}
```

- [ ] **Step 3: Page copy and result.** Brand-mode intro in the header becomes: "Type a brand or a link to its site. Gemini 2.5 Flash searches for certifications, climate action, independent ratings and regulator findings, and Low Tide checks every quote word for word against the page it came from." The catch block in `checkBrand` (the page handler) sets `checks: []` and `removedWhy: { mismatch: 0, wrongSite: 0, banned: 0 }` instead of `claims`/`guides`. Replace the inside of the brand result fragment (the `<h2>` through the removed line) with:

```tsx
<h2 className="font-serif text-3xl leading-snug sm:text-4xl">Is {brandResult.brand} sustainable?</h2>
{brandResult.verdict && (
  <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
    <span className={`rounded-full px-4 py-1.5 text-lg font-semibold ${BRAND_VERDICT[brandResult.verdict].tone}`}>
      {BRAND_VERDICT[brandResult.verdict].label}
    </span>
    <span className="text-deep/80">{ruleLine(brandResult)}</span>
  </div>
)}
<p className="mt-3 max-w-[65ch] text-sm text-deep/70">This describes the evidence Low Tide could verify, not a certification.</p>
<p className="mt-2 text-sm text-deep/65">
  {brandResult.source === "sample" && brandResult.savedOn
    ? `Saved answer from ${modelName(brandResult.model)} with Google Search, checked against these pages on ${savedDate(brandResult.savedOn)}.`
    : `Researched live by ${modelName(brandResult.model)} with Google Search.`}{" "}
  Read {brandResult.pagesRead} of {brandResult.pagesFound} sources found.
</p>
<div className="mt-8">
  {brandResult.checks.map((c) => (
    <CheckCard key={c.check} c={c} />
  ))}
</div>
{brandResult.removed > 0 && <p className="mt-2 font-semibold">{removedLine(brandResult.removedWhy)}</p>}
```

Footer brand sentence becomes `{mode === "brand" && " In brand mode, every quote is checked word for word against the page it came from."}`.

- [ ] **Step 4: Verify.** `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` clean. `npm start -- -p 3100`. Curl (free): `h&m` and `PATAGONIA` return `source: "sample"` with a `verdict`, `good`, `red`, 4 checks; bad inputs still 400; `/api/check` sample unchanged. Paid (about 6 calls): one live brand ("Allbirds") returns a verdict under 60s; "Zqxv Widget Company" returns the "Couldn't find enough" error or `verdict: "not_enough"` with no invented signals. Playwright (global, as in `scripts/record-demo.mjs`) at 390x844 and 1280x800: claim mode unchanged (sample chip, tamper test), brand mode both samples; no horizontal scroll, no console errors; look at every screenshot. Copy scan: no em dash and no banned word in `app/page.tsx`. Stop the server.

- [ ] **Step 5: Commit** `app/api/brand/route.ts app/page.tsx`: "Brand verdict: route computes the verdict, page shows the checklist".

### Task 4 (main session): deploy, prod checks, STATE C1 and C2. Task 5 (main session or a docs workflow): README, DEVPOST under 700 words, CLAUDE.md (brand mode contract, footer rule sentence, demo path: the H&M sample now shows its verdict), todo, video re-record, STATE C3, tag `v3`.
