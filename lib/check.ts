import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import guides from "./guides.json" with { type: "json" };
import type { Finding } from "./guard.ts";

export const MODEL = "gemini-2.5-flash";

export const findingSchema = z.object({
  phrase: z.string().describe("The environmental phrase, copied exactly from the claim"),
  section: z.string().describe('Section number like "260.8", or "" when not_covered'),
  verdict: z.enum(["needs_qualification", "ok_if_substantiated", "not_covered"]),
  why: z.string().describe("One or two plain sentences for a shopper"),
  quote: z.string().describe('Copied word for word from the section text, or "" when not_covered'),
});
const schema = z.object({ findings: z.array(findingSchema) });

const SYSTEM = `You read product marketing claims against the FTC Green Guides (16 CFR Part 260). You get a claim and the full text of the Guides sections below. Return one finding per distinct environmental phrase in the claim.

phrase: the environmental words exactly as they appear in the claim.
section: the number of the one section whose text directly addresses that phrase. Read each section's Examples too, since a term is often addressed there. Pick the most specific section: 260.4 is only for broad terms like "eco-friendly" or "green" that no other section covers.
verdict:
- needs_qualification: the section says an unqualified version of this claim is likely deceptive, or that it needs qualifying language.
- ok_if_substantiated: the section allows the claim as worded, as long as the marketer has competent and reliable evidence.
- not_covered: none of these sections names or clearly describes this specific term. Say so plainly. Never stretch a section to fit a term it does not name, and never assume a claim the words don't make (a material's origin is not a "recycled" claim unless the claim says recycled). In why, you may point to a section that could apply if the marketer said more.
why: one or two plain sentences a shopper can follow. Call the source "the Green Guides", never "the provided sections". Never use the words illegal, violation, or lawsuit. This is a reading of guidance, not legal advice.
quote: one continuous passage of 10 to 40 words copied character for character from the section you named, that supports your verdict. No ellipses, no paraphrase, no stitching separate sentences together. Empty string for not_covered.

If the claim has no environmental phrase, return an empty findings list.`;

const sectionList = guides.map((g) => `${g.section} ${g.title}`).join("\n");
const sectionText = guides.map((g) => `=== ${g.section} ${g.title} ===\n${g.text}`).join("\n\n");

// ponytail: all six sections go in every call (about 8k tokens). Add a keyword prefilter if the Guides set grows past ~20 sections.
export async function askGemini(claim: string): Promise<Finding[]> {
  const { output } = await generateText({
    model: google(MODEL),
    system: SYSTEM,
    prompt: `Sections:\n${sectionList}\n\nFull text:\n${sectionText}\n\nClaim: """${claim}"""`,
    output: Output.object({ schema }),
    temperature: 0,
    providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
    maxRetries: 1,
  });
  return output.findings;
}
