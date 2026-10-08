CREATE TABLE "enrollment_links" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"code_hash" text,
	"code_expires_at" timestamp with time zone,
	"code_sent_at" timestamp with time zone,
	"sends" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"verified_at" timestamp with time zone,
	"session_hash" text,
	"session_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrollment_links_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "enrollment_links_session_hash_unique" UNIQUE("session_hash")
);
--> statement-breakpoint
CREATE TABLE "profile_events" (
	"id" text PRIMARY KEY NOT NULL,
	"profile_id" text NOT NULL,
	"action" text NOT NULL,
	"notice_version" text NOT NULL,
	"locale" text NOT NULL,
	"channel" text DEFAULT 'customer_portal' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"name" text NOT NULL,
	"language" text NOT NULL,
	"destination" text DEFAULT '' NOT NULL,
	"interests" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"consent_version" text NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shared_profiles_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
ALTER TABLE "enrollment_links" ADD CONSTRAINT "enrollment_links_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_events" ADD CONSTRAINT "profile_events_profile_id_shared_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."shared_profiles"("id") ON DELETE no action ON UPDATE no action;