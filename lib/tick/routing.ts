import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { runs, stages, type NewStage, type Run, type Stage } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { ROLES } from "@/lib/flow/roles";
import { planInsertion, route } from "@/lib/flow/route";
import { getTemplate } from "@/lib/flow/templates";
import { newStageId } from "@/lib/ids";
import { terminateRun } from "./terminate";
import type { TickContext } from "./tick";

// Plan §11.3 / ADR-0001. Routing reads DB state only: every done|failed Stage in a live Run whose
// verdict has not been acted on. Each is acted on exactly once (verdict_seen_at).

export async function routePhase({ db, now, result, deadline }: TickContext): Promise<void> {
  const pending = await db
    .select({ stage: stages, run: runs })
    .from(stages)
    .innerJoin(runs, eq(runs.id, stages.runId))
    .where(and(inArray(stages.status, ["done", "failed"]), isNull(stages.verdictSeenAt), inArray(runs.status, ["queued", "running"])))
    .orderBy(asc(stages.runId), asc(stages.seq))
    .limit(50);

  for (const { stage, run } of pending) {
    if (Date.now() > deadline) break;
    try {
      await routeStage(db, run, stage, now);
      result.routed++;
    } catch (e) {
      result.errors.push(`route ${stage.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

export async function routeStage(db: Db, run: Run, finished: Stage, now: Date): Promise<void> {
  const all = await db.select().from(stages).where(eq(stages.runId, run.id)).orderBy(asc(stages.seq));
  const [freshRun] = await db.select().from(runs).where(eq(runs.id, run.id));
  const decision = route({
    template: getTemplate(freshRun.templateId),
    stages: all,
    finished,
    stagesCreated: freshRun.stagesCreated,
    maxStagesPerRun: env.maxStagesPerRun,
    hasPullRequest: freshRun.pullRequests.length > 0,
  });

  const seen = db.update(stages).set({ verdictSeenAt: now, updatedAt: now }).where(eq(stages.id, finished.id));

  switch (decision.kind) {
    case "proceed":
      await seen;
      return;

    case "terminal":
      await seen;
      await terminateRun(db, freshRun, decision.status, decision.reason, now);
      return;

    case "insert": {
      const successor = all.find((s) => s.afterStageId === finished.id && s.status === "pending");
      const { seqs, renumber } = planInsertion(all, finished, decision.roles.length);
      let prev = finished.id;
      const rows: NewStage[] = decision.roles.map((role, i) => {
        const id = newStageId();
        const row: NewStage = {
          id,
          runId: run.id,
          seq: seqs[i],
          role,
          origin: "edge",
          afterStageId: prev,
          status: "pending",
          acuLimit: ROLES[role].acuLimit,
          createdAt: now,
          updatedAt: now,
        };
        prev = id;
        return row;
      });
      const ops = [
        ...renumber.map((r) => db.update(stages).set({ seq: r.seq, updatedAt: now }).where(eq(stages.id, r.id))),
        db.insert(stages).values(rows),
        ...(successor ? [db.update(stages).set({ afterStageId: prev, updatedAt: now }).where(eq(stages.id, successor.id))] : []),
        db
          .update(runs)
          .set({ stagesCreated: freshRun.stagesCreated + rows.length, updatedAt: now })
          .where(eq(runs.id, run.id)),
        seen,
      ] as const;
      // drizzle's batch type wants a non-empty tuple; we always have at least insert + run update + seen.
      await db.batch(ops as unknown as Parameters<typeof db.batch>[0]);
      return;
    }
  }
}
