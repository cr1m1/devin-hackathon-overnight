import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Plan §6. Identifiers are used verbatim by routes, the tick and the UI.

export const RUN_STATUSES = ["queued", "running", "complete", "partial", "blocked", "failed", "cancelled"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
export const TERMINAL_RUN_STATUSES: readonly RunStatus[] = ["complete", "partial", "blocked", "failed", "cancelled"];

export const STAGE_ROLES = ["plan", "implement", "review", "amend", "validate"] as const;
export type StageRole = (typeof STAGE_ROLES)[number];

export const STAGE_STATUSES = ["pending", "starting", "running", "done", "failed", "skipped"] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

export const VERDICTS = ["ok", "needs-work", "blocked", "complete"] as const;
export type Verdict = (typeof VERDICTS)[number];

export type PullRequestRef = { url: string; state?: string | null; title?: string | null; stage_id?: string };

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

// A Connection is one user's own Devin credentials (bring-your-own). The key is stored encrypted;
// the browser holds an httpOnly cookie whose sha256 matches token_hash. Nothing is shared between connections.
export const connections = pgTable("connections", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  devinOrgId: text("devin_org_id").notNull(),
  devinApiKeyEnc: text("devin_api_key_enc").notNull(),
  keyHint: text("key_hint").notNull(), // "cog_…ab12"
  tokenHash: text("token_hash").notNull().unique(),
  repoAllowlist: text("repo_allowlist")
    .array()
    .notNull()
    .default(sql`ARRAY['*/*']::text[]`),
  repoDenylist: text("repo_denylist")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  lastVerifiedAt: ts("last_verified_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const runs = pgTable(
  "runs",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id").references(() => connections.id, { onDelete: "set null" }),
    workspaceId: text("workspace_id"),
    goal: text("goal").notNull(),
    repo: text("repo").notNull(),
    templateId: text("template_id").notNull().default("build"),
    status: text("status", { enum: RUN_STATUSES }).notNull().default("queued"),
    outcomeReason: text("outcome_reason"),
    deadlineAt: ts("deadline_at").notNull(),
    acceptanceCriteria: text("acceptance_criteria").array(),
    acuBudget: numeric("acu_budget", { precision: 10, scale: 2, mode: "number" }).notNull(),
    acuSpent: numeric("acu_spent", { precision: 10, scale: 2, mode: "number" }).notNull().default(0),
    stagesCreated: integer("stages_created").notNull().default(0),
    pullRequests: jsonb("pull_requests").$type<PullRequestRef[]>().notNull().default([]),
    summaryMd: text("summary_md"),
    scheduleId: text("schedule_id"),
    againOfRunId: text("again_of_run_id"),
    createdIp: text("created_ip"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("runs_status_deadline_idx").on(t.status, t.deadlineAt),
    index("runs_created_idx").on(t.createdAt),
    index("runs_connection_idx").on(t.connectionId, t.createdAt),
    check("runs_terminal_has_reason", sql`${t.status} IN ('queued','running') OR ${t.outcomeReason} IS NOT NULL`),
    check("runs_repo_shape", sql`${t.repo} ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'`),
  ],
);

export const stages = pgTable(
  "stages",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    role: text("role", { enum: STAGE_ROLES }).notNull(),
    origin: text("origin", { enum: ["template", "edge"] }).notNull(),
    afterStageId: text("after_stage_id"),
    status: text("status", { enum: STAGE_STATUSES }).notNull().default("pending"),
    verdict: text("verdict", { enum: VERDICTS }),
    verdictSeenAt: ts("verdict_seen_at"),
    sessionId: text("session_id"),
    sessionUrl: text("session_url"),
    acuLimit: integer("acu_limit").notNull(),
    acusConsumed: numeric("acus_consumed", { precision: 10, scale: 2, mode: "number" }),
    summary: text("summary"),
    reportMd: text("report_md"),
    handoff: text("handoff"),
    pullRequests: jsonb("pull_requests").$type<PullRequestRef[]>().notNull().default([]),
    error: text("error"),
    nudgedAt: ts("nudged_at"),
    parseAttempts: integer("parse_attempts").notNull().default(0),
    pollCount: integer("poll_count").notNull().default(0),
    startedAt: ts("started_at"),
    finishedAt: ts("finished_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("stages_run_seq_idx").on(t.runId, t.seq),
    index("stages_active_idx")
      .on(t.status)
      .where(sql`${t.status} IN ('starting','running')`),
    // The single most important line in the schema (§6.5): one live Stage per Run.
    uniqueIndex("stages_one_active")
      .on(t.runId)
      .where(sql`${t.status} IN ('starting','running')`),
    uniqueIndex("stages_session_uniq")
      .on(t.sessionId)
      .where(sql`${t.sessionId} IS NOT NULL`),
    check("stages_done_has_verdict", sql`${t.status} <> 'done' OR ${t.verdict} IS NOT NULL`),
  ],
);

export const schedules = pgTable(
  "schedules",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id").references(() => connections.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id"),
    name: text("name").notNull(),
    goal: text("goal").notNull(),
    repo: text("repo").notNull(),
    templateId: text("template_id").notNull().default("build"),
    atHour: integer("at_hour").notNull(),
    atMinute: integer("at_minute").notNull(),
    tz: text("tz").notNull(),
    deadlineHour: integer("deadline_hour").notNull(),
    deadlineMinute: integer("deadline_minute").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    lastFiredOn: date("last_fired_on", { mode: "string" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("schedules_enabled_connection_idx").on(t.enabled, t.connectionId)],
);

// Single row, id = 1, seeded by migration (§6.4). Lease for the tick + last-run bookkeeping.
export const tickLock = pgTable("tick_lock", {
  id: integer("id").primaryKey(),
  lockedUntil: ts("locked_until").notNull(),
  lastRunAt: ts("last_run_at"),
  lastResult: jsonb("last_result").$type<Record<string, unknown>>(),
});

export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
export type Stage = typeof stages.$inferSelect;
export type NewStage = typeof stages.$inferInsert;
export type Schedule = typeof schedules.$inferSelect;
export type NewSchedule = typeof schedules.$inferInsert;
export type Connection = typeof connections.$inferSelect;
