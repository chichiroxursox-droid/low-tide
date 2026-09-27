"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import fixtures from "@/fixtures/samples.json";
import brandFixtures from "@/fixtures/brands.json";
import type { Shown } from "@/lib/guard";

// A finding the tamper test pulled keeps its row, with the swapped word on show.
type Finding = Shown & { pulled?: { from: string; to: string } };
type Result = {
  claim: string;
  findings: Finding[];
  removed: number;
  source?: "sample" | "live" | "recheck";
  model: string;
  error?: string;
  note?: string;
};

type CheckKey = "certifications" | "climate" | "labor" | "ratings" | "watchdogs";
type Mark = "good" | "red" | "both" | "not_found";
type Signal = { sign: "good" | "red"; quote: string; note: string; url: string; host: string; own: boolean; known: boolean };
type Check = { check: CheckKey; mark: Mark; signals: Signal[] };
type BrandVerdict = "strong" | "mixed" | "red_flags" | "not_enough";
type BrandResult = {
  brand: string;
  verdict?: BrandVerdict;
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
// One line of a live brand check's progress stream (see lib/brand.ts Stage).
type Stage =
  | { stage: "search"; check: CheckKey; links: number }
  | { stage: "read"; found: number; read: number }
  | { stage: "named"; pages: number; known: number }
  | { stage: "picked"; findings: number }
  | { stage: "checked"; kept: number; removed: number };

const SAMPLES = Object.keys(fixtures.samples);
const BRAND_SAMPLES = Object.keys(brandFixtures.brands);
const isSample = (list: string[], text: string) => list.some((s) => s.toLowerCase() === text.toLowerCase());

type Tone = "green" | "yellow" | "red" | "split" | "none";
const FILL = { green: "var(--color-flag-green)", yellow: "var(--color-flag-yellow)", red: "var(--color-rescue)" };

const VERDICT: Record<Shown["verdict"], { label: string; tone: Tone }> = {
  needs_qualification: { label: "Needs qualification", tone: "yellow" },
  ok_if_substantiated: { label: "OK if they can prove it", tone: "green" },
  not_covered: { label: "Not covered by the Guides", tone: "none" },
};
const BRAND_VERDICT: Record<BrandVerdict, { label: string; tone: Tone }> = {
  strong: { label: "Strong record", tone: "green" },
  mixed: { label: "Mixed record", tone: "yellow" },
  red_flags: { label: "Red flags", tone: "red" },
  not_enough: { label: "Not enough evidence", tone: "none" },
};
const CHECK_TITLE: Record<CheckKey, string> = {
  certifications: "Certifications",
  climate: "Climate action",
  labor: "Labor and sourcing",
  ratings: "Independent ratings",
  watchdogs: "Regulator and watchdog findings",
};
const CHECK_ORDER: CheckKey[] = ["certifications", "climate", "labor", "ratings", "watchdogs"];
const MARK: Record<Mark, { label: string; tone: Tone }> = {
  good: { label: "Good sign", tone: "green" },
  red: { label: "Red flag", tone: "red" },
  both: { label: "Both", tone: "split" },
  not_found: { label: "Not found", tone: "none" },
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
        ? "1 was the brand vouching for itself on a certification, rating or labor record"
        : `${w.wrongSite} were the brand vouching for itself on certifications, ratings or labor records`),
    w.banned && `${w.banned} used legal wording Low Tide doesn’t show`,
  ].filter(Boolean);
  return `${n} ${n === 1 ? "quote" : "quotes"} removed: ${parts.join(", ")}.`;
}

const wave = (width: number) =>
  "M0 12 " + Array.from({ length: width / 50 }, (_, i) => `Q ${i * 50 + 25} ${i % 2 ? 20 : 4} ${i * 50 + 50} 12`).join(" ");
const WAVE = wave(1200);
const SURF = `${wave(2400)} L2400 24 L0 24 Z`;

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

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function markClaim(claim: string, phrases: string[]): ReactNode {
  const esc = phrases.filter(Boolean).map(escapeRe);
  if (!esc.length) return claim;
  return claim.split(new RegExp(`(${esc.join("|")})`, "gi")).map((part, i) =>
    i % 2 ? (
      <span key={i} className="underline decoration-flag-yellow decoration-[6px] underline-offset-[7px] [text-decoration-skip-ink:none]">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

// The tampered passage: the original word struck through, the swapped word in rescue red.
function Swapped({ text, from, to }: { text: string; from: string; to: string }) {
  const i = text.search(new RegExp(`\\b${escapeRe(from)}\\b`));
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <s className="decoration-rescue decoration-2">{from}</s> <span className="font-bold text-rescue">{to}</span>
      {text.slice(i + from.length)}
    </>
  );
}

const modelName = (id: string) => id.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

// Plain JSON for samples and errors; a live brand check streams one JSON line per step and ends with the answer.
async function post(path: string, body: object, onStage?: (s: Stage) => void) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.body || !r.headers.get("content-type")?.includes("ndjson")) return r.json();
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = null;
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    for (let nl = buffer.indexOf("\n"); nl >= 0; nl = buffer.indexOf("\n")) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.type === "stage") onStage?.(msg);
      else answer = msg;
    }
    if (done) break;
  }
  if (!answer) throw new Error("The check ended without an answer.");
  return answer;
}

const FLAG = "M4 3.5c4-1.6 8 1.6 14 0v9c-6 1.6-10-1.6-14 0z";

// A beach flag on its pole: the one icon this page draws, in the verdict's own cloth. It can hoist on arrival
// (hoist = delay in ms) or come down when its finding is pulled (lowered).
function FlagIcon({ tone, className = "h-6 w-5", hoist, lowered }: { tone: Tone; className?: string; hoist?: number; lowered?: boolean }) {
  const id = "flag" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const cloth =
    tone === "none" ? null : tone === "split" ? (
      <>
        <clipPath id={id}>
          <path d={FLAG} />
        </clipPath>
        <g clipPath={`url(#${id})`}>
          <rect width="20" height="24" fill={FILL.green} />
          <path d="M4 0H20L4 16Z" fill={FILL.red} />
        </g>
        <path d={FLAG} fill="none" stroke="var(--color-water)" strokeWidth="0.7" />
      </>
    ) : (
      <path d={FLAG} fill={FILL[tone]} stroke="var(--color-water)" strokeWidth="0.7" />
    );
  const outline = <path d={FLAG} fill="none" stroke="var(--color-water)" strokeWidth="1.1" strokeDasharray="2 1.6" />;
  return (
    <svg viewBox="0 0 20 24" className={`shrink-0 overflow-visible ${className}`} aria-hidden>
      <path d="M3.2 2v20.5" stroke="var(--color-water)" strokeWidth="1.6" strokeLinecap="round" />
      {(tone === "none" || lowered) && outline}
      {cloth &&
        (lowered ? (
          <g className="flag-lower">{cloth}</g>
        ) : hoist !== undefined ? (
          <g className="flag-hoist" style={{ "--hoist-from": "15px", animationDelay: `${hoist}ms` } as CSSProperties}>
            {cloth}
          </g>
        ) : (
          cloth
        ))}
    </svg>
  );
}

const BIG_FLAG = "M33 20c26-9 48 9 94 0v58c-46 9-68-9-94 0z";

// The verdict flies on the stand's pole; it hoists when the answer lands.
function VerdictPole({ tone }: { tone: Tone }) {
  return (
    <svg viewBox="0 0 132 214" className="h-40 w-auto shrink-0 sm:h-56" aria-hidden>
      <rect x="12" y="204" width="40" height="8" rx="1.5" fill="var(--color-water)" />
      <path d="M31 16V205" stroke="var(--color-water)" strokeWidth="4" strokeLinecap="round" />
      <circle cx="31" cy="10" r="6.5" fill="var(--color-water)" />
      {tone === "none" ? (
        <path d={BIG_FLAG} fill="none" stroke="var(--color-water)" strokeWidth="2" strokeDasharray="7 6" />
      ) : (
        <g className="flag-hoist" style={{ "--hoist-from": "118px" } as CSSProperties}>
          <path d={BIG_FLAG} fill={FILL[tone as "green" | "yellow" | "red"]} stroke="var(--color-water)" strokeWidth="1.5" />
        </g>
      )}
    </svg>
  );
}

function Tick({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={`shrink-0 ${className}`} aria-hidden>
      <path d="M3 8.5l3.2 3.2L13 4.8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// One section of a tide staff: alternating red and white bands with E-shaped graduations and the step's numeral.
// Under water only its graduations and numeral show through.
function StaffSection({ step, dry }: { step: number; dry: boolean }) {
  const red = step % 2 === 1;
  const ink = !dry ? "text-white/35" : red ? "text-white" : "text-water";
  return (
    <span aria-hidden className={`relative border-r-2 border-water transition-colors duration-700 ${dry ? (red ? "bg-rescue" : "bg-board") : ""} ${ink}`}>
      <span className="absolute left-0 top-0 h-full w-[45%] bg-[repeating-linear-gradient(to_bottom,currentColor_0_3px,transparent_3px_14px)]" />
      <span className="absolute left-0 top-0 h-full w-[3px] bg-current" />
      <span className="absolute right-1.5 top-1.5 font-stencil text-lg font-black leading-none">{step}</span>
    </span>
  );
}

type Row = { label: string; detail?: ReactNode; done: boolean };

// The loading screen: deep water over a tide staff. Each real step that finishes drains one mark.
function TideLoader({ title, hint, rows }: { title: string; hint: string; rows: Row[] }) {
  const firstWet = rows.findIndex((r) => !r.done);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ref.current?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "center" });
  }, []);
  return (
    <div ref={ref} className="overflow-hidden rounded-[3px] border-2 border-water">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-water px-5 py-4">
        <p className="font-stencil text-2xl font-extrabold uppercase tracking-[0.01em]">{title}</p>
        <p className="text-sm text-water/75">{hint}</p>
      </div>
      <ol className="bg-haze">
        {rows.map((r, i) => {
          const wet = !r.done;
          return (
            <li
              key={r.label}
              className={`relative grid min-h-[4.5rem] grid-cols-[2.75rem_1fr] transition-colors duration-700 ${wet ? "bg-water text-white" : "text-water"}`}
            >
              {i === firstWet && (
                <svg aria-hidden viewBox="0 0 2400 24" preserveAspectRatio="none" className="tide-edge absolute -top-3 left-0 h-3.5 w-[200%]">
                  <path d={SURF} fill="var(--color-water)" />
                </svg>
              )}
              <StaffSection step={i + 1} dry={!wet} />
              <span className="flex flex-col justify-center px-4 py-3">
                <span className="flex items-center gap-2.5 font-bold">
                  {r.done ? (
                    <Tick />
                  ) : i === firstWet ? (
                    <span className="tide-active h-3 w-3 shrink-0 rounded-full bg-flag-yellow" />
                  ) : (
                    <span className="h-3 w-3 shrink-0 rounded-full border-2 border-white/55" />
                  )}
                  {r.label}
                </span>
                {r.detail && <span className={`mt-1 pl-[1.375rem] text-sm ${wet ? "text-white/85" : "text-water/80"}`}>{r.detail}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function brandRows(brand: string, stages: Stage[]): Row[] {
  const searched = stages.filter((s): s is Extract<Stage, { stage: "search" }> => s.stage === "search");
  const find = <K extends Stage["stage"]>(k: K) => stages.find((s): s is Extract<Stage, { stage: K }> => s.stage === k);
  const read = find("read");
  const named = find("named");
  const picked = find("picked");
  const checked = find("checked");
  return [
    {
      label: "Search the web for each check",
      done: searched.length === CHECK_ORDER.length,
      detail: (
        <span className="flex flex-wrap gap-x-4 gap-y-1">
          {CHECK_ORDER.map((k) => {
            const s = searched.find((x) => x.check === k);
            return (
              <span key={k} className={`inline-flex items-center gap-1 ${s ? "" : "opacity-60"}`}>
                {s && <Tick className="h-3.5 w-3.5" />}
                {CHECK_TITLE[k]}
                {s && `: ${s.links} ${s.links === 1 ? "link" : "links"}`}
              </span>
            );
          })}
        </span>
      ),
    },
    { label: "Download the pages", done: !!read, detail: read ? `Read ${read.read} of ${read.found}` : "Up to 20 pages" },
    {
      label: `Drop junk sites and pages that don’t name ${brand}`,
      done: !!named,
      detail: named ? `${named.pages} kept, ${named.known} from known sources` : undefined,
    },
    { label: "Gemini picks quotes for each check", done: !!picked, detail: picked ? `${picked.findings} picked` : undefined },
    {
      label: "Check every quote word for word",
      done: !!checked,
      detail: checked ? `${checked.kept} kept, ${checked.removed} removed` : undefined,
    },
  ];
}

// ponytail: a live claim is one Gemini call and an instant guard, so the loader shows that one honest step.
const CLAIM_ROWS: Row[] = [{ label: "Gemini reads the claim against the Green Guides, then every quote is checked word for word", done: false }];

function RowHead({ tone, title, sub, hoist, lowered }: { tone: Tone; title: string; sub?: string; hoist?: number; lowered?: boolean }) {
  return (
    <div className="flex items-start gap-3 md:flex-col md:gap-2.5">
      <FlagIcon tone={tone} className="h-10 w-8" hoist={hoist} lowered={lowered} />
      <div>
        <h3 className="font-stencil text-[1.35rem] font-extrabold uppercase leading-[1.05] tracking-[0.01em]">{title}</h3>
        {sub && <p className="mt-1 text-sm font-bold">{sub}</p>}
      </div>
    </div>
  );
}

const ROW = "grid gap-x-10 gap-y-4 border-t-2 border-water py-8 md:grid-cols-[13.5rem_1fr]";
const MARK_TEXT = "bg-mark text-water [box-decoration-break:clone] [box-shadow:0_0_0_2px_var(--color-mark)]";

type FindingRowProps = { f: Finding; index: number; onTamper: () => void; tampering: boolean; failed: boolean };

function FindingRow({ f, index, onTamper, tampering, failed }: FindingRowProps) {
  const v = VERDICT[f.verdict];
  const passage = f.context ? (
    <>
      {f.context.before}
      {f.pulled ? (
        <Swapped text={f.context.match} from={f.pulled.from} to={f.pulled.to} />
      ) : (
        <mark className={MARK_TEXT}>{f.context.match}</mark>
      )}
      {f.context.after}
    </>
  ) : f.pulled ? (
    <Swapped text={f.quote} from={f.pulled.from} to={f.pulled.to} />
  ) : (
    <mark className={MARK_TEXT}>{f.quote}</mark>
  );
  return (
    <article className={ROW}>
      {/* A pulled finding shows no verdict: its quote no longer verifies. */}
      <RowHead tone={v.tone} title={f.pulled ? "Finding removed" : v.label} hoist={index * 180} lowered={!!f.pulled} />
      <div className="min-w-0">
        {f.pulled && (
          <p className="mb-3 font-bold text-rescue">Finding removed: this quote no longer matches &sect; {f.section} word for word.</p>
        )}
        <p className="text-lg font-bold">&ldquo;{f.phrase}&rdquo;</p>
        <p className="mt-2 max-w-[65ch] leading-relaxed">{f.why}</p>
        {f.verdict === "not_covered" ? (
          <p className="mt-4 max-w-[65ch] text-water/75">
            Low Tide won&rsquo;t stretch a rule to fit a term the Guides never use. Ask the seller what the claim means and
            what backs it up.
          </p>
        ) : (
          <div className="mt-5">
            <figure className="rounded-[3px] bg-haze p-5 sm:p-6">
              <blockquote className="max-w-[68ch] font-serif text-[1.1rem] leading-[1.7]">{passage}</blockquote>
              <figcaption className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
                <a href={f.url} target="_blank" rel="noreferrer" className="font-bold underline decoration-2 underline-offset-2">
                  &sect; {f.section} {f.title}
                </a>
                <span className={f.pulled ? "font-bold text-rescue" : "text-water/70"}>
                  {f.pulled ? "Edited quote failed the word for word check" : "Quote checked word for word"}
                </span>
              </figcaption>
            </figure>
            {!f.pulled && (
              <button
                type="button"
                onClick={onTamper}
                disabled={tampering}
                className="mt-4 rounded-[3px] border-2 border-water px-3 py-1.5 text-sm font-bold transition-colors hover:bg-water hover:text-white disabled:opacity-60"
              >
                {tampering ? "Checking the edited quote…" : "Tamper test: change one word"}
              </button>
            )}
            {failed && (
              <p className="mt-2 text-sm font-bold text-rescue">
                Couldn&rsquo;t reach Low Tide, so the tamper test didn&rsquo;t run. Try it again.
              </p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function CheckRow({ c }: { c: Check }) {
  const m = MARK[c.mark];
  return (
    <article className={ROW}>
      <RowHead tone={m.tone} title={CHECK_TITLE[c.check]} sub={m.label} />
      <div className="min-w-0 divide-y divide-water/25">
        {c.signals.length ? (
          c.signals.map((s) => (
            <figure key={`${s.url}-${s.quote.slice(0, 24)}`} className="py-5 first:pt-0 last:pb-0">
              {c.mark === "both" && (
                <span className="mb-2 flex items-center gap-1.5 text-sm font-bold">
                  <FlagIcon tone={MARK[s.sign].tone} className="h-5 w-4" />
                  {MARK[s.sign].label}
                </span>
              )}
              <p className="max-w-[65ch] leading-relaxed">{s.note}</p>
              <blockquote className="mt-3 max-w-[68ch] font-serif text-[1.1rem] leading-[1.7]">
                <mark className={MARK_TEXT}>{s.quote}</mark>
              </blockquote>
              <figcaption className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
                <span>
                  <a href={s.url} target="_blank" rel="noreferrer" className="font-bold underline decoration-2 underline-offset-2">
                    {s.host}
                  </a>
                  {(s.own || !s.known) && <span className="ml-2 text-water/70">{s.own ? "their own site" : "lesser-known site"}</span>}
                </span>
                <span className="text-water/70">Quote checked word for word against this page</span>
              </figcaption>
            </figure>
          ))
        ) : (
          <p className="max-w-[65ch] pt-1 text-water/75">
            Low Tide couldn&rsquo;t find a source it could verify for this. That isn&rsquo;t the same as a no.
          </p>
        )}
      </div>
    </article>
  );
}

const LEGEND: Record<"claim" | "brand", [Tone, string][]> = {
  claim: [
    ["green", "OK if they can prove it"],
    ["yellow", "Needs qualification"],
    ["none", "Not covered by the Guides"],
  ],
  brand: [
    ["green", "Strong record"],
    ["yellow", "Mixed record"],
    ["red", "Red flags"],
    ["none", "Not enough evidence"],
  ],
};

// The sign every lifeguard stand posts next to its flag pole.
function FlagLegend({ mode }: { mode: "claim" | "brand" }) {
  return (
    <aside className="hidden w-72 shrink-0 bg-board px-6 py-5 text-water lg:block">
      <h2 className="font-stencil text-xl font-extrabold uppercase tracking-[0.02em]">What the flags mean</h2>
      <ul className="mt-3 space-y-2.5">
        {LEGEND[mode].map(([tone, label]) => (
          <li key={label} className="flex items-center gap-3 font-bold">
            <FlagIcon tone={tone} className="h-8 w-7" />
            {label}
          </li>
        ))}
      </ul>
    </aside>
  );
}

function Idle({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-4 text-water/75">
      <FlagIcon tone="none" className="h-12 w-10" />
      <p className="text-lg">{children}</p>
    </div>
  );
}

const PLAQUE =
  "rounded-[3px] border-2 border-water px-3 py-1.5 text-sm font-bold transition-colors hover:bg-water hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-water";
const CHECK_BUTTON =
  "bg-rescue px-7 py-3 font-stencil text-2xl font-extrabold uppercase tracking-[0.02em] text-white transition-[transform,background-color] hover:bg-rescue-edge active:translate-y-0.5 disabled:bg-rescue-edge";
const FIELD =
  "w-full rounded-[3px] border-2 border-water bg-board p-4 text-lg placeholder:text-water/75 focus:border-rescue focus:outline-none";

export default function Home() {
  const [claim, setClaim] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [mode, setMode] = useState<"claim" | "brand">("brand");
  const [brand, setBrand] = useState("");
  const [brandResult, setBrandResult] = useState<BrandResult | null>(null);
  const [loading, setLoading] = useState<null | "claim" | "brand">(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [runs, setRuns] = useState(0);
  const [hint, setHint] = useState("");
  const [tampering, setTampering] = useState<number | null>(null);
  const [tamperFailed, setTamperFailed] = useState<number | null>(null);
  const claimField = useRef<HTMLTextAreaElement>(null);
  const brandField = useRef<HTMLInputElement>(null);

  async function check(text: string) {
    setClaim(text);
    setHint("");
    setTamperFailed(null);
    setBusy(true);
    if (!isSample(SAMPLES, text)) setLoading("claim");
    try {
      setResult({ claim: text, ...(await post("/api/check", { claim: text })) });
    } catch {
      setResult({ claim: text, findings: [], removed: 0, model: "", error: "Couldn't reach Low Tide. Check your connection and try again." });
    } finally {
      setBusy(false);
      setLoading(null);
      setRuns((n) => n + 1);
    }
  }

  async function runTamper(i: number) {
    if (!result) return;
    const f = result.findings[i];
    const t = tamper(f.quote);
    setTampering(i);
    setTamperFailed(null);
    const r = await post("/api/check", {
      recheck: [{ phrase: f.phrase, section: f.section, verdict: f.verdict, why: f.why, quote: t.quote }],
    }).catch(() => null);
    setTampering(null);
    if (!r || r.error) {
      setTamperFailed(i);
      return;
    }
    setResult({
      ...result,
      findings: result.findings.map((x, j) => (j === i && r.removed ? { ...x, pulled: { from: t.from, to: t.to } } : x)),
      removed: result.removed + (r.removed ?? 0),
      note: `Tamper test: changed “${t.from}” to “${t.to}” in the ${f.section} quote and sent it back through the quote check.`,
    });
  }

  async function checkBrand(text: string) {
    setBrand(text);
    setHint("");
    setBusy(true);
    setStages([]);
    if (!isSample(BRAND_SAMPLES, text)) setLoading("brand");
    try {
      setBrandResult(await post("/api/brand", { brand: text }, (s) => setStages((prev) => [...prev, s])));
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
      setLoading(null);
      setRuns((n) => n + 1);
    }
  }

  const v = brandResult?.verdict ? BRAND_VERDICT[brandResult.verdict] : null;

  return (
    <main>
      <header className="bg-rescue text-white">
        <div className="mx-auto max-w-5xl px-5 pt-12 sm:px-8 sm:pt-16">
          <div className="flex items-start justify-between gap-10">
            <div>
              <h1 className="font-stencil text-[clamp(4.5rem,17vw,6rem)] font-black uppercase leading-[0.8] tracking-[0.01em] [font-variation-settings:'opsz'_72]">
                Low Tide
              </h1>
              <p className="mt-6 max-w-[52ch] text-lg leading-relaxed">
                {mode === "claim"
                  ? "Paste a green claim. Get the exact FTC Green Guides passage behind every answer, checked word for word."
                  : "Type a brand. Gemini 2.5 Flash gathers the evidence on how it treats the planet and the people who make its products, and Low Tide checks every quote word for word before the flag goes up."}
              </p>
            </div>
            <FlagLegend mode={mode} />
          </div>
          <div role="group" aria-label="What to check" className="mt-9 flex gap-1.5">
            {(["brand", "claim"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                disabled={busy}
                onClick={() => {
                  setMode(m);
                  setHint("");
                }}
                className={`rounded-t-[4px] px-5 pb-2 pt-2.5 font-stencil text-xl font-extrabold uppercase tracking-[0.02em] transition-colors sm:px-7 ${
                  mode === m ? "bg-board text-water" : "bg-rescue-edge text-white hover:bg-[#8e1811]"
                }`}
              >
                {m === "claim" ? "A claim" : "A brand"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-5 pt-8 sm:px-8">
        {mode === "claim" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (claim.trim().length >= 3) return check(claim.trim());
              setHint("Type a claim of at least 3 characters, or pick a sample.");
              claimField.current?.focus();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
              <label htmlFor="claim" className="sr-only">
                Green claim
              </label>
              <textarea
                id="claim"
                ref={claimField}
                rows={3}
                maxLength={500}
                value={claim}
                onChange={(e) => setClaim(e.target.value)}
                placeholder="Paste a claim, like: Plant-based bottle, 100% compostable"
                aria-describedby={hint ? "entry-hint" : undefined}
                className={`resize-y ${FIELD}`}
              />
              <button type="submit" disabled={busy} className={CHECK_BUTTON}>
                {busy ? "Checking…" : "Check claim"}
              </button>
            </div>
            {hint && (
              <p id="entry-hint" className="mt-2 font-bold text-rescue">
                {hint}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="mr-1 text-water/75">Try a sample:</span>
              {SAMPLES.map((s) => (
                <button key={s} type="button" disabled={busy} onClick={() => check(s)} className={PLAQUE}>
                  {s}
                </button>
              ))}
            </div>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (brand.trim().length >= 2) return checkBrand(brand.trim());
              setHint("Type a brand name or a link of at least 2 characters, or pick a sample.");
              brandField.current?.focus();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
              <label htmlFor="brand" className="sr-only">
                Brand name or link
              </label>
              <input
                id="brand"
                ref={brandField}
                type="text"
                maxLength={300}
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Brand name or a link"
                aria-describedby={hint ? "entry-hint" : undefined}
                className={FIELD}
              />
              <button type="submit" disabled={busy} className={CHECK_BUTTON}>
                {busy ? "Researching…" : "Check brand"}
              </button>
            </div>
            {hint && (
              <p id="entry-hint" className="mt-2 font-bold text-rescue">
                {hint}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="mr-1 text-water/75">Try a sample:</span>
              {BRAND_SAMPLES.map((s) => (
                <button key={s} type="button" disabled={busy} onClick={() => checkBrand(s)} className={PLAQUE}>
                  {s}
                </button>
              ))}
            </div>
          </form>
        )}

        <svg aria-hidden viewBox="0 0 1200 24" preserveAspectRatio="none" className="waterline my-12 h-6 w-full text-water/40">
          <path d={WAVE} pathLength={1} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </svg>
      </section>

      <section aria-live="polite" className="mx-auto min-h-40 max-w-5xl px-5 pb-24 sm:px-8">
        {mode === "claim" ? (
          loading === "claim" ? (
            <TideLoader title="Checking live" hint="A couple of seconds." rows={CLAIM_ROWS} />
          ) : !result ? (
            <Idle>Pick a sample or paste a claim. The answer shows up here.</Idle>
          ) : result.error ? (
            <p className="text-lg">{result.error}</p>
          ) : (
            <>
              <p className="max-w-[40ch] font-serif text-3xl leading-snug sm:text-[2.6rem]">
                &ldquo;{markClaim(result.claim, result.findings.map((f) => f.phrase))}&rdquo;
              </p>
              {result.model && (
                <p className="mt-4 text-sm text-water/75">
                  {result.source === "sample"
                    ? `Saved answer from ${modelName(result.model)}, so this sample works offline.`
                    : `Checked live by ${modelName(result.model)}.`}
                </p>
              )}
              {result.findings.length === 0 && result.removed === 0 && (
                <p className="mt-8 text-lg">No green claims found in that text. Try the exact words from the package.</p>
              )}
              <div className="mt-10" key={runs}>
                {result.findings.map((f, i) => (
                  <FindingRow
                    key={`${f.phrase}-${f.section}`}
                    f={f}
                    index={i}
                    onTamper={() => runTamper(i)}
                    tampering={tampering === i}
                    failed={tamperFailed === i}
                  />
                ))}
              </div>
              {(result.note || result.removed > 0) && (
                <div className="border-t-2 border-water pt-5">
                  {result.note && <p className="text-sm text-water/75">{result.note}</p>}
                  {result.removed > 0 && (
                    <p className="mt-2 font-bold">
                      {result.removed === 1
                        ? "1 finding removed: quote didn’t match the Guides."
                        : `${result.removed} findings removed: quotes didn’t match the Guides.`}
                    </p>
                  )}
                </div>
              )}
            </>
          )
        ) : loading === "brand" ? (
          <TideLoader title={`Checking ${brand} live`} hint="About 30 seconds. The tide goes out as each step finishes." rows={brandRows(brand, stages)} />
        ) : !brandResult ? (
          <Idle>Pick a sample brand or type one. The answer shows up here.</Idle>
        ) : brandResult.error ? (
          <p className="text-lg">{brandResult.error}</p>
        ) : (
          <>
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:gap-10">
              {v && <VerdictPole key={`${brandResult.brand}-${runs}`} tone={v.tone} />}
              <div className="min-w-0">
                <h2 className="break-words font-stencil text-5xl font-extrabold uppercase leading-[0.92] tracking-[0.01em] sm:text-6xl">
                  Is {brandResult.brand} sustainable?
                </h2>
                {v && (
                  <div className="mt-5 flex flex-wrap items-baseline gap-x-5 gap-y-2">
                    <span className="font-stencil text-4xl font-black uppercase tracking-[0.02em]">{v.label}</span>
                    <span className="text-lg">{ruleLine(brandResult)}</span>
                  </div>
                )}
                <p className="mt-4 max-w-[65ch] text-sm text-water/75">This describes the evidence Low Tide could verify, not a certification.</p>
                <p className="mt-1 max-w-[65ch] text-sm text-water/75">
                  Known sources come first: regulators, universities, established news outlets, and recognized certifiers, raters
                  and rights groups. A check uses a lesser-known site only when no known source covers it.
                </p>
                <p className="mt-1 max-w-[65ch] text-sm text-water/75">
                  {brandResult.source === "sample" && brandResult.savedOn
                    ? `Saved answer from ${modelName(brandResult.model)} with Google Search, checked against these pages on ${savedDate(brandResult.savedOn)}.`
                    : `Researched live by ${modelName(brandResult.model)} with Google Search.`}{" "}
                  Read {brandResult.pagesRead} of {brandResult.pagesFound} sources found.
                </p>
              </div>
            </div>
            <div className="mt-12">
              {brandResult.checks.map((c) => (
                <CheckRow key={c.check} c={c} />
              ))}
            </div>
            {brandResult.removed > 0 && <p className="border-t-2 border-water pt-5 font-bold">{removedLine(brandResult.removedWhy)}</p>}
          </>
        )}
      </section>

      <footer className="bg-rescue text-white">
        <div className="mx-auto max-w-5xl px-5 py-9 text-sm leading-relaxed sm:px-8">
          Low Tide reads your claim against the FTC Green Guides (16 CFR Part 260). It is not legal advice. Every quote is
          checked word for word against the Guides before it is shown.
          {mode === "brand" && " In brand mode, every quote is checked word for word against the page it came from."}
        </div>
      </footer>
    </main>
  );
}
