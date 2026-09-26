// Saves a real brand check for the sample chips so brand mode works with no API key.
// Run: node --env-file=.env.local scripts/seed-brands.ts
import fs from "node:fs";
import { checkBrand, parseBrandInput, verdictFor } from "../lib/brand.ts";
import { MODEL } from "../lib/check.ts";

const SAMPLES = ["Patagonia", "H&M"];

const brands: Record<string, unknown> = {};
for (const name of SAMPLES) {
  const r = await checkBrand(parseBrandInput(name)!);
  const { verdict } = verdictFor(r.checks);
  console.log(`${name}: read ${r.pagesRead}/${r.pagesFound} pages, verdict ${verdict},`, r.checks.map((c) => `${c.check}=${c.mark}(${c.signals.length})`).join(" "), "removed", r.removed);
  brands[name] = r;
}
fs.writeFileSync(
  "fixtures/brands.json",
  JSON.stringify({ model: MODEL, savedOn: new Date().toISOString().slice(0, 10), brands }, null, 2) + "\n",
);
