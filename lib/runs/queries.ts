import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runs, stages, type Run, type Stage } from "@/lib/db/schema";

export async function getRunWithStages(id: string): Promise<{ run: Run; stages: Stage[] } | null> {
  const [run] = await db.select().from(runs).where(eq(runs.id, id));
  if (!run) return null;
  const stageRows = await db.select().from(stages).where(eq(stages.runId, id)).orderBy(asc(stages.seq));
  return { run, stages: stageRows };
}

export function listRuns(limit = 50): Promise<Run[]> {
  return db.select().from(runs).orderBy(desc(runs.createdAt)).limit(limit);
}
