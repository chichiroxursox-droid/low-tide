# STATE: Low Tide

Read first every session. Append only, never rewrite old entries.

## NEEDED FROM ETHAN
(nothing right now)

## Milestones
Bell was Sat Sept 26 10:00am EDT. If a milestone runs 90 min late, take the next scope cut and log it.

| # | Target | Done when | Status |
|---|---|---|---|
| M1 | Sat 11:00am | Repo on GitHub, hello world live on the prod URL | hit 11:48am |
| M2 | Sat 1:00pm | Guides typed in, `verifyQuote` passes its tests | hit 11:58am |
| M3 | Sat 3:00pm | Gemini returns typed findings, guard filters them, sample fixtures saved | hit 12:21pm |
| M4 | Sat 6:00pm | GATE: a judge can run the whole demo path on prod | hit 12:28pm |
| M5 | Sat 8:00pm | Gemini visibly load-bearing in the UI, offline path proven with key removed. Dependency freeze | hit 12:33pm |
| M6 | Sat 10:00pm | Backup demo video recorded from prod | hit 12:40pm |
| M7 | Sun 12:30am | README done (what, how the check works, limits, AI disclosure) | hit 12:45pm |
| M8 | Sun 6:00am | Code freeze, DEVPOST.md drafted | hit 12:49pm |

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

### Sat 12:49pm, M8
- Milestone: hit. Code frozen and tagged `v1` on GitHub, 19 hours before the Sun 8:00am hard stop. From here, only README, video and DEVPOST.md may change
- Prod URL works: yes. Final probe on prod: 4 samples served through the guard, live claim answered by Gemini in 1.8s, tamper recheck removed=1, bad input gets a JSON 400
- Tests pass: yes, 7/7
- What broke: DEVPOST.md first came in at 777 words. Trimmed to 691 by merging overlapping sections
- Done check: (1) `node --test` 7/7 pass. (2) `vercel --prod` live at https://low-tide-nine.vercel.app, 200, full demo path works, offline path proven at M5. (3) Public repo chichiroxursox-droid/low-tide, no `.env*` in the tree or history. (4) README has what, how, limitations, AI disclosure. (5) ~/Desktop/low-tide-demo.mp4, H.264, 72.8s, frames checked. (6) DEVPOST.md, 691 words, names Sustainability and Best Use of Gemini. (7) This log has M1 to M8
- Next step: Ethan submits on Devpost (see tasks/todo.md). Nothing left for the build
- Scope cuts so far: none

### Sat 12:55pm, M6 addendum (video only)
- Re-recorded the backup video. A caption said the live claim was "copied off a real package", which wasn't true (I wrote the claim text). It now reads "Now a claim typed in live, checked by Gemini 2.5 Flash."
- ~/Desktop/low-tide-demo.mp4 is now H.264, 1280x800, 76.9s. All frames checked, no artifacts, footer caption present at the end
- No app code changed. v1 tag still matches what is deployed

## Brand mode (v2, add-on before the freeze)
Spec `docs/superpowers/specs/2026-09-26-brand-mode-design.md`, plan `docs/superpowers/plans/2026-09-26-brand-mode.md`. Targets: B1 Sat 4:30pm, B2 Sat 7:00pm, B3 Sat 9:30pm. Rollback line Sat 11:00pm (`git checkout v1 && vercel --prod`).

### Sat 2:28pm, B1
- Milestone: hit, 2 hours ahead of the 4:30pm target
- Prod URL works: yes (unchanged v1 until B2)
- Tests pass: yes, 22/22 (then 25/25 after review fixes)
- What broke: probes first. Gemini 2.5 Flash rejects tools plus JSON output in one call, and when asked to write source URLs it garbled Google's redirect links (1 of 37 quotes verified). Fixed by design: search call only yields links from the SDK's `sources`, the server fetches the pages, a second call quotes from that text. Probe then verified 15 of 16
- Notes: `lib/brand.ts` (input parsing, link safety, page reader, `guardBrand`, two Gemini calls, `checkBrand`). Seed: Patagonia 7/8 pages, 3 claims, 6 evidence; H&M 6/8 pages, 3 claims, 2 evidence (both pushback, one from acm.nl, the Dutch consumer regulator). Fixtures are unedited: a reviewer hand-trimmed a clunky Patagonia quote and it was reverted
- Next step: B2, route and UI on prod
- Scope cuts so far: none

### Sat 3:01pm, B2
- Milestone: hit, 4 hours ahead of the 7:00pm target
- Prod URL works: yes. Playwright on prod at 390 and 1280: claim sample plus tamper test ("1 finding removed"), both brand samples (3 cards each, "checked against these pages on Sep 26, 2026"), live brand Allbirds in 16.0s (3 cards), live link patagonia.com/our-footprint in 27.2s (3 cards, 7 of 9 sources read), brand footer sentence, no horizontal scroll, no console errors
- Offline proof: removed `GOOGLE_GENERATIVE_AI_API_KEY` from production and redeployed. Both brand samples and claim samples still rendered, tamper test still worked, live brand and live claim showed their offline lines with a 200. Restored the key, redeployed, live claim answered in 2.2s
- Tests pass: yes, 25/25; tsc, lint, build clean
- What broke: a three-lens review found 12 issues, all reproduced and fixed with tests: quadratic regexes in `htmlToText` on hostile HTML, trailing-dot hosts (`localhost.`) slipping past the link check, evidence from a second brand-owned host counted as independent, claim labels not softened, charset ignored, "L.L.Bean" parsed as a link, no empty state for a missing Guides reading, two intros stacked in brand mode, placeholder cut off at 390px
- Notes: live checks lean on the model to say which sites are the brand's own (Allbirds quotes came from allbirds.com.kw and allbirdsbenelux.nl). Guard backs that up with a same-host and subdomain check
- Next step: B3, README, DEVPOST, CLAUDE.md, video, tag v2
- Scope cuts so far: none

### Sat 3:18pm, B3
- Milestone: hit, about 6 hours ahead of the 9:30pm target. Tagged `v2` on GitHub and deployed. `v1` stays as the rollback point
- Prod URL works: yes (redeployed, 200). Code unchanged since B2; this milestone is docs and video
- Tests pass: yes, 25/25
- What broke: a skeptical check of the new docs found 6 overstatements, all fixed (for example "up to 8 pages" when a pasted link makes it 9, and "calls only the Gemini API" when brand mode also downloads web pages)
- Notes: README has a brand mode section and 7 new limitations. DEVPOST.md is 699 words and names Sustainability and Best Use of Gemini. CLAUDE.md rules updated (brand samples are real companies shown only through verified quotes, brand footer sentence, new files, new demo path). New video ~/Desktop/low-tide-demo.mp4, H.264, 1280x800, 76.7s, recorded from prod: Biodegradable chip, ocean plastic chip, H&M sample with the acm.nl pushback, live claim, tamper test. Frames checked. The v1 video is kept at ~/Desktop/low-tide-demo-v1.mp4
- Next step: Ethan submits on Devpost (tasks/todo.md). Code freeze Sun 8:00am
- Scope cuts so far: none
