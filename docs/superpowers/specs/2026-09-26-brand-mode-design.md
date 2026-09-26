# Brand mode: design

Date: Sat Sept 26 2026. Status: approved in chat, awaiting spec review.

## Intent

A shopper deciding whether to buy from a company types the brand's name (or pastes a link to its sustainability page). Low Tide finds what the brand says about itself, finds what independent sources say about those same claims, and shows both side by side. The shopper draws the conclusion.

Success: on prod, both sample brands render instantly, a live brand check finishes in about 20 seconds, and every quote on screen was checked word for word against the page it came from. The claim checker keeps working exactly as in `v1`.

## Decisions (from the brainstorm)

| Question | Decision |
|---|---|
| Timing | Add-on, built before the Sun 8:00am freeze. `v1` tag is the rollback point |
| Output | Per-claim evidence. No overall grade or score |
| Input | One box, brand name or URL |
| Samples | Two real brands saved as fixtures: Patagonia and H&M. Claim samples stay generic |
| Verification | Low Tide verifies every quote itself against the fetched page (approach A) |

## Probe findings (throwaway scripts, 9 Gemini calls, not committed)

1. `gemini-2.5-flash` rejects tools plus JSON output in one call ("Tool use with a response mime type: 'application/json' is unsupported"). Brand mode needs two calls: search, then structured pick.
2. Asking Gemini to write source URLs fails: it only sees long Google redirect links and garbles them (most 404). One run returned empty research text and the structuring call then invented findings. So Gemini never writes URLs, and an empty search result stops the pipeline.
3. When the server takes links from the SDK's `sources` and grounding chunks, fetches the pages itself, and hands Gemini the page text to quote from, 15 of 16 quotes verified (Patagonia 9/9, H&M 6/7). Search about 11 to 15s, fetch about 1.5s, pick about 4s.
4. Source quality varies (Patagonia's "independent" sources were mostly blogs), and some brand pages are stale. Cards show the source site so the shopper can judge.
5. `urlContext` is not needed.

## Flow

```
input (name or URL)
  -> [URL only] isSafeUrl + readPage: the pasted page joins the source list first,
                and Call 1 searches for its host without "www." (e.g. "patagonia.com")
  -> Call 1: findSources(brand)        gemini-2.5-flash + google.tools.googleSearch, text discarded,
                                        links taken from result.sources + groundingMetadata.groundingChunks (max 8)
  -> readPage on each link, in parallel (10s timeout, 2 MB cap, text capped at 20k chars)
     unreadable or under 500 chars: skipped
  -> none readable: "Couldn't find enough about X to check."
  -> Call 2: pickQuotes(brand, pages)   gemini-2.5-flash, no tools, Output.object, thinkingBudget 0, temperature 0
  -> guardBrand(raw, pages)             pure, word-for-word checks, see Guard
  -> no claims left: "Couldn't find enough about X to check."
  -> Guides reading: askGemini(claim.quote) + guardFindings, up to 3 in parallel (existing code, unchanged)
  -> JSON response, every path, never a 500
```

## Units

### `lib/brand.ts`

```ts
type SourcePage = { id: string; url: string; host: string; text: string }; // id is "S1".."Sn"
type RawEvidence = { stance: "backs" | "pushes_back"; sourceId: string; quote: string };
type RawClaim = { claim: string; sourceId: string; quote: string; evidence: RawEvidence[] };
type Picked = { ownSites: string[]; claims: RawClaim[] }; // ownSites: source ids that belong to the brand

htmlToText(html: string): string            // drop script/style/noscript/svg/nav/footer, strip tags, decode entities, collapse whitespace
isSafeUrl(input: string): URL | null        // http(s) only; refuse IP-literal hosts, localhost, *.local, *.internal
readPage(url: string): Promise<SourcePage | null>   // follows redirects; url/host are the final ones
findSources(brand: string): Promise<string[]>       // Call 1
pickQuotes(brand: string, pages: SourcePage[]): Promise<Picked>   // Call 2
guardBrand(picked: Picked, pages: SourcePage[]): { claims: BrandClaim[]; removed: { mismatch: number; notIndependent: number; banned: number } }
```

`BrandClaim = { claim, quote, url, host, evidence: { stance, quote, url, host }[] }`.

### Model contract, Call 2

Input: the brand name and the readable pages, each as `=== S<n> <host> ===\n<text>`.
Output: `{ ownSites, claims: [{ claim, sourceId, quote, evidence: [{ stance, sourceId, quote }] }] }`.
- `ownSites`: ids of sources that belong to the brand (its main site, group site, regional sites).
- Up to 3 claims, each quoted from an own site. `claim` is a short label, 3 to 8 words.
- Up to 2 evidence items per claim, each from a source not in `ownSites`, stance `backs` or `pushes_back`.
- Every quote: one continuous passage of 10 to 40 words, copied character for character. No ellipses, no paraphrase.
- No own site among the sources: empty `claims`.
- Prompt prefers news, NGOs, certifiers and regulators over blogs. Never uses the three banned words from CLAUDE.md.

### Guard (`guardBrand`)

A claim is kept only if its `sourceId` is in `ownSites`, the page exists, and `verifyQuote(quote, page.text)` passes. Each evidence item is kept only if its source exists, is not in `ownSites`, its host differs from the claim's host, and its quote verifies. Any quote containing one of the three banned words is dropped. Every drop is counted by reason. A dropped claim takes its evidence with it (counted as one removal).

`verifyQuote` from `lib/guard.ts` is reused as is (6-word minimum, normalized substring).

### Shared helpers

Move `soften` out of `app/api/check/route.ts` into `lib/guard.ts` next to a shared `BANNED` regex, so both routes and `guardBrand` use one list.

### `app/api/brand/route.ts`

Body: `{ brand: string }`, trimmed, 2 to 300 characters. Response:

```ts
{ model, brand, source: "sample" | "live", savedOn?: string,
  pagesFound: number, pagesRead: number,
  claims: (BrandClaim & { findings: Shown[] })[],   // findings = Guides reading, same shape as /api/check
  removed: number, removedWhy: { mismatch, notIndependent, banned },
  error?: string }
```

- Sample hit (case-insensitive brand name): served from `fixtures/brands.json`. Its Guides findings go through `guardFindings` again at serve time.
- No `GOOGLE_GENERATIVE_AI_API_KEY`: "Live checks are offline right now. The sample brands still work."
- Bad input or unsafe URL: JSON 400.
- Any thrown error: the existing friendly message, status 200.

### `scripts/seed-brands.ts`

Runs the live pipeline for Patagonia and H&M and writes `fixtures/brands.json` as `{ savedOn: "2026-09-26", brands: { [name]: response } }`. Run with `node --env-file=.env.local scripts/seed-brands.ts`. Output is unedited.

### `app/page.tsx`

- Switch above the form: "A claim" / "A brand" (buttons with `aria-pressed`). Claim mode unchanged.
- Brand mode: one-line input ("Brand name or link to their sustainability page"), "Check brand" button, chips for Patagonia and H&M.
- Busy state: "Researching…" plus "Searching the web and reading sources. This takes about 20 seconds."
- Result heading: "What <brand> says, and what others found." Model line: "Researched live by Gemini 2.5 Flash with Google Search" or "Saved answer, checked against these pages on Sep 26, 2026."
- One card per claim: "They say" (brand quote, serif highlight, host link, "Quote checked word for word against their page"), "Green Guides reading" (the existing finding card, extracted into a `FindingCard` component used by both modes; tamper link claim mode only), "Others say" (pill "Backs it up" in sea glass or "Pushes back" in buoy, quote, host link; if none: "No independent source we could verify talks about this claim.").
- Below cards: "Read N of M sources found." and, when removed > 0, e.g. "3 quotes removed: 2 didn't match their page, 1 wasn't from an independent source."
- Footer: the exact existing text, plus in brand mode only: "Brand and source quotes are checked word for word against the page they came from."
- No em dashes in any new copy.

## Tests (`lib/brand.test.ts`, `node --test`)

1. `htmlToText` strips a script block and tags and decodes `&rsquo;` and `&amp;`, and a real sentence from the HTML then passes `verifyQuote`.
2. `guardBrand` keeps a real claim and its real evidence.
3. Drops a claim quote with one word changed (mismatch).
4. Drops evidence citing a missing source id (mismatch).
5. Drops evidence from an `ownSites` source or the claim's host (notIndependent).
6. Drops a quote containing a banned word (banned).
7. `isSafeUrl` accepts `https://example.com/x`, refuses `http://127.0.0.1`, `http://localhost:3000`, `file:///etc/passwd`, `ftp://x.com`.

Search, fetch and Gemini are verified by the seed run and a Playwright probe on prod, the same way M3 and M4 were.

## Milestones

| # | Target | Done when |
|---|---|---|
| B1 | Sat 4:30pm | `lib/brand.ts` plus tests pass, `soften` moved, both brand fixtures saved |
| B2 | Sat 7:00pm | `/api/brand` and the brand UI on prod. Playwright on prod: both samples, one live brand, one live URL, offline path with the key removed then restored |
| B3 | Sat 9:30pm | README, DEVPOST.md (under 700 words), video under 90s, CLAUDE.md, STATE.md, todo.md updated. Tagged `v2` |

Deploy with `vercel --prod` and append a STATE.md log entry after each.

## Scope cuts, in order

1. URL input (name only)
2. Guides reading inside brand cards
3. Live brand checks (samples only)

Never cut: the brand guard and its tests, the claim checker, the footer, the cached samples.

## Rollback

If brand mode is not solid on prod by Sat 11:00pm: `git checkout v1 && vercel --prod`, return to `main`, and submit v1 as it stands.

## Doc and rule changes (B3)

- CLAUDE.md: "Sample claims are generic. No brand names" becomes "Claim samples are generic. Brand samples are real companies, shown only through verified quotes." Footer rule gains the brand-mode sentence. Files list gains the new files. Stack notes the `googleSearch` tool.
- Demo path: Biodegradable chip, Ocean plastic chip, H&M brand sample, live claim, tamper test. Under 90s.
- README: brand mode section; new limitations (web pages change after samples are saved, source quality varies, sites that block downloads or render with JavaScript are skipped, "own site" is the model's call backed by a same-host check).
- DEVPOST.md: brand mode and Google Search grounding, still under 700 words.

## Out of scope

Overall grade or score, rate limiting (add if the URL is shared widely), streaming progress, tamper test in brand mode, new dependencies, a different model.
