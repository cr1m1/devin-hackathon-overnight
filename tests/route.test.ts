import { describe, expect, it } from "vitest";
import { planInsertion, route, type RouteStage } from "@/lib/flow/route";
import { TEMPLATES } from "@/lib/flow/templates";
import type { StageRole, Verdict } from "@/lib/db/schema";

const T = TEMPLATES.build;
const mk = (
  id: string,
  seq: number,
  role: StageRole,
  status: RouteStage["status"],
  after: string | null,
  verdict: Verdict | null = null,
  extra: Partial<RouteStage> = {},
): RouteStage => ({
  id,
  seq,
  role,
  status,
  afterStageId: after,
  verdict,
  summary: null,
  error: null,
  ...extra,
});

const chain = () => [
  mk("p", 10, "plan", "done", null, "ok"),
  mk("i", 20, "implement", "pending", "p"),
  mk("r", 30, "review", "pending", "i"),
  mk("v", 40, "validate", "pending", "r"),
];
const base = { template: T, stagesCreated: 4, maxStagesPerRun: 16, hasPullRequest: false };

describe("route — every (role, verdict) pair", () => {
  it("ok with a successor proceeds", () => {
    const s = chain();
    expect(route({ ...base, stages: s, finished: s[0] })).toEqual({ kind: "proceed" });
  });

  it("review → needs-work inserts amend, review", () => {
    const s = chain();
    s[1] = { ...s[1], status: "done", verdict: "ok" };
    s[2] = { ...s[2], status: "done", verdict: "needs-work", summary: "Missing null check." };
    expect(route({ ...base, stages: s, finished: s[2] })).toEqual({ kind: "insert", roles: ["amend", "review"], reason: "review → needs-work" });
  });

  it("validate → needs-work inserts amend, review, validate (declared edge)", () => {
    const s = chain();
    const v = { ...s[3], status: "done" as const, verdict: "needs-work" as const };
    expect(route({ ...base, stages: [...s.slice(0, 3), v], finished: v })).toMatchObject({ kind: "insert", roles: ["amend", "review", "validate"] });
  });

  it("needs-work from a role without an edge blocks with a reason naming the role", () => {
    const s = chain();
    const p = { ...s[0], verdict: "needs-work" as const, summary: "Goal is ambiguous." };
    const d = route({ ...base, stages: s, finished: p });
    expect(d).toMatchObject({ kind: "terminal", status: "blocked" });
    expect((d as { reason: string }).reason).toBe("plan found problems that no stage is declared to fix: Goal is ambiguous.");
  });

  it("blocked anywhere terminates blocked with the stage summary", () => {
    const s = chain();
    const i = { ...s[1], status: "done" as const, verdict: "blocked" as const, summary: "Need repo write access." };
    expect(route({ ...base, stages: s, finished: i })).toEqual({ kind: "terminal", status: "blocked", reason: "Need repo write access." });
  });

  it("complete from the acceptance stage completes; from another stage it is read as ok", () => {
    const s = chain();
    const v = { ...s[3], status: "done" as const, verdict: "complete" as const };
    expect(route({ ...base, stages: s, finished: v })).toMatchObject({ kind: "terminal", status: "complete" });
    const i = { ...s[1], status: "done" as const, verdict: "complete" as const };
    expect(route({ ...base, stages: s, finished: i })).toEqual({ kind: "proceed" });
  });

  it("acceptance stage returning ok is not a completion", () => {
    const s = chain();
    const v = { ...s[3], status: "done" as const, verdict: "ok" as const };
    expect(route({ ...base, stages: [...s.slice(0, 3), v], finished: v })).toMatchObject({ kind: "terminal", status: "blocked" });
  });

  it("a failed stage terminates partial iff a PR exists", () => {
    const s = chain();
    const i = { ...s[1], status: "failed" as const, error: "deadline" };
    expect(route({ ...base, stages: s, finished: i })).toEqual({ kind: "terminal", status: "failed", reason: "deadline" });
    expect(route({ ...base, hasPullRequest: true, stages: s, finished: i })).toMatchObject({ status: "partial" });
  });

  it("edge fires again on the second review instance, bounded by the stage budget", () => {
    const s = chain();
    const r2 = mk("r2", 36, "review", "done", "a1", "needs-work");
    expect(route({ ...base, stagesCreated: 6, stages: [...s, mk("a1", 33, "amend", "done", "r", "ok"), r2], finished: r2 })).toMatchObject({ kind: "insert" });
    expect(route({ ...base, stagesCreated: 15, stages: [...s, r2], finished: r2 })).toEqual({
      kind: "terminal",
      status: "blocked",
      reason: "stage budget exhausted — the flow is looping",
    });
  });
});

describe("planInsertion", () => {
  it("uses midpoints when there is room", () => {
    const s = [
      { id: "r", seq: 30 },
      { id: "v", seq: 40 },
    ];
    expect(planInsertion(s, s[0], 2)).toEqual({ seqs: [33, 37], renumber: [] });
    expect(planInsertion(s, s[0], 1)).toEqual({ seqs: [35], renumber: [] });
  });
  it("renumbers the tail when there is no room", () => {
    const s = [
      { id: "r", seq: 30 },
      { id: "x", seq: 31 },
      { id: "v", seq: 40 },
    ];
    expect(planInsertion(s, s[0], 2)).toEqual({
      seqs: [40, 50],
      renumber: [
        { id: "x", seq: 51 },
        { id: "v", seq: 60 },
      ],
    });
  });
  it("appends with the step after the last row", () => {
    expect(planInsertion([{ id: "v", seq: 40 }], { id: "v", seq: 40 }, 3)).toEqual({ seqs: [50, 60, 70], renumber: [] });
  });
});

describe("route — successor already admitted", () => {
  it("ok proceeds when the successor is already running (verdict acted on late)", () => {
    const s = chain();
    s[1] = { ...s[1], status: "running" };
    expect(route({ ...base, stages: s, finished: s[0] })).toEqual({ kind: "proceed" });
  });
});
