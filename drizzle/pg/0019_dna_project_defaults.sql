ALTER TABLE "project_dna" ADD COLUMN IF NOT EXISTS "llm_model" text;
--> statement-breakpoint
ALTER TABLE "project_dna" ADD COLUMN IF NOT EXISTS "image_model" text;
--> statement-breakpoint
ALTER TABLE "project_dna" ADD COLUMN IF NOT EXISTS "video_model" text;
--> statement-breakpoint
ALTER TABLE "project_dna" ADD COLUMN IF NOT EXISTS "video_clip_audio" text;
--> statement-breakpoint
ALTER TABLE "project_dna" ADD COLUMN IF NOT EXISTS "tts_model" text;
--> statement-breakpoint
ALTER TABLE "project_dna" ADD COLUMN IF NOT EXISTS "tts_voice" text;
--> statement-breakpoint
ALTER TABLE "project_dna" ADD COLUMN IF NOT EXISTS "video_format" text;
--> statement-breakpoint
ALTER TABLE "project_dna" ADD COLUMN IF NOT EXISTS "cut_pace" text;
--> statement-breakpoint
ALTER TABLE "project_dna" ADD COLUMN IF NOT EXISTS "script_language" text;
--> statement-breakpoint
ALTER TABLE "project_dna" ADD COLUMN IF NOT EXISTS "target_duration_seconds" integer;
