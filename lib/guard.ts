export type Verdict = "needs_qualification" | "ok_if_substantiated" | "not_covered";
export type Finding = { phrase: string; section: string; verdict: Verdict; why: string; quote: string };
export type Guide = { section: string; title: string; text: string; url: string };

// A quote this short proves nothing ("deceptive" appears in every section).
const MIN_WORDS = 6;

// Irons out the typographic noise a model adds when copying text, so the
// comparison is about words, not glyphs.
export function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/^[\s"'.]+|[\s"'.]+$/g, "");
}

export function verifyQuote(quote: string, sectionText: string): boolean {
  const q = normalize(quote);
  return q.split(" ").length >= MIN_WORDS && normalize(sectionText).includes(q);
}

// Finds a verified quote in the original section text and returns its
// paragraph split around it, so the UI can highlight it in place.
export function locateQuote(quote: string, text: string) {
  const words = normalize(quote)
    .split(" ")
    .map((w) =>
      w
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/'/g, "['‘’]")
        .replace(/"/g, '["“”]')
        .replace(/-/g, "[-‐-―]"),
    );
  const m = new RegExp(words.join("\\s+"), "i").exec(text);
  if (!m) return null;
  const start = text.lastIndexOf("\n\n", m.index) + 1; // -1 + 1 = 0 when first paragraph
  const endBreak = text.indexOf("\n\n", m.index + m[0].length);
  const end = endBreak === -1 ? text.length : endBreak;
  return {
    before: text.slice(start, m.index).trimStart(),
    match: m[0],
    after: text.slice(m.index + m[0].length, end),
  };
}

// Keeps findings whose quote is really in the section they cite. "not_covered"
// needs no quote: it is the honest answer when no section applies.
export function guardFindings(findings: Finding[], guides: Guide[]) {
  const kept: Finding[] = [];
  let removed = 0;
  for (const f of findings) {
    if (f.verdict === "not_covered") {
      kept.push({ ...f, section: "", quote: "" });
      continue;
    }
    const section = f.section.match(/260\.\d+/)?.[0];
    const guide = guides.find((g) => g.section === section);
    if (guide && verifyQuote(f.quote, guide.text)) kept.push({ ...f, section: guide.section });
    else removed++;
  }
  return { findings: kept, removed };
}

// The words the UI must never show (CLAUDE.md hard rules). No g flag, so .test() keeps no lastIndex state.
export const BANNED = /\b(illegal(ly)?|violations?|lawsuits?)\b/i;

// Safety net for model prose, in case it slips.
export const soften = (s: string) =>
  s
    .replace(/\billegally\b/gi, "improperly")
    .replace(/\billegal\b/gi, "not allowed")
    .replace(/\bviolations?\b/gi, "problem")
    .replace(/\blawsuits?\b/gi, "dispute");

export type Shown = Finding & { title: string; url: string; context: ReturnType<typeof locateQuote> };

// What the page needs for each verified finding: section title and link, the highlight, and softened prose.
export function present(findings: Finding[], guides: Guide[]): Shown[] {
  return findings.map((f) => {
    const g = guides.find((x) => x.section === f.section);
    return {
      ...f,
      why: soften(f.why),
      title: g?.title ?? "",
      url: g?.url ?? "",
      context: g ? locateQuote(f.quote, g.text) : null,
    };
  });
}
