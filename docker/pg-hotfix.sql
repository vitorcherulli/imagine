-- Run manually on production Postgres if migrations did not apply:
-- psql "$DATABASE_URL" -f docker/pg-hotfix.sql

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "folder_id" text;
ALTER TABLE "exports" ADD COLUMN IF NOT EXISTS "resolution" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "tts_speed" real DEFAULT 1 NOT NULL;
ALTER TABLE "youtube_metadata" ADD COLUMN IF NOT EXISTS "cover_avatar_id" text;
