# Low Tide (OwlHacks 2026)

Someone pastes a green marketing claim from a product. Low Tide reads it against the FTC Green Guides (16 CFR Part 260) and returns findings, each one backed by a quote from the Guides. The server checks every quote word for word against the real section text and drops any that don't match. No verified quote, no verdict.

Tracks: Sustainability. Sponsor prize: Best Use of Gemini. Solo build, all code written during the event (MLH rule 9).

Start every session by reading `STATE.md`. Don't re-explore the repo.

## Stack (no additions)
Next.js 15 App Router, TypeScript, Tailwind 4, `ai` v7 + `@ai-sdk/google` + `zod`. Model: `gemini-2.5-flash`. Hosted on Vercel. No database, no auth.
AI SDK v7 has no `generateObject`. Structured output goes through `generateText({ output: Output.object({ schema }) })`.
Brand mode searches with `google.tools.googleSearch`, which ships in `@ai-sdk/google`, so no new dependency. Gemini 2.5 Flash rejects a tool and structured output in the same call, so search and structured output are two separate calls.

## Files
- `app/page.tsx`: the lifeguard board (see DESIGN.md): red stencil header with the "What the flags mean" sign, claim/brand tabs, entry strip and sample plaques, claim finding rows with flags and the tamper test (a pulled row stays, flag lowered, swapped word struck through), the brand verdict on a flag pole with four check rows, the tide loader for live checks, footer
- `app/api/check/route.ts`: one Gemini call, then the guard. Returns JSON on every path, never a 500
- `lib/guides.json`: Green Guides sections from eCFR, shape `{ section, title, text, url }`. Scope: 260.4, 260.5, 260.7, 260.8, 260.12, 260.13
- `lib/guard.ts`: `verifyQuote(quote, sectionText)`, a pure normalized substring check (whitespace, curly quotes, dash variants)
- `lib/guard.test.ts`: `node --test` cases: real quote passes, one changed word fails, quote from the wrong section fails
- `fixtures/`: saved Gemini output for the sample claims. Samples are served from here, so the app works with no API key
- `lib/brand.ts`: brand pipeline: input parsing, `isSafeUrl`, `readPage`, `namesBrand`, `hostNamesBrand`, `ruleName`, the four searches (`findSources`), the pick call (`pickQuotes`), `guardChecks`, `verdictFor`, `checkBrand`
- `lib/brand.test.ts`: `node --test` cases for `htmlToText`, `isSafeUrl`, `parseBrandInput`, `readPage`, `namesBrand`, `hostNamesBrand`, `ruleName`, every `guardChecks` source rule and mark, and every `verdictFor` branch
- `app/api/brand/route.ts`: brand samples, live brand check, offline line, "Couldn't find enough" line, verdict from `verdictFor` at serve time. Samples and errors return JSON; a live brand check streams NDJSON (one `stage` line per real step from `checkBrand`, then one `result` line) so the tide loader shows real progress. Never a 500
- `fixtures/brands.json`: saved brand checks for Patagonia (Mixed record) and H&M (Red flags), guarded at seed time and unedited, so brand samples work with no API key. No verdict is saved; the route computes it
- `scripts/seed-brands.ts`: runs the live brand pipeline and writes `fixtures/brands.json`

## Model contract
Input: the claim, the list of section numbers and titles, and the full text of those sections.
Output: `{ findings: [{ phrase, section, verdict, why, quote }] }` where verdict is `needs_qualification`, `ok_if_substantiated`, or `not_covered`.
- `phrase` is lifted exactly from the claim
- `quote` is copied exactly from the named section
- A finding whose quote fails `verifyQuote` is removed, and the UI says how many were removed and why
- `not_covered` means the Guides don't address the phrase. It is its own visible state, never shoehorned into a section, and needs no quote

### Brand mode contract
Brand mode answers "Is this brand sustainable?" with a verdict built from four checks: `certifications`, `climate`, `ratings`, `watchdogs`. It has no brand claims, no "They say / Others say" cards and no Guides reading.
Call 1 (`findSources`): four Google Searches in parallel, one per check, with `googleSearch`. Gemini's text is thrown away. Links come only from the SDK's sources, up to 4 per check, interleaved, deduplicated, max 12. A failed search brings no links. The server downloads the pages itself, a pasted link first.
Page name filter: a downloaded page that never names the brand (`namesBrand`: whole words read with the spaces squeezed out, "&" as "and" or left out, a possessive "'s" optional, accents stripped) is dropped before call 2. The pasted link is exempt. With no readable page left, the route says "Couldn't find enough about X to check." and makes no pick call.
Call 2 (`pickQuotes`): no tools, gets the readable pages as `=== S<n> <host> ===` blocks. Output: `{ checks: [{ check, findings: [{ sign, sourceId, quote, note }] }] }` where sign is `good` or `red`. Gemini does not say which sites are the brand's own; code does.
Guard (`guardChecks`, pure):
- Only the first 2 findings per check are read. A finding is kept only if its source exists and its quote passes `verifyQuote` against that page, else `mismatch`
- Signs per check: certifications only `good`, watchdogs only `red`, climate and ratings either. Anything else is `offCheck`
- A page is the brand's own when a label of its host starts with the brand's name, "the" or "about" allowed in front (`hostNamesBrand`). A name under 4 characters must be the whole label, a company word like "group" aside, so `hmrc.gov.uk` isn't H&M's. For a link, the name is the label its site is registered under (`ruleName`: `www2.hm.com` is "hm"). A parent company's site is not recognized
- Certifications and ratings: a `good` finding from a brand-owned page is `wrongSite`, because the brand can't vouch for itself. Climate may come from the brand's own site. `red` findings may come from any source
- A quote or source host containing a banned word is `banned`
- Notes go through `soften`. Each check's mark comes from what survives: `good`, `red`, `both`, or `not_found`
- Removed findings are counted as `mismatch`, `offCheck`, `wrongSite`, `banned`, and the UI says how many were removed and why

Verdict (`verdictFor`, pure): a rule in code, never the model's opinion. The route runs it at serve time for live and sample results alike, so it is never saved. With G, R, B the checks marked good, red, both, and E the checks not `not_found`:
- E < 2: `not_enough` (Not enough evidence)
- R > 0 and R >= G: `red_flags` (Red flags)
- G >= 3, R = 0 and B = 0: `strong` (Strong record)
- otherwise: `mixed` (Mixed record)

Tamper test (owner-approved): a link on each verified card changes one word of its quote and posts it back through the same guard, so the "finding removed" line can be shown live on demand.

## Hard rules
- Never use the words "illegal", "violation", or "lawsuit" anywhere. This is a reading of guidance, not legal advice
- No verdict renders without a verified quote (except `not_covered`, which has none by definition). In brand mode, Strong record, Mixed record and Red flags need verified quotes on at least 2 checks; "Not enough evidence" and a "Not found" card are the honest no-answer states and carry no quote
- Claim samples are generic. Brand samples are real companies, shown only through verified quotes.
- No em dashes in UI copy, README, or DEVPOST.md
- `.env*` is never committed. Key name: `GOOGLE_GENERATIVE_AI_API_KEY`
- Footer text, exactly: "Low Tide reads your claim against the FTC Green Guides (16 CFR Part 260). It is not legal advice. Every quote is checked word for word against the Guides before it is shown." In brand mode only, the page appends: " In brand mode, every quote is checked word for word against the page it came from."
- Code freeze Sun Sept 27 8:00am EDT. After that only README, video, DEVPOST.md

## Workflow
- Deploy with `vercel --prod` after each milestone, then append a log entry to `STATE.md`
- Test: `node --test` (pipe output to a file, read failures only)
- Same error survives 3 fixes: stop, apply the next scope cut, log it
- Scope cuts, in order: (1) sections past the six, (2) live claim box, (3) highlight inside section text, (4) fourth sample
- Brand mode scope cuts, in order: (1) URL input (name only), (2) live brand checks (samples only)
- Never cut: the guard and its test, the brand guard and its tests, the `not_covered` state, the footer, the cached samples

## Demo path (under 90s, prod URL only)
1. Chip "Biodegradable plastic bag": needs qualification, 260.8 quote highlighted
2. Chip "Made with ocean plastic": not covered, and why saying so matters
3. Switch to "A brand", sample H&M: Red flags verdict and the Norwegian Consumer Authority quote
4. Switch back to "A claim": a live claim
5. Tamper test once (claim mode only) to show the "finding removed" line
