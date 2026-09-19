import type { Run } from "@/lib/db/schema";

// Copy rules (§13.0): plain sentences, pattern "<Outcome> — <what you have>. <why it stopped>."

export function resultLine(run: Run): string {
  const prs = run.pullRequests.length;
  const prText = prs === 0 ? "no pull request" : prs === 1 ? "one pull request" : `${prs} pull requests`;
  switch (run.status) {
    case "complete":
      return `Complete — ${prText}, validated.`;
    case "partial":
      return `Partial — ${prText} open, not validated. ${run.outcomeReason ?? ""}`.trim();
    case "blocked":
      return `Blocked — needs you. ${run.outcomeReason ?? ""}`.trim();
    case "failed":
      return `Failed — ${prText}. ${run.outcomeReason ?? ""}`.trim();
    case "cancelled":
      return `Cancelled — ${prText}.`;
    case "running":
      return "Running.";
    case "queued":
      return "Queued — waiting for the next tick.";
  }
}

export const shortTime = (d: Date | string | null | undefined, tz?: string) =>
  d ? new Date(d).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", timeZone: tz }) : "—";

export const shortDate = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—");

export function relative(d: Date | string, now = new Date()): string {
  const diff = new Date(d).getTime() - now.getTime();
  const abs = Math.abs(diff);
  const m = Math.round(abs / 60_000);
  const text = m < 1 ? "under a minute" : m < 60 ? `${m} min` : m < 60 * 36 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`;
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}

export const acu = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${Number(n).toFixed(1)} ACU`);

export function formatDurationBetween(from: Date | string, to: Date | string): string {
  const total = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
}
