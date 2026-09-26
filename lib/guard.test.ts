import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyQuote, guardFindings, locateQuote, type Finding } from "./guard.ts";
import guides from "./guides.json" with { type: "json" };

const text = (s: string) => guides.find((g) => g.section === s)!.text;
const REAL = "the entire item will completely break down and return to nature";

test("a real quote from the section passes", () => {
  assert.equal(verifyQuote(REAL, text("260.8")), true);
});

test("curly quotes, dashes, spacing and case differences still pass", () => {
  const messy = "A marketer making an unqualified   degradable claim should have competent";
  assert.equal(verifyQuote(`“${messy}”`, text("260.8")), true);
  assert.equal(verifyQuote("package is degradable, biodegradable, oxo‑degradable, oxo–biodegradable, or photodegradable", text("260.8")), true);
});

test("changing one word fails", () => {
  assert.equal(verifyQuote(REAL.replace("completely", "quickly"), text("260.8")), false);
});

test("a real quote from a different section fails", () => {
  const offsets = "sellers should employ competent and reliable scientific and accounting methods";
  assert.equal(verifyQuote(offsets, text("260.5")), true);
  assert.equal(verifyQuote(offsets, text("260.8")), false);
});

test("a quote too short to prove anything fails", () => {
  assert.equal(verifyQuote("It is deceptive", text("260.8")), false);
});

test("locateQuote finds the original span and its paragraph", () => {
  const hit = locateQuote("“the entire item will completely break down”", text("260.8"))!;
  assert.equal(hit.match, "the entire item will completely break down");
  assert.ok(hit.before.startsWith("(b) A marketer"));
  assert.ok(hit.after.endsWith("after customary disposal."));
});

test("guardFindings drops bad quotes, counts them, keeps not_covered", () => {
  const f = (over: Partial<Finding>): Finding => ({
    phrase: "biodegradable",
    section: "260.8",
    verdict: "needs_qualification",
    why: "",
    quote: REAL,
    ...over,
  });
  const { findings, removed } = guardFindings(
    [
      f({ section: "§ 260.8(b)" }),
      f({ quote: REAL.replace("nature", "the earth") }),
      f({ section: "260.5" }),
      f({ section: "260.99" }),
      f({ phrase: "ocean plastic", verdict: "not_covered", section: "260.12", quote: "made up" }),
    ],
    guides,
  );
  assert.equal(removed, 3);
  assert.deepEqual(
    findings.map((x) => [x.verdict, x.section, x.quote === ""]),
    [
      ["needs_qualification", "260.8", false],
      ["not_covered", "", true],
    ],
  );
});
