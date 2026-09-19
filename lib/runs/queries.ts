import { and, asc, desc, eq } from "drizzle-orm";
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
