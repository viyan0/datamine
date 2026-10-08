ALTER TABLE "conversations" ADD COLUMN "analysis" jsonb;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "analysis_run_id" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "analysis_started_at" timestamp with time zone;