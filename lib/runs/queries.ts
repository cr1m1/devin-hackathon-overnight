import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runs, schedules, stages, type Run, type Stage, type StageRole } from "@/lib/db/schema";

/** A run is only visible to the connection that owns it. `scheduleName` is null when the schedule was deleted. */
export async function getRunWithStages(
  id: string,
  connectionId: string | null,
): Promise<{ run: Run; stages: Stage[]; scheduleName: string | null } | null> {
  if (!connectionId) return null;
  const [run] = await db
    .select()
    .from(runs)
    .where(and(eq(runs.id, id), eq(runs.connectionId, connectionId)));
  if (!run) return null;
  const stageRows = await db.select().from(stages).where(eq(stages.runId, id)).orderBy(asc(stages.seq));
  let scheduleName: string | null = null;
  if (run.scheduleId) {
    const [s] = await db.select({ name: schedules.name }).from(schedules).where(eq(schedules.id, run.scheduleId));
    scheduleName = s?.name ?? null;
  }
  return { run, stages: stageRows, scheduleName };
}

export function listRuns(connectionId: string | null, limit = 50): Promise<Run[]> {
  if (!connectionId) return Promise.resolve([]);
  return db.select().from(runs).where(eq(runs.connectionId, connectionId)).orderBy(desc(runs.createdAt)).limit(limit);
}

export type RunWithChain = Run & { chain: { role: StageRole; status: string; verdict: string | null }[] };

/** Runs plus a compact stage chain for list rows. */
export async function listRunsWithChain(connectionId: string | null, limit = 50): Promise<RunWithChain[]> {
  const rows = await listRuns(connectionId, limit);
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const st = await db
    .select({ runId: stages.runId, role: stages.role, status: stages.status, verdict: stages.verdict, seq: stages.seq })
    .from(stages)
    .where(inArray(stages.runId, ids))
    .orderBy(asc(stages.seq));
  return rows.map((r) => ({ ...r, chain: st.filter((s) => s.runId === r.id).map((s) => ({ role: s.role, status: s.status, verdict: s.verdict })) }));
}
