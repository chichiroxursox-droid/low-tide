# Low Tide

**Elevator pitch:** Is this brand sustainable, for the planet and for the people who make its products? Low Tide answers with quotes checked word for word against their source. No verified quote, no verdict.

**Try it:** https://low-tide-nine.vercel.app
**Code:** https://github.com/chichiroxursox-droid/low-tide
**Track:** Sustainability. **Sponsor prize:** Best Use of Gemini

**Built with:** Next.js, TypeScript, Tailwind CSS, Vercel, Vercel AI SDK, Google Gemini API (Gemini 2.5 Flash, Google Search grounding), zod, eCFR API

---

## Inspiration

A shopper deciding whether to buy from a company has a simple question: is this brand actually sustainable? A chatbot can summarize the evidence, and it can also invent a source that sounds right.

So I built around one rule: no verified quote, no verdict. When the tide goes out, you see who's been swimming naked.

## What it does

**Brand mode**, the first thing you see. Type a brand's name or paste a link, and Low Tide checks five things: certifications, climate action, labor and sourcing (child and forced labor, wages, factory safety), independent ratings, and regulator and watchdog findings.

Every Good sign or Red flag is a quote checked word for word against its page. Known sources (regulators, established news, recognized certifiers, raters and rights groups) come first; a lesser-known site fills a gap only when needed, and is tagged. A rule in code, not Gemini, turns the marks into Strong record, Mixed record, Red flags or Not enough evidence. H&M gets Red flags: reports of abused garment workers at its suppliers, and the Dutch regulator's action on its "Conscious" labels.

**Claim mode.** Paste a label claim, and Gemini 2.5 Flash reads it against six sections of the FTC Green Guides (16 CFR Part 260):

- **Needs qualification.** "Biodegradable plastic bag" lands here, citing 260.8: bags end up in landfills, where they won't break down within a year.
- **OK if they can prove it.** Allowed with solid evidence.
- **Not covered by the Guides.** The Guides never mention "ocean plastic", and Low Tide says so rather than forcing a rule to fit.

A tamper test changes one word of a quote to show a removal live.

## How I built it

- **Gemini 2.5 Flash through the Vercel AI SDK**, with zod structured output, so every finding arrives with a quote to test.
- **Gemini finds, code checks.** A brand check runs five Google Search grounded calls in parallel, one per check. Low Tide keeps only the links, downloads the pages itself, and drops junk sites and pages that never name the brand. A final call with no tools quotes from that text and marks each quote good or red.
- **The guard** normalizes each quote and requires an exact match of at least six words in the cited source. Failures are removed and counted on screen.
- **Source rules live in code.** Certifications only count for a brand, watchdog findings only against it, and a brand can't vouch for its own certifications, ratings or factories.
- **Real progress.** The loading screen shows each step of a live check as the server streams it.
- **Offline samples**, saved unedited, so the demo needs no API key.
- **30 unit tests.**

## Challenges

- Gemini stretched "ocean plastic" into recycled content rules until a zero thinking budget and two prompt rules fixed it.
- Asked to write source URLs, Gemini garbled Google's redirect links, and 1 of 37 quotes verified. Quoting downloaded pages raised that to 15 of 16.
- A made-up brand scored Mixed record from pages that never named it, so pages must now name the brand.
- Gemini called a review blog Patagonia's own site, and early samples leaned on blogs, so a site's address now decides both.
- A verified quote can still carry the wrong sign: Gemini once counted a middle rating as good. Tighter rules helped.

## What I learned

The core promise has to live in code, not the prompt. A small tested function beat a longer prompt more than once. Honest "we don't know" answers (Not covered, Not found, Not enough evidence) matter as much as the verdicts.

## What's next

- Load all of Part 260
- Check that each quote supports its verdict, not just that it exists
- Recognize parent companies' sites, and cover small brands better

## AI disclosure

Built with Claude Code (Claude Opus 5.5) during the event. The only runtime AI API is the Gemini API: Gemini 2.5 Flash, plus Google Search grounding in brand mode (up to six calls per live brand check). Low Tide is a reading of evidence, not legal advice.
