ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "script_language" text DEFAULT 'en' NOT NULL;
