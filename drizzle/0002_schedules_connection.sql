ALTER TABLE "schedules" ADD COLUMN "connection_id" text;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "schedules_enabled_connection_idx" ON "schedules" USING btree ("enabled","connection_id");