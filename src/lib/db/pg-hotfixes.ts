import type postgres from "postgres";

/** Idempotent ALTERs for columns added after first production deploy. */
export const PG_SCHEMA_HOTFIXES = [
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "folder_id" text`,
  `ALTER TABLE "exports" ADD COLUMN IF NOT EXISTS "resolution" text`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "tts_speed" real DEFAULT 1 NOT NULL`,
  `ALTER TABLE "youtube_metadata" ADD COLUMN IF NOT EXISTS "cover_avatar_id" text`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "script_draft" text`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "script_draft_notes" text`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "script_draft_status" text DEFAULT 'none' NOT NULL`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "script_draft_version" integer`,
  `CREATE TABLE IF NOT EXISTS "script_versions" (
    "id" text PRIMARY KEY NOT NULL,
    "project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
    "version" integer NOT NULL,
    "script" text NOT NULL,
    "notes" text,
    "source" text NOT NULL,
    "summary" text,
    "word_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "script_versions_project_version" ON "script_versions" ("project_id", "version")`,
] as const;

export async function applyPgSchemaHotfixes(client: postgres.Sql): Promise<void> {
  for (const sql of PG_SCHEMA_HOTFIXES) {
    await client.unsafe(sql);
  }
}
