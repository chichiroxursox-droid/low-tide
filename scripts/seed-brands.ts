// Saves a real brand check for the sample chips so brand mode works with no API key.
// Run: node --env-file=.env.local scripts/seed-brands.ts
import fs from "node:fs";
import { checkBrand, parseBrandInput } from "../lib/brand.ts";
import { MODEL } from "../lib/check.ts";

const SAMPLES = ["Patagonia", "H&M"];

const brands: Record<string, unknown> = {};
for (const name of SAMPLES) {
  const r = await checkBrand(parseBrandInput(name)!);
  const evidence = r.claims.reduce((n, c) => n + c.evidence.length, 0);
  console.log(`${name}: read ${r.pagesRead}/${r.pagesFound} pages, ${r.claims.length} claims, ${evidence} evidence, removed`, r.removed);
  brands[name] = r;
}
fs.writeFileSync(
  "fixtures/brands.json",
  JSON.stringify({ model: MODEL, savedOn: new Date().toISOString().slice(0, 10), brands }, null, 2) + "\n",
);
