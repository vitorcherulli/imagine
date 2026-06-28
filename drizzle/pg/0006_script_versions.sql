CREATE TABLE IF NOT EXISTS "script_versions" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "version" integer NOT NULL,
  "script" text NOT NULL,
  "notes" text,
  "source" text NOT NULL,
  "summary" text,
  "word_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "script_versions_project_version" ON "script_versions" ("project_id", "version");
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "script_draft_version" integer;
