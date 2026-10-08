CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"contact_phone" text NOT NULL,
	"name" text NOT NULL,
	"service" text DEFAULT 'other' NOT NULL,
	"destination" text DEFAULT '' NOT NULL,
	"inquiry_status" text DEFAULT 'new' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"last_inbound_at" timestamp with time zone NOT NULL,
	"last_message_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "provider_message_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "request_id" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "delivery_status" text DEFAULT 'received' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_connection_id_whatsapp_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."whatsapp_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_contact_unique" ON "conversations" USING btree ("connection_id","contact_phone");--> statement-breakpoint
CREATE INDEX "conversation_agency_idx" ON "conversations" USING btree ("agency_id","last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "message_request_unique" ON "messages" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "message_thread_idx" ON "messages" USING btree ("connection_id","contact_phone","provider_timestamp");
--> statement-breakpoint
INSERT INTO conversations (id, agency_id, connection_id, contact_phone, name, last_inbound_at, last_message_at)
SELECT min(id), agency_id, connection_id, contact_phone, contact_phone,
       max(provider_timestamp), max(provider_timestamp)
FROM messages WHERE direction = 'inbound'
GROUP BY agency_id, connection_id, contact_phone
ON CONFLICT (connection_id, contact_phone) DO NOTHING;
