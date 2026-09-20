"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button, Mono, Pill } from "./ui";
import { inputClass, RepoPicker } from "./new-run-form";
import type { Schedule } from "@/lib/db/schema";
import { pad2 } from "@/lib/schedules/time";

// Settings → Schedules (§13.4): a list, not cards; mono for times and repos.

type ApiError = { error?: string; issues?: { message: string }[] };
const errorOf = (b: ApiError, fallback: string) => b.error ?? b.issues?.[0]?.message ?? fallback;

export function SchedulesSection({ schedules }: { schedules: Schedule[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function patch(id: string, body: { enabled: boolean }) {
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/schedules/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) setError(errorOf((await res.json()) as ApiError, "Could not update the schedule."));
    setBusy(null);
    router.refresh();
  }

  async function remove(s: Schedule) {
    if (!confirm(`Delete schedule “${s.name}”? Runs it already started are kept.`)) return;
    setBusy(s.id);
    setError(null);
    const res = await fetch(`/api/schedules/${s.id}`, { method: "DELETE" });
    if (!res.ok) setError(errorOf((await res.json()) as ApiError, "Could not delete the schedule."));
    setBusy(null);
    router.refresh();
  }

  return (
    <div>
      {schedules.length === 0 ? (
        <p className="text-sm text-ink-3 py-3 border-b border-rule">
          No schedules. A schedule starts a run every day at a wall-clock time and gives it a deadline the same or next day.
        </p>
      ) : (
        <ul>
          {schedules.map((s) => (
            <li key={s.id} className="py-2.5 border-b border-rule text-sm grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={clsx("font-medium", !s.enabled && "text-ink-3")}>{s.name}</span>
                  <Pill tone={s.enabled ? "ok" : "mute"}>{s.enabled ? "enabled" : "disabled"}</Pill>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                  <Mono className="text-ink">{s.repo}</Mono>
                  <Mono>
                    at {pad2(s.atHour)}:{pad2(s.atMinute)} {s.tz} → deadline {pad2(s.deadlineHour)}:{pad2(s.deadlineMinute)}
                  </Mono>
                  <Mono>{s.lastFiredOn ? `last fired ${s.lastFiredOn}` : "never fired"}</Mono>
                </div>
                <p className="text-xs text-ink-2 mt-1 line-clamp-2">{s.goal}</p>
              </div>
              <div className="flex items-start gap-2">
                <Button variant="ghost" className="h-8 px-3 text-xs" disabled={busy === s.id} onClick={() => patch(s.id, { enabled: !s.enabled })}>
                  {s.enabled ? "Disable" : "Enable"}
                </Button>
                <Button variant="danger" className="h-8 px-3 text-xs" disabled={busy === s.id} onClick={() => remove(s)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-bad mt-3">{error}</p>}
      <div className="pt-4">
        {creating ? (
          <NewScheduleForm
            onDone={() => {
              setCreating(false);
              router.refresh();
            }}
            onCancel={() => setCreating(false)}
          />
        ) : (
          <Button variant="ghost" onClick={() => setCreating(true)}>
            New schedule
          </Button>
        )}
      </div>
    </div>
  );
}

const browserTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

function NewScheduleForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [repo, setRepo] = useState("");
  const [at, setAt] = useState("22:00");
  const [deadline, setDeadline] = useState("08:00");
  const [tz, setTz] = useState(browserTz);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const split = (hhmm: string) => hhmm.split(":").map(Number) as [number, number];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const [at_hour, at_minute] = split(at);
      const [deadline_hour, deadline_minute] = split(deadline);
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, goal, repo, at_hour, at_minute, deadline_hour, deadline_minute, tz }),
      });
      if (!res.ok) {
        setError(errorOf((await res.json()) as ApiError, "Could not create the schedule."));
        return;
      }
      onDone();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 max-w-[60ch]">
      <label className="block">
        <span className="block text-sm font-medium mb-1.5">Name</span>
        <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nightly triage" className={inputClass} />
      </label>
      <label className="block">
        <span className="block text-sm font-medium mb-1.5">Goal</span>
        <textarea required minLength={8} maxLength={8000} rows={3} value={goal} onChange={(e) => setGoal(e.target.value)} className={inputClass + " resize-y"} />
      </label>
      <label className="block">
        <span className="block text-sm font-medium mb-1.5">Repository</span>
        <RepoPicker value={repo} onChange={setRepo} />
      </label>
      <div className="grid grid-cols-3 gap-3">
        <label className="block">
          <span className="block text-sm font-medium mb-1.5">Starts at</span>
          <input type="time" required value={at} onChange={(e) => setAt(e.target.value)} className={inputClass + " font-mono"} />
        </label>
        <label className="block">
          <span className="block text-sm font-medium mb-1.5">Deadline</span>
          <input type="time" required value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputClass + " font-mono"} />
        </label>
        <label className="block">
          <span className="block text-sm font-medium mb-1.5">Time zone</span>
          <input required value={tz} onChange={(e) => setTz(e.target.value)} className={inputClass + " font-mono"} placeholder="Europe/Budapest" />
        </label>
      </div>
      <p className="text-xs text-ink-3">Fires once per day at the start time; the deadline is the next occurrence of that wall-clock time (today or tomorrow).</p>
      {error && <p className="text-sm text-bad">{error}</p>}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting || !repo || goal.trim().length < 8 || !name.trim()}>
          {submitting ? "Saving…" : "Create schedule"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
