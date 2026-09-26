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
