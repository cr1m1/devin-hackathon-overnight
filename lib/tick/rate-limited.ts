// Plan §9.5 / §14: a 429 is never a failure by itself, but a Stage that cannot be
// started for more than RATE_LIMIT_GIVE_UP_MIN minutes in a row takes its Run down.

export const RATE_LIMIT_GIVE_UP_MIN = 30;
export const RATE_LIMITED_REASON = "rate limited";

export type RateLimitDecision = { kind: "retry"; since: Date } | { kind: "give-up"; since: Date };

export function decideRateLimited(since: Date | null, now: Date, giveUpMin = RATE_LIMIT_GIVE_UP_MIN): RateLimitDecision {
  const start = since ?? now;
  const limitedFor = now.getTime() - start.getTime();
  return limitedFor > giveUpMin * 60_000 ? { kind: "give-up", since: start } : { kind: "retry", since: start };
}
