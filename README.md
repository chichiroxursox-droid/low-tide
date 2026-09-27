# Low Tide

Paste a green claim from a product ("biodegradable", "carbon neutral", "made with ocean plastic") and Low Tide checks it against the FTC Green Guides (16 CFR Part 260). Every answer comes with the exact passage of the Guides behind it, and that passage is checked word for word before you see it. If the quote doesn't match, the answer doesn't show.

Brand mode asks the bigger question: is this brand sustainable? Type a company's name or paste a link, and Low Tide gives a verdict built from four checks, where every good sign and red flag is a quote checked word for word against the page it came from.

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
- **Tests.** `lib/guard.test.ts` (run by `node --test`): a real quote passes, messy typography still passes, one changed word fails, a real quote checked against the wrong section fails, a too-short quote fails, `locateQuote` finds the right span, `guardFindings` drops and counts correctly, and the banned-word filter catches all three words Low Tide never prints.

## Brand mode

A single claim on a package only tells you so much. Before buying from a company, a shopper may want to know whether the brand as a whole holds up. Switch to "A brand", then type a company's name or paste a link to its site. Low Tide asks "Is [brand] sustainable?" and answers with:

- **A verdict**: Strong record, Mixed record, Red flags, or Not enough evidence, shown as a pill.
- **The rule line** next to it, which spells out the count behind the verdict. For the Patagonia sample: "2 good signs, 1 red flag, 1 with both a good sign and a red flag across 4 checks."
- **A reminder** under it: "This describes the evidence Low Tide could verify, not a certification."
- **Four check cards**, always in the same order, each marked Good sign, Red flag, Both, or Not found. Each finding on a card shows a plain note, the quote, and a link to the page it came from, tagged "their own site" when the page is the brand's. In a Both card, each finding carries its own Good sign or Red flag tag.
- **Not found** means Low Tide couldn't find a source it could verify for that check. It is not a no, and the card says so: "That isn't the same as a no."

### The checklist

| Check | Good sign | Red flag |
|---|---|---|
| Certifications | A source confirms a current third-party certification (B Corp, Fair Trade, bluesign, FSC, Cradle to Cradle, GOTS) | None. Not holding a certification isn't a finding |
| Climate action | A climate target validated by the Science Based Targets initiative, or published greenhouse gas emissions | Targets missed or dropped, or emissions rising |
| Independent ratings | A high score from a rater like Good On You, CDP or the Fashion Transparency Index | A low score |
| Regulator and watchdog findings | None | A regulator, consumer authority or watchdog group acted on or criticized the brand's environmental claims |

### The verdict rule

The model never picks the verdict. `verdictFor` (`lib/brand.ts`) counts the checks by mark, where good, red and both each count checks with that mark, and applies the first rule that fits:

1. Fewer than 2 checks are anything but Not found: **Not enough evidence**.
2. At least 1 red check, and at least as many red checks as good ones: **Red flags**.
3. At least 3 good checks, with no red and no both: **Strong record**.
4. Anything else: **Mixed record**.

A Both check counts as evidence and rules out Strong record, but it counts on neither side of the Red flags comparison. The route runs `verdictFor` every time it serves a result, live or saved, so the saved samples store no verdict of their own.

### How it works

1. **Four searches in parallel.** Gemini 2.5 Flash runs with the Google Search tool once per check, each with its own question (for example, whether the brand has a climate target validated by the Science Based Targets initiative). Its written answers are thrown away. Only the links in the SDK's `sources` (and the grounding metadata behind them) are kept, up to 4 per search, because when Gemini writes URLs itself it garbles Google's long redirect links. The four lists are interleaved so each check gets a share, deduplicated, and capped at 12. A search that fails brings no links.
2. **The server downloads the pages itself.** Up to 12 pages from search, plus the pasted link if there is one, in parallel, each with a 10 second timeout and a 2 MB cap, converted to plain text and capped at 20,000 characters. Pages that fail, aren't HTML or plain text, or come out under 500 characters are skipped.
3. **Pages that never name the brand are dropped** before Gemini sees them. `namesBrand` looks for the brand's name as whole words read with the spaces squeezed out, with "&" read as "and" or left out, a possessive "'s" optional, and accents stripped, so "Marks and Spencer" matches "Marks & Spencer" and "L'Oreal" matches "L'Oréal". The pasted link is exempt. Without this step, a made-up brand collected generic pages about other companies and scored Mixed record. The same made-up brand now reads 0 of 12 pages and gets "Couldn't find enough".
4. **One pick call.** Gemini 2.5 Flash, with no tools, gets the remaining page text, each page labeled with a source id (S1, S2, and so on). Structured output returns findings for each check, each with a sign (good or red), the source id, a quote copied from that page, and a one-sentence note. The prompt asks for up to two findings per check and quotes of 10 to 40 words, but the schema doesn't enforce either. Search and quoting are separate calls because Gemini 2.5 Flash can't use Search and structured output in the same request.
5. **The brand guard.** `guardChecks` (`lib/brand.ts`, a pure function) looks at the first two findings per check and keeps one only if all of these hold:
   - **The quote is on the page.** It passes the same `verifyQuote` as the claim check, word for word, against the page it cites.
   - **The sign fits the check.** Certifications take only good signs and watchdog findings only red flags. Climate action and ratings take either.
   - **The brand isn't vouching for itself.** A page is the brand's own when a label of its address starts with the brand's name ("patagoniaworks.com", "allbirds.com.kw"), with "the" or "about" allowed in front ("thenorthface.com"). A name under 4 letters must be the whole label, a company word like "group" aside ("hmgroup.com" is H&M's), so "hmrc.gov.uk" isn't. For a pasted link, the name is the label its site is registered under ("www2.hm.com" is "hm"). The address decides this, not Gemini. A good sign for certifications or ratings from the brand's own site is refused. Climate action may come from its own site, since publishing emissions is the point, and a red flag may come from any site.
   - **No legal wording.** A quote, or a site address, that uses any of the three legal terms Low Tide never prints is dropped.

   Each check's mark follows from what survives: Good sign if only good findings, Red flag if only red, Both if both, Not found if none. Notes go through the same `soften` as claim mode. Findings past the first two, or in a repeated entry for the same check, are ignored and not counted. Every other removal is counted by reason and shown under the cards ("didn't match the page they cite", "didn't fit its check", "the brand vouching for its own certifications or ratings", "used legal wording Low Tide doesn't show"). Then the route computes the verdict with `verdictFor`.

If no page is left to read, the page says "Couldn't find enough about [brand] to check. Try a link to its site." instead of showing empty cards.

- **Saved samples.** The Patagonia and H&M chips are served from `fixtures/brands.json`, saved by `scripts/seed-brands.ts` on Sep 26 2026. They are unedited seed output, and both work with no API key.
  - **Patagonia, Mixed record.** Read 9 of 12 sources. Certifications and Independent ratings are good signs (bluesign and Fair Trade, a Good On You rating of "Good"). Climate action has both: targets verified by the Science Based Targets initiative, and total emissions up about 25% from 2017 to 2025. The red flag is a greenwashing complaint accepted by an advertising ethics jury in France.
  - **H&M, Red flags.** Read 10 of 12 sources. Climate action is a good sign quoted from its own site, hmgroup.com (targets validated by the Science Based Targets initiative, a 41 percent cut in Scope 1 and 2 emissions compared with 2019). The red flag is the Norwegian Consumer Authority's investigation of its Conscious Collection. Certifications and Independent ratings are Not found. The guard removed 3 quotes: 2 were H&M vouching for its own certifications or ratings, and 1 didn't fit its check.
- **Tests.** `lib/brand.test.ts` covers the brand side: `namesBrand` across punctuation and possessive spellings, `hostNamesBrand` and `ruleName` on real address shapes, `guardChecks` marks and each source rule, sloppy source ids like "[S1]" and " S2 ", banned words, the two-per-check cap and softened notes, every branch of `verdictFor`, `htmlToText` (strips scripts, decodes entities, stays fast on hostile HTML), `isSafeUrl`, `parseBrandInput` (keeps "L.L.Bean" a name), and `readPage` against a local server (charsets, redirects, PDFs, errors, thin and huge pages).

## Run it locally

```bash
npm install
echo "GOOGLE_GENERATIVE_AI_API_KEY=your-gemini-key" > .env.local
npm run dev        # http://localhost:3000
npm test           # node --test, 27 tests
node --env-file=.env.local scripts/seed.ts          # re-save the sample claim answers
node --env-file=.env.local scripts/seed-brands.ts   # re-save the Patagonia and H&M samples (10 Gemini calls)
```

Without a key the app still runs, on the saved claim and brand samples only.

The backup demo video comes from `node scripts/record-demo.mjs <url> <outDir>`, which uses a globally installed Playwright, followed by `ffmpeg -i <file>.webm -c:v libx264 -pix_fmt yuv420p demo.mp4`.

## Limitations

- **Six sections only.** Claims covered by other parts of the Guides (certifications and seals, free-of, non-toxic, renewable energy and materials, and others) will come back as not covered, even though the full Guides address them.
- **A real quote is not a right answer.** The guard proves the quote exists in the section Gemini cited. It does not prove the quote supports the verdict, or that Gemini picked the best section. In brand mode, a verified quote proves the page says it, not that the page is right, is current, or sits under the right check.
- **Phrase finding is up to the model.** Gemini can miss a phrase, merge two, or split one.
- **Live answers can vary.** Even at temperature 0, the same live claim returned a different (still verified) quote on a second run. The samples are fixed.
- **Matching is forgiving on typography.** Case, quote style, dash style and spacing are ignored. A quote that differs only in those ways passes.
- **Text only.** You type or paste the claim. There is no photo or label scanning.
- **Point in time.** The Guides text is from eCFR as of 2026-09-24. If the FTC revises the Guides, `lib/guides.json` needs a refresh.
- **Web pages change.** The brand samples show the pages as they read on Sep 26 2026. The linked pages may say something different now, and the same brand checked live today may get a different verdict.
- **Live brand results can vary.** Search can return a different set of pages from one run to the next, so the quotes, marks and verdict can change. A live check can also differ from its saved sample: the pasted link patagonia.com/our-footprint, which adds that page and searches for "patagonia.com", got Red flags on prod, while the saved Patagonia sample is Mixed record. The brand samples are fixed.
- **Source quality varies.** Search puts blogs next to certifiers, news outlets and regulators, and every finding shows its site so you can judge it. In the Patagonia sample, 5 of the 7 quotes come from one review site, bettertrail.com. All three saved watchdog red flags are quoted from blogs and news sites that report the finding, not from the regulator or jury itself.
- **Some sites can't be read.** Sites that block downloads, build their text with JavaScript, or publish their reports as PDFs are skipped, so a brand's best evidence may be missing.
- **A brand name that is also a common word passes the name filter.** "Gap" is a common word, so it appears on many pages. For a brand like that the filter may drop little, and the pick prompt is left to keep only passages about the brand itself.
- **Own sites are recognized by address.** A page counts as the brand's own only when its address names the brand. A parent company's site (unilever.com for Dove, say) is not recognized, so a certification quoted from it would count as independent.
- **The checklist favors large brands.** Certifiers, raters, regulators and news outlets mostly write about big companies. A small brand may get Not enough evidence, which says how little Low Tide could verify, not how the brand behaves.
- **A verdict is not a certification.** It describes the evidence Low Tide could verify on the pages it read, counted by a fixed rule. The page says this under every verdict.
- **Patagonia's red flag reads badly.** Its only red flag quotes a machine-translated page, clumsy English included ("The company hired Patagonia understood this at a cost"). It is verbatim, because an edited quote would no longer be checked word for word.
- **Link safety checks the hostname only.** Links to IP addresses, localhost and internal names are refused, but a public name that points to a private address, or redirects to one, would still be fetched. Vercel functions have no private network to reach.
- **Charset comes from the response header only.** A page that declares its encoding only in a `<meta>` tag is read as UTF-8, so its curly quotes and accented letters can come out garbled.
- **Brand checks are slow.** A live brand check takes about 15 to 20 seconds: four searches, up to 13 page downloads, then the pick call. The wait is shown as it happens: the route streams each real step (searches finished, pages read, pages that name the brand, quotes picked, quotes checked) and the loading screen drains a tide staff one mark per step.
- **No rate limiting** on the live endpoints. Claims are capped at 500 characters, brand input at 300.
- **Not legal advice.** Low Tide is a reading of published guidance and public evidence. It never tells you a claim or a brand breaks the law.

## AI disclosure

- **Built with Claude Code.** All code, copy and docs in this repo, brand mode and its verdict included, were written during OwlHacks 2026 by Claude Code (Anthropic, model Claude Opus 5.5), directed by me.
- **Runtime model:** Google Gemini 2.5 Flash (`gemini-2.5-flash`) through the Gemini API, called with the Vercel AI SDK (`ai` 7 and `@ai-sdk/google` 4). Each live brand check makes up to five Gemini calls: four searches with Google Search grounding through the Gemini API (the SDK's `google.tools.googleSearch`), one per check, to find sources, and then, if any page is left to read, one pick call with no tools that quotes from the downloaded pages. The verdict itself is computed in code, not by Gemini. Gemini is the only AI model or AI API the app uses at runtime, and it runs only for live checks, not for the saved samples.
- **Data sources:** the eCFR API (U.S. Government Publishing Office), fetched once during the build to create `lib/guides.json`. The app makes no eCFR calls at runtime. For a live brand check, the server follows the links search returned (Google redirect links) and downloads each page from its site.
- **Not used:** no Claude, OpenAI or ElevenLabs calls at runtime, no database, no analytics, and no user accounts. Claims and brand names you type go to the Gemini API, which runs the searches in brand mode, and nowhere else. A link you paste is also downloaded from that site, and the text of every page read goes to the pick call.

## Stack

Next.js 15 (App Router), TypeScript, Tailwind CSS 4, Vercel AI SDK, zod, hosted on Vercel.

---

Low Tide reads your claim against the FTC Green Guides (16 CFR Part 260). It is not legal advice. Every quote is checked word for word against the Guides before it is shown.
