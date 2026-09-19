import Link from "next/link";
import clsx from "clsx";
import type { RunStatus, StageStatus, Verdict } from "@/lib/db/schema";

// Small, boring primitives. Status colour appears ONLY here (§13.0).

type Tone = "ok" | "warn" | "bad" | "mute" | "live";

const toneClass: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  bad: "bg-bad-bg text-bad",
  mute: "bg-mute-bg text-ink-2",
  live: "bg-paper-2 text-accent-ink border border-accent/30",
};

export function Pill({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return <span className={clsx("inline-flex items-center rounded-full px-2 py-[1px] text-xs font-medium whitespace-nowrap", toneClass[tone], className)}>{children}</span>;
}

export const runTone: Record<RunStatus, Tone> = {
  queued: "mute",
  running: "live",
  complete: "ok",
  partial: "warn",
  blocked: "bad",
  failed: "bad",
  cancelled: "mute",
};

export const runLabel: Record<RunStatus, string> = {
  queued: "Queued",
  running: "Running",
  complete: "Complete",
  partial: "Partial",
  blocked: "Blocked",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function RunPill({ status }: { status: RunStatus }) {
  return <Pill tone={runTone[status]}>{runLabel[status]}</Pill>;
}

export function verdictTone(v: Verdict | null, status: StageStatus): Tone {
  if (status === "failed") return "bad";
  if (status === "skipped" || status === "pending") return "mute";
  if (status === "starting" || status === "running") return "live";
  switch (v) {
    case "ok":
    case "complete":
      return "ok";
    case "needs-work":
      return "warn";
    case "blocked":
      return "bad";
    default:
      return "mute";
  }
}

export function StagePill({ verdict, status }: { verdict: Verdict | null; status: StageStatus }) {
  const label = status === "done" ? (verdict ?? "done") : status;
  return <Pill tone={verdictTone(verdict, status)}>{label}</Pill>;
}

export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={clsx("font-mono text-xs text-ink-3", className)}>{children}</span>;
}

export function Button({ children, variant = "primary", className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  return (
    <button
      {...rest}
      className={clsx(
        "inline-flex items-center justify-center h-10 px-4 rounded-md text-sm font-medium transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed",
        variant === "primary" && "bg-ink text-paper hover:bg-accent-ink",
        variant === "ghost" && "border border-rule text-ink hover:bg-paper-2",
        variant === "danger" && "border border-rule text-bad hover:bg-bad-bg",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function LinkButton({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={clsx("inline-flex items-center h-10 px-4 rounded-md text-sm font-medium border border-rule hover:bg-paper-2 transition-colors duration-150", className)}
    >
      {children}
    </Link>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="border border-dashed border-rule rounded-md px-5 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <p className="text-ink-3 text-sm mt-1">{children}</p>}
    </div>
  );
}

export function PageTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 mb-6">
      <h1 className="text-lg font-semibold">{children}</h1>
      {aside}
    </div>
  );
}
