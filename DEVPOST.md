# Low Tide

**Track:** Sustainability
**Sponsor prize:** Best Use of Gemini

**Tagline:** Paste a green claim from a product. See the exact FTC Green Guides passage behind every answer, checked word for word.

**Try it:** https://low-tide-nine.vercel.app
**Code:** https://github.com/chichiroxursox-droid/low-tide

## Inspiration

Packaging is full of words like "biodegradable" and "carbon neutral". The FTC's Green Guides (16 CFR Part 260) say what claims like these should mean, but few shoppers have read them. A chatbot can summarize them, and it can also invent a rule that sounds right. For a tool about honest marketing, a made-up citation defeats the point.

So the rule I built around: no verified quote, no verdict. When the tide goes out, you see who's been swimming naked.

## What it does

You paste a claim or pick a sample. Gemini 2.5 Flash reads it against six sections of the Green Guides and returns one finding per environmental phrase. Each finding gets one of three verdicts:

- **Needs qualification.** "Biodegradable plastic bag" lands here, citing 260.8: bags end up in landfills, where they won't break down within a year.
- **OK if they can prove it.** The Guides allow the claim if the seller has solid evidence.
- **Not covered by the Guides.** The Guides never mention "ocean plastic", and Low Tide says so rather than forcing a rule to fit. That honest gap is an answer too: ask the seller what the claim means.

Every finding shows the paragraph of the Guides it relies on, with the quoted words highlighted and a link to the official text on eCFR.

## How I built it

- **Next.js 15 on Vercel**, TypeScript and Tailwind, with no database and no accounts.
- **Gemini 2.5 Flash through the Vercel AI SDK**, using structured output with a zod schema, so every answer arrives as typed findings: phrase, section, verdict, explanation and quote.
- **The guard.** Before anything renders, the server normalizes each quote (curly quotes, dashes, spacing, case) and checks that it appears exactly in the section Gemini cited. It must be at least six words, since "It is deceptive" appears everywhere. Any finding that fails is removed and counted: "1 finding removed: quote didn't match the Guides."
- **A tamper test** on every verified finding changes one word of the real quote, for example "should" to "may", and sends it back through the same check. It gets removed on screen, so you can watch the guard work.
- **Offline samples.** The four sample claims are real saved Gemini answers. They still pass through the guard on every request, so the demo works with the API key removed.
- **Unit tests** (`node --test`): a real quote passes, one changed word fails, a quote from the wrong section fails.

## How Gemini is used

Gemini does the reading: it finds the environmental phrases in messy marketing copy, picks the section, decides the verdict and explains it plainly. Low Tide does the checking. Structured output makes the guard possible, since every finding arrives with its own quote to test. A live check takes about two seconds.

## Challenges

With default thinking, Gemini filed "carbon neutral" under general benefits and stretched "ocean plastic" into the recycled content rules. Two prompt rules fixed it (pick the most specific section, never assume a claim the words don't make), and a zero thinking budget made it about five times faster.

## Accomplishments and lessons

The core promise is enforced in code, not by prompting: the model can't put a quote on screen that isn't really in the Guides. A small tested function beat a longer prompt.

## What's next

- Load all of Part 260, not just six sections
- Read claims straight from a photo of the label
- Check that each quote actually supports its verdict, not just that it exists

## Built with

Next.js, TypeScript, Tailwind CSS, Vercel, Vercel AI SDK, Google Gemini API (Gemini 2.5 Flash), zod, eCFR API

## AI disclosure

Built with Claude Code (Claude Opus 5.5) during the event. The only AI the app calls at runtime is Gemini 2.5 Flash. Low Tide is a reading of published guidance, not legal advice.
