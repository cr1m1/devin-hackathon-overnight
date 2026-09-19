import Link from "next/link";
import { Empty, LinkButton, Mono, PageTitle, RunPill } from "@/components/ui";
import { relative, resultLine, shortDate, shortTime } from "@/lib/format";
import { listRuns } from "@/lib/runs/queries";
import { currentConnection } from "@/lib/connections";
import { ConnectGate } from "@/components/connect-gate";

export const dynamic = "force-dynamic";
export const metadata = { title: "Runs" };

export default async function RunsPage() {
  const c = await currentConnection();
  if (!c) return <ConnectGate what="Your runs appear here once connected." />;
  const runs = await listRuns(c.id, 100);
  return (
    <div>
      <PageTitle aside={<LinkButton href="/">New run</LinkButton>}>Runs</PageTitle>
      {runs.length === 0 ? (
        <Empty title="No runs yet.">Create one and it will appear here with its stage chain.</Empty>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {runs.map((r) => (
            <li key={r.id}>
              <Link href={`/runs/${r.id}`} className="block py-4 hover:bg-paper-2 -mx-5 px-5 transition-colors duration-150">
                <div className="flex items-start justify-between gap-4">
                  <p className="font-medium leading-snug line-clamp-2">{r.goal}</p>
                  <RunPill status={r.status} />
                </div>
                <p className="text-sm text-ink-2 mt-1">{resultLine(r)}</p>
                <p className="mt-1.5 flex flex-wrap gap-x-4">
                  <Mono>{r.repo}</Mono>
                  <Mono>
                    {shortDate(r.createdAt)} {shortTime(r.createdAt)}
                  </Mono>
                  {["queued", "running"].includes(r.status) && <Mono>deadline {relative(r.deadlineAt)}</Mono>}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
