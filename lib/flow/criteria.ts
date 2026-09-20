// Plan §13.2: the validate role reports one line per acceptance criterion, "PASS" or "FAIL"
// followed by evidence. Both the run page checklist and buildSummary read that with this parser.

export type CriterionResult = "pass" | "fail" | "unknown";

const VERDICT_LINE = /^\s*(?:[-*]\s*)?(?:\[[ xX]\]\s*)?(?:\*\*)?(?:(\d+)[.):]\s*(?:\*\*)?\s*)?(PASS|FAIL)\b/i;

/** Ordered PASS/FAIL verdicts found in a validate report, with an explicit criterion number when the line carries one. */
export function parseVerdictLines(reportMd: string): { index: number | null; result: "pass" | "fail" }[] {
  const out: { index: number | null; result: "pass" | "fail" }[] = [];
  for (const line of reportMd.split(/\r?\n/)) {
    const m = VERDICT_LINE.exec(line);
    if (!m) continue;
    out.push({ index: m[1] ? Number(m[1]) - 1 : null, result: m[2].toUpperCase() === "PASS" ? "pass" : "fail" });
  }
  return out;
}

/**
 * One result per criterion. Numbered lines ("2. FAIL …") map to that criterion; unnumbered lines are
 * assigned in order to the criteria not yet covered. Criteria with no line stay "unknown".
 */
export function criteriaResults(criteria: readonly string[], reportMd: string | null | undefined): CriterionResult[] {
  const results: CriterionResult[] = criteria.map(() => "unknown");
  if (!reportMd) return results;
  const lines = parseVerdictLines(reportMd);
  for (const l of lines) if (l.index !== null && l.index >= 0 && l.index < results.length && results[l.index] === "unknown") results[l.index] = l.result;
  let cursor = 0;
  for (const l of lines) {
    if (l.index !== null && l.index >= 0 && l.index < results.length) continue;
    while (cursor < results.length && results[cursor] !== "unknown") cursor++;
    if (cursor >= results.length) break;
    results[cursor++] = l.result;
  }
  return results;
}

export const passedCount = (results: readonly CriterionResult[]): number => results.filter((r) => r === "pass").length;
