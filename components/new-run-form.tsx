"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "./ui";
import type { RepoOption } from "@/lib/devin/repos";
import { ROLE_COLOR } from "@/lib/flow/role-colors";
import type { StageRole } from "@/lib/db/schema";

function defaultDeadline(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NewRunForm({ chain }: { chain: string[] }) {
  const router = useRouter();
  const [goal, setGoal] = useState("");
  const [repo, setRepo] = useState("");
  const [deadline, setDeadline] = useState(defaultDeadline);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, repo, deadline_at: new Date(deadline).toISOString() }),
      });
      const body = (await res.json()) as { run?: { id: string }; error?: string; issues?: { message: string }[] };
      if (!res.ok || !body.run) {
        setError(body.error ?? body.issues?.[0]?.message ?? "Could not create the run.");
        return;
      }
      router.push(`/runs/${body.run.id}`);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-7">
      <Field label="Goal" hint="One task, stated like you would to a colleague. A ticket key works if Jira is connected in Devin.">
        <textarea
          autoFocus
          required
          minLength={8}
          maxLength={8000}
          rows={5}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Fix the date-range filter that drops the last day of the range, add a regression test, keep the API unchanged."
          className={inputClass + " resize-y leading-relaxed"}
        />
      </Field>

      <Field label="Repository" hint="Only repositories this instance is allowed to work in are listed.">
        <RepoPicker value={repo} onChange={setRepo} />
      </Field>

      <Field label="Deadline" hint="Hard stop. Nothing starts that cannot finish in time; a running stage is wrapped up at the deadline.">
        <input type="datetime-local" required value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputClass + " font-mono text-sm max-w-[260px]"} />
      </Field>

      <div className="pt-2 border-t border-rule">
        <p className="text-xs text-ink-3 mb-4">
          Will run{" "}
          {chain.map((t, i) => (
            <span key={t}>
              <span className={`font-medium ${ROLE_COLOR[t.toLowerCase() as StageRole].text}`}>{t}</span>
              {i < chain.length - 1 ? " → " : ""}
            </span>
          ))}
          . Review may insert <span className={`font-medium ${ROLE_COLOR.amend.text}`}>Amend</span> rounds. Each stage is a separate Devin session.
        </p>
        {error && <p className="text-sm text-bad mb-3">{error}</p>}
        <Button type="submit" disabled={submitting || !repo || goal.trim().length < 8}>
          {submitting ? "Starting…" : "Start the run"}
        </Button>
      </div>
    </form>
  );
}

const inputClass = "w-full rounded-md border border-rule bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:border-ink";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-xs text-ink-3 mt-1.5">{hint}</span>}
    </label>
  );
}

function RepoPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [repos, setRepos] = useState<RepoOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/repos")
      .then(async (r) => {
        const b = (await r.json()) as { repos: RepoOption[]; error?: string };
        if (cancelled) return;
        if (!r.ok) setLoadError(b.error ?? "Could not load repositories.");
        setRepos(b.repos ?? []);
      })
      .catch(() => !cancelled && setLoadError("Could not load repositories."));
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => (repos ?? []).filter((r) => r.path.toLowerCase().includes(q.toLowerCase())).slice(0, 12), [repos, q]);

  if (loadError) return <p className="text-sm text-bad">{loadError}</p>;
  if (repos === null) return <div className={inputClass + " text-ink-3"}>Loading repositories…</div>;
  if (repos.length === 0) return <p className="text-sm text-ink-3">No allowed repositories are reachable. Check the Devin GitHub connection and the allowlist in Settings.</p>;

  return (
    <div className="relative">
      <input
        type="text"
        value={open ? q : value || q}
        onFocus={() => {
          setOpen(true);
          setQ("");
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => setQ(e.target.value)}
        placeholder="owner/name"
        className={inputClass + " font-mono text-sm"}
        aria-autocomplete="list"
      />
      {open && (
        <ul className="absolute z-10 mt-1 w-full max-h-72 overflow-auto rounded-md border border-rule bg-white py-1">
          {filtered.length === 0 && <li className="px-3 py-2 text-sm text-ink-3">No match.</li>}
          {filtered.map((r) => (
            <li key={r.path}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(r.path);
                  setQ("");
                  setOpen(false);
                }}
                className={clsx("w-full text-left px-3 py-2 hover:bg-paper-2 flex items-baseline justify-between gap-3", r.path === value && "bg-paper-2")}
              >
                <span className="font-mono text-sm">{r.path}</span>
                <span className="text-xs text-ink-3 truncate">{r.language ?? ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
