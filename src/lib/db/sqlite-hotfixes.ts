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
  `CREATE TABLE IF NOT EXISTS media_library_folders (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL,
    parent_id text,
    name text NOT NULL,
    position integer DEFAULT 0 NOT NULL,
    created_at integer DEFAULT (unixepoch()) NOT NULL,
    updated_at integer DEFAULT (unixepoch()) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS media_library_assets (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL,
    folder_id text,
    name text NOT NULL,
    url text NOT NULL,
    mime_type text DEFAULT 'image/jpeg' NOT NULL,
    kind text DEFAULT 'image' NOT NULL,
    source text DEFAULT 'upload' NOT NULL,
    project_id text,
    block_id text,
    created_at integer DEFAULT (unixepoch()) NOT NULL,
    updated_at integer DEFAULT (unixepoch()) NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS media_library_assets_user_folder ON media_library_assets (user_id, folder_id)`,
  `CREATE INDEX IF NOT EXISTS media_library_assets_user_url ON media_library_assets (user_id, url)`,
  `CREATE TABLE IF NOT EXISTS social_slides (
    id text PRIMARY KEY NOT NULL,
    project_id text NOT NULL,
    position integer NOT NULL,
    slide_role text DEFAULT 'body' NOT NULL,
    headline text DEFAULT '' NOT NULL,
    body_text text DEFAULT '' NOT NULL,
    visual_prompt text DEFAULT '' NOT NULL,
    image_url text,
    status text DEFAULT 'draft' NOT NULL,
    avatar_id text,
    error_message text,
    created_at integer DEFAULT (unixepoch()) NOT NULL,
    updated_at integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE TABLE IF NOT EXISTS social_metadata (
    id text PRIMARY KEY NOT NULL,
    project_id text NOT NULL,
    hook_line text,
    caption text,
    hashtags text DEFAULT '[]' NOT NULL,
    slide_notes text DEFAULT '[]' NOT NULL,
    status text DEFAULT 'draft' NOT NULL,
    created_at integer DEFAULT (unixepoch()) NOT NULL,
    updated_at integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS social_metadata_project_id_unique ON social_metadata (project_id)`,
] as const;

/** Idempotent ALTERs for columns added after first local deploy. */
export const SQLITE_COLUMN_HOTFIXES = [
  {
    table: "projects",
    column: "script_draft",
    sql: `ALTER TABLE projects ADD COLUMN script_draft text`,
  },
  {
    table: "projects",
    column: "script_draft_notes",
    sql: `ALTER TABLE projects ADD COLUMN script_draft_notes text`,
  },
  {
    table: "projects",
    column: "script_draft_status",
    sql: `ALTER TABLE projects ADD COLUMN script_draft_status text DEFAULT 'none' NOT NULL`,
  },
  {
    table: "projects",
    column: "script_draft_version",
    sql: `ALTER TABLE projects ADD COLUMN script_draft_version integer`,
  },
  {
    table: "projects",
    column: "tts_voice_settings",
    sql: `ALTER TABLE projects ADD COLUMN tts_voice_settings text DEFAULT '{}' NOT NULL`,
  },
  {
    table: "projects",
    column: "timeline_free_edit",
    sql: `ALTER TABLE projects ADD COLUMN timeline_free_edit INTEGER NOT NULL DEFAULT 0`,
  },
  {
    table: "story_blocks",
    column: "video_timeline_start",
    sql: `ALTER TABLE story_blocks ADD COLUMN video_timeline_start REAL`,
  },
  {
    table: "story_blocks",
    column: "narration_timeline_start",
    sql: `ALTER TABLE story_blocks ADD COLUMN narration_timeline_start REAL`,
  },
  {
    table: "story_blocks",
    column: "scene_timeline_start",
    sql: `ALTER TABLE story_blocks ADD COLUMN scene_timeline_start REAL`,
  },
  {
    table: "story_blocks",
    column: "video_shot_count",
    sql: `ALTER TABLE story_blocks ADD COLUMN video_shot_count INTEGER NOT NULL DEFAULT 1`,
  },
  {
    table: "story_blocks",
    column: "keyframe_fit_mode",
    sql: `ALTER TABLE story_blocks ADD COLUMN keyframe_fit_mode TEXT NOT NULL DEFAULT 'cover'`,
  },
  {
    table: "story_blocks",
    column: "stock_video_id",
    sql: `ALTER TABLE story_blocks ADD COLUMN stock_video_id TEXT`,
  },
  {
    table: "story_blocks",
    column: "open_router_cost_usd",
    sql: `ALTER TABLE story_blocks ADD COLUMN open_router_cost_usd REAL`,
  },
  {
    table: "projects",
    column: "script_language",
    sql: `ALTER TABLE projects ADD COLUMN script_language text NOT NULL DEFAULT 'en'`,
  },
  {
    table: "projects",
    column: "music_start_seconds",
    sql: `ALTER TABLE projects ADD COLUMN music_start_seconds REAL NOT NULL DEFAULT 0`,
  },
  {
    table: "projects",
    column: "music_span_seconds",
    sql: `ALTER TABLE projects ADD COLUMN music_span_seconds REAL`,
  },
  {
    table: "projects",
    column: "music2_url",
    sql: `ALTER TABLE projects ADD COLUMN music2_url text`,
  },
  {
    table: "projects",
    column: "music2_status",
    sql: `ALTER TABLE projects ADD COLUMN music2_status text DEFAULT 'none' NOT NULL`,
  },
  {
    table: "projects",
    column: "music2_prompt",
    sql: `ALTER TABLE projects ADD COLUMN music2_prompt text`,
  },
  {
    table: "projects",
    column: "music2_timeline_start_seconds",
    sql: `ALTER TABLE projects ADD COLUMN music2_timeline_start_seconds REAL`,
  },
  {
    table: "projects",
    column: "music2_file_start_seconds",
    sql: `ALTER TABLE projects ADD COLUMN music2_file_start_seconds REAL NOT NULL DEFAULT 0`,
  },
  {
    table: "projects",
    column: "preview_mode",
    sql: `ALTER TABLE projects ADD COLUMN preview_mode text DEFAULT 'auto' NOT NULL`,
  },
  {
    table: "projects",
    column: "video_clip_audio",
    sql: `ALTER TABLE projects ADD COLUMN video_clip_audio text DEFAULT 'default' NOT NULL`,
  },
  {
    table: "media_library_folders",
    column: "project_id",
    sql: `ALTER TABLE media_library_folders ADD COLUMN project_id text`,
  },
  {
    table: "projects",
    column: "content_type",
    sql: `ALTER TABLE projects ADD COLUMN content_type text DEFAULT 'video' NOT NULL`,
  },
  {
    table: "projects",
    column: "post_format",
    sql: `ALTER TABLE projects ADD COLUMN post_format text DEFAULT 'carousel' NOT NULL`,
  },
  {
    table: "projects",
    column: "social_aspect_ratio",
    sql: `ALTER TABLE projects ADD COLUMN social_aspect_ratio text DEFAULT '4:5' NOT NULL`,
  },
  {
    table: "projects",
    column: "post_kind",
    sql: `ALTER TABLE projects ADD COLUMN post_kind text DEFAULT 'educational' NOT NULL`,
  },
  {
    table: "projects",
    column: "slide_count",
    sql: `ALTER TABLE projects ADD COLUMN slide_count INTEGER NOT NULL DEFAULT 7`,
  },
  {
    table: "projects",
    column: "social_use_avatar",
    sql: `ALTER TABLE projects ADD COLUMN social_use_avatar INTEGER NOT NULL DEFAULT 0`,
  },
  {
    table: "exports",
    column: "quality",
    sql: `ALTER TABLE exports ADD COLUMN quality text`,
  },
  {
    table: "exports",
    column: "progress_percent",
    sql: `ALTER TABLE exports ADD COLUMN progress_percent INTEGER NOT NULL DEFAULT 0`,
  },
  {
    table: "exports",
    column: "progress_stage",
    sql: `ALTER TABLE exports ADD COLUMN progress_stage TEXT`,
  },
  {
    table: "exports",
    column: "progress_message",
    sql: `ALTER TABLE exports ADD COLUMN progress_message TEXT`,
  },
  {
    table: "project_dna",
    column: "genre",
    sql: `ALTER TABLE project_dna ADD COLUMN genre text`,
  },
  {
    table: "project_dna",
    column: "visual_style",
    sql: `ALTER TABLE project_dna ADD COLUMN visual_style text`,
  },
  {
    table: "project_dna",
    column: "voice_tone",
    sql: `ALTER TABLE project_dna ADD COLUMN voice_tone text`,
  },
  {
    table: "project_dna",
    column: "color_palette",
    sql: `ALTER TABLE project_dna ADD COLUMN color_palette text`,
  },
  {
    table: "project_dna",
    column: "visual_mood",
    sql: `ALTER TABLE project_dna ADD COLUMN visual_mood text`,
  },
  {
    table: "project_dna",
    column: "learned_notes",
    sql: `ALTER TABLE project_dna ADD COLUMN learned_notes text`,
  },
  {
    table: "project_dna",
    column: "gallery_folder_id",
    sql: `ALTER TABLE project_dna ADD COLUMN gallery_folder_id text`,
  },
  {
    table: "media_library_folders",
    column: "project_dna_id",
    sql: `ALTER TABLE media_library_folders ADD COLUMN project_dna_id text`,
  },
  {
    table: "social_slides",
    column: "reference_asset_id",
    sql: `ALTER TABLE social_slides ADD COLUMN reference_asset_id text`,
  },
] as const;

/** @deprecated use SQLITE_COLUMN_HOTFIXES */
export const SQLITE_SCHEMA_HOTFIXES = SQLITE_COLUMN_HOTFIXES.map((entry) => entry.sql);

export function applySqliteSchemaHotfixes(sqlite: Database.Database): void {
  for (const sql of SQLITE_TABLE_HOTFIXES) {
    sqlite.exec(sql);
  }

  const columnsByTable = new Map<string, Set<string>>();
  function tableColumns(table: string): Set<string> {
    let existing = columnsByTable.get(table);
    if (!existing) {
      existing = new Set(
        (sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
          (c) => c.name,
        ),
      );
      columnsByTable.set(table, existing);
    }
    return existing;
  }

  for (const { table, column, sql } of SQLITE_COLUMN_HOTFIXES) {
    const existing = tableColumns(table);
    if (existing.has(column)) continue;
    try {
      sqlite.exec(sql);
      existing.add(column);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("duplicate column")) continue;
      throw err;
    }
  }
}
