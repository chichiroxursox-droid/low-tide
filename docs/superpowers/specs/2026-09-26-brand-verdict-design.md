# Brand verdict: design

Date: Sat Sept 26 2026. Supersedes the output half of `2026-09-26-brand-mode-design.md` (input, link safety, page reading and quote checking stay as built in `v2`).

## Intent

A shopper asks "is this brand sustainable?" and gets a verdict about the brand itself, built from a fixed checklist where every mark is backed by a quote checked word for word against its source page. The verdict is computed by a rule in code, never by the model's opinion. Claim mode (Green Guides) is unchanged.

Success: on prod, both sample brands show a verdict with at least 2 checks backed by verified quotes, a live brand check finishes in about 20 seconds, and a brand with no evidence gets "Not enough evidence" or "Couldn't find enough", never an invented mark.

## Decisions (from the brainstorm)

| Question | Decision |
|---|---|
| Basis | Checklist, verdict computed from it by a rule we write |
| Checks | Certifications, Climate action, Independent ratings, Regulator and watchdog findings |
| Labels | Strong record, Mixed record, Red flags, Not enough evidence |
| Old parts | Drop brand claims, "They say / Others say", and Guides readings from brand mode |
| Offline path | Not re-proved by removing the key again: the route's offline branch is unchanged and samples never call Gemini |
| Rollback | `v2` (claim comparison, proven on prod) if C2 is not solid by Sat 11:00pm |

## Flow

```
input (name or link, unchanged)
  -> Call 1 x4 in parallel: one Google Search per check, links from the SDK's sources only,
     up to 4 per check, interleaved, deduplicated, max 12. A failed search yields no links.
  -> readPage on each (unchanged), pasted link first
  -> no readable page: "Couldn't find enough about X to check."
  -> Call 2: pickQuotes, no tools, structured output:
     { checks: [{ check, findings: [{ sign: good|red, sourceId, quote, note }] }] }
  -> guardChecks (pure): verify each quote, apply source rules, derive each check's mark
  -> verdictFor (pure, run by the route at serve time for live and sample results alike)
```

## Source rules (`guardChecks`)

Revised after the first build (a made-up brand got "Mixed record" from generic pages about other companies, and Gemini marked "not a B Corp" red and called a review blog Patagonia's own site). Rules that were prompts are now code:

- Before the pick call, a downloaded page that never names the brand (`namesBrand`, whole words read with the spaces squeezed out, "&" as "and" or left out, a possessive "'s" optional, accents stripped) is dropped. The pasted link is exempt. A made-up brand ends with 0 pages read and "Couldn't find enough".
- A finding is kept only if its source exists and `verifyQuote(quote, page.text)` passes (else `mismatch`).
- Signs per check: certifications only `good`, watchdogs only `red`, climate and ratings either. Anything else is dropped (`offCheck`, shown as "didn't fit its check").
- A page is the brand's own when a label of its host starts with the brand's name, "the" or "about" allowed in front (`hostNamesBrand`; a name under 4 characters must be the whole label, a company word like "group" aside, so `hmrc.gov.uk` isn't H&M's). For a link, the name is the label its site is registered under (`ruleName`: `www2.hm.com` is "hm"). Gemini no longer lists own sites. A parent company's site is not recognized (README limitation).
- Certifications and Independent ratings: a `good` finding from a brand-owned page is refused (`wrongSite`). The brand can't vouch for itself.
- Climate action: may come from the brand's own site (publishing emissions is the point).
- `red` findings: any source.
- A quote or source host containing one of the three banned words is dropped (`banned`).
- At most 2 findings per check. Notes go through `soften`.

## Marks and verdict

Each check's mark: `good` if only good findings survive, `red` if only red, `both` if both, `not_found` if none.

`verdictFor(checks)`, with G = checks marked good, R = checks marked red, B = checks marked both, E = checks not `not_found`:
- E < 2: `not_enough` (Not enough evidence)
- R > 0 and R >= G: `red_flags` (Red flags)
- G >= 3 and R = 0 and B = 0: `strong` (Strong record)
- otherwise: `mixed` (Mixed record)

## API

`POST /api/brand` `{ brand }` returns `{ model, brand, source, savedOn?, pagesFound, pagesRead, verdict, good, red, checks: [{ check, mark, signals: [{ sign, quote, note, url, host, own }] }], removed, removedWhy: { mismatch, offCheck, wrongSite, banned }, error? }`. Input limits, link refusal, sample lookup, offline message and the friendly error are unchanged from `v2`.

## UI (brand mode)

- Intro: "Type a brand or a link to its site. Gemini 2.5 Flash searches for certifications, climate action, independent ratings and regulator findings, and Low Tide checks every quote word for word against the page it came from."
- Heading "Is H&M sustainable?", verdict pill (Strong record in sea glass, Mixed record in sun, Red flags in buoy, Not enough evidence dashed), the rule line ("2 good signs, 1 red flag across 4 checks."), "This describes the evidence Low Tide could verify, not a certification.", saved or live line, "Read N of M sources found."
- Four check cards in fixed order, each with a mark pill (Good sign, Red flag, Both, Not found), and per finding: its plain note, the quote, the source link, a "their own site" tag when brand-owned, and in a Both card a Good sign or Red flag tag on each finding. The rule line spells a Both check as "1 with both a good sign and a red flag". Not found: "Low Tide couldn't find a source it could verify for this. That isn't the same as a no."
- Removed line as in `v2`, reasons: didn't match the page they cite, didn't fit its check, came from the brand's own site, used legal wording Low Tide doesn't show.
- Footer: exact text, plus in brand mode only: " In brand mode, every quote is checked word for word against the page it came from."

## Samples and tests

Re-seed Patagonia and H&M (unedited). Gate: each sample has at least 2 checks not `not_found`; rerun once if not; if still thin, stop and report.

Tests keep `htmlToText`, `isSafeUrl`, `parseBrandInput`, `readPage`. Replace the claim-comparison guard tests with: marks per check (good, red, both, not found), each source rule, sloppy ids, banned words, the 2-per-check cap, softened notes, and every verdict branch.

## Milestones

| # | Target | Done when |
|---|---|---|
| C1 | Sat 5:00pm | lib and tests pass, samples re-seeded and through the gate |
| C2 | Sat 6:30pm | Route and UI on prod. Playwright on prod: both samples, one live brand, one made-up brand, claim mode unchanged |
| C3 | Sat 8:00pm | README, DEVPOST under 700 words, CLAUDE.md, STATE.md, todo, video with the H&M verdict. Tagged `v3` |

## Out of scope

A numeric score, per-industry checklists, Guides readings in brand mode, rate limiting.
