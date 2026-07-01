ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "tts_voice_settings" text DEFAULT '{}' NOT NULL;
