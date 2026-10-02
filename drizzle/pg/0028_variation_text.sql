ALTER TABLE "variation_sets" ADD COLUMN IF NOT EXISTS "text_mode" text DEFAULT 'keep' NOT NULL;
--> statement-breakpoint
ALTER TABLE "variation_sets" ADD COLUMN IF NOT EXISTS "custom_text" text;
--> statement-breakpoint
ALTER TABLE "variation_items" ADD COLUMN IF NOT EXISTS "headline" text;
