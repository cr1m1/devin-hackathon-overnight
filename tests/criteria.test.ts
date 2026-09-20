import { describe, expect, it } from "vitest";
import { criteriaResults, parseVerdictLines, passedCount } from "@/lib/flow/criteria";
import { buildSummary } from "@/lib/tick/terminate";
import type { Run, Stage } from "@/lib/db/schema";

const CRITERIA = ["API returns 200", "Settings shows the list", "README updated"];

const REPORT = `# Validation
1. PASS — curl returned 200 with the expected body.
2. FAIL — the list is empty until a reload.
3. PASS — README section present.
Overall: two of three pass; the phrase "should PASS" in prose must not count.`;

describe("parseVerdictLines", () => {
  it("reads numbered PASS/FAIL lines and ignores prose", () => {
    expect(parseVerdictLines(REPORT)).toEqual([
      { index: 0, result: "pass" },
      { index: 1, result: "fail" },
      { index: 2, result: "pass" },
    ]);
  });
  it("accepts bullets, checkboxes and bold markers", () => {
    expect(parseVerdictLines("- [x] **PASS** ok\n* FAIL nope\n- **2. FAIL** again")).toEqual([
      { index: null, result: "pass" },
      { index: null, result: "fail" },
      { index: 1, result: "fail" },
    ]);
  });
  it("accepts a trailing verdict after the criterion text", () => {
    expect(parseVerdictLines("1. **Endpoint returns 200** — PASS\n2. Settings list refreshes: FAIL.\n- README updated - **PASS**")).toEqual([
      { index: 0, result: "pass" },
      { index: 1, result: "fail" },
      { index: null, result: "pass" },
    ]);
  });
  it("is case-sensitive so prose starting with 'Pass' or ending in 'fail' is not a verdict", () => {
    expect(parseVerdictLines("Pass the flag to the CLI.\nFail fast on errors.\nThis will otherwise fail\nwe expect it to pass.")).toEqual([]);
  });
  it("requires a list line and separator for trailing verdicts", () => {
    expect(parseVerdictLines("All unit tests PASS\n**Verdict:** FAIL\nThe endpoint did not FAIL\nOverall: FAIL")).toEqual([]);
  });
});

describe("criteriaResults", () => {
  it("maps numbered lines to their criterion", () => {
    expect(criteriaResults(CRITERIA, REPORT)).toEqual(["pass", "fail", "pass"]);
  });
  it("assigns unnumbered lines in order and leaves the rest unknown", () => {
    expect(criteriaResults(CRITERIA, "PASS a\nFAIL b")).toEqual(["pass", "fail", "unknown"]);
  });
  it("mixes numbered and unnumbered lines without double-counting", () => {
    expect(criteriaResults(CRITERIA, "2. FAIL b\nPASS a\nPASS c\nPASS extra")).toEqual(["pass", "fail", "pass"]);
  });
  it("does not spill out-of-range numbered lines into unnumbered criteria", () => {
    expect(criteriaResults(["a", "b"], "Overall: FAIL\n1. PASS")).toEqual(["pass", "unknown"]);
    expect(criteriaResults(["a", "b", "c"], "7. FAIL\n1. PASS")).toEqual(["pass", "unknown", "unknown"]);
  });
  it("is all unknown without a report", () => {
    expect(criteriaResults(CRITERIA, null)).toEqual(["unknown", "unknown", "unknown"]);
    expect(passedCount(criteriaResults(CRITERIA, undefined))).toBe(0);
  });
});

describe("buildSummary uses the same parser", () => {
  const now = new Date("2026-09-20T06:00:00Z");
  const run = {
    goal: "Ship it",
    status: "complete",
    outcomeReason: "all criteria pass",
    pullRequests: [],
    acceptanceCriteria: CRITERIA,
    createdAt: now,
    acuSpent: 3,
  } as unknown as Run;
  const validate = { role: "validate", status: "done", verdict: "needs-work", seq: 3, reportMd: REPORT, pullRequests: [] } as unknown as Stage;

  it("reports n passed / m from the validate report", () => {
    expect(buildSummary(run, [validate], now)).toContain("**Acceptance criteria:** 2 passed / 3");
    expect(passedCount(criteriaResults(CRITERIA, REPORT))).toBe(2);
  });
  it("does not over-count stray PASS words", () => {
    const noisy = { ...validate, reportMd: "PASS PASS PASS PASS\nPASS" } as Stage;
    expect(buildSummary(run, [noisy], now)).toContain("**Acceptance criteria:** 2 passed / 3");
  });
});
