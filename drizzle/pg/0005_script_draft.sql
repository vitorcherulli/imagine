ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "script_draft" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "script_draft_notes" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "script_draft_status" text DEFAULT 'none' NOT NULL;
