CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'IQD' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_price_nonnegative" CHECK ("products"."price" >= 0),
	CONSTRAINT "product_currency_format" CHECK ("products"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "product_id" text;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_agency_idx" ON "products" USING btree ("agency_id");--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;