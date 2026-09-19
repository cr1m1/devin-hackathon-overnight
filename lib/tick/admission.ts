import type { Run, RunStatus, Stage, StageRole } from "@/lib/db/schema";
import { ROLES } from "@/lib/flow/roles";
import { isRepoAllowed } from "@/lib/repos";
import { addMinutes, minutesBetween } from "@/lib/time";

// Plan §12. Pure functions over (run, stages, role, now, limits). No I/O.

export type Limits = {
  maxStagesPerRun: number;
  repoAllowlist: readonly string[];
  repoDenylist: readonly string[];
};

export type TerminalStatus = Exclude<RunStatus, "queued" | "running">;
export type AdmissionDecision = { kind: "admit" } | { kind: "terminate"; status: TerminalStatus; reason: string } | { kind: "skip"; reason: string };

/** §12.6: partial iff a pull request exists. */
export function outcomeWithoutAcceptance(run: Pick<Run, "pullRequests">): "partial" | "failed" {
  return run.pullRequests.length > 0 ? "partial" : "failed";
}

export function admit(
  run: Pick<Run, "status" | "repo" | "deadlineAt" | "acuSpent" | "acuBudget" | "stagesCreated" | "pullRequests">,
  role: StageRole,
  now: Date,
  limits: Limits,
): AdmissionDecision {
  // §12.4 cancellation — never admit, never terminate again
  if (run.status === "cancelled") return { kind: "skip", reason: "cancelled" };
  if (!["queued", "running"].includes(run.status)) return { kind: "skip", reason: `run is ${run.status}` };

  // §12.0 repository gate (defensive; creation already refused it)
  if (!isRepoAllowed(run.repo, limits.repoAllowlist, limits.repoDenylist)) {
    return { kind: "terminate", status: "failed", reason: `repository not allowed: ${run.repo}` };
  }

  const def = ROLES[role];

  // §12.1 deadline gate — projected end, never `now`
  const projectedEnd = addMinutes(now, def.estimateMinutes);
  if (projectedEnd > run.deadlineAt) {
    const remain = Math.max(0, minutesBetween(now, run.deadlineAt));
    return { kind: "terminate", status: outcomeWithoutAcceptance(run), reason: `deadline: ${role} needs ~${def.estimateMinutes} min, only ${remain} min remain` };
  }

  // §12.2 budget gate
  if (Number(run.acuSpent) + def.acuLimit > Number(run.acuBudget)) {
    return { kind: "terminate", status: outcomeWithoutAcceptance(run), reason: "run ACU budget exhausted" };
  }

  // §12.3 stage-count gate
  if (run.stagesCreated > limits.maxStagesPerRun) {
    return { kind: "terminate", status: "blocked", reason: "stage budget exhausted — the flow is looping" };
  }

  return { kind: "admit" };
}

/** The pending Stage that may start now: lowest seq whose gate is satisfied (§11.4). */
export function nextAdmissible(stages: Stage[]): Stage | undefined {
  const byId = new Map(stages.map((s) => [s.id, s]));
  if (stages.some((s) => s.status === "starting" || s.status === "running")) return undefined;
  return stages
    .filter((s) => s.status === "pending")
    .sort((a, b) => a.seq - b.seq)
    .find((s) => !s.afterStageId || byId.get(s.afterStageId)?.status === "done");
}
