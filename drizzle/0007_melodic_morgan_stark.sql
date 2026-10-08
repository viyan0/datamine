CREATE TABLE "customer_consents" (
	"phone" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"locale" text NOT NULL,
	"notice_version" text NOT NULL,
	"notice_at" timestamp with time zone,
	"decision_at" timestamp with time zone,
	"decision_message_id" text,
	"last_inbound_at" timestamp with time zone NOT NULL,
	"reply_connection_id" text NOT NULL,
	"reply_message_id" text NOT NULL,
	"reply_status" text DEFAULT 'queued' NOT NULL,
	"reply_started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_consents_reply_message_id_unique" UNIQUE("reply_message_id")
);
--> statement-breakpoint
ALTER TABLE "shared_profiles" ADD COLUMN "automatic_interests" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_consents" ADD CONSTRAINT "customer_consents_reply_connection_id_whatsapp_connections_id_fk" FOREIGN KEY ("reply_connection_id") REFERENCES "public"."whatsapp_connections"("id") ON DELETE no action ON UPDATE no action;