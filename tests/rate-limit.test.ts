import { describe, expect, it } from "vitest";
import { decideRateLimited, RATE_LIMIT_GIVE_UP_MIN, streakResetForSkip } from "@/lib/tick/rate-limited";

const T0 = new Date("2026-09-20T00:00:00Z");
const plus = (min: number) => new Date(T0.getTime() + min * 60_000);

describe("decideRateLimited (§9.5: > 30 min fully rate-limited → Run failed)", () => {
  it("first 429 starts the clock at now and retries", () => {
    expect(decideRateLimited(null, T0)).toEqual({ kind: "retry", since: T0 });
  });
  it("keeps retrying while the streak is at most 30 minutes", () => {
    expect(decideRateLimited(T0, plus(RATE_LIMIT_GIVE_UP_MIN)).kind).toBe("retry");
    expect(decideRateLimited(T0, plus(1)).since).toEqual(T0);
  });
  it("gives up once the streak exceeds 30 minutes", () => {
    expect(decideRateLimited(T0, plus(RATE_LIMIT_GIVE_UP_MIN + 1))).toEqual({ kind: "give-up", since: T0 });
  });
  it("a Stage held back by another gate loses its streak, so a later 429 starts a fresh window", () => {
    // 429 at T0, then not attempted for 40 min (budget/lease gate), then 429 again: must retry, not give up.
    const reset = streakResetForSkip({ rateLimitedSince: T0 });
    expect(reset).toEqual({ rateLimitedSince: null });
    expect(decideRateLimited(reset!.rateLimitedSince, plus(40))).toEqual({ kind: "retry", since: plus(40) });
    expect(streakResetForSkip({ rateLimitedSince: null })).toBeNull();
  });
});

