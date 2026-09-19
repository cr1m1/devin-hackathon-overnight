import { and, eq, lt, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { tickLock } from "@/lib/db/schema";

// Plan §11.0 / ADR-0002. One conditional UPDATE claims the lease; it expires by itself.

export async function acquireLease(db: Db, leaseSec: number, now = new Date()): Promise<boolean> {
  const until = new Date(now.getTime() + leaseSec * 1000);
  const rows = await db
    .update(tickLock)
    .set({ lockedUntil: until, lastRunAt: now })
    .where(and(eq(tickLock.id, 1), lt(tickLock.lockedUntil, now)))
    .returning({ id: tickLock.id });
  return rows.length === 1;
}

export async function recordResult(db: Db, result: Record<string, unknown>): Promise<void> {
  // Also release early: a finished tick should not make the next minute wait out the lease.
  await db
    .update(tickLock)
    .set({ lastResult: result, lockedUntil: sql`now()` })
    .where(eq(tickLock.id, 1));
}

export async function readLease(db: Db): Promise<{ lastRunAt: Date | null; lockedUntil: Date; lastResult: Record<string, unknown> | null } | null> {
  const [row] = await db.select().from(tickLock).where(eq(tickLock.id, 1));
  return row ?? null;
}
