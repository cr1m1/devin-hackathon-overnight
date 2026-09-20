import { z } from "zod";
import type { Schedule } from "@/lib/db/schema";
import type { CreateRunInput } from "@/lib/runs/create";
import { MINUTE_MS } from "@/lib/time";

// Plan §6.3, §11.5. A Schedule fires a Run once per local day at at_hour:at_minute in its tz;
// the Run's deadline is the next deadline_hour:deadline_minute in the same tz.

export const MIN_DEADLINE_LEAD_MIN = 15;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const hour = z.number().int().min(0).max(23);
const minute = z.number().int().min(0).max(59);

const scheduleFields = {
  name: z.string().trim().min(1).max(80),
  goal: z.string().trim().min(8, "describe the goal in at least a sentence").max(8000),
  repo: z.string().trim(),
  template_id: z.string().min(1),
  at_hour: hour,
  at_minute: minute,
  tz: z.string().trim().refine(isValidTimeZone, "unknown IANA time zone"),
  deadline_hour: hour,
  deadline_minute: minute,
  enabled: z.boolean(),
};

export const scheduleInput = z.object({
  ...scheduleFields,
  template_id: scheduleFields.template_id.default("build"),
  enabled: scheduleFields.enabled.default(true),
});
export type ScheduleInput = z.infer<typeof scheduleInput>;
/** Every field optional and none defaulted, so PATCH { name } changes only the name. */
export const schedulePatch = z.object(scheduleFields).partial();
export type SchedulePatch = z.infer<typeof schedulePatch>;

export type ScheduleTiming = Pick<Schedule, "atHour" | "atMinute" | "tz" | "deadlineHour" | "deadlineMinute" | "enabled" | "lastFiredOn">;

export type LocalParts = { date: string; hour: number; minute: number };

/** Wall-clock parts of `now` in `tz`. `date` is YYYY-MM-DD, hours are 0–23. */
export function localParts(now: Date, tz: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) % 24, minute: Number(get("minute")) };
}

/** Enabled, its local time today has passed, and it has not fired on this local date yet. */
export function isDue(s: ScheduleTiming, now: Date): boolean {
  if (!s.enabled) return false;
  const local = localParts(now, s.tz);
  if (s.lastFiredOn === local.date) return false;
  return local.hour * 60 + local.minute >= s.atHour * 60 + s.atMinute;
}

/**
 * `last_fired_on` for a schedule that is created or re-enabled at `now`: today's local date when
 * its start time has already passed (so it waits for tomorrow instead of firing on the next Tick),
 * otherwise null.
 */
export function initialLastFiredOn(s: Pick<ScheduleTiming, "atHour" | "atMinute" | "tz">, now: Date): string | null {
  const local = localParts(now, s.tz);
  return local.hour * 60 + local.minute >= s.atHour * 60 + s.atMinute ? local.date : null;
}

/**
 * The first instant after `now` whose wall clock in `tz` reads deadline_hour:deadline_minute
 * and which is at least MIN_DEADLINE_LEAD_MIN ahead (so it passes createRunInput's lead check).
 * Walks whole minutes, so DST shifts are handled by the formatter, not by arithmetic.
 */
export function nextDeadline(s: Pick<ScheduleTiming, "tz" | "deadlineHour" | "deadlineMinute">, now: Date): Date {
  const base = new Date(Math.floor(now.getTime() / MINUTE_MS) * MINUTE_MS);
  const earliest = now.getTime() + MIN_DEADLINE_LEAD_MIN * MINUTE_MS;
  // Jump close to the target first, then scan minute by minute (at most ~2 days of minutes).
  const local = localParts(base, s.tz);
  const nowMin = local.hour * 60 + local.minute;
  const targetMin = s.deadlineHour * 60 + s.deadlineMinute;
  let t = base.getTime() + ((targetMin - nowMin + 24 * 60) % (24 * 60)) * MINUTE_MS - 120 * MINUTE_MS;
  const limit = base.getTime() + 3 * 24 * 60 * MINUTE_MS;
  for (; t <= limit; t += MINUTE_MS) {
    if (t < earliest) continue;
    const p = localParts(new Date(t), s.tz);
    if (p.hour === s.deadlineHour && p.minute === s.deadlineMinute) return new Date(t);
  }
  throw new Error(`no deadline instant found for ${s.deadlineHour}:${s.deadlineMinute} in ${s.tz}`);
}

export function runInputFrom(s: Schedule, now: Date): CreateRunInput {
  return { goal: s.goal, repo: s.repo, template_id: s.templateId, deadline_at: nextDeadline(s, now) };
}

export const pad2 = (n: number) => String(n).padStart(2, "0");
