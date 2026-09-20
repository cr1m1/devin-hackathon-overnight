import { and, eq, isNull, ne, or } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { schedules, type Schedule } from "@/lib/db/schema";
import { connectionById } from "@/lib/connections";
import { createRun } from "@/lib/runs/create";
import { isDue, localParts, runInputFrom } from "@/lib/schedules/time";
import type { TickContext } from "./tick";

// Plan §11.5 — Phase 5: fire Schedules. Claim the local date first (a conditional UPDATE that
// only one of two overlapping Ticks can win), create the Run second.

export async function schedulesPhase({ db, now, result, deadline }: TickContext): Promise<void> {
  const enabled = await db.select().from(schedules).where(eq(schedules.enabled, true));
  for (const s of enabled) {
    if (Date.now() > deadline) break;
    if (!isDue(s, now)) continue;
    try {
      if (await fireSchedule(db, s, now)) result.fired++;
    } catch (e) {
      result.errors.push(`schedule ${s.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

/** Returns true when this call created the Run; false when another Tick already claimed today. */
export async function fireSchedule(db: Db, s: Schedule, now: Date): Promise<boolean> {
  const today = localParts(now, s.tz).date;
  const connection = await connectionById(s.connectionId);
  if (!connection) {
    await db.update(schedules).set({ enabled: false, updatedAt: now }).where(eq(schedules.id, s.id));
    throw new Error("connection missing; schedule disabled");
  }
  const claimed = await db
    .update(schedules)
    .set({ lastFiredOn: today, updatedAt: now })
    .where(and(eq(schedules.id, s.id), eq(schedules.enabled, true), or(isNull(schedules.lastFiredOn), ne(schedules.lastFiredOn, today))))
    .returning({ id: schedules.id });
  if (claimed.length === 0) return false;
  await createRun(runInputFrom(s, now), connection, { scheduleId: s.id }, now);
  return true;
}
