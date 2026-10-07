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
  `CREATE TABLE IF NOT EXISTS scenarios (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL,
    name text NOT NULL,
    description text,
    image_urls text DEFAULT '[]' NOT NULL,
    primary_image_url text,
    created_at integer DEFAULT (unixepoch()) NOT NULL,
    updated_at integer DEFAULT (unixepoch()) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS variation_sets (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL,
    name text NOT NULL,
    source_image_url text NOT NULL,
    instructions text,
    aspect_ratio text DEFAULT '1:1' NOT NULL,
    created_at integer DEFAULT (unixepoch()) NOT NULL,
    updated_at integer DEFAULT (unixepoch()) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS variation_items (
    id text PRIMARY KEY NOT NULL,
    set_id text NOT NULL,
    user_id text NOT NULL,
    direction text,
    image_url text,
    status text DEFAULT 'generating' NOT NULL,
    error text,
    video_url text,
    video_status text,
    video_error text,
    created_at integer DEFAULT (unixepoch()) NOT NULL,
    updated_at integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY (set_id) REFERENCES variation_sets(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE TABLE IF NOT EXISTS image_chats (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL,
    title text DEFAULT 'New chat' NOT NULL,
    image_model text,
    aspect_ratio text DEFAULT '1:1' NOT NULL,
    created_at integer DEFAULT (unixepoch()) NOT NULL,
    updated_at integer DEFAULT (unixepoch()) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS image_chat_messages (
    id text PRIMARY KEY NOT NULL,
    chat_id text NOT NULL,
    user_id text NOT NULL,
    role text NOT NULL,
    content text DEFAULT '' NOT NULL,
    image_urls text DEFAULT '[]' NOT NULL,
    status text DEFAULT 'ready' NOT NULL,
    error text,
    prompt text,
    model text,
    created_at integer DEFAULT (unixepoch()) NOT NULL,
    updated_at integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY (chat_id) REFERENCES image_chats(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE TABLE IF NOT EXISTS person_swaps (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL,
    name text NOT NULL,
    source_url text NOT NULL,
    audio_url text,
    duration_seconds real NOT NULL,
    aspect_ratio text DEFAULT '9:16' NOT NULL,
    video_model text,
    image_model text,
    mode text DEFAULT 'person' NOT NULL,
    scenario_id text,
    instructions text,
    voice_mode text DEFAULT 'original' NOT NULL,
    voice_id text,
    created_at integer DEFAULT (unixepoch()) NOT NULL,
    updated_at integer DEFAULT (unixepoch()) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS person_swap_items (
    id text PRIMARY KEY NOT NULL,
    swap_id text NOT NULL,
    user_id text NOT NULL,
    avatar_id text,
    avatar_name text DEFAULT '' NOT NULL,
    reference_urls text DEFAULT '[]' NOT NULL,
    keyframe_url text,
    raw_video_url text,
    video_url text,
    voice_id text,
    status text DEFAULT 'frame' NOT NULL,
    error text,
    video_model text,
    created_at integer DEFAULT (unixepoch()) NOT NULL,
    updated_at integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY (swap_id) REFERENCES person_swaps(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE TABLE IF NOT EXISTS dubbing_sources (
    id text PRIMARY KEY NOT NULL,
    project_id text NOT NULL,
    source_type text NOT NULL,
    source_url text NOT NULL,
    extracted_audio_url text,
    original_filename text,
    mime_type text,
    size_bytes integer,
    duration_seconds real,
    detected_language text,
    transcript_engine text,
    transcribed_at integer,
    created_at integer DEFAULT (unixepoch()) NOT NULL,
    updated_at integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS dubbing_sources_project_id_unique ON dubbing_sources (project_id)`,
  `CREATE TABLE IF NOT EXISTS dubbing_segments (
    id text PRIMARY KEY NOT NULL,
    project_id text NOT NULL,
    position integer NOT NULL,
    start_seconds real NOT NULL,
    end_seconds real NOT NULL,
    source_text text DEFAULT '' NOT NULL,
    source_language text,
    translated_text text DEFAULT '' NOT NULL,
    target_language text,
    tts_audio_url text,
    tts_duration_seconds real,
    tts_model text,
    tts_voice text,
    stretch_ratio real,
    status text DEFAULT 'pending' NOT NULL,
    error_message text,
    speaker_id text,
    created_at integer DEFAULT (unixepoch()) NOT NULL,
    updated_at integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS dubbing_segments_project_position ON dubbing_segments (project_id, position)`,
  `CREATE TABLE IF NOT EXISTS dubbing_renders (
    id text PRIMARY KEY NOT NULL,
    project_id text NOT NULL,
    kind text NOT NULL,
    url text NOT NULL,
    target_language text,
    background_gain real DEFAULT 0 NOT NULL,
    duration_seconds real,
    size_bytes integer,
    created_at integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS dubbing_renders_project_created ON dubbing_renders (project_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS dubbing_tracks (
    id text PRIMARY KEY NOT NULL,
    project_id text NOT NULL,
    language_id text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    tts_voice text,
    created_at integer DEFAULT (unixepoch()) NOT NULL,
    updated_at integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS dubbing_tracks_project_language ON dubbing_tracks (project_id, language_id)`,
  `CREATE TABLE IF NOT EXISTS dubbing_segment_locales (
    id text PRIMARY KEY NOT NULL,
    segment_id text NOT NULL,
    track_id text NOT NULL,
    translated_text text DEFAULT '' NOT NULL,
    tts_audio_url text,
    tts_duration_seconds real,
    tts_model text,
    tts_voice text,
    stretch_ratio real,
    status text DEFAULT 'pending' NOT NULL,
    error_message text,
    created_at integer DEFAULT (unixepoch()) NOT NULL,
    updated_at integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY (segment_id) REFERENCES dubbing_segments(id) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (track_id) REFERENCES dubbing_tracks(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS dubbing_segment_locales_segment_track ON dubbing_segment_locales (segment_id, track_id)`,
  `CREATE INDEX IF NOT EXISTS dubbing_segment_locales_track ON dubbing_segment_locales (track_id)`,
  `CREATE TABLE IF NOT EXISTS social_art_brand_kits (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL,
    project_dna_id text NOT NULL,
    handle text DEFAULT '' NOT NULL,
    colors text DEFAULT '{}' NOT NULL,
    accent_shine integer DEFAULT 1 NOT NULL,
    font_heading text DEFAULT 'Montserrat' NOT NULL,
    font_body text DEFAULT 'Montserrat' NOT NULL,
    uppercase_titles integer DEFAULT 1 NOT NULL,
    decor_color text DEFAULT '#f59e0b' NOT NULL,
    decor_default integer DEFAULT 0 NOT NULL,
    created_at integer DEFAULT (unixepoch()) NOT NULL,
    updated_at integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY (project_dna_id) REFERENCES project_dna(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS social_art_brand_kits_project_dna_id_unique ON social_art_brand_kits (project_dna_id)`,
  `CREATE TABLE IF NOT EXISTS creatives (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL,
    code integer NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    product text NOT NULL,
    angle text NOT NULL,
    hook text DEFAULT '' NOT NULL,
    format text NOT NULL,
    creator text DEFAULT '' NOT NULL,
    aspect_ratio text NOT NULL,
    language text DEFAULT 'PT' NOT NULL,
    kind text DEFAULT 'image' NOT NULL,
    file_url text NOT NULL,
    thumb_url text,
    mime_type text NOT NULL,
    width integer,
    height integer,
    duration_seconds real,
    size_bytes integer DEFAULT 0 NOT NULL,
    original_name text DEFAULT '' NOT NULL,
    source text DEFAULT 'upload' NOT NULL,
    source_ref text,
    status text,
    notes text DEFAULT '' NOT NULL,
    created_at integer DEFAULT (unixepoch()) NOT NULL,
    updated_at integer DEFAULT (unixepoch()) NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS creatives_user_code ON creatives (user_id, code)`,
  `CREATE TABLE IF NOT EXISTS creative_metrics (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL,
    ad_name text NOT NULL,
    code integer,
    spend real DEFAULT 0 NOT NULL,
    impressions integer DEFAULT 0 NOT NULL,
    clicks integer DEFAULT 0 NOT NULL,
    results real DEFAULT 0 NOT NULL,
    source_file text DEFAULT '' NOT NULL,
    imported_at integer DEFAULT (unixepoch()) NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS creative_metrics_user_code ON creative_metrics (user_id, code)`,
  `CREATE TABLE IF NOT EXISTS creative_folders (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS creative_folders_user_name ON creative_folders (user_id, name)`,
  `CREATE TABLE IF NOT EXISTS creative_metric_imports (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL,
    source_file text DEFAULT '' NOT NULL,
    period_start text,
    period_end text,
    rows integer DEFAULT 0 NOT NULL,
    matched integer DEFAULT 0 NOT NULL,
    imported_at integer DEFAULT (unixepoch()) NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS creative_metric_imports_user ON creative_metric_imports (user_id)`,
  `CREATE TABLE IF NOT EXISTS creative_shares (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL,
    token text NOT NULL,
    scope text NOT NULL,
    scope_value text DEFAULT '' NOT NULL,
    expires_at integer,
    views integer DEFAULT 0 NOT NULL,
    last_viewed_at integer,
    created_at integer DEFAULT (unixepoch()) NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS creative_shares_token ON creative_shares (token)`,
  `CREATE TABLE IF NOT EXISTS photo_batches (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL,
    folder_id text,
    name text NOT NULL,
    instructions text,
    image_model text,
    aspect_ratio text DEFAULT 'original' NOT NULL,
    created_at integer DEFAULT (unixepoch()) NOT NULL,
    updated_at integer DEFAULT (unixepoch()) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS photo_batch_items (
    id text PRIMARY KEY NOT NULL,
    batch_id text NOT NULL,
    user_id text NOT NULL,
    position integer DEFAULT 0 NOT NULL,
    original_name text DEFAULT '' NOT NULL,
    source_url text NOT NULL,
    width integer,
    height integer,
    status text DEFAULT 'idle' NOT NULL,
    result_url text,
    error text,
    image_model text,
    instructions text,
    approved integer DEFAULT 0 NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    created_at integer DEFAULT (unixepoch()) NOT NULL,
    updated_at integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY (batch_id) REFERENCES photo_batches(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS photo_batch_items_batch ON photo_batch_items (batch_id, position)`,
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
    column: "video_camera_angle",
    sql: `ALTER TABLE story_blocks ADD COLUMN video_camera_angle TEXT NOT NULL DEFAULT 'auto'`,
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
    table: "story_blocks",
    column: "keyframe_ai_model",
    sql: `ALTER TABLE story_blocks ADD COLUMN keyframe_ai_model TEXT`,
  },
  {
    table: "story_blocks",
    column: "video_ai_model",
    sql: `ALTER TABLE story_blocks ADD COLUMN video_ai_model TEXT`,
  },
  {
    table: "story_blocks",
    column: "narration_ai_model",
    sql: `ALTER TABLE story_blocks ADD COLUMN narration_ai_model TEXT`,
  },
  {
    table: "story_blocks",
    column: "scene_audio_ai_model",
    sql: `ALTER TABLE story_blocks ADD COLUMN scene_audio_ai_model TEXT`,
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
  {
    table: "project_dna",
    column: "llm_model",
    sql: `ALTER TABLE project_dna ADD COLUMN llm_model text`,
  },
  {
    table: "project_dna",
    column: "image_model",
    sql: `ALTER TABLE project_dna ADD COLUMN image_model text`,
  },
  {
    table: "project_dna",
    column: "video_model",
    sql: `ALTER TABLE project_dna ADD COLUMN video_model text`,
  },
  {
    table: "project_dna",
    column: "video_clip_audio",
    sql: `ALTER TABLE project_dna ADD COLUMN video_clip_audio text`,
  },
  {
    table: "project_dna",
    column: "tts_model",
    sql: `ALTER TABLE project_dna ADD COLUMN tts_model text`,
  },
  {
    table: "project_dna",
    column: "tts_voice",
    sql: `ALTER TABLE project_dna ADD COLUMN tts_voice text`,
  },
  {
    table: "project_dna",
    column: "video_format",
    sql: `ALTER TABLE project_dna ADD COLUMN video_format text`,
  },
  {
    table: "project_dna",
    column: "cut_pace",
    sql: `ALTER TABLE project_dna ADD COLUMN cut_pace text`,
  },
  {
    table: "project_dna",
    column: "script_language",
    sql: `ALTER TABLE project_dna ADD COLUMN script_language text`,
  },
  {
    table: "project_dna",
    column: "target_duration_seconds",
    sql: `ALTER TABLE project_dna ADD COLUMN target_duration_seconds integer`,
  },
  {
    table: "projects",
    column: "scenario_id",
    sql: `ALTER TABLE projects ADD COLUMN scenario_id text`,
  },
  {
    table: "story_blocks",
    column: "scenario_id",
    sql: `ALTER TABLE story_blocks ADD COLUMN scenario_id text`,
  },
  {
    table: "projects",
    column: "dub_target_language",
    sql: `ALTER TABLE projects ADD COLUMN dub_target_language text`,
  },
  {
    table: "projects",
    column: "dub_background_gain",
    sql: `ALTER TABLE projects ADD COLUMN dub_background_gain real NOT NULL DEFAULT 0`,
  },
  {
    table: "projects",
    column: "dub_use_voice_clone",
    sql: `ALTER TABLE projects ADD COLUMN dub_use_voice_clone integer NOT NULL DEFAULT 0`,
  },
  {
    table: "projects",
    column: "dub_cloned_voice_id",
    sql: `ALTER TABLE projects ADD COLUMN dub_cloned_voice_id text`,
  },
  {
    table: "projects",
    column: "dub_pipeline_stage",
    sql: `ALTER TABLE projects ADD COLUMN dub_pipeline_stage text`,
  },
  {
    table: "projects",
    column: "dub_pipeline_message",
    sql: `ALTER TABLE projects ADD COLUMN dub_pipeline_message text`,
  },
  {
    table: "projects",
    column: "dub_pipeline_current",
    sql: `ALTER TABLE projects ADD COLUMN dub_pipeline_current integer`,
  },
  {
    table: "projects",
    column: "dub_pipeline_total",
    sql: `ALTER TABLE projects ADD COLUMN dub_pipeline_total integer`,
  },
  {
    table: "dubbing_renders",
    column: "track_id",
    sql: `ALTER TABLE dubbing_renders ADD COLUMN track_id text`,
  },
  {
    table: "projects",
    column: "social_art",
    sql: `ALTER TABLE projects ADD COLUMN social_art text`,
  },
  {
    table: "projects",
    column: "social_references",
    sql: `ALTER TABLE projects ADD COLUMN social_references text`,
  },
  {
    table: "projects",
    column: "social_reference_notes",
    sql: `ALTER TABLE projects ADD COLUMN social_reference_notes text`,
  },
  {
    table: "social_slides",
    column: "art",
    sql: `ALTER TABLE social_slides ADD COLUMN art text`,
  },
  {
    table: "variation_sets",
    column: "image_model",
    sql: `ALTER TABLE variation_sets ADD COLUMN image_model text`,
  },
  {
    table: "variation_sets",
    column: "video_model",
    sql: `ALTER TABLE variation_sets ADD COLUMN video_model text`,
  },
  {
    table: "variation_items",
    column: "image_model",
    sql: `ALTER TABLE variation_items ADD COLUMN image_model text`,
  },
  {
    table: "variation_items",
    column: "video_model",
    sql: `ALTER TABLE variation_items ADD COLUMN video_model text`,
  },
  {
    table: "variation_sets",
    column: "text_mode",
    sql: `ALTER TABLE variation_sets ADD COLUMN text_mode text DEFAULT 'keep' NOT NULL`,
  },
  {
    table: "variation_sets",
    column: "custom_text",
    sql: `ALTER TABLE variation_sets ADD COLUMN custom_text text`,
  },
  {
    table: "variation_items",
    column: "headline",
    sql: `ALTER TABLE variation_items ADD COLUMN headline text`,
  },
  {
    table: "creative_metrics",
    column: "import_id",
    sql: `ALTER TABLE creative_metrics ADD COLUMN import_id text`,
  },
  {
    table: "creatives",
    column: "usage",
    sql: `ALTER TABLE creatives ADD COLUMN usage text`,
  },
  {
    table: "creatives",
    column: "trashed_at",
    sql: `ALTER TABLE creatives ADD COLUMN trashed_at integer`,
  },
  {
    table: "variation_sets",
    column: "folder_id",
    sql: `ALTER TABLE variation_sets ADD COLUMN folder_id text`,
  },
  {
    table: "image_chats",
    column: "folder_id",
    sql: `ALTER TABLE image_chats ADD COLUMN folder_id text`,
  },
  {
    table: "person_swaps",
    column: "folder_id",
    sql: `ALTER TABLE person_swaps ADD COLUMN folder_id text`,
  },
  {
    table: "person_swap_items",
    column: "segments",
    sql: `ALTER TABLE person_swap_items ADD COLUMN segments text`,
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
