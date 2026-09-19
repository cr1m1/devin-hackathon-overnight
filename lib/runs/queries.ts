import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runs, stages, type Run, type Stage } from "@/lib/db/schema";

/** A run is only visible to the connection that owns it. */
export async function getRunWithStages(id: string, connectionId: string | null): Promise<{ run: Run; stages: Stage[] } | null> {
  if (!connectionId) return null;
  const [run] = await db
    .select()
    .from(runs)
    .where(and(eq(runs.id, id), eq(runs.connectionId, connectionId)));
  if (!run) return null;
  const stageRows = await db.select().from(stages).where(eq(stages.runId, id)).orderBy(asc(stages.seq));
  return { run, stages: stageRows };
}

export function listRuns(connectionId: string | null, limit = 50): Promise<Run[]> {
  if (!connectionId) return Promise.resolve([]);
  return db.select().from(runs).where(eq(runs.connectionId, connectionId)).orderBy(desc(runs.createdAt)).limit(limit);
}

export type RunWithChain = Run & { chain: { status: string; verdict: string | null }[] };

/** Runs plus a compact stage chain for list rows. */
export async function listRunsWithChain(connectionId: string | null, limit = 50): Promise<RunWithChain[]> {
  const rows = await listRuns(connectionId, limit);
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const st = await db
    .select({ runId: stages.runId, status: stages.status, verdict: stages.verdict, seq: stages.seq })
    .from(stages)
    .where(inArray(stages.runId, ids))
    .orderBy(asc(stages.seq));
  return rows.map((r) => ({ ...r, chain: st.filter((s) => s.runId === r.id).map((s) => ({ status: s.status, verdict: s.verdict })) }));
}
