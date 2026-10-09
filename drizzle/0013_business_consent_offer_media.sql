ALTER TABLE "products" ADD COLUMN "contact_phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "image_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "contact_phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "image_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "recommendation_jobs" ADD COLUMN "image_url" text;--> statement-breakpoint
CREATE TABLE "consent_invitations" (
 "phone" text PRIMARY KEY NOT NULL,
 "connection_id" text NOT NULL REFERENCES "whatsapp_connections"("id"),
 "locale" text NOT NULL,
 "message_id" text NOT NULL UNIQUE,
 "status" text DEFAULT 'queued' NOT NULL,
 "last_inbound_at" timestamp with time zone NOT NULL,
 "started_at" timestamp with time zone,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
WITH verified AS (
 SELECT DISTINCT ON (agency_id) agency_id, regexp_replace(display_phone, '[^0-9]', '', 'g') phone
 FROM whatsapp_connections
 WHERE verified_at IS NOT NULL AND regexp_replace(display_phone, '[^0-9]', '', 'g') ~ '^[1-9][0-9]{7,14}$'
 ORDER BY agency_id, verified_at DESC
)
UPDATE products SET contact_phone=verified.phone FROM verified WHERE products.agency_id=verified.agency_id AND products.contact_phone='';--> statement-breakpoint
WITH verified AS (
 SELECT DISTINCT ON (agency_id) agency_id, regexp_replace(display_phone, '[^0-9]', '', 'g') phone
 FROM whatsapp_connections
 WHERE verified_at IS NOT NULL AND regexp_replace(display_phone, '[^0-9]', '', 'g') ~ '^[1-9][0-9]{7,14}$'
 ORDER BY agency_id, verified_at DESC
)
UPDATE campaigns SET contact_phone=verified.phone FROM verified WHERE campaigns.agency_id=verified.agency_id AND campaigns.contact_phone='';
