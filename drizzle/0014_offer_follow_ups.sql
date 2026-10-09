CREATE TABLE "platform_settings" (
 "id" text PRIMARY KEY NOT NULL,
 "business_chat_offers" text DEFAULT 'immediate' NOT NULL,
 "updated_by" text REFERENCES "users"("id"),
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 CONSTRAINT "platform_settings_business_chat_offers" CHECK ("business_chat_offers" IN ('immediate', 'businessFirst'))
);
