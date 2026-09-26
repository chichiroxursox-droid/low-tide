# Low Tide

**Track:** Sustainability
**Sponsor prize:** Best Use of Gemini

**Tagline:** Check a green claim, or ask whether a brand is sustainable. Every quote is checked word for word against its source.

**Try it:** https://low-tide-nine.vercel.app
**Code:** https://github.com/chichiroxursox-droid/low-tide

## Inspiration

Packaging is full of words like "biodegradable" and "carbon neutral". The FTC's Green Guides (16 CFR Part 260) say what claims like these should mean, but few shoppers have read them. A chatbot can summarize them, and also invent a rule that sounds right.

So the rule I built around: no verified quote, no verdict. When the tide goes out, you see who's been swimming naked.

## What it does

**Claim mode.** Gemini 2.5 Flash reads a pasted claim against six sections of the Green Guides and returns one finding per environmental phrase, with one of three verdicts:

- **Needs qualification.** "Biodegradable plastic bag" lands here, citing 260.8: bags end up in landfills, where they won't break down within a year.
- **OK if they can prove it.** The Guides allow the claim if the seller has solid evidence.
- **Not covered by the Guides.** The Guides never mention "ocean plastic", and Low Tide says so rather than forcing a rule to fit.

Each finding shows its Guides paragraph with the quote highlighted.

**Brand mode.** Type a brand's name or a link, and Low Tide asks "Is it sustainable?" across four checks: certifications, climate action, independent ratings, and regulator and watchdog findings. Every Good sign or Red flag is a verified quote, and Not found means nothing could be verified, not a no. A rule in code turns the marks into Strong record, Mixed record, Red flags or Not enough evidence.

## How I built it

- **Gemini 2.5 Flash through the Vercel AI SDK**, with zod structured output, so every finding arrives with its own quote to test.
- **The guard** normalizes each quote (curly quotes, dashes, spacing, case) and requires an exact match of at least six words in the cited source. Failures are removed and counted. A tamper test changes one word to show a removal live.
- **Brand source rules live in code.** Certifications only count for a brand, watchdog findings only against it, and a brand can't vouch for its own certifications or ratings. Own sites are known by address.
- **The verdict is a fixed rule** over the four marks, never Gemini's opinion.
- **Offline samples.** Four claims and two brands are saved, unedited Gemini answers, so the demo needs no API key.
- **27 unit tests** (`node --test`).

## How Gemini is used

Gemini does the reading. Brand mode runs four Google Search grounded calls in parallel, one per check. Low Tide keeps only the returned links, downloads the pages, and drops any that never name the brand. A final call with no tools quotes from that text and marks each quote good or red. Low Tide verifies every quote and computes the verdict.

## Challenges

Gemini stretched "ocean plastic" into recycled content rules until a zero thinking budget and two prompt rules fixed it. Asked to write source URLs, Gemini garbled Google's redirect links, and 1 of 37 quotes verified. Quoting pages downloaded from search result links raised that to 15 of 16.

A made-up brand scored Mixed record from generic pages that never named it, so pages must now name the brand. Gemini also called a review blog Patagonia's own site, so a site's address now decides that.

## Accomplishments and lessons

The core promise lives in code, not the prompt. A small tested function beat a longer prompt, twice.

## What's next

- Load all of Part 260
- Check that each quote supports its verdict
- Recognize parent companies' sites, and cover small brands better

## Built with

Next.js, TypeScript, Tailwind CSS, Vercel, Vercel AI SDK, Google Gemini API (Gemini 2.5 Flash, Google Search grounding), zod, eCFR API

## AI disclosure

Built with Claude Code (Claude Opus 5.5) during the event. The only runtime AI API is the Gemini API: Gemini 2.5 Flash, plus Google Search grounding in brand mode (up to five calls per live brand check). Low Tide is a reading of evidence, not legal advice.
