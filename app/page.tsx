"use client";

import { useState, type ReactNode } from "react";
import fixtures from "@/fixtures/samples.json";
import brandFixtures from "@/fixtures/brands.json";
import type { Shown } from "@/lib/guard";

type Result = {
  claim: string;
  findings: Shown[];
  removed: number;
  source?: "sample" | "live" | "recheck";
  model: string;
  error?: string;
  note?: string;
};

const SAMPLES = Object.keys(fixtures.samples);

const VERDICT = {
  needs_qualification: { label: "Needs qualification", tone: "bg-buoy" },
  ok_if_substantiated: { label: "OK if they can prove it", tone: "bg-glass" },
  not_covered: { label: "Not covered by the Guides", tone: "border border-dashed border-deep/50" },
};

type CheckKey = "certifications" | "climate" | "ratings" | "watchdogs";
type Mark = "good" | "red" | "both" | "not_found";
type Signal = { sign: "good" | "red"; quote: string; note: string; url: string; host: string; own: boolean };
type Check = { check: CheckKey; mark: Mark; signals: Signal[] };
type BrandResult = {
  brand: string;
  verdict?: "strong" | "mixed" | "red_flags" | "not_enough";
  good?: number;
  red?: number;
  checks: Check[];
  removed: number;
  removedWhy: { mismatch: number; offCheck: number; wrongSite: number; banned: number };
  pagesFound: number;
  pagesRead: number;
  source?: "sample" | "live";
  savedOn?: string;
  model: string;
  error?: string;
};

const BRAND_SAMPLES = Object.keys(brandFixtures.brands);

const BRAND_VERDICT = {
  strong: { label: "Strong record", tone: "bg-glass" },
  mixed: { label: "Mixed record", tone: "bg-sun" },
  red_flags: { label: "Red flags", tone: "bg-buoy" },
  not_enough: { label: "Not enough evidence", tone: "border border-dashed border-deep/50" },
};
const CHECK_TITLE: Record<CheckKey, string> = {
  certifications: "Certifications",
  climate: "Climate action",
  ratings: "Independent ratings",
  watchdogs: "Regulator and watchdog findings",
};
const MARK: Record<Mark, { label: string; tone: string }> = {
  good: { label: "Good sign", tone: "bg-glass" },
  red: { label: "Red flag", tone: "bg-buoy" },
  both: { label: "Both", tone: "bg-sun" },
  not_found: { label: "Not found", tone: "border border-dashed border-deep/50" },
};

const savedDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function ruleLine(r: BrandResult) {
  const good = r.good ?? 0;
  const red = r.red ?? 0;
  const both = r.checks.filter((c) => c.mark === "both").length;
  const parts = [`${good} good ${good === 1 ? "sign" : "signs"}`, `${red} red ${red === 1 ? "flag" : "flags"}`];
  if (both) parts.push(`${both} with both a good sign and a red flag`);
  return `${parts.join(", ")} across ${r.checks.length} checks.`;
}

function removedLine(w: BrandResult["removedWhy"]) {
  const n = w.mismatch + w.offCheck + w.wrongSite + w.banned;
  const parts = [
    w.mismatch && `${w.mismatch} didn’t match the page they cite`,
    w.offCheck && `${w.offCheck} didn’t fit ${w.offCheck === 1 ? "its check" : "their checks"}`,
    w.wrongSite &&
      (w.wrongSite === 1
        ? "1 was the brand vouching for its own certification or rating"
        : `${w.wrongSite} were the brand vouching for its own certifications or ratings`),
    w.banned && `${w.banned} used legal wording Low Tide doesn’t show`,
  ].filter(Boolean);
  return `${n} ${n === 1 ? "quote" : "quotes"} removed: ${parts.join(", ")}.`;
}

const WAVE = "M0 12 " + Array.from({ length: 24 }, (_, i) => `Q ${i * 50 + 25} ${i % 2 ? 20 : 4} ${i * 50 + 50} 12`).join(" ");

// Swaps exactly one word, the kind of slip that flips meaning, so the guard has something real to catch.
const SWAPS: [RegExp, string][] = [
  [/\bshould\b/, "may"],
  [/\bunless\b/, "if"],
  [/\bnot\b/, "always"],
  [/\bdeceptive\b/, "acceptable"],
];
function tamper(quote: string) {
  for (const [re, to] of SWAPS) {
    const m = quote.match(re);
    if (m) return { quote: quote.replace(re, to), from: m[0], to };
  }
  const from = quote.split(/\s+/).reduce((a, b) => (b.length > a.length ? b : a));
  return { quote: quote.replace(from, "generally"), from, to: "generally" };
}

function markClaim(claim: string, phrases: string[]): ReactNode {
  const esc = phrases.filter(Boolean).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!esc.length) return claim;
  return claim.split(new RegExp(`(${esc.join("|")})`, "gi")).map((part, i) =>
    i % 2 ? (
      <span key={i} className="underline decoration-buoy decoration-[5px] underline-offset-[6px] [text-decoration-skip-ink:none]">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

const modelName = (id: string) => id.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

async function post(path: string, body: object) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

function FindingCard({ f, onTamper }: { f: Shown; onTamper?: () => void }) {
  const v = VERDICT[f.verdict];
  return (
    <article className="border-t border-deep/15 py-7">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${v.tone}`}>{v.label}</span>
        <span className="text-lg font-semibold">&ldquo;{f.phrase}&rdquo;</span>
      </div>
      <p className="mt-3 max-w-[65ch] leading-relaxed">{f.why}</p>

      {f.verdict === "not_covered" ? (
        <p className="mt-4 max-w-[65ch] text-deep/70">
          Low Tide won&rsquo;t stretch a rule to fit a term the Guides never use. Ask the seller what the claim means and
          what backs it up.
        </p>
      ) : (
        <figure className="mt-5 rounded-md bg-white/65 p-4 sm:p-6">
          <figcaption className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <a href={f.url} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">
              &sect; {f.section} {f.title}
            </a>
            <span className="text-deep/65">Quote checked word for word</span>
          </figcaption>
          <blockquote className="mt-3 font-serif text-[1.08rem] leading-[1.7]">
            {f.context ? (
              <>
                {f.context.before}
                <mark className="bg-sun text-deep">{f.context.match}</mark>
                {f.context.after}
              </>
            ) : (
              <mark className="bg-sun text-deep">{f.quote}</mark>
            )}
          </blockquote>
          {onTamper && (
            <button
              type="button"
              onClick={onTamper}
              className="mt-4 text-sm text-deep/70 underline underline-offset-2 hover:text-deep"
            >
              Tamper test: change one word
            </button>
          )}
        </figure>
      )}
    </article>
  );
}

function CheckCard({ c }: { c: Check }) {
  const m = MARK[c.mark];
  return (
    <article className="border-t border-deep/15 py-7">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-xl font-semibold">{CHECK_TITLE[c.check]}</h3>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${m.tone}`}>{m.label}</span>
      </div>
      {c.signals.length ? (
        c.signals.map((s) => (
          <figure key={`${s.url}-${s.quote.slice(0, 24)}`} className="mt-4 rounded-md bg-white/65 p-4 sm:p-6">
            {c.mark === "both" && (
              <span className={`mb-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${MARK[s.sign].tone}`}>
                {MARK[s.sign].label}
              </span>
            )}
            <p className="max-w-[65ch] leading-relaxed">{s.note}</p>
            <blockquote className="mt-3 font-serif text-[1.08rem] leading-[1.7]">
              <mark className="bg-sun text-deep">{s.quote}</mark>
            </blockquote>
            <figcaption className="mt-3 flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span>
                <a href={s.url} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">
                  {s.host}
                </a>
                {s.own && <span className="ml-2 text-deep/65">their own site</span>}
              </span>
              <span className="text-deep/65">Quote checked word for word against this page</span>
            </figcaption>
          </figure>
        ))
      ) : (
        <p className="mt-3 max-w-[65ch] text-deep/70">
          Low Tide couldn&rsquo;t find a source it could verify for this. That isn&rsquo;t the same as a no.
        </p>
      )}
    </article>
  );
}

export default function Home() {
  const [claim, setClaim] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [runs, setRuns] = useState(0);
  const [mode, setMode] = useState<"claim" | "brand">("claim");
  const [brand, setBrand] = useState("");
  const [brandResult, setBrandResult] = useState<BrandResult | null>(null);

  async function check(text: string) {
    setClaim(text);
    setBusy(true);
    try {
      setResult({ claim: text, ...(await post("/api/check", { claim: text })) });
    } catch {
      setResult({ claim: text, findings: [], removed: 0, model: "", error: "Couldn't reach Low Tide. Check your connection and try again." });
    } finally {
      setBusy(false);
      setRuns((n) => n + 1);
    }
  }

  async function runTamper(i: number) {
    if (!result) return;
    const f = result.findings[i];
    const t = tamper(f.quote);
    const r = await post("/api/check", {
      recheck: [{ phrase: f.phrase, section: f.section, verdict: f.verdict, why: f.why, quote: t.quote }],
    }).catch(() => null);
    if (!r) return;
    setResult({
      ...result,
      findings: r.removed ? result.findings.filter((_, j) => j !== i) : result.findings,
      removed: result.removed + (r.removed ?? 0),
      note: `Tamper test: changed “${t.from}” to “${t.to}” in the ${f.section} quote and sent it back through the quote check.`,
    });
  }

  async function checkBrand(text: string) {
    setBrand(text);
    setBusy(true);
    try {
      setBrandResult(await post("/api/brand", { brand: text }));
    } catch {
      setBrandResult({
        brand: text,
        checks: [],
        removed: 0,
        removedWhy: { mismatch: 0, offCheck: 0, wrongSite: 0, banned: 0 },
        pagesFound: 0,
        pagesRead: 0,
        model: "",
        error: "Couldn't reach Low Tide. Check your connection and try again.",
      });
    } finally {
      setBusy(false);
      setRuns((n) => n + 1);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-5 pb-16 pt-14 sm:px-8 sm:pt-20">
      <header>
        <h1 className="text-6xl font-bold tracking-[-0.04em] sm:text-8xl">Low Tide</h1>
        <p className="mt-5 max-w-[58ch] text-lg leading-relaxed text-deep/80">
          {mode === "claim" ? (
            <>
              Paste a green claim from a product. Gemini 2.5 Flash reads it against the FTC Green Guides, and Low Tide
              checks every quote it cites word for word before showing you the passage.
            </>
          ) : (
            <>
              Type a brand or a link to its site. Gemini 2.5 Flash searches for certifications, climate action,
              independent ratings and regulator findings, and Low Tide checks every quote word for word against the page
              it came from.
            </>
          )}
        </p>
      </header>

      <div role="group" aria-label="What to check" className="mt-10 inline-flex rounded-full border border-deep/30 p-1">
        {(["claim", "brand"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            disabled={busy}
            onClick={() => setMode(m)}
            className={`rounded-full px-4 py-1.5 font-semibold transition-colors ${mode === m ? "bg-deep text-flat" : "text-deep/75 hover:text-deep"}`}
          >
            {m === "claim" ? "A claim" : "A brand"}
          </button>
        ))}
      </div>

      {mode === "claim" ? (
        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (claim.trim().length >= 3) check(claim.trim());
          }}
        >
          <label htmlFor="claim" className="sr-only">
            Green claim
          </label>
          <textarea
            id="claim"
            rows={3}
            maxLength={500}
            value={claim}
            onChange={(e) => setClaim(e.target.value)}
            placeholder="Paste a claim, like: Plant-based bottle, 100% compostable"
            className="w-full resize-y rounded-md border border-deep/25 bg-white/70 p-4 text-lg placeholder:text-deep/45 focus:border-deep focus:outline-none"
          />
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <button
              type="submit"
              disabled={busy || claim.trim().length < 3}
              className="rounded-md bg-deep px-5 py-2.5 font-semibold text-flat transition-opacity disabled:opacity-40"
            >
              {busy ? "Checking…" : "Check claim"}
            </button>
            <span className="text-deep/70">or try a sample:</span>
            {SAMPLES.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy}
                onClick={() => check(s)}
                className="rounded-full border border-deep/30 px-3 py-1.5 text-sm transition-colors hover:bg-deep hover:text-flat disabled:opacity-40"
              >
                {s}
              </button>
            ))}
          </div>
        </form>
      ) : (
        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (brand.trim().length >= 2) checkBrand(brand.trim());
          }}
        >
          <label htmlFor="brand" className="sr-only">
            Brand name or link
          </label>
          <input
            id="brand"
            type="text"
            maxLength={300}
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="Brand name or a link"
            className="w-full rounded-md border border-deep/25 bg-white/70 p-4 text-lg placeholder:text-deep/45 focus:border-deep focus:outline-none"
          />
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <button
              type="submit"
              disabled={busy || brand.trim().length < 2}
              className="rounded-md bg-deep px-5 py-2.5 font-semibold text-flat transition-opacity disabled:opacity-40"
            >
              {busy ? "Researching…" : "Check brand"}
            </button>
            <span className="text-deep/70">or try a sample:</span>
            {BRAND_SAMPLES.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy}
                onClick={() => checkBrand(s)}
                className="rounded-full border border-deep/30 px-3 py-1.5 text-sm transition-colors hover:bg-deep hover:text-flat disabled:opacity-40"
              >
                {s}
              </button>
            ))}
          </div>
          {busy && <p className="mt-3 text-deep/70">Searching the web and reading sources. This takes about 20 seconds.</p>}
        </form>
      )}

      <svg key={runs} aria-hidden viewBox="0 0 1200 24" preserveAspectRatio="none" className="waterline my-12 h-6 w-full text-deep/35">
        <path d={WAVE} pathLength={1} fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>

      {mode === "claim" ? (
        <section aria-live="polite" className="min-h-24">
          {!result && <p className="text-deep/60">Pick a sample or paste a claim. The answer shows up here.</p>}

          {result?.error && <p className="text-lg">{result.error}</p>}

          {result && !result.error && (
            <>
              <p className="font-serif text-3xl leading-snug sm:text-4xl">
                &ldquo;{markClaim(result.claim, result.findings.map((f) => f.phrase))}&rdquo;
              </p>
              {result.model && (
                <p className="mt-3 text-sm text-deep/65">
                  {result.source === "sample"
                    ? `Saved answer from ${modelName(result.model)}, so this sample works offline.`
                    : `Checked live by ${modelName(result.model)}.`}
                </p>
              )}

              {result.findings.length === 0 && result.removed === 0 && (
                <p className="mt-8 text-lg">No green claims found in that text. Try the exact words from the package.</p>
              )}

              <div className="mt-8">
                {result.findings.map((f, i) => (
                  <FindingCard key={`${f.phrase}-${f.section}`} f={f} onTamper={() => runTamper(i)} />
                ))}
              </div>

              {result.note && <p className="mt-2 text-sm text-deep/70">{result.note}</p>}
              {result.removed > 0 && (
                <p className="mt-2 font-semibold">
                  {result.removed === 1
                    ? "1 finding removed: quote didn’t match the Guides."
                    : `${result.removed} findings removed: quotes didn’t match the Guides.`}
                </p>
              )}
            </>
          )}
        </section>
      ) : (
        <section aria-live="polite" className="min-h-24">
          {!brandResult && <p className="text-deep/60">Pick a sample brand or type one. The answer shows up here.</p>}
          {brandResult?.error && <p className="text-lg">{brandResult.error}</p>}
          {brandResult && !brandResult.error && (
            <>
              <h2 className="font-serif text-3xl leading-snug sm:text-4xl">Is {brandResult.brand} sustainable?</h2>
              {brandResult.verdict && (
                <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className={`rounded-full px-4 py-1.5 text-lg font-semibold ${BRAND_VERDICT[brandResult.verdict].tone}`}>
                    {BRAND_VERDICT[brandResult.verdict].label}
                  </span>
                  <span className="text-deep/80">{ruleLine(brandResult)}</span>
                </div>
              )}
              <p className="mt-3 max-w-[65ch] text-sm text-deep/70">This describes the evidence Low Tide could verify, not a certification.</p>
              <p className="mt-2 text-sm text-deep/65">
                {brandResult.source === "sample" && brandResult.savedOn
                  ? `Saved answer from ${modelName(brandResult.model)} with Google Search, checked against these pages on ${savedDate(brandResult.savedOn)}.`
                  : `Researched live by ${modelName(brandResult.model)} with Google Search.`}{" "}
                Read {brandResult.pagesRead} of {brandResult.pagesFound} sources found.
              </p>
              <div className="mt-8">
                {brandResult.checks.map((c) => (
                  <CheckCard key={c.check} c={c} />
                ))}
              </div>
              {brandResult.removed > 0 && <p className="mt-2 font-semibold">{removedLine(brandResult.removedWhy)}</p>}
            </>
          )}
        </section>
      )}

      <footer className="mt-20 border-t border-deep/15 pt-6 text-sm leading-relaxed text-deep/70">
        Low Tide reads your claim against the FTC Green Guides (16 CFR Part 260). It is not legal advice. Every quote is
        checked word for word against the Guides before it is shown.
        {mode === "brand" && " In brand mode, every quote is checked word for word against the page it came from."}
      </footer>
    </main>
  );
}
