CREATE TABLE "campaign_recipients" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"profile_id" text NOT NULL,
	"profile_updated_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'matched' NOT NULL,
	"message_id" text,
	"submitted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"created_by" text NOT NULL,
	"title" text NOT NULL,
	"offer_text" text NOT NULL,
	"locale" text NOT NULL,
	"status" text DEFAULT 'matching' NOT NULL,
	"sender_id" text,
	"template" jsonb,
	"analysis" jsonb,
	"due_at" timestamp with time zone DEFAULT now(),
	"run_id" text,
	"started_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agencies" ALTER COLUMN "categories" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD COLUMN "campaign_sender" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "analysis_due_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "analysis_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "analysis_error" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "analysis_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "analysis_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "manual_fields" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "shared_profiles" ADD COLUMN "offer_hold" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_profile_id_shared_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."shared_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_sender_id_whatsapp_connections_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."whatsapp_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_recipient_unique" ON "campaign_recipients" USING btree ("campaign_id","profile_id");
--> statement-breakpoint
-- Before automatic analysis, non-default CRM values were entered by staff.
UPDATE "conversations" SET "manual_fields" =
  (CASE WHEN "service" <> 'other' THEN '["service"]'::jsonb ELSE '[]'::jsonb END) ||
  (CASE WHEN "destination" <> '' THEN '["destination"]'::jsonb ELSE '[]'::jsonb END) ||
  (CASE WHEN "inquiry_status" <> 'new' THEN '["inquiryStatus"]'::jsonb ELSE '[]'::jsonb END);
