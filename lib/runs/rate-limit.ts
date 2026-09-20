import { and, eq, gt } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { runs } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { CreateRunError } from "@/lib/runs/create";

export const DEMO_WINDOW_MIN = 10;
export const DEMO_RATE_LIMIT_MESSAGE = `Public demo: one run per ${DEMO_WINDOW_MIN} minutes per address.`;

/** True when `ip` created a Run within the last `windowMin` minutes (plan §5 DEMO_MODE limit). */
export async function recentRunFromIp(db: Db, ip: string, now: Date, windowMin = DEMO_WINDOW_MIN): Promise<boolean> {
  const since = new Date(now.getTime() - windowMin * 60_000);
  const rows = await db
    .select({ id: runs.id })
    .from(runs)
    .where(and(eq(runs.createdIp, ip), gt(runs.createdAt, since)))
    .limit(1);
  return rows.length > 0;
}

/** Throws a 429 `CreateRunError` when DEMO_MODE is on and this address started a Run recently. */
export async function enforceDemoLimit(db: Db, ip: string | null, now = new Date()): Promise<void> {
  if (!env.demoMode || !ip) return;
  if (await recentRunFromIp(db, ip, now)) throw new CreateRunError(DEMO_RATE_LIMIT_MESSAGE, 429);
}
