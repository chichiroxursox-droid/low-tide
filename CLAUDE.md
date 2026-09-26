# Low Tide (OwlHacks 2026)

Someone pastes a green marketing claim from a product. Low Tide reads it against the FTC Green Guides (16 CFR Part 260) and returns findings, each one backed by a quote from the Guides. The server checks every quote word for word against the real section text and drops any that don't match. No verified quote, no verdict.

Tracks: Sustainability. Sponsor prize: Best Use of Gemini. Solo build, all code written during the event (MLH rule 9).

Start every session by reading `STATE.md`. Don't re-explore the repo.

## Stack (no additions)
Next.js 15 App Router, TypeScript, Tailwind 4, `ai` v7 + `@ai-sdk/google` + `zod`. Model: `gemini-2.5-flash`. Hosted on Vercel. No database, no auth.
AI SDK v7 has no `generateObject`. Structured output goes through `generateText({ output: Output.object({ schema }) })`.
Brand mode searches with `google.tools.googleSearch`, which ships in `@ai-sdk/google`, so no new dependency. Gemini 2.5 Flash rejects a tool and structured output in the same call, so search and structured output are two separate calls.

## Files
- `app/page.tsx`: claim/brand mode switch, claim input and sample chips, brand input and sample chips, verdict cards, brand cards, footer
- `app/api/check/route.ts`: one Gemini call, then the guard. Returns JSON on every path, never a 500
- `lib/guides.json`: Green Guides sections from eCFR, shape `{ section, title, text, url }`. Scope: 260.4, 260.5, 260.7, 260.8, 260.12, 260.13
- `lib/guard.ts`: `verifyQuote(quote, sectionText)`, a pure normalized substring check (whitespace, curly quotes, dash variants)
- `lib/guard.test.ts`: `node --test` cases: real quote passes, one changed word fails, quote from the wrong section fails
- `fixtures/`: saved Gemini output for the sample claims. Samples are served from here, so the app works with no API key
- `lib/brand.ts`: brand pipeline: input parsing, `isSafeUrl`, `readPage`, `guardBrand`, the two Gemini calls, `checkBrand`
- `lib/brand.test.ts`: `node --test` cases for `htmlToText`, `isSafeUrl`, `parseBrandInput`, `readPage` and every `guardBrand` drop reason
- `app/api/brand/route.ts`: brand samples, live brand check, offline line, Guides guard at serve time. Returns JSON on every path, never a 500
- `fixtures/brands.json`: saved brand results for Patagonia and H&M, unedited, so brand samples work with no API key
- `scripts/seed-brands.ts`: runs the live brand pipeline and writes `fixtures/brands.json`

## Model contract
Input: the claim, the list of section numbers and titles, and the full text of those sections.
Output: `{ findings: [{ phrase, section, verdict, why, quote }] }` where verdict is `needs_qualification`, `ok_if_substantiated`, or `not_covered`.
- `phrase` is lifted exactly from the claim
- `quote` is copied exactly from the named section
- A finding whose quote fails `verifyQuote` is removed, and the UI says how many were removed and why
- `not_covered` means the Guides don't address the phrase. It is its own visible state, never shoehorned into a section, and needs no quote

### Brand mode contract
Call 1: Gemini with `googleSearch`. Its text is thrown away. Links come only from the SDK's sources, max 8, and the server downloads the pages itself.
Call 2: no tools, gets the readable pages as `=== S<n> <host> ===` blocks. Output: `{ ownSites, claims: [{ claim, sourceId, quote, evidence: [{ stance, sourceId, quote }] }] }` where stance is `backs` or `pushes_back`.
- `ownSites` lists the source ids that belong to the brand. Up to 3 claims, up to 2 evidence items each
- A claim is kept only if its source is in `ownSites` and its quote passes `verifyQuote` against that page
- Evidence is kept only if its quote passes `verifyQuote` against its page and that page is not on a brand host or its subdomain
- Any quote with a banned word is dropped. A dropped claim takes its evidence with it. Drops are counted as `mismatch`, `wrongSite`, `banned`, and `guides` for Guides quotes dropped at serve time
- Each kept claim quote gets a Guides reading. A failed Guides call is `null` for that card, not a failed check

Tamper test (owner-approved): a link on each verified card changes one word of its quote and posts it back through the same guard, so the "finding removed" line can be shown live on demand.

## Hard rules
- Never use the words "illegal", "violation", or "lawsuit" anywhere. This is a reading of guidance, not legal advice
- No verdict renders without a verified quote (except `not_covered`, which has none by definition)
- Claim samples are generic. Brand samples are real companies, shown only through verified quotes.
- No em dashes in UI copy, README, or DEVPOST.md
- `.env*` is never committed. Key name: `GOOGLE_GENERATIVE_AI_API_KEY`
- Footer text, exactly: "Low Tide reads your claim against the FTC Green Guides (16 CFR Part 260). It is not legal advice. Every quote is checked word for word against the Guides before it is shown." In brand mode only, the page appends: " Brand and source quotes are checked word for word against the page they came from."
- Code freeze Sun Sept 27 8:00am EDT. After that only README, video, DEVPOST.md

## Workflow
- Deploy with `vercel --prod` after each milestone, then append a log entry to `STATE.md`
- Test: `node --test` (pipe output to a file, read failures only)
- Same error survives 3 fixes: stop, apply the next scope cut, log it
- Scope cuts, in order: (1) sections past the six, (2) live claim box, (3) highlight inside section text, (4) fourth sample
- Brand mode scope cuts, in order: (1) URL input (name only), (2) Guides reading in brand cards, (3) live brand checks (samples only)
- Never cut: the guard and its test, the brand guard and its tests, the `not_covered` state, the footer, the cached samples

## Demo path (under 90s, prod URL only)
1. Chip "Biodegradable plastic bag": needs qualification, 260.8 quote highlighted
2. Chip "Made with ocean plastic": not covered, and why saying so matters
3. Switch to "A brand", sample H&M: its own claims next to the Dutch consumer regulator (acm.nl) pushing back
4. Back to "A claim": a live claim
5. Tamper test once (claim mode only) to show the "finding removed" line
