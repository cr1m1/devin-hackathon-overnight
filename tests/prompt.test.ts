import { describe, expect, it } from "vitest";
import { buildPrompt, type PromptContext } from "@/lib/flow/prompt";
import { TEMPLATES } from "@/lib/flow/templates";

const base: PromptContext = {
  run: {
    goal: "Fix the date-range filter that drops the last day.",
    repo: "cr1m1/lalafo-stats",
    deadlineAt: new Date("2026-09-20T09:00:00.000Z"),
    acceptanceCriteria: null,
    pullRequests: [],
  },
  stage: { role: "plan" },
  template: TEMPLATES.build,
  priorStages: [],
};

describe("buildPrompt", () => {
  it("is deterministic for the same input", () => {
    expect(buildPrompt(base)).toBe(buildPrompt(base));
    expect(buildPrompt(base)).not.toMatch(/\d{4}-\d{2}-\d{2}T(?!09:00:00Z)/); // only the deadline carries a timestamp
  });

  it("matches the §8.1 skeleton for plan", () => {
    expect(buildPrompt(base)).toMatchSnapshot();
  });

  it("plan asks for acceptance criteria and split; others do not", () => {
    expect(buildPrompt(base)).toContain("acceptance_criteria:");
    expect(buildPrompt({ ...base, stage: { role: "implement" } })).not.toContain("acceptance_criteria:");
  });

  it("only the acceptance role may return complete", () => {
    expect(buildPrompt({ ...base, stage: { role: "validate" } })).toContain('"complete" is allowed only if');
    expect(buildPrompt({ ...base, stage: { role: "review" } })).toContain('"complete" is NOT allowed');
  });

  it("includes criteria, previous reports (last 3, truncated), PRs and the handoff", () => {
    const prior = (seq: number, role: "plan" | "implement" | "review" | "amend", report: string, handoff?: string) => ({
      seq,
      role,
      status: "done" as const,
      verdict: "ok" as const,
      reportMd: report,
      handoff: handoff ?? null,
    });
    const p = buildPrompt({
      ...base,
      stage: { role: "validate" },
      run: { ...base.run, acceptanceCriteria: ["last day included", "tests pass"], pullRequests: [{ url: "https://github.com/cr1m1/lalafo-stats/pull/7", state: "open" }] },
      priorStages: [prior(10, "plan", "PLAN"), prior(20, "implement", "IMPL"), prior(30, "review", "x".repeat(7000)), prior(35, "amend", "AMEND", "Check the timezone edge case.")],
    });
    expect(p).toContain("- last day included");
    expect(p).not.toContain("PLAN"); // oldest of four dropped
    expect(p).toContain("IMPL");
    expect(p).toContain("…(truncated)");
    expect(p).toContain("pull/7 (open)");
    expect(p).toContain("## Handoff from the previous stage\nCheck the timezone edge case.");
    expect(p).toContain("PASS or FAIL");
  });

  it("states the repository as the only allowed one", () => {
    expect(buildPrompt(base)).toContain("cr1m1/lalafo-stats — work only in this repository");
  });
});
