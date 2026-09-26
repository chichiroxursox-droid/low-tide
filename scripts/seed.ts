// Saves real Gemini output for the sample chips so the demo works with no API key.
// Run: node --env-file=.env.local scripts/seed.ts
import fs from "node:fs";
import { askGemini, MODEL } from "../lib/check.ts";

const SAMPLES = [
  "Biodegradable plastic bag",
  "Carbon neutral shipping",
  "Made with ocean plastic",
  "100% recyclable packaging",
];

const samples: Record<string, unknown> = {};
for (const claim of SAMPLES) samples[claim] = await askGemini(claim);
fs.writeFileSync(
  "fixtures/samples.json",
  JSON.stringify({ model: MODEL, savedAt: new Date().toISOString(), samples }, null, 2) + "\n",
);
