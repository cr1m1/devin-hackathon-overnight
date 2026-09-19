import clsx from "clsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Mono, StagePill } from "./ui";
import type { RunStatus, Stage } from "@/lib/db/schema";
import { ROLES } from "@/lib/flow/roles";
import { acu, formatDurationBetween, shortTime } from "@/lib/format";

// §13.2: the whole chain, including pending (grey) and skipped (struck) rows, on a visible spine.

export function StageTimeline({ stages, runStatus }: { stages: Stage[]; runStatus: RunStatus }) {
  return (
    <ol className="relative">
      {stages.map((s, i) => {
        const live = s.status === "running" || s.status === "starting";
        const pending = s.status === "pending";
        const skipped = s.status === "skipped";
        const last = i === stages.length - 1;
        return (
          <li key={s.id} className="relative grid grid-cols-[56px_20px_1fr] gap-x-2">
            <div className="pt-[3px] text-right">
              <Mono>{s.startedAt ? shortTime(s.startedAt) : ""}</Mono>
            </div>
            <div className="relative flex justify-center">
              <span
                className={clsx(
                  "mt-[7px] block h-[10px] w-[10px] rounded-full border-2 z-10",
                  live && "bg-accent border-accent pulse",
                  s.status === "done" && "bg-ink border-ink",
                  s.status === "failed" && "bg-bad border-bad",
                  (pending || skipped) && "bg-paper border-rule",
                )}
              />
              {!last && <span className="absolute top-[17px] bottom-[-4px] w-px bg-rule" />}
            </div>
            <div className={clsx("pb-6 min-w-0", pending && "opacity-60")}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className={clsx("font-medium", skipped && "line-through text-ink-3")}>{ROLES[s.role].title}</span>
                <StagePill verdict={s.verdict} status={s.status} />
                {s.origin === "edge" && <Mono>inserted</Mono>}
                {s.acusConsumed !== null && <Mono>{acu(s.acusConsumed)}</Mono>}
                {s.startedAt && s.finishedAt && <Mono>{formatDurationBetween(s.startedAt, s.finishedAt)}</Mono>}
              </div>
              {pending && (
                <p className="text-sm text-ink-3 mt-1">
                  {runStatus === "queued" || runStatus === "running" ? `Waiting. Estimated ${ROLES[s.role].estimateMinutes} min.` : "Not started."}
                </p>
              )}
              {live && <p className="text-sm text-ink-2 mt-1">{s.status === "starting" ? "Starting a session…" : "Working."}</p>}
              {s.summary && <p className="text-sm text-ink-2 mt-1">{s.summary}</p>}
              {s.error && <p className="text-sm text-bad mt-1">{s.error}</p>}
              <div className="mt-1.5 flex flex-wrap gap-x-4">
                {s.sessionUrl && (
                  <a href={s.sessionUrl} target="_blank" rel="noreferrer" className="text-xs underline underline-offset-2 text-ink-3 hover:text-ink">
                    Open session
                  </a>
                )}
                {s.pullRequests.map((pr) => (
                  <a key={pr.url} href={pr.url} target="_blank" rel="noreferrer" className="text-xs underline underline-offset-2 text-accent-ink">
                    {pr.url.replace(/^https?:\/\/(www\.)?github\.com\//, "")}
                  </a>
                ))}
              </div>
              {s.reportMd && (
                <details className="mt-2 group">
                  <summary className="text-xs text-ink-3 cursor-pointer select-none hover:text-ink list-none [&::-webkit-details-marker]:hidden">
                    <span className="group-open:hidden">Show report</span>
                    <span className="hidden group-open:inline">Hide report</span>
                  </summary>
                  <div className="report mt-2 border-l border-rule pl-4">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{s.reportMd}</ReactMarkdown>
                  </div>
                </details>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
