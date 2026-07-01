ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "timeline_free_edit" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "story_blocks" ADD COLUMN IF NOT EXISTS "video_timeline_start" real;
--> statement-breakpoint
ALTER TABLE "story_blocks" ADD COLUMN IF NOT EXISTS "narration_timeline_start" real;
--> statement-breakpoint
ALTER TABLE "story_blocks" ADD COLUMN IF NOT EXISTS "scene_timeline_start" real;
