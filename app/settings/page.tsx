import { ConnectDevinForm, DisconnectButton, RepoListsEditor } from "@/components/connect-devin";
import { Mono, PageTitle, Pill } from "@/components/ui";
import { currentConnection } from "@/lib/connections";
import { getConnectionHealth, getHealth } from "@/lib/health";
import { relative, shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [h, c] = await Promise.all([getHealth(), currentConnection()]);
  const ch = c ? await getConnectionHealth(c) : null;
  const owners = ch ? Object.entries(ch.owners).sort((x, y) => y[1] - x[1]) : [];

  return (
    <div>
      <PageTitle>Settings</PageTitle>

      <Section title="Your Devin" hint={c ? undefined : "Connect the Devin organization Overnight should run sessions in. Credentials never leave this instance's database."}>
        {c ? (
          <>
            <Row label="Connection" value={<span>{c.name}</span>} />
            <Row label="Organization" value={<Mono className="text-ink">{c.devinOrgId}</Mono>} />
            <Row label="API key" value={<Mono className="text-ink">{c.keyHint}</Mono>} />
            <Row
              label="Status"
              value={
                ch?.devin === "ok" ? (
                  <span className="flex items-center gap-2">
                    <Pill tone="ok">key accepted</Pill>
                    <Mono>connected {shortDate(c.createdAt)}</Mono>
                  </span>
                ) : (
                  <Pill tone="bad">Devin rejected the stored key</Pill>
                )
              }
            />
            <div className="pt-4">
              <DisconnectButton />
            </div>
          </>
        ) : (
          <div className="pt-4">
            <ConnectDevinForm encryptionReady={h.encryption === "ok"} />
          </div>
        )}
      </Section>

      {c && ch && (
        <Section
          title="Repositories"
          hint="Access itself is granted in your Devin organization's GitHub connection. These rules further restrict what this connection's runs may target."
        >
          <Row label="Reachable by Devin" value={<Mono className="text-ink">{ch.repos_reachable}</Mono>} />
          <Row label="Allowed by rules" value={<Mono className="text-ink">{ch.repos_allowed}</Mono>} />
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
          <div className="pt-4">
            <RepoListsEditor allow={c.repoAllowlist} deny={c.repoDenylist} />
          </div>
        </Section>
      )}

      <Section title="This instance">
        <Row label="Database" value={h.db === "ok" ? <Pill tone="ok">reachable</Pill> : <Pill tone="bad">unreachable</Pill>} />
        <Row label="Credential storage" value={h.encryption === "ok" ? <Pill tone="ok">encrypted at rest</Pill> : <Pill tone="bad">encryption key missing</Pill>} />
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
