# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary for this phase: hackathon judges at OwlHacks 2026 (Sustainability track, Best Use of Gemini sponsor prize) watching a demo of under 90 seconds on a laptop or projector. They need to grasp the idea and trust the mechanism at a glance.

End users: shoppers, often on a phone, who either paste a green claim off a package or want to know whether a brand is worth buying from.

## Product Purpose

Low Tide has two modes. Claim mode reads a green marketing claim against the FTC Green Guides (16 CFR Part 260) and returns findings, each backed by a quote from the Guides. Brand mode answers "Is this brand sustainable?" with a verdict (Strong record, Mixed record, Red flags, Not enough evidence) computed by a rule in code from four checks: certifications, climate action, independent ratings, and regulator and watchdog findings.

Success for the demo: a judge sees a verdict, sees the exact source passage behind it, and watches a tampered quote get rejected.

## Positioning

Every quote on screen is checked word for word against its source text by the server, and anything that does not match is removed and counted. No verified quote, no verdict. Verdicts come from rules in code, never the model's opinion. Gemini 2.5 Flash reads and searches; Low Tide checks.

## Operating Context

- Demo path: claim samples (Biodegradable plastic bag, Made with ocean plastic), the H&M brand sample (Red flags), a live claim, the tamper test.
- Samples are served from saved fixtures and work with no API key. Live checks take about 2 seconds (claim) and 15 to 20 seconds (brand: four Google Searches, page downloads, one pick call).
- Deployed on Vercel at https://low-tide-nine.vercel.app.

## Capabilities and Constraints

- Next.js 15 App Router, TypeScript, Tailwind 4, `ai` v7 with `@ai-sdk/google`, `zod`. No new dependencies.
- Code freeze Sun Sept 27 2026, 8:00am EDT. After that only README, video and DEVPOST.md change.
- Never use the words illegal, violation, or lawsuit. No em dashes in UI copy, README, or DEVPOST.md. It is a reading of guidance and evidence, not legal advice.
- Footer text is fixed (see CLAUDE.md), plus one brand-mode sentence.
- Every API path returns JSON, never a 500.

## Brand Commitments

- Name: Low Tide.
- Voice: plain, specific sentences a shopper can follow; says what it could not verify ("That isn't the same as a no").

## Evidence on Hand

- Guides text: `lib/guides.json` (sections 260.4, 260.5, 260.7, 260.8, 260.12, 260.13, from eCFR).
- Saved samples: `fixtures/samples.json` (four claims), `fixtures/brands.json` (Patagonia Mixed record, H&M Red flags, saved Sep 26 2026).
- 27 unit tests, the STATE.md build log, a demo video.
- No users, testimonials, press, or usage numbers exist. Do not invent any.

## Product Principles

1. No verified quote, no verdict.
2. Show the check, not just the answer: the source passage and where it came from stay visible.
3. Rules over model opinion.
4. Honest empty states: "Not covered", "Not found", and "Not enough evidence" are real answers.
5. The samples always work.
