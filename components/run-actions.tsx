"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui";
import type { RunStatus } from "@/lib/db/schema";

export function RunActions({ runId, status }: { runId: string; status: RunStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const terminal = !["queued", "running"].includes(status);

  async function cancel() {
    if (!confirm("Cancel this run? The active session is put to sleep and nothing further starts.")) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/runs/${runId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }) });
    if (!res.ok) setError(((await res.json()) as { error?: string }).error ?? "Could not cancel.");
    setBusy(false);
    router.refresh();
  }

  async function again() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/runs/${runId}/again`, { method: "POST" });
    const body = (await res.json()) as { run?: { id: string }; error?: string };
    setBusy(false);
    if (!res.ok || !body.run) return setError(body.error ?? "Could not start a new run.");
    router.push(`/runs/${body.run.id}`);
  }

  return (
    <div className="flex items-center gap-3">
      {terminal ? (
        <Button variant="ghost" onClick={again} disabled={busy}>
          Run again
        </Button>
      ) : (
        <Button variant="danger" onClick={cancel} disabled={busy}>
          Cancel run
        </Button>
      )}
      {error && <span className="text-sm text-bad">{error}</span>}
    </div>
  );
}
