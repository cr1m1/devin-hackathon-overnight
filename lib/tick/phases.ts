import { and, asc, eq, inArray, isNull, lt } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { runs, stages, type Run, type Stage } from "@/lib/db/schema";
import { clientFor, connectionById } from "@/lib/connections";
import { DevinApiError, type DevinClient } from "@/lib/devin/client";
import { env } from "@/lib/env";
import type { Connection } from "@/lib/db/schema";
import { buildPrompt, sessionTags, sessionTitle } from "@/lib/flow/prompt";
import { playbookIdFor, ROLES } from "@/lib/flow/roles";
import { STRUCTURED_OUTPUT_SCHEMA } from "@/lib/flow/schema";
import { getTemplate } from "@/lib/flow/templates";
import { admit, nextAdmissible, outcomeWithoutAcceptance, type Limits } from "./admission";
import { decidePoll, mergePullRequests, NUDGE_DEADLINE, NUDGE_IDLE } from "./poll";
import { decideRateLimited, RATE_LIMITED_REASON, streakResetForSkip } from "./rate-limited";
import { terminateRun } from "./terminate";
import type { TickContext } from "./tick";
import { addMinutes, isoUtc } from "@/lib/time";

// Plan §11.1, §11.2, §11.4 and §12.5. Phase 3 (routing) lives in routing.ts.

const ORPHAN_AFTER_MS = 90_000;

/** Credentials come from the run's Connection (bring-your-own Devin). A run without one cannot proceed. */
async function clientForRun(db: Db, run: Run, now: Date): Promise<{ client: DevinClient; connection: Connection } | null> {
  const connection = await connectionById(run.connectionId);
  if (!connection) {
    if (run.status === "queued" || run.status === "running") await terminateRun(db, run, "failed", "Devin connection removed", now);
    return null;
  }
  return { client: clientFor(connection), connection };
}
const OVERRUN_NUDGE = 3;
const OVERRUN_FAIL = 4;

// ---------------------------------------------------------------------------------------------
// Phase 1 — poll active Stages
// ---------------------------------------------------------------------------------------------
export async function pollPhase({ db, now, result, deadline }: TickContext): Promise<void> {
  const active = await db
    .select()
    .from(stages)
    .where(inArray(stages.status, ["starting", "running"]))
    .orderBy(asc(stages.updatedAt))
    .limit(env.tickMaxPolls);

  for (const stage of active) {
    if (Date.now() > deadline) break;
    const [run] = await db.select().from(runs).where(eq(runs.id, stage.runId));
    if (!run) continue;
    try {
      const resolved = await clientForRun(db, run, now);
      if (!resolved) continue;
      if (!stage.sessionId) {
        await reconcileStage(db, resolved.client, stage, now);
      } else {
        await pollStage(db, resolved.client, run, stage, now);
      }
      result.polled++;
    } catch (e) {
      result.errors.push(`poll ${stage.id}: ${msg(e)}`);
    }
  }
}

async function pollStage(db: Db, devin: DevinClient, run: Run, stage: Stage, now: Date): Promise<void> {
  const session = await devin.getSession(stage.sessionId!);
  const template = getTemplate(run.templateId);
  const action = decidePoll({ stage, session, acceptanceRole: template.acceptance, now });
  const acus = Number.isFinite(session.acus_consumed) ? session.acus_consumed : null;

  switch (action.kind) {
    case "complete": {
      const out = action.output;
      const prevAcus = Number(stage.acusConsumed ?? 0);
      const runPrs = mergePullRequests(run.pullRequests, [], []);
      for (const p of action.pullRequests) if (!runPrs.some((q) => q.url.toLowerCase() === p.url.toLowerCase())) runPrs.push({ ...p, stage_id: stage.id });
      const runPatch: Partial<typeof runs.$inferInsert> = {
        pullRequests: runPrs,
        acuSpent: Number(run.acuSpent) - prevAcus + (acus ?? prevAcus),
        updatedAt: now,
      };
      if (stage.role === "plan" && out.acceptance_criteria?.length) runPatch.acceptanceCriteria = out.acceptance_criteria;
      await db.batch([
        db
          .update(stages)
          .set({
            status: "done",
            verdict: action.verdict,
            summary: out.summary,
            reportMd: out.report_md,
            handoff: out.handoff ?? null,
            pullRequests: action.pullRequests,
            acusConsumed: acus ?? stage.acusConsumed,
            finishedAt: now,
            pollCount: stage.pollCount + 1,
            error: action.downgraded ? "verdict complete downgraded to ok (not the acceptance stage)" : null,
            updatedAt: now,
          })
          .where(eq(stages.id, stage.id)),
        db.update(runs).set(runPatch).where(eq(runs.id, run.id)),
      ]);
      return;
    }
    case "working":
      await touch(db, stage, now, acus);
      await deadlineHandling(db, devin, run, stage, now);
      return;
    case "nudge":
      await devin.messageSession(stage.sessionId!, NUDGE_IDLE);
      await db
        .update(stages)
        .set({ nudgedAt: now, pollCount: stage.pollCount + 1, acusConsumed: acus ?? stage.acusConsumed, updatedAt: now })
        .where(eq(stages.id, stage.id));
      return;
    case "give-up":
      await finishStage(db, run, stage, now, { status: "done", verdict: "blocked", summary: action.summary, acus });
      return;
    case "malformed":
      if (action.attempts >= 2) {
        await finishStage(db, run, stage, now, { status: "done", verdict: "blocked", summary: "Stage produced no machine-readable result.", acus });
      } else {
        await db
          .update(stages)
          .set({ parseAttempts: action.attempts, pollCount: stage.pollCount + 1, updatedAt: now })
          .where(eq(stages.id, stage.id));
      }
      return;
    case "failed":
      await finishStage(db, run, stage, now, { status: "failed", error: action.error, acus });
      if (action.fatalForRun) await terminateRun(db, await fresh(db, run.id), "failed", action.error, now);
      return;
  }
}

async function touch(db: Db, stage: Stage, now: Date, acus: number | null) {
  await db
    .update(stages)
    .set({ status: "running", pollCount: stage.pollCount + 1, acusConsumed: acus ?? stage.acusConsumed, updatedAt: now })
    .where(eq(stages.id, stage.id));
}

async function finishStage(
  db: Db,
  run: Run,
  stage: Stage,
  now: Date,
  f: { status: "done" | "failed"; verdict?: "blocked"; summary?: string; error?: string; acus: number | null },
) {
  const prevAcus = Number(stage.acusConsumed ?? 0);
  await db.batch([
    db
      .update(stages)
      .set({
        status: f.status,
        verdict: f.verdict ?? null,
        summary: f.summary ?? stage.summary,
        error: f.error ?? stage.error,
        acusConsumed: f.acus ?? stage.acusConsumed,
        finishedAt: now,
        pollCount: stage.pollCount + 1,
        updatedAt: now,
      })
      .where(eq(stages.id, stage.id)),
    db
      .update(runs)
      .set({ acuSpent: Number(run.acuSpent) - prevAcus + (f.acus ?? prevAcus), updatedAt: now })
      .where(eq(runs.id, run.id)),
  ]);
}

/** §12.5 + §14 overrun: nudge before the deadline, stop after grace; nudge at 3× estimate, stop at 4×. */
async function deadlineHandling(db: Db, devin: DevinClient, run: Run, stage: Stage, now: Date): Promise<void> {
  if (!stage.sessionId) return;
  const est = ROLES[stage.role].estimateMinutes;
  const ranMin = stage.startedAt ? (now.getTime() - stage.startedAt.getTime()) / 60_000 : 0;
  const pastGrace = now >= addMinutes(run.deadlineAt, env.deadlineGraceMin);
  const overrun = ranMin >= est * OVERRUN_FAIL;

  if (pastGrace || overrun) {
    try {
      await devin.archiveSession(stage.sessionId);
    } catch {
      /* benign (§14) */
    }
    await finishStage(db, run, stage, now, { status: "failed", error: pastGrace ? "deadline" : "overrun", acus: stage.acusConsumed });
    const r = await fresh(db, run.id);
    await terminateRun(db, r, outcomeWithoutAcceptance(r), pastGrace ? `deadline: ${stage.role} did not finish within grace` : `${stage.role} ran over 4× its estimate`, now);
    return;
  }

  const nudgeDue = now >= addMinutes(run.deadlineAt, -env.deadlineNudgeMin) || ranMin >= est * OVERRUN_NUDGE;
  if (nudgeDue && !stage.nudgedAt) {
    await devin.messageSession(stage.sessionId, NUDGE_DEADLINE(isoUtc(run.deadlineAt)));
    await db.update(stages).set({ nudgedAt: now, updatedAt: now }).where(eq(stages.id, stage.id));
  }
}

// ---------------------------------------------------------------------------------------------
// Phase 2 — reconcile orphans (starting, no session_id, > 90 s)
// ---------------------------------------------------------------------------------------------
export async function reconcilePhase({ db, now, result }: TickContext): Promise<void> {
  const orphans = await db
    .select()
    .from(stages)
    .where(and(eq(stages.status, "starting"), isNull(stages.sessionId), lt(stages.updatedAt, new Date(now.getTime() - ORPHAN_AFTER_MS))));
  for (const s of orphans) {
    try {
      const [run] = await db.select().from(runs).where(eq(runs.id, s.runId));
      const resolved = run ? await clientForRun(db, run, now) : null;
      if (!resolved) continue;
      await reconcileStage(db, resolved.client, s, now);
    } catch (e) {
      result.errors.push(`reconcile ${s.id}: ${msg(e)}`);
    }
  }
}

async function reconcileStage(db: Db, devin: DevinClient, stage: Stage, now: Date): Promise<void> {
  if (now.getTime() - stage.updatedAt.getTime() < ORPHAN_AFTER_MS) return; // give the create call time
  const found = await devin.findSessionsByTag(`stage:${stage.id}`);
  if (found.length === 1) {
    await db
      .update(stages)
      .set({ sessionId: found[0].session_id, sessionUrl: found[0].url, status: "running", startedAt: stage.startedAt ?? now, error: null, updatedAt: now })
      .where(eq(stages.id, stage.id));
  } else if (found.length === 0) {
    await db.update(stages).set({ status: "pending", error: "create response lost; will retry", updatedAt: now }).where(eq(stages.id, stage.id));
  } else {
    await db
      .update(stages)
      .set({ status: "failed", error: `duplicate sessions for stage ${stage.id}`, updatedAt: now })
      .where(eq(stages.id, stage.id));
    const run = await fresh(db, stage.runId);
    await terminateRun(db, run, "failed", `duplicate sessions for stage ${stage.id}`, now);
  }
}

// ---------------------------------------------------------------------------------------------
// Phase 4 — admit pending Stages (claim in DB first, call Devin second)
// ---------------------------------------------------------------------------------------------
export async function admitPhase({ db, now, result, deadline }: TickContext): Promise<void> {
  const candidates = await db
    .select()
    .from(runs)
    .where(inArray(runs.status, ["queued", "running"]))
    .orderBy(asc(runs.createdAt))
    .limit(50);
  for (const run of candidates) {
    if (result.started >= env.tickMaxStarts || Date.now() > deadline) break;
    const resolved = await clientForRun(db, run, now);
    if (!resolved) continue;
    const { client: devin, connection } = resolved;
    const limits: Limits = { maxStagesPerRun: env.maxStagesPerRun, repoAllowlist: connection.repoAllowlist, repoDenylist: connection.repoDenylist };
    const stageRows = await db.select().from(stages).where(eq(stages.runId, run.id)).orderBy(asc(stages.seq));
    // Routing (Phase 3) must act on every finished Stage before anything new is admitted.
    if (stageRows.some((s) => (s.status === "done" || s.status === "failed") && !s.verdictSeenAt)) continue;
    const next = nextAdmissible(stageRows);
    if (!next) continue;

    const decision = admit(run, next.role, now, limits);
    if (decision.kind === "skip") {
      const reset = streakResetForSkip(next);
      if (reset) await db.update(stages).set({ ...reset, updatedAt: now }).where(eq(stages.id, next.id));
      continue;
    }
    if (decision.kind === "terminate") {
      await terminateRun(db, run, decision.status, decision.reason, now);
      continue;
    }

    // Claim first (stages_one_active makes a duplicate claim fail loudly), call second.
    const claimed = await db
      .update(stages)
      .set({ status: "starting", startedAt: now, error: null, updatedAt: now })
      .where(and(eq(stages.id, next.id), eq(stages.status, "pending")))
      .returning({ id: stages.id });
    if (claimed.length === 0) continue;
    if (run.status === "queued") await db.update(runs).set({ status: "running", updatedAt: now }).where(eq(runs.id, run.id));

    try {
      const prior = stageRows.filter((s) => s.id !== next.id && s.status === "done");
      const template = getTemplate(run.templateId);
      const session = await devin.startSession({
        prompt: buildPrompt({ run, stage: next, template, priorStages: prior }),
        title: sessionTitle(run.id, next.role),
        tags: sessionTags(run.id, next.id),
        repos: [run.repo],
        structured_output_schema: STRUCTURED_OUTPUT_SCHEMA as unknown as Record<string, unknown>,
        max_acu_limit: next.acuLimit,
        resumable: false,
        secret_ids: [],
        ...(playbookIdFor(next.role) ? { playbook_id: playbookIdFor(next.role) } : {}),
      });
      await db.update(stages).set({ sessionId: session.session_id, sessionUrl: session.url, status: "running", rateLimitedSince: null, updatedAt: now }).where(eq(stages.id, next.id));
      result.started++;
    } catch (e) {
      if (e instanceof DevinApiError) {
        if (e.isRateLimit) {
          const rl = decideRateLimited(next.rateLimitedSince, now);
          if (rl.kind === "give-up") {
            await db
              .update(stages)
              .set({ status: "failed", error: `rate limited since ${isoUtc(rl.since)}`, finishedAt: now, updatedAt: now })
              .where(eq(stages.id, next.id));
            await terminateRun(db, await fresh(db, run.id), "failed", RATE_LIMITED_REASON, now);
          } else {
            await db
              .update(stages)
              .set({ status: "pending", startedAt: null, rateLimitedSince: rl.since, error: "rate limited; will retry", updatedAt: now })
              .where(eq(stages.id, next.id));
          }
        } else {
          await db
            .update(stages)
            .set({ status: "failed", error: `create failed: ${e.detail}`, finishedAt: now, updatedAt: now })
            .where(eq(stages.id, next.id));
          await terminateRun(db, await fresh(db, run.id), "failed", `could not start ${next.role}: ${e.detail}`, now);
        }
      } else {
        // Unknown outcome: leave `starting` with no session_id; Phase 2 reconciles by tag (§11.2).
        await db
          .update(stages)
          .set({ error: `create outcome unknown: ${msg(e)}`, updatedAt: now })
          .where(eq(stages.id, next.id));
      }
      result.errors.push(`admit ${next.id}: ${msg(e)}`);
    }
  }
}

async function fresh(db: Db, runId: string): Promise<Run> {
  const [r] = await db.select().from(runs).where(eq(runs.id, runId));
  return r;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
