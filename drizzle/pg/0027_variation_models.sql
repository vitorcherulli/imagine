ALTER TABLE "variation_sets" ADD COLUMN IF NOT EXISTS "image_model" text;
--> statement-breakpoint
ALTER TABLE "variation_sets" ADD COLUMN IF NOT EXISTS "video_model" text;
--> statement-breakpoint
ALTER TABLE "variation_items" ADD COLUMN IF NOT EXISTS "image_model" text;
--> statement-breakpoint
ALTER TABLE "variation_items" ADD COLUMN IF NOT EXISTS "video_model" text;
