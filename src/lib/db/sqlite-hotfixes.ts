import type Database from "better-sqlite3";

/** Idempotent CREATE TABLE for tables added after first local deploy. */
export const SQLITE_TABLE_HOTFIXES = [
  `CREATE TABLE IF NOT EXISTS script_versions (
    id text PRIMARY KEY NOT NULL,
    project_id text NOT NULL,
    version integer NOT NULL,
    script text NOT NULL,
    notes text,
    source text NOT NULL,
    summary text,
    word_count integer DEFAULT 0 NOT NULL,
    created_at integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS script_versions_project_version ON script_versions (project_id, version)`,
] as const;

/** Idempotent ALTERs for columns added after first local deploy. */
export const SQLITE_SCHEMA_HOTFIXES = [
  `ALTER TABLE projects ADD COLUMN script_draft text`,
  `ALTER TABLE projects ADD COLUMN script_draft_notes text`,
  `ALTER TABLE projects ADD COLUMN script_draft_status text DEFAULT 'none' NOT NULL`,
  `ALTER TABLE projects ADD COLUMN script_draft_version integer`,
] as const;

export function applySqliteSchemaHotfixes(sqlite: Database.Database): void {
  for (const sql of SQLITE_TABLE_HOTFIXES) {
    sqlite.exec(sql);
  }

  const existing = new Set(
    (sqlite.prepare(`PRAGMA table_info(projects)`).all() as Array<{ name: string }>).map(
      (c) => c.name,
    ),
  );
  for (const sql of SQLITE_SCHEMA_HOTFIXES) {
    const col = sql.match(/ADD COLUMN (\w+)/i)?.[1];
    if (col && existing.has(col)) continue;
    try {
      sqlite.exec(sql);
      if (col) existing.add(col);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("duplicate column")) continue;
      throw err;
    }
  }
}
