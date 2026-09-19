"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui";

const inputClass = "w-full rounded-md border border-rule bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:border-ink font-mono";

export function ConnectDevinForm({ encryptionReady }: { encryptionReady: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [orgId, setOrgId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || "My Devin", org_id: orgId, api_key: apiKey }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) return setError(body.error ?? "Could not connect.");
      setApiKey("");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!encryptionReady) return <p className="text-sm text-bad">This instance cannot store credentials: the server is missing its encryption key.</p>;

  return (
    <form onSubmit={submit} className="space-y-5 max-w-[520px]">
      <p className="text-sm text-ink-2">
        Overnight starts Devin sessions <em>in your own Devin organization</em>, against repositories <em>your</em> Devin can already reach. Nothing is shared with other users of
        this instance.
      </p>
      <label className="block">
        <span className="block text-sm font-medium mb-1.5">Organization id</span>
        <input required value={orgId} onChange={(e) => setOrgId(e.target.value)} placeholder="org-…" className={inputClass} autoComplete="off" spellCheck={false} />
        <span className="block text-xs text-ink-3 mt-1.5">Devin → Settings → Service users. Shown next to the key you create.</span>
      </label>
      <label className="block">
        <span className="block text-sm font-medium mb-1.5">Service-user API key</span>
        <input required type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="cog_…" className={inputClass} autoComplete="off" />
        <span className="block text-xs text-ink-3 mt-1.5">
          Create a service user with the <strong>Member</strong> role and generate a key. Verified once, then stored encrypted (AES-256-GCM); only its last four characters are ever
          shown again.
        </span>
      </label>
      <label className="block">
        <span className="block text-sm font-medium mb-1.5">Name (optional)</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Personal" className={inputClass.replace(" font-mono", "")} maxLength={80} />
      </label>
      {error && <p className="text-sm text-bad">{error}</p>}
      <Button type="submit" disabled={busy || !orgId || !apiKey}>
        {busy ? "Verifying…" : "Connect Devin"}
      </Button>
    </form>
  );
}

export function DisconnectButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run() {
    if (!confirm("Disconnect? The stored key is deleted and any running runs of this connection are cancelled.")) return;
    setBusy(true);
    await fetch("/api/connection", { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }
  return (
    <Button variant="danger" onClick={run} disabled={busy}>
      {busy ? "Disconnecting…" : "Disconnect and delete key"}
    </Button>
  );
}

export function RepoListsEditor({ allow, deny }: { allow: string[]; deny: string[] }) {
  const router = useRouter();
  const [a, setA] = useState(allow.join("\n"));
  const [d, setD] = useState(deny.join("\n"));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const lines = (s: string) =>
    s
      .split(/\r?\n|,/)
      .map((x) => x.trim())
      .filter(Boolean);

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/connection", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo_allowlist: lines(a).length ? lines(a) : ["*/*"], repo_denylist: lines(d) }),
    });
    const body = (await res.json()) as { error?: string };
    setBusy(false);
    setMsg(res.ok ? "Saved." : (body.error ?? "Could not save."));
    if (res.ok) router.refresh();
  }

  return (
    <div className="grid sm:grid-cols-2 gap-4 max-w-[640px]">
      <label className="block">
        <span className="block text-sm font-medium mb-1.5">Allow</span>
        <textarea rows={4} value={a} onChange={(e) => setA(e.target.value)} className={inputClass + " text-xs"} placeholder={"*/*\nowner/*\nowner/name"} />
      </label>
      <label className="block">
        <span className="block text-sm font-medium mb-1.5">Deny</span>
        <textarea rows={4} value={d} onChange={(e) => setD(e.target.value)} className={inputClass + " text-xs"} placeholder={"work-org/*"} />
      </label>
      <div className="sm:col-span-2 flex items-center gap-3">
        <Button variant="ghost" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save repository rules"}
        </Button>
        {msg && <span className="text-sm text-ink-2">{msg}</span>}
      </div>
    </div>
  );
}
