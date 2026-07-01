ALTER TABLE "project_dna" ADD COLUMN IF NOT EXISTS "genre" text;
--> statement-breakpoint
ALTER TABLE "project_dna" ADD COLUMN IF NOT EXISTS "visual_style" text;
--> statement-breakpoint
ALTER TABLE "project_dna" ADD COLUMN IF NOT EXISTS "voice_tone" text;
--> statement-breakpoint
ALTER TABLE "project_dna" ADD COLUMN IF NOT EXISTS "color_palette" text;
--> statement-breakpoint
ALTER TABLE "project_dna" ADD COLUMN IF NOT EXISTS "visual_mood" text;
