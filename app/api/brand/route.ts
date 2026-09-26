import { z } from "zod";
import fixtures from "@/fixtures/brands.json";
import { MODEL } from "@/lib/check";
import { checkBrand, parseBrandInput, verdictFor, type BrandCheck } from "@/lib/brand";

const Body = z.object({ brand: z.string().trim().min(2).max(300) });

const samples = fixtures.brands as unknown as Record<string, BrandCheck>;
const NONE = { mismatch: 0, wrongSite: 0, banned: 0 };

const reply = (data: object, status = 200) =>
  Response.json({ model: MODEL, checks: [], removed: 0, removedWhy: NONE, pagesFound: 0, pagesRead: 0, ...data }, { status });

export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return reply({ error: "Type a brand name or a link, 2 to 300 characters." }, 400);
    const text = parsed.data.brand;
    const input = parseBrandInput(text);
    if (!input) return reply({ error: "That link can't be checked. Use a public http or https page." }, 400);

    let raw: BrandCheck;
    let source: "sample" | "live";
    const hit = Object.keys(samples).find((k) => k.toLowerCase() === text.toLowerCase());
    if (hit) {
      raw = samples[hit];
      source = "sample";
    } else if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return reply({ brand: input.name, error: "Live checks are offline right now. The sample brands still work." });
    } else {
      raw = await checkBrand(input);
      source = "live";
    }

    const found = { brand: raw.brand, source, pagesFound: raw.pagesFound, pagesRead: raw.pagesRead };
    if (!raw.pagesRead) {
      return reply({ ...found, error: `Couldn't find enough about ${raw.brand} to check. Try a link to its site.` });
    }
    const { mismatch, wrongSite, banned } = raw.removed;
    return reply({
      ...found,
      savedOn: source === "sample" ? fixtures.savedOn : undefined,
      ...verdictFor(raw.checks),
      checks: raw.checks,
      removed: mismatch + wrongSite + banned,
      removedWhy: raw.removed,
    });
  } catch (err) {
    console.error("brand check failed", err);
    return reply({ error: "Gemini didn't answer that time. Try again, or pick a sample brand." });
  }
}
