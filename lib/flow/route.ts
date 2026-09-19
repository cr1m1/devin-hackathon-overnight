import type { Stage, StageRole } from "@/lib/db/schema";
import type { TerminalStatus } from "@/lib/tick/admission";
import { edgeFor, type FlowTemplate } from "./templates";

// Plan §7.4 / ADR-0001. Pure, synchronous, no I/O. Decides what a finished Stage means for the Run.
// The Tick applies `insert` as a batch (rows + re-gate + stages_created) and stamps verdict_seen_at.

export type RouteDecision = { kind: "insert"; roles: StageRole[]; reason: string } | { kind: "proceed" } | { kind: "terminal"; status: TerminalStatus; reason: string };

export type RouteStage = Pick<Stage, "id" | "seq" | "role" | "status" | "verdict" | "summary" | "error" | "afterStageId">;

export type RouteInput = {
  template: FlowTemplate;
  stages: RouteStage[]; // all Stage rows of the Run, any order
  finished: RouteStage; // the Stage whose verdict we are acting on (status done or failed)
  stagesCreated: number;
  maxStagesPerRun: number;
  hasPullRequest: boolean;
};

export function route({ template, stages, finished, stagesCreated, maxStagesPerRun, hasPullRequest }: RouteInput): RouteDecision {
  const withoutAcceptance: TerminalStatus = hasPullRequest ? "partial" : "failed";

  if (finished.status === "failed") {
    return { kind: "terminal", status: withoutAcceptance, reason: finished.error ?? `${finished.role} failed` };
  }

  const isAcceptance = finished.role === template.acceptance;
  // Any successor row (pending, or already admitted by an earlier tick) means the chain continues.
  const successor = stages.find((s) => s.afterStageId === finished.id && s.status !== "skipped");
  const verdict = finished.verdict === "complete" && !isAcceptance ? "ok" : finished.verdict;

  switch (verdict) {
    case "complete":
      return { kind: "terminal", status: "complete", reason: "all acceptance criteria passed" };

    case "blocked":
      return { kind: "terminal", status: "blocked", reason: finished.summary?.trim() || `${finished.role} reported blocked` };

    case "needs-work": {
      const edge = edgeFor(template, finished.role);
      if (!edge) {
        return { kind: "terminal", status: "blocked", reason: `${finished.role} found problems that no stage is declared to fix: ${finished.summary?.trim() ?? ""}`.trim() };
      }
      if (stagesCreated + edge.append.length > maxStagesPerRun) {
        return { kind: "terminal", status: "blocked", reason: "stage budget exhausted — the flow is looping" };
      }
      return { kind: "insert", roles: [...edge.append], reason: `${finished.role} → needs-work` };
    }

    case "ok":
      if (successor) return { kind: "proceed" };
      // ok from the last row without a successor: the chain ended without the acceptance stage deciding.
      return isAcceptance
        ? { kind: "terminal", status: "blocked", reason: `${finished.role} returned ok instead of complete or needs-work` }
        : { kind: "terminal", status: withoutAcceptance, reason: `chain ended after ${finished.role}` };

    default:
      return { kind: "terminal", status: "blocked", reason: `${finished.role} finished without a verdict` };
  }
}

/**
 * Sequence numbers for `count` rows inserted after `after`, before its successor (§7.4 step 1).
 * Returns the new seqs plus any successor renumbering needed when there is no room.
 */
export function planInsertion(
  stages: Pick<Stage, "id" | "seq">[],
  after: Pick<Stage, "id" | "seq">,
  count: number,
  step = 10,
): { seqs: number[]; renumber: { id: string; seq: number }[] } {
  const sorted = [...stages].sort((a, b) => a.seq - b.seq);
  const idx = sorted.findIndex((s) => s.id === after.id);
  const tail = sorted.slice(idx + 1);
  const next = tail[0];
  const room = next ? next.seq - after.seq - 1 : Infinity;

  if (room >= count) {
    const gap = next ? (next.seq - after.seq) / (count + 1) : step;
    return { seqs: Array.from({ length: count }, (_, i) => Math.round(after.seq + gap * (i + 1))), renumber: [] };
  }
  const shift = count * step;
  return {
    seqs: Array.from({ length: count }, (_, i) => after.seq + step * (i + 1)),
    renumber: tail.map((s) => ({ id: s.id, seq: s.seq + shift })),
  };
}
