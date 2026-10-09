CREATE TABLE "recommendation_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"profile_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"trigger_message_id" text NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source_revision" integer NOT NULL,
	"profile_updated_at" timestamp with time zone NOT NULL,
	"source_hash" text,
	"topic" text,
	"campaign_id" text,
	"campaign_hash" text,
	"reason" text,
	"body" text,
	"message_id" text,
	"due_at" timestamp with time zone DEFAULT now(),
	"run_id" text,
	"started_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recommendation_jobs_trigger_message_id_unique" UNIQUE("trigger_message_id")
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "network_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "network_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shared_profiles" ADD COLUMN "blocked_topics" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "recommendation_jobs" ADD CONSTRAINT "recommendation_jobs_profile_id_shared_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."shared_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_jobs" ADD CONSTRAINT "recommendation_jobs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_jobs" ADD CONSTRAINT "recommendation_jobs_trigger_message_id_messages_id_fk" FOREIGN KEY ("trigger_message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_jobs" ADD CONSTRAINT "recommendation_jobs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_jobs" ADD CONSTRAINT "recommendation_jobs_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recommendation_due_idx" ON "recommendation_jobs" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "recommendation_profile_idx" ON "recommendation_jobs" USING btree ("profile_id");