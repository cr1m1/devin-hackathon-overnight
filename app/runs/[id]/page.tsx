import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { RunActions } from "@/components/run-actions";
import { StageTimeline } from "@/components/stage-timeline";
import { NightStrip } from "@/components/night-strip";
import { Sky } from "@/components/sky";
import { Mono, RunPill } from "@/components/ui";
import { TERMINAL_RUN_STATUSES } from "@/lib/db/schema";
import { acu, relative, resultLine, shortDate, shortTime } from "@/lib/format";
import { getRunWithStages } from "@/lib/runs/queries";
import { currentConnection } from "@/lib/connections";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await currentConnection();
  const data = await getRunWithStages(id, c?.id ?? null);
  if (!data) notFound();
  const { run, stages, scheduleName } = data;
  const terminal = TERMINAL_RUN_STATUSES.includes(run.status);
  const blocking = run.status === "blocked" ? stages.find((s) => s.verdict === "blocked") : undefined;

  return (
    <div>
      {!terminal && <AutoRefresh everyMs={10_000} />}

      <header className="mb-8">
        <div className="flex items-start gap-4">
          <Sky status={run.status} className="w-12 h-12 -mt-1" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-lg font-semibold leading-snug">{run.goal}</h1>
              <RunPill status={run.status} />
            </div>
            <p className="mt-2 text-ink-2">{resultLine(run)}</p>
          </div>
        </div>
        <NightStrip run={run} stages={stages} />
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
          <dt className="text-ink-3">Repository</dt>
          <dd>
            <Mono className="text-ink">{run.repo}</Mono>
          </dd>
          <dt className="text-ink-3">Deadline</dt>
          <dd>
            <Mono className="text-ink">
              {shortDate(run.deadlineAt)} {shortTime(run.deadlineAt)}
            </Mono>{" "}
            {!terminal && <span className="text-ink-3">({relative(run.deadlineAt)})</span>}
          </dd>
          <dt className="text-ink-3">Spent</dt>
          <dd>
            <Mono className="text-ink">
              {acu(run.acuSpent)} of {acu(run.acuBudget)}
            </Mono>
          </dd>
          {run.scheduleId && (
            <>
              <dt className="text-ink-3">Started by</dt>
              <dd>
                <Mono className="text-ink">schedule {scheduleName ?? `${run.scheduleId} (deleted)`}</Mono>
              </dd>
            </>
          )}
          {run.pullRequests.length > 0 && (
            <>
              <dt className="text-ink-3">Pull requests</dt>
              <dd className="space-y-0.5">
                {run.pullRequests.map((pr) => (
                  <a key={pr.url} href={pr.url} target="_blank" rel="noreferrer" className="block underline underline-offset-2 text-accent-ink break-all">
                    {pr.title ?? pr.url.replace(/^https?:\/\/(www\.)?/, "")}
                    {pr.state ? <span className="text-ink-3 no-underline"> · {pr.state}</span> : null}
                  </a>
                ))}
              </dd>
            </>
          )}
        </dl>
        <div className="mt-5">
          <RunActions runId={run.id} status={run.status} />
        </div>
      </header>

      {blocking && (
        <section className="mb-8 border-l-2 border-bad pl-4">
          <p className="text-sm font-medium text-bad">Needs you</p>
          <p className="text-sm text-ink-2 mt-1">{blocking.summary ?? run.outcomeReason}</p>
        </section>
      )}

      {run.acceptanceCriteria && run.acceptanceCriteria.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-medium mb-2">Acceptance criteria</h2>
          <ul className="space-y-1">
            {run.acceptanceCriteria.map((c, i) => (
              <li key={i} className="text-sm text-ink-2 flex gap-2">
                <span className="text-ink-3 font-mono text-xs pt-[3px]">{String(i + 1).padStart(2, "0")}</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-sm font-medium mb-3">Stages</h2>
        <StageTimeline stages={stages} runStatus={run.status} />
      </section>
    </div>
  );
}
