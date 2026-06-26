import type postgres from "postgres";

/** Idempotent ALTERs for columns added after first production deploy. */
export const PG_SCHEMA_HOTFIXES = [
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "folder_id" text`,
  `ALTER TABLE "exports" ADD COLUMN IF NOT EXISTS "resolution" text`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "tts_speed" real DEFAULT 1 NOT NULL`,
  `ALTER TABLE "youtube_metadata" ADD COLUMN IF NOT EXISTS "cover_avatar_id" text`,
] as const;

export async function applyPgSchemaHotfixes(client: postgres.Sql): Promise<void> {
  for (const sql of PG_SCHEMA_HOTFIXES) {
    await client.unsafe(sql);
  }
}
