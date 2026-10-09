ALTER TABLE "campaigns" ADD COLUMN "catalog_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "expires_at" timestamp with time zone DEFAULT now() + interval '7 days' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_catalog_product_unique" ON "campaigns" USING btree ("product_id") WHERE "campaigns"."catalog_only" = true;