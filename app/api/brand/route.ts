import { z } from "zod";
import fixtures from "@/fixtures/brands.json";
import { MODEL } from "@/lib/check";
import { checkBrand, parseBrandInput, verdictFor, type BrandCheck } from "@/lib/brand";

const Body = z.object({ brand: z.string().trim().min(2).max(300) });

const samples = fixtures.brands as unknown as Record<string, BrandCheck>;
const NONE = { mismatch: 0, offCheck: 0, wrongSite: 0, banned: 0 };
const BASE = { model: MODEL, checks: [], removed: 0, removedWhy: NONE, pagesFound: 0, pagesRead: 0 };
const FAILED = "Gemini didn't answer that time. Try again, or pick a sample brand.";

const reply = (data: object, status = 200) => Response.json({ ...BASE, ...data }, { status });

// What the page shows for a finished check, sample or live. The verdict is computed here, never saved.
function answer(raw: BrandCheck, source: "sample" | "live") {
  const found = { brand: raw.brand, source, pagesFound: raw.pagesFound, pagesRead: raw.pagesRead };
  if (!raw.pagesRead) {
    return { ...BASE, ...found, error: `Couldn't find enough about ${raw.brand} to check. Try a link to its site.` };
  }
  const { mismatch, offCheck, wrongSite, banned } = raw.removed;
  return {
    ...BASE,
    ...found,
    savedOn: source === "sample" ? fixtures.savedOn : undefined,
    ...verdictFor(raw.checks),
    checks: raw.checks,
    removed: mismatch + offCheck + wrongSite + banned,
    removedWhy: raw.removed,
  };
}

export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return reply({ error: "Type a brand name or a link, 2 to 300 characters." }, 400);
    const text = parsed.data.brand;
    const input = parseBrandInput(text);
    if (!input) return reply({ error: "That link can't be checked. Use a public http or https page." }, 400);

    const hit = Object.keys(samples).find((k) => k.toLowerCase() === text.toLowerCase());
    if (hit) return Response.json(answer(samples[hit], "sample"));
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return reply({ brand: input.name, error: "Live checks are offline right now. The sample brands still work." });
    }

    // A live check streams one JSON line per real step so the page can show progress, then the answer as the last line.
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (o: object) => controller.enqueue(encoder.encode(JSON.stringify(o) + "\n"));
        try {
          const raw = await checkBrand(input, (s) => send({ type: "stage", ...s }));
          send({ type: "result", ...answer(raw, "live") });
        } catch (err) {
          console.error("brand check failed", err);
          send({ type: "result", ...BASE, brand: input.name, error: FAILED });
        }
        controller.close();
      },
    });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
  } catch (err) {
    console.error("brand check failed", err);
    return reply({ error: FAILED });
  }
}
