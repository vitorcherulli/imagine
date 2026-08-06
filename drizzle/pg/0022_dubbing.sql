-- Dubbing feature (Postgres): adds project fields + 3 new tables.

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "dub_target_language" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "dub_background_gain" real NOT NULL DEFAULT 0;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "dub_use_voice_clone" boolean NOT NULL DEFAULT false;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "dub_cloned_voice_id" text;

CREATE TABLE IF NOT EXISTS "dubbing_sources" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL UNIQUE REFERENCES "projects"("id") ON DELETE cascade,
  "source_type" text NOT NULL,
  "source_url" text NOT NULL,
  "extracted_audio_url" text,
  "original_filename" text,
  "mime_type" text,
  "size_bytes" integer,
  "duration_seconds" real,
  "detected_language" text,
  "transcript_engine" text,
  "transcribed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "dubbing_segments" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "position" integer NOT NULL,
  "start_seconds" real NOT NULL,
  "end_seconds" real NOT NULL,
  "source_text" text NOT NULL DEFAULT '',
  "source_language" text,
  "translated_text" text NOT NULL DEFAULT '',
  "target_language" text,
  "tts_audio_url" text,
  "tts_duration_seconds" real,
  "tts_model" text,
  "tts_voice" text,
  "stretch_ratio" real,
  "status" text NOT NULL DEFAULT 'pending',
  "error_message" text,
  "speaker_id" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "dubbing_segments_project_position"
  ON "dubbing_segments" ("project_id", "position");

CREATE TABLE IF NOT EXISTS "dubbing_renders" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "kind" text NOT NULL,
  "url" text NOT NULL,
  "target_language" text,
  "background_gain" real NOT NULL DEFAULT 0,
  "duration_seconds" real,
  "size_bytes" integer,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "dubbing_renders_project_created"
  ON "dubbing_renders" ("project_id", "created_at" DESC);
