import { neonConfig } from "@neondatabase/serverless";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localParts, nextDeadline } from "@/lib/schedules/time";
import { FakeDevin } from "./fake-devin/server";

// Plan §16.3. Needs a real Postgres reachable through the Neon HTTP driver (a Neon branch):
//   TEST_DATABASE_URL=postgresql://… npm test -- tests/tick.test.ts
// or a local Postgres behind a Neon-compatible HTTP proxy (e.g. ghcr.io/timowilhelm/local-neon-http-proxy):
//   TEST_DATABASE_URL=postgres://postgres:postgres@pg:5432/overnight TEST_NEON_HTTP_ENDPOINT=http://localhost:4444/sql npm test -- tests/tick.test.ts
// Without TEST_DATABASE_URL the whole file is skipped.

const TEST_URL = process.env.TEST_DATABASE_URL;
const ORG = "org-fakefakefake0001";
const KEY = "cog_fake_key_for_integration_tests_only";
const REPO = "cr1m1/lalafo-stats";

type Mods = {
  db: typeof import("@/lib/db/client").db;
  schema: typeof import("@/lib/db/schema");
  runTick: typeof import("@/lib/tick/tick").runTick;
  createRun: typeof import("@/lib/runs/create").createRun;
  createSchedule: typeof import("@/lib/schedules/store").createSchedule;
  connect: typeof import("@/lib/connections").connect;
  getRunWithStages: typeof import("@/lib/runs/queries").getRunWithStages;
};

describe.skipIf(!TEST_URL)("tick integration (fake Devin + TEST_DATABASE_URL)", () => {
  const fake = new FakeDevin({ orgId: ORG, apiKey: KEY, repos: [REPO] });
  let m: Mods;
  let connection: import("@/lib/db/schema").Connection;
  // Simulated clock: starts now, moves one minute per tick so the lease (released with DB now()) never blocks.
  let clock = new Date();
  const minute = () => (clock = new Date(clock.getTime() + 60_000));

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    if (process.env.TEST_NEON_HTTP_ENDPOINT) neonConfig.fetchEndpoint = process.env.TEST_NEON_HTTP_ENDPOINT;
    process.env.ENCRYPTION_KEY ??= "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.DEVIN_API_BASE = await fake.start();

    const [{ db }, schema, { runTick }, { createRun }, { createSchedule }, { connect }, { getRunWithStages }] = await Promise.all([
      import("@/lib/db/client"),
      import("@/lib/db/schema"),
      import("@/lib/tick/tick"),
      import("@/lib/runs/create"),
      import("@/lib/schedules/store"),
      import("@/lib/connections"),
      import("@/lib/runs/queries"),
    ]);
    m = { db, schema, runTick, createRun, createSchedule, connect, getRunWithStages };

    const { migrate } = await import("drizzle-orm/neon-http/migrator");
    await migrate(db, { migrationsFolder: "./drizzle" });
    await db.execute(sql`TRUNCATE TABLE stages, runs, schedules, connections`);
    await db.execute(sql`UPDATE tick_lock SET locked_until = now() - interval '1 minute'`);

    connection = (await m.connect({ name: "test", orgId: ORG, apiKey: KEY })).connection;
  }, 60_000);

  afterAll(async () => {
    await fake.stop();
  });

  async function tick() {
    const r = await m.runTick(m.db, minute());
    expect(r.ticked, `tick should run: ${r.reason ?? ""}`).toBe(true);
    return r;
  }

  const hoursAhead = (h: number) => new Date(clock.getTime() + h * 3_600_000);

  it("drives the §16.3 happy path to a complete Run", async () => {
    const { run } = await m.createRun({ goal: "Ship the integration test happy path", repo: REPO, deadline_at: hoursAhead(8), template_id: "build" }, connection, {}, clock);
    let data = await m.getRunWithStages(run.id, connection.id);
    expect(data!.stages.map((s) => s.role)).toEqual(["plan", "implement", "review", "validate"]);
    expect(data!.stages.every((s) => s.status === "pending")).toBe(true);

    // Creates arrive in this order: plan, implement, review, amend, review, validate.
    fake.plan(
      { kind: "finish-with", verdict: "ok", output: { acceptance_criteria: ["Endpoint returns 200", "README updated"] } },
      { kind: "finish-with", verdict: "ok", output: { pull_requests: [{ url: "https://github.com/cr1m1/lalafo-stats/pull/1", title: "Ship it" }] } },
      { kind: "finish-with", verdict: "needs-work" },
      { kind: "finish-with", verdict: "ok" },
      { kind: "finish-with", verdict: "ok" },
      { kind: "finish-with", verdict: "complete", output: { report_md: "1. PASS — 200 observed\n2. PASS — README section present" } },
    );

    // Tick 1: plan starts.
    let r = await tick();
    expect(r.started).toBe(1);
    data = await m.getRunWithStages(run.id, connection.id);
    expect(data!.run.status).toBe("running");
    expect(data!.stages[0]).toMatchObject({ role: "plan", status: "running" });
    expect(data!.stages[0].sessionId).toBeTruthy();

    // Tick 2: plan done (criteria written), implement starts.
    r = await tick();
    expect(r.polled).toBe(1);
    data = await m.getRunWithStages(run.id, connection.id);
    expect(data!.run.acceptanceCriteria).toEqual(["Endpoint returns 200", "README updated"]);
    expect(data!.stages.find((s) => s.role === "implement")?.status).toBe("running");

    // Tick 3: implement done with a PR, review starts.
    await tick();
    data = await m.getRunWithStages(run.id, connection.id);
    expect(data!.run.pullRequests.map((p) => p.url)).toEqual(["https://github.com/cr1m1/lalafo-stats/pull/1"]);

    // Tick 4: review needs-work → amend, review inserted; validate re-gated; amend starts.
    await tick();
    data = await m.getRunWithStages(run.id, connection.id);
    expect(data!.stages.map((s) => s.role)).toEqual(["plan", "implement", "review", "amend", "review", "validate"]);
    expect(data!.stages.find((s) => s.role === "amend")?.status).toBe("running");

    // Ticks 5–7: amend ok → review#2 ok → validate complete.
    await tick();
    await tick();
    await tick();
    data = await m.getRunWithStages(run.id, connection.id);
    expect(data!.stages.map((s) => s.status)).toEqual(["done", "done", "done", "done", "done", "done"]);
    expect(data!.run.status).toBe("complete");
    expect(data!.run.summaryMd).toContain("**Acceptance criteria:** 2 passed / 2");
    expect((data!.run.summaryMd!.match(/^## /gm) ?? []).length).toBe(6);

    expect(fake.creates).toHaveLength(6);
    expect(fake.creates.every((c) => c.repos?.[0] === REPO)).toBe(true);
    expect(fake.violations).toEqual([]);
  }, 120_000);

  it("leaves a rate-limited Stage pending and terminates after 30 minutes of 429s", async () => {
    const { run } = await m.createRun({ goal: "Rate limited run for the integration test", repo: REPO, deadline_at: hoursAhead(8), template_id: "build" }, connection, {}, clock);
    fake.plan({ kind: "rate-limit" });
    await tick();
    let data = await m.getRunWithStages(run.id, connection.id);
    expect(data!.stages[0]).toMatchObject({ role: "plan", status: "pending" });
    expect(data!.stages[0].rateLimitedSince).toBeInstanceOf(Date);

    fake.plan({ kind: "rate-limit" });
    clock = new Date(clock.getTime() + 31 * 60_000);
    await tick();
    data = await m.getRunWithStages(run.id, connection.id);
    expect(data!.run).toMatchObject({ status: "failed", outcomeReason: "rate limited" });
    expect(data!.stages[0].status).toBe("failed");
    expect(fake.violations).toEqual([]);
  }, 60_000);

  it("refuses a Run whose deadline is too close before starting implement", async () => {
    const { run } = await m.createRun({ goal: "Deadline too close for the implement stage", repo: REPO, deadline_at: new Date(clock.getTime() + 40 * 60_000), template_id: "build" }, connection, {}, clock);
    fake.plan({ kind: "finish-with", verdict: "ok" });
    await tick(); // plan starts (30 min estimate fits)
    await tick(); // plan done; implement needs 90 min → terminate
    const data = await m.getRunWithStages(run.id, connection.id);
    expect(data!.run.status).toBe("failed");
    expect(data!.run.outcomeReason).toMatch(/deadline/);
    expect(data!.stages.find((s) => s.role === "implement")?.status).toBe("skipped");
  }, 60_000);

  it("fires an enabled schedule once per local day and never fires a disabled schedule", async () => {
    const start = localParts(clock, "UTC");
    if (start.hour === 23 && start.minute >= 57) clock = new Date(clock.getTime() + 5 * 60_000);
    const target = new Date(clock.getTime() + 2 * 60_000);
    const p = localParts(target, "UTC");
    const deadline = localParts(new Date(target.getTime() + 3 * 3_600_000), "UTC");
    const timing = {
      at_hour: p.hour,
      at_minute: p.minute,
      tz: "UTC",
      deadline_hour: deadline.hour,
      deadline_minute: deadline.minute,
      goal: "Run the scheduled integration scenario",
      repo: REPO,
      template_id: "build",
    } as const;
    const a = await m.createSchedule({ ...timing, enabled: true, name: "fires" }, connection, clock);
    expect(a.lastFiredOn).toBeNull();
    const b = await m.createSchedule({ ...timing, enabled: false, name: "disabled" }, connection, clock);

    let r = await tick();
    expect(r.fired).toBe(0);
    r = await tick();
    expect(r.fired).toBe(1);
    const at = clock;
    let aRuns = await m.db.select().from(m.schema.runs).where(eq(m.schema.runs.scheduleId, a.id));
    expect(aRuns).toHaveLength(1);
    expect(aRuns[0].deadlineAt).toEqual(nextDeadline(a, at));
    const [firedA] = await m.db.select().from(m.schema.schedules).where(eq(m.schema.schedules.id, a.id));
    expect(firedA.lastFiredOn).toBe(p.date);

    r = await tick();
    expect(r.fired).toBe(0);
    aRuns = await m.db.select().from(m.schema.runs).where(eq(m.schema.runs.scheduleId, a.id));
    expect(aRuns).toHaveLength(1);
    expect(await m.db.select().from(m.schema.runs).where(eq(m.schema.runs.scheduleId, b.id))).toHaveLength(0);
    expect(fake.violations).toEqual([]);
  }, 60_000);
});
