import { z } from "zod";
import guides from "@/lib/guides.json";
import fixtures from "@/fixtures/samples.json";
import { askGemini, findingSchema, MODEL } from "@/lib/check";
import { guardFindings, locateQuote, type Finding } from "@/lib/guard";

const Body = z.union([
  z.object({ claim: z.string().trim().min(3).max(500) }),
  // Tamper test: the page sends back an edited finding and the guard judges it again.
  z.object({ recheck: z.array(findingSchema).min(1).max(10) }),
]);

const samples = fixtures.samples as Record<string, Finding[]>;

// Safety net for the words the UI must never show, in case the model slips.
const soften = (s: string) =>
  s.replace(/\billegal\b/gi, "not allowed").replace(/\bviolations?\b/gi, "problem").replace(/\blawsuits?\b/gi, "dispute");

const reply = (data: object, status = 200) => Response.json({ model: MODEL, findings: [], removed: 0, ...data }, { status });

export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return reply({ error: "Type a claim between 3 and 500 characters." }, 400);
    const body = parsed.data;

    let raw: Finding[];
    let source: "sample" | "live" | "recheck";
    if ("recheck" in body) {
      raw = body.recheck;
      source = "recheck";
    } else {
      const hit = Object.keys(samples).find((k) => k.toLowerCase() === body.claim.toLowerCase());
      if (hit) {
        raw = samples[hit];
        source = "sample";
      } else if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        return reply({ error: "Live checks are offline right now. The sample claims still work." });
      } else {
        raw = await askGemini(body.claim);
        source = "live";
      }
    }

    const { findings, removed } = guardFindings(raw, guides);
    return reply({
      source,
      removed,
      findings: findings.map((f) => {
        const g = guides.find((x) => x.section === f.section);
        return {
          ...f,
          why: soften(f.why),
          title: g?.title ?? "",
          url: g?.url ?? "",
          context: g ? locateQuote(f.quote, g.text) : null,
        };
      }),
    });
  } catch (err) {
    console.error("check failed", err);
    return reply({ error: "Gemini didn't answer that time. Try again, or pick a sample claim." });
  }
}
