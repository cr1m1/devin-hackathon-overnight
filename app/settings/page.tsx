import { Mono, PageTitle, Pill } from "@/components/ui";
import { getHealth } from "@/lib/health";
import { relative } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

// §13.4: read-only configuration health. No credentials are stored or shown here.
export default async function SettingsPage() {
  const h = await getHealth();
  const owners = Object.entries(h.owners).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <PageTitle>Settings</PageTitle>

      <Section title="Connections">
        <Row label="Database" value={h.db === "ok" ? <Pill tone="ok">reachable</Pill> : <Pill tone="bad">unreachable</Pill>} />
        <Row
          label="Devin"
          value={
            h.devin === "ok" ? (
              <Pill tone="ok">key and organization accepted</Pill>
            ) : h.devin === "unconfigured" ? (
              <Pill tone="warn">not configured</Pill>
            ) : (
              <Pill tone="bad">rejected</Pill>
            )
          }
        />
        <Row
          label="Scheduler"
          value={
            h.last_tick_at ? (
              <span className="flex items-center gap-2">
                <Pill tone={h.tick_stale ? "bad" : "ok"}>{h.tick_stale ? "stale" : "running"}</Pill>
                <Mono>last tick {relative(h.last_tick_at)}</Mono>
              </span>
            ) : (
              <Pill tone="bad">never ran</Pill>
            )
          }
        />
      </Section>

      <Section title="Repositories" hint="Access is granted in Devin's GitHub connection, not here. This instance further restricts which of those repositories a run may target.">
        <Row label="Reachable by Devin" value={<Mono className="text-ink">{h.repos_reachable}</Mono>} />
        <Row label="Allowed here" value={<Mono className="text-ink">{h.repos_allowed}</Mono>} />
        <Row label="Allow list" value={<Mono className="text-ink">{h.allowlist.join(", ") || "—"}</Mono>} />
        <Row label="Deny list" value={<Mono className="text-ink">{h.denylist.join(", ") || "—"}</Mono>} />
        {owners.length > 0 && (
          <Row
            label="By owner"
            value={
              <span className="flex flex-wrap gap-x-4 gap-y-1">
                {owners.map(([o, n]) => (
                  <Mono key={o} className="text-ink">
                    {o}: {n}
                  </Mono>
                ))}
              </span>
            }
          />
        )}
      </Section>

      <Section title="Defaults">
        <Row label="Stage budget per run" value={<Mono className="text-ink">{h.defaults.max_stages_per_run} stages</Mono>} />
        <Row label="ACU budget per run" value={<Mono className="text-ink">{h.defaults.max_acu_per_run} ACU</Mono>} />
        <Row
          label="Deadline handling"
          value={
            <Mono className="text-ink">
              nudge −{h.defaults.deadline_nudge_min} min · stop +{h.defaults.deadline_grace_min} min
            </Mono>
          }
        />
        <Row label="Build" value={<Mono className="text-ink">{h.version}</Mono>} />
      </Section>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-sm font-medium mb-1">{title}</h2>
      {hint && <p className="text-xs text-ink-3 mb-3 max-w-[60ch]">{hint}</p>}
      <dl className="border-t border-rule">{children}</dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(120px,160px)_1fr] gap-4 py-2.5 border-b border-rule text-sm">
      <dt className="text-ink-3">{label}</dt>
      <dd className="min-w-0">{value}</dd>
    </div>
  );
}
