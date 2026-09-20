import { describe, expect, it } from "vitest";
import { decideRateLimited, RATE_LIMIT_GIVE_UP_MIN } from "@/lib/tick/rate-limited";

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
});

