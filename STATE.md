# STATE: Low Tide

Read first every session. Append only, never rewrite old entries.

## NEEDED FROM ETHAN
(nothing right now)

## Milestones
Bell was Sat Sept 26 10:00am EDT. If a milestone runs 90 min late, take the next scope cut and log it.

| # | Target | Done when | Status |
|---|---|---|---|
| M1 | Sat 11:00am | Repo on GitHub, hello world live on the prod URL | |
| M2 | Sat 1:00pm | Guides typed in, `verifyQuote` passes its tests | |
| M3 | Sat 3:00pm | Gemini returns typed findings, guard filters them, sample fixtures saved | |
| M4 | Sat 6:00pm | GATE: a judge can run the whole demo path on prod | |
| M5 | Sat 8:00pm | Gemini visibly load-bearing in the UI, offline path proven with key removed. Dependency freeze | |
| M6 | Sat 10:00pm | Backup demo video recorded from prod | |
| M7 | Sun 12:30am | README done (what, how the check works, limits, AI disclosure) | |
| M8 | Sun 6:00am | Code freeze, DEVPOST.md drafted | |

## Log

### Sat 11:48am, M1
- Milestone: hit, 48 min past target (under the 90 min cut line)
- Prod URL works: yes, https://low-tide-nine.vercel.app returns 200 with the hello page
- Tests pass: n/a (no tests yet)
- What broke: create-next-app refused the folder because a hook wrote `.planning/HANDOFF.json`. Scaffolded in scratchpad and moved it in; `.planning/` is gitignored
- Notes: GitHub repo public at chichiroxursox-droid/low-tide. Vercel project `low-tide` on team chiethan. AI SDK installed as v7, so structured output uses `generateText` + `Output.object`
- Next step: M2, type the six Green Guides sections from eCFR into `lib/guides.json`, write `verifyQuote` and its test
- Scope cuts so far: none

### Sat 11:58am, M2
- Milestone: hit, an hour ahead of the 1:00pm target
- Prod URL works: yes (200, redeployed)
- Tests pass: yes, `node --test` 6/6 (real quote, messy typography, one word changed, wrong section, too short, guardFindings filter)
- What broke: a test quote was only 4 words and the 6-word minimum rejected it. The test was wrong, not the guard
- Notes: `lib/guides.json` built from the eCFR versioner API (as of 2026-09-24), with examples included and footnote superscripts stripped. About 29k chars total, small enough to send all six sections every call. `guardFindings` normalizes "§ 260.8(b)" to "260.8" and blanks section/quote on not_covered
- Next step: M3, the Gemini route plus fixtures for the 4 sample claims
- Scope cuts so far: none

### Sat 12:21pm, M3
- Milestone: hit, about 2.5 hours ahead of the 3:00pm target
- Prod URL works: yes. On prod: all 4 samples come from fixtures, a live claim goes to Gemini (about 1.8s), a tampered recheck is dropped with removed=1, bad input gets a JSON 400
- Tests pass: yes, 7/7 (added `locateQuote` for the in-section highlight)
- What broke: with default thinking, Gemini 2.5 Flash put "carbon neutral" under 260.4 and stretched "ocean plastic" into 260.13 recycled content. A thinking budget of 0 plus two prompt rules (most specific section wins, don't assume claims the words don't make) gave 260.5 and not_covered, at about 1s per call. Fixtures are unedited model output
- Notes: `GOOGLE_GENERATIVE_AI_API_KEY` set in Vercel production and in `.env.local` (gitignored). Seed with `node --env-file=.env.local scripts/seed.ts`. The route also swaps any banned word in `why` as a safety net
- Next step: M4, build the page (chips, claim box, verdict cards with highlight, not_covered state, removed line, tamper link, footer)
- Scope cuts so far: none
