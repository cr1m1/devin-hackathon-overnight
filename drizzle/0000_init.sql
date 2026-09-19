CREATE TABLE "runs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"goal" text NOT NULL,
	"repo" text NOT NULL,
	"template_id" text DEFAULT 'build' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"outcome_reason" text,
	"deadline_at" timestamp with time zone NOT NULL,
	"acceptance_criteria" text[],
	"acu_budget" numeric(10, 2) NOT NULL,
	"acu_spent" numeric(10, 2) DEFAULT 0 NOT NULL,
	"stages_created" integer DEFAULT 0 NOT NULL,
	"pull_requests" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary_md" text,
	"schedule_id" text,
	"again_of_run_id" text,
	"created_ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "runs_terminal_has_reason" CHECK ("runs"."status" IN ('queued','running') OR "runs"."outcome_reason" IS NOT NULL),
	CONSTRAINT "runs_repo_owner" CHECK ("runs"."repo" ~ '^cr1m1/[A-Za-z0-9_.-]+$')
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"name" text NOT NULL,
	"goal" text NOT NULL,
	"repo" text NOT NULL,
	"template_id" text DEFAULT 'build' NOT NULL,
	"at_hour" integer NOT NULL,
	"at_minute" integer NOT NULL,
	"tz" text NOT NULL,
	"deadline_hour" integer NOT NULL,
	"deadline_minute" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_fired_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stages" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"seq" integer NOT NULL,
	"role" text NOT NULL,
	"origin" text NOT NULL,
	"after_stage_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"verdict" text,
	"verdict_seen_at" timestamp with time zone,
	"session_id" text,
	"session_url" text,
	"acu_limit" integer NOT NULL,
	"acus_consumed" numeric(10, 2),
	"summary" text,
	"report_md" text,
	"handoff" text,
	"pull_requests" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"nudged_at" timestamp with time zone,
	"parse_attempts" integer DEFAULT 0 NOT NULL,
	"poll_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stages_done_has_verdict" CHECK ("stages"."status" <> 'done' OR "stages"."verdict" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "tick_lock" (
	"id" integer PRIMARY KEY NOT NULL,
	"locked_until" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_result" jsonb
);
--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "runs_status_deadline_idx" ON "runs" USING btree ("status","deadline_at");--> statement-breakpoint
CREATE INDEX "runs_created_idx" ON "runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "stages_run_seq_idx" ON "stages" USING btree ("run_id","seq");--> statement-breakpoint
CREATE INDEX "stages_active_idx" ON "stages" USING btree ("status") WHERE "stages"."status" IN ('starting','running');--> statement-breakpoint
CREATE UNIQUE INDEX "stages_one_active" ON "stages" USING btree ("run_id") WHERE "stages"."status" IN ('starting','running');--> statement-breakpoint
CREATE UNIQUE INDEX "stages_session_uniq" ON "stages" USING btree ("session_id") WHERE "stages"."session_id" IS NOT NULL;--> statement-breakpoint
INSERT INTO "tick_lock" ("id", "locked_until") VALUES (1, now() - interval '1 minute') ON CONFLICT DO NOTHING;
