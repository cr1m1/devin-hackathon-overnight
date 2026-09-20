import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { schedules, type Connection, type Schedule } from "@/lib/db/schema";
import { newScheduleId } from "@/lib/ids";
import { repoRefusalFor } from "@/lib/connections";
import { CreateRunError } from "@/lib/runs/create";
import type { ScheduleInput, SchedulePatch } from "./time";

// ---- DB access, scoped to a Connection --------------------------------------------------------

export function listSchedules(connectionId: string): Promise<Schedule[]> {
  return db.select().from(schedules).where(eq(schedules.connectionId, connectionId)).orderBy(asc(schedules.createdAt));
}

export async function createSchedule(input: ScheduleInput, owner: Pick<Connection, "id" | "repoAllowlist" | "repoDenylist">, now = new Date()): Promise<Schedule> {
  const refusal = repoRefusalFor(owner, input.repo);
  if (refusal) throw new CreateRunError(refusal);
  const [row] = await db
    .insert(schedules)
    .values({
      id: newScheduleId(),
      connectionId: owner.id,
      name: input.name,
      goal: input.goal,
      repo: input.repo,
      templateId: input.template_id,
      atHour: input.at_hour,
      atMinute: input.at_minute,
      tz: input.tz,
      deadlineHour: input.deadline_hour,
      deadlineMinute: input.deadline_minute,
      enabled: input.enabled,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row;
}

export async function updateSchedule(
  id: string,
  patch: SchedulePatch,
  owner: Pick<Connection, "id" | "repoAllowlist" | "repoDenylist">,
  now = new Date(),
): Promise<Schedule | null> {
  if (patch.repo !== undefined) {
    const refusal = repoRefusalFor(owner, patch.repo);
    if (refusal) throw new CreateRunError(refusal);
  }
  const [row] = await db
    .update(schedules)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.goal !== undefined ? { goal: patch.goal } : {}),
      ...(patch.repo !== undefined ? { repo: patch.repo } : {}),
      ...(patch.template_id !== undefined ? { templateId: patch.template_id } : {}),
      ...(patch.at_hour !== undefined ? { atHour: patch.at_hour } : {}),
      ...(patch.at_minute !== undefined ? { atMinute: patch.at_minute } : {}),
      ...(patch.tz !== undefined ? { tz: patch.tz } : {}),
      ...(patch.deadline_hour !== undefined ? { deadlineHour: patch.deadline_hour } : {}),
      ...(patch.deadline_minute !== undefined ? { deadlineMinute: patch.deadline_minute } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      updatedAt: now,
    })
    .where(and(eq(schedules.id, id), eq(schedules.connectionId, owner.id)))
    .returning();
  return row ?? null;
}

export async function deleteSchedule(id: string, connectionId: string): Promise<boolean> {
  const rows = await db
    .delete(schedules)
    .where(and(eq(schedules.id, id), eq(schedules.connectionId, connectionId)))
    .returning({ id: schedules.id });
  return rows.length > 0;
}
