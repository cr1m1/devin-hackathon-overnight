import { describe, expect, it } from "vitest";
import { admit, nextAdmissible, outcomeWithoutAcceptance, type Limits } from "@/lib/tick/admission";
import type { Stage } from "@/lib/db/schema";

const limits: Limits = { maxStagesPerRun: 16, repoAllowlist: ["cr1m1/*"], repoDenylist: ["Namadgi/*"] };
const now = new Date("2026-09-19T22:00:00Z");
const run = (over: Partial<Parameters<typeof admit>[0]> = {}) => ({
  status: "running" as const,
  repo: "cr1m1/lalafo-stats",
  deadlineAt: new Date("2026-09-20T09:00:00Z"),
  acuSpent: 0,
  acuBudget: 80,
  stagesCreated: 4,
  pullRequests: [],
  ...over,
});

describe("admit", () => {
  it("admits a normal stage", () => {
    expect(admit(run(), "plan", now, limits)).toEqual({ kind: "admit" });
  });

  it("deadline gate uses the projected end: 90 min estimate with 89 min left is refused", () => {
    const r = run({ deadlineAt: new Date(now.getTime() + 89 * 60_000) });
    const d = admit(r, "implement", now, limits);
    expect(d).toMatchObject({ kind: "terminate", status: "failed" });
    expect((d as { reason: string }).reason).toBe("deadline: implement needs ~90 min, only 89 min remain");
    expect(admit(run({ deadlineAt: new Date(now.getTime() + 90 * 60_000) }), "implement", now, limits)).toEqual({ kind: "admit" });
  });

  it("outcome is partial only when a pull request exists", () => {
    const late = new Date(now.getTime() + 5 * 60_000);
    expect(admit(run({ deadlineAt: late }), "validate", now, limits)).toMatchObject({ status: "failed" });
    expect(admit(run({ deadlineAt: late, pullRequests: [{ url: "https://github.com/cr1m1/x/pull/1" }] }), "validate", now, limits)).toMatchObject({ status: "partial" });
    expect(outcomeWithoutAcceptance({ pullRequests: [] })).toBe("failed");
  });

  it("budget gate", () => {
    expect(admit(run({ acuSpent: 60 }), "implement", now, limits)).toMatchObject({ kind: "terminate", reason: "run ACU budget exhausted" });
    expect(admit(run({ acuSpent: 55 }), "implement", now, limits)).toEqual({ kind: "admit" });
  });

  it("stage-count gate blocks loudly", () => {
    expect(admit(run({ stagesCreated: 17 }), "review", now, limits)).toMatchObject({ kind: "terminate", status: "blocked" });
  });

  it("cancelled and terminal runs are skipped, not terminated again", () => {
    expect(admit(run({ status: "cancelled" }), "plan", now, limits)).toMatchObject({ kind: "skip" });
    expect(admit(run({ status: "complete" }), "plan", now, limits)).toMatchObject({ kind: "skip" });
  });

  it("refuses a run whose repo slipped past the allowlist", () => {
    expect(admit(run({ repo: "Namadgi/x" }), "plan", now, limits)).toMatchObject({ kind: "terminate", status: "failed" });
  });
});

const stage = (id: string, seq: number, status: Stage["status"], after: string | null): Stage => ({ id, seq, status, afterStageId: after, role: "plan" }) as unknown as Stage;

describe("nextAdmissible", () => {
  it("picks the first pending stage whose predecessor is done", () => {
    const s = [stage("a", 10, "done", null), stage("b", 20, "pending", "a"), stage("c", 30, "pending", "b")];
    expect(nextAdmissible(s)?.id).toBe("b");
  });
  it("returns nothing while a stage is active or the gate is not satisfied", () => {
    expect(nextAdmissible([stage("a", 10, "running", null), stage("b", 20, "pending", "a")])).toBeUndefined();
    expect(nextAdmissible([stage("a", 10, "failed", null), stage("b", 20, "pending", "a")])).toBeUndefined();
  });
  it("respects re-gating after an insertion (b now waits on the inserted x)", () => {
    const s = [stage("a", 10, "done", null), stage("x", 15, "pending", "a"), stage("b", 20, "pending", "x")];
    expect(nextAdmissible(s)?.id).toBe("x");
  });
});
