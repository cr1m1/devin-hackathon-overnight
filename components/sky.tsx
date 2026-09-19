import clsx from "clsx";
import type { RunStatus } from "@/lib/db/schema";

// The one piece of iconography in the app: where the night is. Moon while working, sun when the
// morning delivered, a clouded moon when it needs a human. Stroke icons, no fills beyond the disc.

export function Sky({ status, className }: { status: RunStatus; className?: string }) {
  const base = clsx("shrink-0", className);
  switch (status) {
    case "complete":
      return (
        <svg viewBox="0 0 48 48" className={clsx(base, "text-accent")} aria-label="Morning">
          <circle cx="24" cy="26" r="9" className="fill-current" />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            const x1 = 24 + Math.cos(a) * 13,
              y1 = 26 + Math.sin(a) * 13,
              x2 = 24 + Math.cos(a) * 17,
              y2 = 26 + Math.sin(a) * 17;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="2" strokeLinecap="round" />;
          })}
        </svg>
      );
    case "partial":
      return (
        <svg viewBox="0 0 48 48" className={clsx(base, "text-warn")} aria-label="Half morning">
          <path d="M12 30a12 12 0 0 1 24 0z" className="fill-current" />
          <line x1="8" y1="34" x2="40" y2="34" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <line x1="24" y1="10" x2="24" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <line x1="12" y1="15" x2="14.5" y2="17.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <line x1="36" y1="15" x2="33.5" y2="17.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "blocked":
    case "failed":
      return (
        <svg viewBox="0 0 48 48" className={clsx(base, "text-bad")} aria-label="Needs you">
          <path d="M30 12a11 11 0 1 0 6 20 9 9 0 0 1-6-20z" className="fill-current opacity-80" />
          <path d="M10 36h20a5 5 0 0 0 0-10 7 7 0 0 0-13-2 6 6 0 0 0-7 12z" className="fill-paper" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case "cancelled":
      return (
        <svg viewBox="0 0 48 48" className={clsx(base, "text-ink-3")} aria-label="Cancelled">
          <path d="M30 12a11 11 0 1 0 6 20 9 9 0 0 1-6-20z" fill="none" stroke="currentColor" strokeWidth="2" />
          <line x1="12" y1="36" x2="36" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 48 48" className={clsx(base, "text-ink")} aria-label="Night">
          <path d="M30 12a11 11 0 1 0 6 20 9 9 0 0 1-6-20z" className="fill-current" />
          <circle cx="14" cy="14" r="1.2" className="fill-current" />
          <circle cx="10" cy="24" r="1" className="fill-current" />
          <circle cx="40" cy="10" r="1" className="fill-current" />
        </svg>
      );
  }
}

/** Compact chain for list rows: one dot per stage in seq order. */
export function ChainDots({ statuses, verdicts }: { statuses: string[]; verdicts: (string | null)[] }) {
  return (
    <span className="inline-flex items-center gap-1 align-middle" aria-label={`Stages: ${statuses.join(", ")}`}>
      {statuses.map((s, i) => {
        const v = verdicts[i];
        const cls =
          s === "done" && (v === "ok" || v === "complete")
            ? "bg-ink"
            : s === "done" && v === "needs-work"
              ? "bg-warn"
              : s === "done" || s === "failed"
                ? "bg-bad"
                : s === "running" || s === "starting"
                  ? "bg-accent pulse"
                  : "border border-rule bg-paper";
        return <i key={i} className={clsx("inline-block w-2 h-2 rounded-full", cls)} />;
      })}
    </span>
  );
}
