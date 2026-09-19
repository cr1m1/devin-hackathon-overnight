import type { PullRequestRef, Stage, Verdict } from "@/lib/db/schema";
import type { SessionResponse } from "@/lib/devin/types";
import { SUSPENDED_CREDIT_DETAILS } from "@/lib/devin/types";
import { parseStageOutput, type StageOutput } from "@/lib/flow/schema";

// Plan §9.3 / §9.4 / ADR-0003 as a pure mapping from (stage, session, now) to an action.
// Completion is defined by parseable output, never by session state.

export type PollAction =
  | { kind: "complete"; output: StageOutput; verdict: Verdict; downgraded: boolean; pullRequests: PullRequestRef[] }
  | { kind: "working" }
  | { kind: "nudge"; reason: string }
  | { kind: "give-up"; verdict: "blocked"; summary: string } // idle without output after the nudge
  | { kind: "malformed"; attempts: number } // output present but unparseable; retry once
  | { kind: "failed"; error: string; fatalForRun: boolean };

export type PollInput = {
  stage: Pick<Stage, "nudgedAt" | "parseAttempts" | "role" | "pullRequests">;
  session: SessionResponse;
  acceptanceRole: string;
  now: Date;
  /** How long after a nudge we wait before giving up (2 ticks ≈ 2 min). */
  nudgeWaitMs?: number;
};

const IDLE_DETAILS = new Set(["waiting_for_user", "waiting_for_approval", "finished"]);

export function decidePoll({ stage, session, acceptanceRole, now, nudgeWaitMs = 2 * 60_000 }: PollInput): PollAction {
  const output = parseStageOutput(session.structured_output);
  if (output) {
    const downgraded = output.verdict === "complete" && stage.role !== acceptanceRole;
    return {
      kind: "complete",
      output,
      verdict: downgraded ? "ok" : output.verdict,
      downgraded,
      pullRequests: mergePullRequests(stage.pullRequests, output.pull_requests ?? [], session.pull_requests),
    };
  }

  const { status, status_detail: detail } = session;

  if (status === "suspended") {
    if ((SUSPENDED_CREDIT_DETAILS as readonly string[]).includes(detail ?? "")) {
      return { kind: "failed", error: detail ?? "suspended", fatalForRun: true };
    }
    return { kind: "failed", error: `session ended: ${detail ?? "suspended"}`, fatalForRun: false };
  }
  if (status === "exit" || status === "error") {
    if (session.structured_output) return { kind: "malformed", attempts: stage.parseAttempts + 1 };
    return { kind: "failed", error: `session ended: ${status}${detail ? ` (${detail})` : ""}`, fatalForRun: false };
  }

  if (status === "running" && detail && IDLE_DETAILS.has(detail)) {
    if (session.structured_output) return { kind: "malformed", attempts: stage.parseAttempts + 1 };
    if (!stage.nudgedAt) return { kind: "nudge", reason: detail };
    if (now.getTime() - stage.nudgedAt.getTime() >= nudgeWaitMs) {
      return { kind: "give-up", verdict: "blocked", summary: `Session stopped without a result (${detail}).` };
    }
    return { kind: "working" };
  }

  return { kind: "working" }; // new, claimed, running/working, resuming
}

export function mergePullRequests(existing: PullRequestRef[], fromOutput: { url: string; title?: string }[], fromSession: SessionResponse["pull_requests"]): PullRequestRef[] {
  const map = new Map<string, PullRequestRef>();
  for (const p of existing) map.set(norm(p.url), { ...p });
  for (const p of fromOutput) map.set(norm(p.url), { ...map.get(norm(p.url)), url: p.url, title: p.title ?? map.get(norm(p.url))?.title ?? null });
  for (const p of fromSession ?? []) map.set(norm(p.pr_url), { ...map.get(norm(p.pr_url)), url: p.pr_url, state: p.pr_state ?? null });
  return [...map.values()];
}

const norm = (u: string) => u.trim().replace(/\/+$/, "").toLowerCase();

export const NUDGE_IDLE = 'If you are waiting on input you cannot get, finish now and return your structured output with verdict "blocked" and what you need.';
export const NUDGE_DEADLINE = (deadlineIso: string) =>
  `The run's deadline is ${deadlineIso}. Wrap up now: commit what is safe, update the pull request, and return your structured output with what remains.`;
