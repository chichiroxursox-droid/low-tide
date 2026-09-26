# Low Tide

**Track:** Sustainability
**Sponsor prize:** Best Use of Gemini

**Tagline:** Check a green claim, or a whole brand. Every quote on screen is checked word for word against its source.

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

Each finding shows its Guides paragraph with the quote highlighted and a link to eCFR.

**Brand mode.** Type a company's name or paste a link. Low Tide shows up to three claims the brand makes about itself, each with a Green Guides reading and up to two verified passages from other sites that back it up or push back. In the saved H&M sample, the Dutch consumer regulator pushes back. No score: the shopper decides.

## How I built it

- **Gemini 2.5 Flash through the Vercel AI SDK**, with zod structured output, so every finding arrives with its own quote to test.
- **The guard.** The server normalizes each quote (curly quotes, dashes, spacing, case) and requires an exact match of at least six words in the section Gemini cited. Failures are removed and counted on screen.
- **A tamper test** changes one word of a verified quote and sends it back through the same check, so you can watch it get removed.
- **The brand guard** checks every brand and source quote against the page it cites. Claims must come from the brand's own sites, evidence from anyone else.
- **Offline samples.** Four claims and two brands are saved, unedited Gemini answers that still pass through the guard, so the demo works without an API key.
- **25 unit tests** (`node --test`) cover both guards, the page reader and link safety.

## How Gemini is used

Gemini does the reading: it finds the environmental phrases, picks the section, decides the verdict and explains it. Brand mode adds Google Search grounding. The first call searches for the brand's pages and independent sources. Low Tide keeps only the links search returned and downloads each page itself. A second call, with no tools, quotes from that text by source id. Gemini finds the sources, and Low Tide verifies every quote against the page.

## Challenges

With default thinking, Gemini filed "carbon neutral" under general benefits and stretched "ocean plastic" into the recycled content rules. Two prompt rules fixed it, and a zero thinking budget made it about five times faster. Asked to write source URLs, Gemini garbled Google's redirect links, and 1 of 37 brand quotes verified. Taking links from the search results and quoting downloaded pages raised that to 15 of 16.

## Accomplishments and lessons

The core promise lives in code, not the prompt. A small tested function beat a longer prompt.

## What's next

- Load all of Part 260, not just six sections
- Check that each quote actually supports its verdict, not just that it exists

## Built with

Next.js, TypeScript, Tailwind CSS, Vercel, Vercel AI SDK, Google Gemini API (Gemini 2.5 Flash, Google Search grounding), zod, eCFR API

## AI disclosure

Built with Claude Code (Claude Opus 5.5) during the event. The app's only runtime AI API is the Gemini API: Gemini 2.5 Flash, plus Google Search grounding in brand mode. Low Tide is a reading of published guidance, not legal advice.
