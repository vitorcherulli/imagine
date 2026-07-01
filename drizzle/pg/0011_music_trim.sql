ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "music_start_seconds" real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "music_span_seconds" real;
