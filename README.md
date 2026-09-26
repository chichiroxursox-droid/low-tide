# Low Tide

Paste a green claim from a product ("biodegradable", "carbon neutral", "made with ocean plastic") and Low Tide checks it against the FTC Green Guides (16 CFR Part 260). Every answer comes with the exact passage of the Guides behind it, and that passage is checked word for word before you see it. If the quote doesn't match, the answer doesn't show.

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
- **Tests.** `node --test` runs `lib/guard.test.ts`: a real quote passes, messy typography still passes, one changed word fails, a real quote checked against the wrong section fails, a too-short quote fails, `locateQuote` finds the right span, and `guardFindings` drops and counts correctly.

## Run it locally

```bash
npm install
echo "GOOGLE_GENERATIVE_AI_API_KEY=your-gemini-key" > .env.local
npm run dev        # http://localhost:3000
npm test           # node --test
node --env-file=.env.local scripts/seed.ts   # re-save the sample answers
```

Without a key the app still runs, on the saved samples only.

The backup demo video comes from `node scripts/record-demo.mjs <url> <outDir>`, which uses a globally installed Playwright, followed by `ffmpeg -i <file>.webm -c:v libx264 -pix_fmt yuv420p demo.mp4`.

## Limitations

- **Six sections only.** Claims covered by other parts of the Guides (certifications and seals, free-of, non-toxic, renewable energy and materials, and others) will come back as not covered, even though the full Guides address them.
- **A real quote is not a right answer.** The guard proves the quote exists in the section Gemini cited. It does not prove the quote supports the verdict, or that Gemini picked the best section.
- **Phrase finding is up to the model.** Gemini can miss a phrase, merge two, or split one.
- **Live answers can vary.** Even at temperature 0, the same live claim returned a different (still verified) quote on a second run. The samples are fixed.
- **Matching is forgiving on typography.** Case, quote style, dash style and spacing are ignored. A quote that differs only in those ways passes.
- **Text only.** You type or paste the claim. There is no photo or label scanning.
- **Point in time.** The Guides text is from eCFR as of 2026-09-24. If the FTC revises the Guides, `lib/guides.json` needs a refresh.
- **No rate limiting** on the live endpoint. Claims are capped at 500 characters.
- **Not legal advice.** Low Tide is a reading of published guidance. It never tells you a claim breaks the law.

## AI disclosure

- **Built with Claude Code.** All code, copy and docs in this repo were written during OwlHacks 2026 by Claude Code (Anthropic, model Claude Opus 5.5), directed by me.
- **Runtime model:** Google Gemini 2.5 Flash (`gemini-2.5-flash`) through the Gemini API, called with the Vercel AI SDK (`ai` 7 and `@ai-sdk/google` 4). It is the only AI model or AI API the app uses at runtime, and it runs only for live claims, not for the saved samples.
- **Data source:** the eCFR API (U.S. Government Publishing Office), fetched once during the build to create `lib/guides.json`. The app makes no eCFR calls at runtime.
- **Not used:** no Claude, OpenAI or ElevenLabs calls at runtime, no database, no analytics, and no user accounts. Claims you paste go to Gemini and nowhere else.

## Stack

Next.js 15 (App Router), TypeScript, Tailwind CSS 4, Vercel AI SDK, zod, hosted on Vercel.

---

Low Tide reads your claim against the FTC Green Guides (16 CFR Part 260). It is not legal advice. Every quote is checked word for word against the Guides before it is shown.
