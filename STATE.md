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

### Sat 12:28pm, M4 (GATE)
- Milestone: hit, about 5.5 hours ahead of the 6:00pm gate
- Prod URL works: yes. A headless Playwright run on prod covered all 4 chips, the live claim "Eco-friendly cleaner in a bottle made from recycled materials" (260.4 needs qualification plus 260.13 OK if proven), and a tamper test (changed "should" to "may" in the 260.5 quote, card dropped, "1 finding removed: quote didn't match the Guides."). No console errors, no horizontal scroll at 390px
- Tests pass: yes, 7/7
- What broke: nothing major. Fixed from screenshots: claim underline breaking at descenders, a highlight padding gap, and the not covered block repeating the model's why
- Notes: design uses tidal flat #E7ECE8, deep channel #12343B, buoy #E8B04B, sea glass #9CCBB8, sun #F7E49A; Schibsted Grotesk for UI and Newsreader for Guides text. The Guides passages keep their own em dashes because they are verbatim government text, and our UI copy has none
- Next step: M5, prove the offline path on prod with the key removed, then restore it
- Scope cuts so far: none

### Sat 12:33pm, M5
- Milestone: hit, about 7.5 hours ahead of the 8:00pm target. Dependency freeze from here on (only the kit's stack: next, react, ai, @ai-sdk/google, zod, tailwind)
- Prod URL works: yes. Offline proof: removed `GOOGLE_GENERATIVE_AI_API_KEY` from Vercel production and redeployed. On prod, all 4 samples returned their saved answers through the guard, the tamper test still dropped the edited quote, and the live claim showed "Live checks are offline right now. The sample claims still work." with a 200, not a 500. Restored the key, redeployed, and the live claim was answered by Gemini again in 1.8s
- Tests pass: yes, 7/7
- What broke: nothing
- Notes: the intro now names Gemini 2.5 Flash as the reader and Low Tide as the quote checker. Each result says "Checked live by Gemini 2.5 Flash" or "Saved answer from Gemini 2.5 Flash, so this sample works offline."
- Next step: M6, a scripted headless Playwright recording of the demo path on prod, converted to H.264 under 90s at ~/Desktop/low-tide-demo.mp4
- Scope cuts so far: none

### Sat 12:40pm, M6
- Milestone: hit, about 9 hours ahead of the 10:00pm target
- Prod URL works: yes (the video was recorded against it)
- Tests pass: yes, 7/7
- What broke: the first recording (old headless shell) left a background-colored unpainted tile over the 260.13 quote after smooth scrolls. Chromium's new headless mode (`channel: "chromium"`) plus a 1px scroll nudge after each scroll fixed it
- Notes: `~/Desktop/low-tide-demo.mp4`, H.264, 1280x800, 72.8s, 5.6MB. Made by `node scripts/record-demo.mjs` (uses the global Playwright, not a project dependency), then ffmpeg to libx264. Checked every 4s frame: hero, 260.8 highlight, 260.5, ocean plastic not covered, live claim typed and checked (260.4 + 260.13), tamper test, "1 finding removed", footer caption. Captions stand in for narration. Live Gemini output varied between runs even at temperature 0 (a different 260.13 quote), so that goes in the README limitations
- Next step: M7, README (what it does, how the check works, limitations, AI disclosure)
- Scope cuts so far: none

### Sat 12:45pm, M7
- Milestone: hit, about 12 hours ahead of the Sun 12:30am target
- Prod URL works: yes (redeployed, 200)
- Tests pass: yes, 7/7
- What broke: nothing. Caught and reworded one README line that used a banned word
- Notes: README covers what it does, how the check works (source text, structured output, guard functions, tamper test, offline samples, tests), how to run it, 9 limitations, and an AI disclosure (built with Claude Code on Claude Opus 5.5; runtime is only Gemini 2.5 Flash via the Gemini API and Vercel AI SDK; eCFR is used at build time only). A scan found no em dashes in README or UI files
- Next step: M8, DEVPOST.md under 700 words naming the Sustainability track and Best Use of Gemini, then tag v1 as the code freeze
- Scope cuts so far: none
