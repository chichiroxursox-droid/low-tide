# Low Tide

Paste a green claim from a product ("biodegradable", "carbon neutral", "made with ocean plastic") and Low Tide checks it against the FTC Green Guides (16 CFR Part 260). Every answer comes with the exact passage of the Guides behind it, and that passage is checked word for word before you see it. If the quote doesn't match, the answer doesn't show.

Brand mode goes one level up: type a company's name and Low Tide puts what the brand says about itself next to what other sites say, with every quote checked word for word against its source.

The name: when the tide goes out, you see who's been swimming naked.

- Live: https://low-tide-nine.vercel.app
- Built solo at OwlHacks 2026, Sustainability track

## What it does

1. You paste a claim, or pick one of four samples.
2. Gemini 2.5 Flash reads the claim against six sections of the Green Guides and returns one finding per environmental phrase: the phrase, the section, a verdict, a plain explanation, and a quote.
3. Low Tide checks each quote against the real text of the section it cites. Findings that fail are dropped, and the page says how many were removed.
4. Each surviving finding shows its verdict and the section's paragraph, with the quoted words highlighted and a link to the section on eCFR.

There are three verdicts:

- **Needs qualification**: the Guides say an unqualified version of this claim is likely deceptive, or needs qualifying language.
- **OK if they can prove it**: the Guides allow the claim as worded, if the seller has competent and reliable evidence.
- **Not covered by the Guides**: none of the sections name this term. Low Tide says so instead of stretching a rule to fit. "Made with ocean plastic" is the example: the Guides never mention ocean plastic.

## How the check works

The model is not trusted to quote correctly. The server verifies every quote before anything renders.

- **Source text.** `lib/guides.json` holds sections 260.4, 260.5, 260.7, 260.8, 260.12 and 260.13, taken from the eCFR API (text as of 2026-09-24), with each section's examples included. All six go to Gemini on every call, about 8k tokens.
- **Structured output.** The route calls Gemini through the Vercel AI SDK with a zod schema, so the response is always `{ findings: [{ phrase, section, verdict, why, quote }] }`.
- **The guard** (`lib/guard.ts`, pure functions):
  - `normalize` evens out the typographic differences a model introduces when copying (curly quotes, dash variants, whitespace, case) and trims quote marks and periods at the ends.
  - `verifyQuote(quote, sectionText)` passes only if the normalized quote is an exact substring of the normalized section and is at least 6 words long, since a quote like "It is deceptive" appears everywhere and proves nothing.
  - `guardFindings` looks up the section each finding cites (tolerating forms like "§ 260.8(b)"), keeps findings whose quote verifies, counts the rest as removed, and lets `not_covered` through with no section or quote.
  - `locateQuote` finds the verified quote in the original text so the page can highlight it inside its paragraph.
- **Tamper test.** Each verified finding has a "Tamper test: change one word" link. It swaps one word of the real quote (for example "should" to "may") and sends it back through the same server check, which drops it. This shows the guard working on demand, without waiting for the model to misquote.
- **Works offline.** The four sample claims are served from `fixtures/samples.json`, which holds unedited Gemini output saved by `scripts/seed.ts`. They still go through the guard on every request. With no API key, samples and the tamper test work, and live claims get a clear message instead of an error.
- **Tests.** `lib/guard.test.ts` (run by `node --test`): a real quote passes, messy typography still passes, one changed word fails, a real quote checked against the wrong section fails, a too-short quote fails, `locateQuote` finds the right span, and `guardFindings` drops and counts correctly.

## Brand mode

A single claim on a package only tells you so much. Before buying from a company, a shopper may want to know what the brand says about itself overall, and whether anyone else agrees. Switch to "A brand", then type a company's name or paste a link to its sustainability page. Low Tide finds up to three environmental claims the brand makes and gives each one a card:

- **They say**: the brand's own words, quoted from its own site, with a link to the page.
- **Green Guides reading**: that quote run through the same claim check described above.
- **Others say**: up to two passages from other sites, each labeled "Backs it up" or "Pushes back", with a link. If none of them verify, the card says so.

There is no overall grade or score. The shopper reads both sides and draws the conclusion.

### How it works

1. **Call 1: find sources.** Gemini 2.5 Flash runs with the Google Search tool and is asked for the brand's own sustainability page plus 4 to 6 independent sources. Its written answer is thrown away. Only the links in the SDK's `sources` (and the grounding metadata behind them) are kept, up to 8, because when Gemini writes URLs itself it garbles Google's long redirect links. A pasted link is read too and goes first in the list.
2. **The server downloads the pages itself.** Up to 8 pages from search, plus the pasted link if there is one, in parallel, each with a 10 second timeout and a 2 MB cap, converted to plain text and capped at 20,000 characters. Pages that fail, aren't HTML or plain text, or come out under 500 characters are skipped.
3. **Call 2: quote from that text.** A second Gemini call with no tools gets the page text, each page labeled with a source id (S1, S2, and so on). It returns which ids belong to the brand, up to three claims quoted from those, and up to two passages per claim from the other sources, each quote tagged with the id it came from. It takes two calls because Gemini 2.5 Flash can't use Search and structured output in the same request.
4. **The brand guard.** `guardBrand` (`lib/brand.ts`, a pure function) checks every quote word for word against the page it cites, using the same `verifyQuote` as the claim check. A claim must come from a source the model marked as the brand's own. Evidence must come from a source that isn't, and its host can't be the same as, or a subdomain of, any brand host. A quote that uses any of the three legal terms Low Tide never prints is dropped. A dropped claim takes its evidence with it and counts as one removal, and the page shows each removal by reason.
5. **The Guides reading.** Each claim that survives gets the existing Green Guides reading, and those Guides quotes go through `guardFindings` like any other.

If no page can be read, or no claim survives the guard, the page says "Couldn't find enough about [brand] to check" instead of showing empty cards.

- **Saved samples.** The Patagonia and H&M chips are served from `fixtures/brands.json`, saved by `scripts/seed-brands.ts` on Sep 26 2026. They are unedited seed output: one Patagonia quote repeats a sentence because the page it came from repeats it, and it stays that way. Their Guides findings go back through the guard on every request, and both samples work with no API key. Patagonia read 7 of 8 sources and shows 3 claims with 6 passages that back them up. H&M read 6 of 8 and shows 3 claims, and 2 passages push back, one of them from acm.nl, the Dutch consumer regulator.
- **Tests.** `lib/brand.test.ts` covers the brand side: `htmlToText` strips scripts and decodes entities and stays fast on hostile HTML, `guardBrand` drops each kind of bad quote and counts it, sloppy source ids like "[S1]" and " S2 " still match, the three-claim and two-passage caps hold, `isSafeUrl` refuses local and non-web links, `parseBrandInput` keeps "L.L.Bean" a name, and `readPage` handles charsets, redirects, PDFs, errors, thin pages and huge pages against a local server.

## Run it locally

```bash
npm install
echo "GOOGLE_GENERATIVE_AI_API_KEY=your-gemini-key" > .env.local
npm run dev        # http://localhost:3000
npm test           # node --test, 25 tests
node --env-file=.env.local scripts/seed.ts          # re-save the sample claim answers
node --env-file=.env.local scripts/seed-brands.ts   # re-save the Patagonia and H&M samples
```

Without a key the app still runs, on the saved claim and brand samples only.

The backup demo video comes from `node scripts/record-demo.mjs <url> <outDir>`, which uses a globally installed Playwright, followed by `ffmpeg -i <file>.webm -c:v libx264 -pix_fmt yuv420p demo.mp4`.

## Limitations

- **Six sections only.** Claims covered by other parts of the Guides (certifications and seals, free-of, non-toxic, renewable energy and materials, and others) will come back as not covered, even though the full Guides address them.
- **A real quote is not a right answer.** The guard proves the quote exists in the section Gemini cited. It does not prove the quote supports the verdict, or that Gemini picked the best section. In brand mode, a verified quote proves the page says it, not that the page is right, or that an "Others say" passage is about exactly the same thing as the claim.
- **Phrase finding is up to the model.** Gemini can miss a phrase, merge two, or split one.
- **Live answers can vary.** Even at temperature 0, the same live claim returned a different (still verified) quote on a second run. The samples are fixed.
- **Matching is forgiving on typography.** Case, quote style, dash style and spacing are ignored. A quote that differs only in those ways passes.
- **Text only.** You type or paste the claim. There is no photo or label scanning.
- **Point in time.** The Guides text is from eCFR as of 2026-09-24. If the FTC revises the Guides, `lib/guides.json` needs a refresh.
- **Web pages change.** The brand samples show the pages as they read on Sep 26 2026. The linked pages may say something different now.
- **Source quality varies.** Search puts blogs next to news outlets and regulators. The prompt prefers news, NGOs, certifiers and regulators, and every passage shows its site so you can judge it, but a blog can still end up as the only voice on a claim.
- **Some sites can't be read.** Sites that block downloads, build their text with JavaScript, or publish their reports as PDFs are skipped, so a brand's best evidence may be missing.
- **Which sites are the brand's own is the model's call.** Gemini lists which sources belong to the brand, and the guard backs that up with a same-host and subdomain check. Regional sites get past a rule like that: live Allbirds quotes came from allbirds.com.kw and allbirdsbenelux.nl, and only the model's judgment tied those to the brand.
- **Link safety checks the hostname only.** Links to IP addresses, localhost and internal names are refused, but a public name that points to a private address, or redirects to one, would still be fetched. Vercel functions have no private network to reach.
- **Charset comes from the response header only.** A page that declares its encoding only in a `<meta>` tag is read as UTF-8, so its curly quotes and accented letters can come out garbled.
- **Brand checks are slow and vary.** A live brand check takes about 15 to 30 seconds, and the sources, claims and quotes change from run to run. The brand samples are fixed.
- **No rate limiting** on the live endpoints. Claims are capped at 500 characters, brand input at 300.
- **Not legal advice.** Low Tide is a reading of published guidance. It never tells you a claim breaks the law.

## AI disclosure

- **Built with Claude Code.** All code, copy and docs in this repo, brand mode included, were written during OwlHacks 2026 by Claude Code (Anthropic, model Claude Opus 5.5), directed by me.
- **Runtime model:** Google Gemini 2.5 Flash (`gemini-2.5-flash`) through the Gemini API, called with the Vercel AI SDK (`ai` 7 and `@ai-sdk/google` 4). Brand mode also uses Google Search grounding through the Gemini API (the SDK's `google.tools.googleSearch`) to find sources. Gemini is the only AI model or AI API the app uses at runtime, and it runs only for live checks, not for the saved samples.
- **Data sources:** the eCFR API (U.S. Government Publishing Office), fetched once during the build to create `lib/guides.json`. The app makes no eCFR calls at runtime. For a live brand check, the server follows the links search returned (Google redirect links) and downloads each page from its site.
- **Not used:** no Claude, OpenAI or ElevenLabs calls at runtime, no database, no analytics, and no user accounts. Claims and brand names you type go to the Gemini API, which runs the search in brand mode, and nowhere else. A link you paste is also downloaded from that site.

## Stack

Next.js 15 (App Router), TypeScript, Tailwind CSS 4, Vercel AI SDK, zod, hosted on Vercel.

---

Low Tide reads your claim against the FTC Green Guides (16 CFR Part 260). It is not legal advice. Every quote is checked word for word against the Guides before it is shown.
