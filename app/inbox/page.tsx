import Link from "next/link";
import { Empty, Mono, PageTitle, RunPill } from "@/components/ui";
import type { RunWithChain } from "@/lib/runs/queries";
import { acu, resultLine, shortDate, shortTime } from "@/lib/format";
import { listRunsWithChain } from "@/lib/runs/queries";
import { ChainDots } from "@/components/sky";
import { currentConnection } from "@/lib/connections";
import { ConnectGate } from "@/components/connect-gate";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inbox" };

// §13.3: the morning screen. Needs-you above Ready; readable in ten seconds.
export default async function InboxPage() {
  const c = await currentConnection();
  if (!c) return <ConnectGate what="Finished runs land here — what to merge first, then what needs a decision." />;
  const all = await listRunsWithChain(c.id, 200);
  const needsYou = all.filter((r) => ["blocked", "failed", "partial"].includes(r.status));
  const ready = all.filter((r) => r.status === "complete");
  const inFlight = all.filter((r) => ["queued", "running"].includes(r.status)).length;

  return (
    <div>
      <PageTitle aside={inFlight > 0 ? <span className="text-sm text-ink-3">{inFlight} running</span> : undefined}>Inbox</PageTitle>
      {needsYou.length === 0 && ready.length === 0 ? (
        <Empty title="Nothing finished yet.">Finished runs land here — what to merge first, then what needs a decision.</Empty>
      ) : (
        <div className="space-y-10">
          <Section title="Needs you" runs={needsYou} empty="Nothing needs you." />
          <Section title="Ready to merge" runs={ready} empty="Nothing validated yet." />
        </div>
      )}
    </div>
  );
}

function Section({ title, runs, empty }: { title: string; runs: RunWithChain[]; empty: string }) {
  return (
    <section>
      <h2 className="text-sm font-medium text-ink-3 mb-2">{title}</h2>
      {runs.length === 0 ? (
        <p className="text-sm text-ink-3 border-t border-rule pt-3">{empty}</p>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {runs.map((r) => (
            <li key={r.id}>
              <Link href={`/runs/${r.id}`} className="block py-4 -mx-5 px-5 hover:bg-paper-2 transition-colors duration-150">
                <div className="flex items-start justify-between gap-4">
                  <p className="font-medium leading-snug line-clamp-2">{r.goal}</p>
                  <RunPill status={r.status} />
                </div>
                <p className="text-sm text-ink-2 mt-1">{resultLine(r)}</p>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-4">
                  <ChainDots statuses={r.chain.map((x) => x.status)} verdicts={r.chain.map((x) => x.verdict)} />
                  <Mono>{r.repo}</Mono>
                  <Mono>
                    finished {shortDate(r.updatedAt)} {shortTime(r.updatedAt)}
                  </Mono>
                  <Mono>{acu(r.acuSpent)}</Mono>
                  {r.pullRequests[0] && (
                    <span className="text-xs text-accent-ink underline underline-offset-2">
                      {r.pullRequests.length === 1 ? "pull request" : `${r.pullRequests.length} pull requests`}
                    </span>
                  )}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
