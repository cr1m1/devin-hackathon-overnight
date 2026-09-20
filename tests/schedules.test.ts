import { describe, expect, it } from "vitest";
import { initialLastFiredOn, isDue, isValidTimeZone, localParts, MIN_DEADLINE_LEAD_MIN, nextDeadline, scheduleInput, schedulePatch } from "@/lib/schedules/time";

const timing = (over: Partial<Parameters<typeof isDue>[0]> = {}) => ({
  atHour: 22,
  atMinute: 0,
  tz: "Europe/Budapest",
  deadlineHour: 8,
  deadlineMinute: 0,
  enabled: true,
  lastFiredOn: null,
  ...over,
});

describe("localParts", () => {
  it("converts to the schedule's wall clock, 24-hour", () => {
    // 2026-07-01 22:30 UTC = 00:30 next day in Budapest (CEST, UTC+2)
    expect(localParts(new Date("2026-07-01T22:30:00Z"), "Europe/Budapest")).toEqual({ date: "2026-07-02", hour: 0, minute: 30 });
    expect(localParts(new Date("2026-01-15T12:05:00Z"), "America/Los_Angeles")).toEqual({ date: "2026-01-15", hour: 4, minute: 5 });
  });
});

describe("isDue", () => {
  it("fires once the local time has passed and not again the same local day", () => {
    const s = timing({ atHour: 22, atMinute: 0 });
    expect(isDue(s, new Date("2026-07-01T19:59:00Z"))).toBe(false); // 21:59 local
    expect(isDue(s, new Date("2026-07-01T20:00:00Z"))).toBe(true); // 22:00 local
    expect(isDue(s, new Date("2026-07-01T21:30:00Z"))).toBe(true); // 23:30 local, still today
    expect(isDue({ ...s, lastFiredOn: "2026-07-01" }, new Date("2026-07-01T21:30:00Z"))).toBe(false);
    expect(isDue({ ...s, lastFiredOn: "2026-07-01" }, new Date("2026-07-02T20:00:00Z"))).toBe(true); // next local day
  });

  it("uses the schedule's time zone, not UTC, for 'today'", () => {
    const s = timing({ atHour: 1, atMinute: 0, tz: "Pacific/Auckland" }); // UTC+12 in July
    // 2026-07-01 13:30 UTC = 2026-07-02 01:30 in Auckland
    const now = new Date("2026-07-01T13:30:00Z");
    expect(isDue(s, now)).toBe(true);
    expect(isDue({ ...s, lastFiredOn: "2026-07-02" }, now)).toBe(false);
    expect(isDue({ ...s, lastFiredOn: "2026-07-01" }, now)).toBe(true);
  });

  it("never fires when disabled", () => {
    expect(isDue(timing({ enabled: false }), new Date("2026-07-01T23:00:00Z"))).toBe(false);
  });

  it("handles a DST transition day", () => {
    // Europe/Budapest 2026-03-29: clocks jump 02:00 → 03:00. A 02:30 schedule must still fire that day.
    const s = timing({ atHour: 2, atMinute: 30 });
    expect(isDue(s, new Date("2026-03-29T00:59:00Z"))).toBe(false); // 01:59 CET
    expect(isDue(s, new Date("2026-03-29T01:00:00Z"))).toBe(true); // 03:00 CEST (02:30 never existed; passed)
  });
});

describe("nextDeadline", () => {
  it("picks today's deadline when it is still ahead", () => {
    const s = timing({ deadlineHour: 8, deadlineMinute: 0 });
    const d = nextDeadline(s, new Date("2026-07-01T22:00:00Z")); // 00:00 local 07-02
    expect(d.toISOString()).toBe("2026-07-02T06:00:00.000Z"); // 08:00 CEST
  });

  it("rolls to tomorrow when today's time has passed", () => {
    const s = timing({ deadlineHour: 8, deadlineMinute: 0 });
    const d = nextDeadline(s, new Date("2026-07-02T07:00:00Z")); // 09:00 local
    expect(d.toISOString()).toBe("2026-07-03T06:00:00.000Z");
  });

  it(`rolls to tomorrow when today's time is less than ${MIN_DEADLINE_LEAD_MIN} minutes ahead`, () => {
    const s = timing({ deadlineHour: 8, deadlineMinute: 0 });
    const d = nextDeadline(s, new Date("2026-07-02T05:50:00Z")); // 07:50 local, 10 min before
    expect(d.toISOString()).toBe("2026-07-03T06:00:00.000Z");
    const ok = nextDeadline(s, new Date("2026-07-02T05:45:00Z")); // exactly 15 min before
    expect(ok.toISOString()).toBe("2026-07-02T06:00:00.000Z");
  });

  it("respects the offset change across a DST boundary", () => {
    // Europe/Budapest, 2026-10-25 clocks fall back 03:00 → 02:00. Deadline 08:00 on 10-25 is 07:00 UTC.
    const s = timing({ deadlineHour: 8, deadlineMinute: 0 });
    const d = nextDeadline(s, new Date("2026-10-24T20:00:00Z")); // 22:00 CEST on 10-24
    expect(d.toISOString()).toBe("2026-10-25T07:00:00.000Z");
  });
});

describe("scheduleInput", () => {
  const good = {
    name: "Nightly",
    goal: "Fix the flaky test suite",
    repo: "cr1m1/lalafo-stats",
    at_hour: 22,
    at_minute: 0,
    tz: "Europe/Budapest",
    deadline_hour: 8,
    deadline_minute: 0,
  };

  it("accepts a valid schedule and defaults enabled/template", () => {
    const parsed = scheduleInput.parse(good);
    expect(parsed.enabled).toBe(true);
    expect(parsed.template_id).toBe("build");
  });

  it("rejects an unknown time zone", () => {
    expect(scheduleInput.safeParse({ ...good, tz: "Mars/Olympus" }).success).toBe(false);
    expect(isValidTimeZone("UTC")).toBe(true);
  });

  it("rejects out-of-range hours and minutes", () => {
    expect(scheduleInput.safeParse({ ...good, at_hour: 24 }).success).toBe(false);
    expect(scheduleInput.safeParse({ ...good, deadline_minute: 60 }).success).toBe(false);
    expect(scheduleInput.safeParse({ ...good, at_hour: -1 }).success).toBe(false);
    expect(scheduleInput.safeParse({ ...good, at_hour: 1.5 }).success).toBe(false);
  });

  it("rejects hours and minutes that are not numbers (no coercion)", () => {
    expect(scheduleInput.safeParse({ ...good, at_hour: "" }).success).toBe(false);
    expect(scheduleInput.safeParse({ ...good, at_minute: null }).success).toBe(false);
    expect(scheduleInput.safeParse({ ...good, deadline_hour: true }).success).toBe(false);
    expect(scheduleInput.safeParse({ ...good, deadline_hour: "8" }).success).toBe(false);
  });
});

describe("schedulePatch", () => {
  it("does not inject defaults, so a rename leaves enabled/template untouched", () => {
    const parsed = schedulePatch.parse({ name: "renamed" });
    expect(parsed).toEqual({ name: "renamed" });
    expect(parsed.enabled).toBeUndefined();
    expect(parsed.template_id).toBeUndefined();
  });

  it("still validates the fields it is given", () => {
    expect(schedulePatch.safeParse({ enabled: false }).success).toBe(true);
    expect(schedulePatch.safeParse({ at_hour: 24 }).success).toBe(false);
    expect(schedulePatch.safeParse({ at_hour: "3" }).success).toBe(false);
    expect(schedulePatch.safeParse({ tz: "Mars/Olympus" }).success).toBe(false);
  });
});

describe("initialLastFiredOn", () => {
  const s = { atHour: 8, atMinute: 0, tz: "Europe/Budapest" };

  it("marks today as fired when created after the start time, so the next tick does not catch up", () => {
    const created = new Date("2026-07-01T13:00:00Z"); // 15:00 local
    const last = initialLastFiredOn(s, created);
    expect(last).toBe("2026-07-01");
    expect(isDue({ ...s, deadlineHour: 8, deadlineMinute: 0, enabled: true, lastFiredOn: last }, created)).toBe(false);
    expect(isDue({ ...s, deadlineHour: 8, deadlineMinute: 0, enabled: true, lastFiredOn: last }, new Date("2026-07-02T06:00:00Z"))).toBe(true);
  });

  it("leaves it null when the start time is still ahead today", () => {
    expect(initialLastFiredOn(s, new Date("2026-07-01T04:00:00Z"))).toBeNull(); // 06:00 local
  });
});
