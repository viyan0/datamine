ALTER TABLE "recommendation_jobs" ADD COLUMN "waiting_for_offer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "recommendation_jobs" ADD COLUMN "notice_message_id" text REFERENCES "messages"("id");--> statement-breakpoint
ALTER TABLE "recommendation_jobs" ADD COLUMN "offer_check_hash" text;
