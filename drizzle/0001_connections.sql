CREATE TABLE "connections" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"devin_org_id" text NOT NULL,
	"devin_api_key_enc" text NOT NULL,
	"key_hint" text NOT NULL,
	"token_hash" text NOT NULL,
	"repo_allowlist" text[] DEFAULT ARRAY['*/*']::text[] NOT NULL,
	"repo_denylist" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connections_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "runs" DROP CONSTRAINT "runs_repo_owner";--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "connection_id" text;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "runs_connection_idx" ON "runs" USING btree ("connection_id","created_at");--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_repo_shape" CHECK ("runs"."repo" ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$');