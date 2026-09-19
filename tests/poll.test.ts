import { describe, expect, it } from "vitest";
import { decidePoll, mergePullRequests } from "@/lib/tick/poll";
import type { SessionResponse } from "@/lib/devin/types";

const now = new Date("2026-09-19T23:00:00Z");
const session = (over: Partial<SessionResponse> = {}): SessionResponse => ({
  session_id: "abc",
  url: "https://app.devin.ai/sessions/abc",
  title: null,
  status: "running",
  status_detail: "working",
  structured_output: null,
  pull_requests: [],
  acus_consumed: 1.5,
  tags: [],
  created_at: 0,
  updated_at: 0,
  is_archived: false,
  playbook_id: null,
  ...over,
});
const stage = (over: Partial<Parameters<typeof decidePoll>[0]["stage"]> = {}) => ({ nudgedAt: null, parseAttempts: 0, role: "implement" as const, pullRequests: [], ...over });
const good = { verdict: "ok", summary: "s", report_md: "r" };

describe("decidePoll — completion is defined by output, not state (ADR-0003)", () => {
  it("completes when output parses, whatever the status", () => {
    for (const st of [
      session({ structured_output: good }),
      session({ status: "running", status_detail: "waiting_for_user", structured_output: good }),
      session({ status: "exit", status_detail: null, structured_output: good }),
    ]) {
      expect(decidePoll({ stage: stage(), session: st, acceptanceRole: "validate", now })).toMatchObject({ kind: "complete", verdict: "ok" });
    }
  });

  it("downgrades complete from a non-acceptance role", () => {
    const a = decidePoll({ stage: stage({ role: "implement" }), session: session({ structured_output: { ...good, verdict: "complete" } }), acceptanceRole: "validate", now });
    expect(a).toMatchObject({ kind: "complete", verdict: "ok", downgraded: true });
    const b = decidePoll({ stage: stage({ role: "validate" }), session: session({ structured_output: { ...good, verdict: "complete" } }), acceptanceRole: "validate", now });
    expect(b).toMatchObject({ kind: "complete", verdict: "complete", downgraded: false });
  });

  it("working states stay working", () => {
    for (const s of [
      session({ status: "new", status_detail: null }),
      session({ status: "claimed", status_detail: null }),
      session(),
      session({ status: "resuming", status_detail: null }),
    ]) {
      expect(decidePoll({ stage: stage(), session: s, acceptanceRole: "validate", now })).toEqual({ kind: "working" });
    }
  });

  it("idle without output: nudge once, wait, then give up as blocked", () => {
    const idle = session({ status_detail: "waiting_for_user" });
    expect(decidePoll({ stage: stage(), session: idle, acceptanceRole: "validate", now })).toMatchObject({ kind: "nudge" });
    const nudgedRecently = stage({ nudgedAt: new Date(now.getTime() - 30_000) });
    expect(decidePoll({ stage: nudgedRecently, session: idle, acceptanceRole: "validate", now })).toEqual({ kind: "working" });
    const nudgedLongAgo = stage({ nudgedAt: new Date(now.getTime() - 3 * 60_000) });
    expect(decidePoll({ stage: nudgedLongAgo, session: idle, acceptanceRole: "validate", now })).toMatchObject({ kind: "give-up", verdict: "blocked" });
  });

  it("credit/usage suspension is fatal for the run with the reason verbatim", () => {
    const a = decidePoll({ stage: stage(), session: session({ status: "suspended", status_detail: "out_of_credits" }), acceptanceRole: "validate", now });
    expect(a).toEqual({ kind: "failed", error: "out_of_credits", fatalForRun: true });
  });

  it("other suspensions / exits fail the stage only", () => {
    expect(decidePoll({ stage: stage(), session: session({ status: "suspended", status_detail: "inactivity" }), acceptanceRole: "validate", now })).toMatchObject({
      kind: "failed",
      fatalForRun: false,
    });
    expect(decidePoll({ stage: stage(), session: session({ status: "error", status_detail: null }), acceptanceRole: "validate", now })).toMatchObject({
      kind: "failed",
      fatalForRun: false,
    });
  });

  it("garbage output while idle/exited is 'malformed' with an attempt counter", () => {
    const s = session({ status_detail: "finished", structured_output: { nonsense: true } });
    expect(decidePoll({ stage: stage({ parseAttempts: 1 }), session: s, acceptanceRole: "validate", now })).toEqual({ kind: "malformed", attempts: 2 });
  });
});

describe("mergePullRequests", () => {
  it("unions by url, preferring output titles and session states", () => {
    const merged = mergePullRequests(
      [{ url: "https://github.com/cr1m1/x/pull/1", state: "open" }],
      [{ url: "https://github.com/cr1m1/x/pull/1/", title: "Fix" }, { url: "https://github.com/cr1m1/x/pull/2" }],
      [{ pr_url: "https://github.com/cr1m1/x/pull/2", pr_state: "open" }],
    );
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ title: "Fix", state: "open" });
    expect(merged[1]).toMatchObject({ url: "https://github.com/cr1m1/x/pull/2", state: "open" });
  });
});
