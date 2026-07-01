ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "video_clip_audio" text DEFAULT 'default' NOT NULL;
