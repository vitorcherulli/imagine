ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "music2_url" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "music2_status" text DEFAULT 'none' NOT NULL;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "music2_prompt" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "music2_timeline_start_seconds" real;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "music2_file_start_seconds" real DEFAULT 0 NOT NULL;
