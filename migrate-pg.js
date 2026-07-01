"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/lib/db/migrate-pg.ts
var import_postgres_js = require("drizzle-orm/postgres-js");
var import_migrator = require("drizzle-orm/postgres-js/migrator");
var import_postgres = __toESM(require("postgres"));

// src/lib/db/schema-pg.ts
var schema_pg_exports = {};
__export(schema_pg_exports, {
  avatars: () => avatars,
  exports: () => exports2,
  projectDna: () => projectDna,
  projectFolders: () => projectFolders,
  projects: () => projects,
  scriptVersions: () => scriptVersions,
  storyBlocks: () => storyBlocks,
  youtubeMetadata: () => youtubeMetadata
});
var import_pg_core = require("drizzle-orm/pg-core");

// src/lib/project-durations.ts
var DEFAULT_PROJECT_DURATION_SECONDS = 30;

// src/lib/db/schema-pg.ts
var projects = (0, import_pg_core.pgTable)("projects", {
  id: (0, import_pg_core.text)("id").primaryKey(),
  userId: (0, import_pg_core.text)("user_id").notNull(),
  title: (0, import_pg_core.text)("title").notNull(),
  projectIdentity: (0, import_pg_core.text)("project_identity").notNull().default(""),
  projectDnaId: (0, import_pg_core.text)("project_dna_id"),
  storyDescription: (0, import_pg_core.text)("story_description").notNull(),
  genre: (0, import_pg_core.text)("genre").notNull(),
  visualStyle: (0, import_pg_core.text)("visual_style").notNull(),
  voiceTone: (0, import_pg_core.text)("voice_tone").notNull(),
  targetDurationSeconds: (0, import_pg_core.integer)("target_duration_seconds").notNull().default(DEFAULT_PROJECT_DURATION_SECONDS),
  videoFormat: (0, import_pg_core.text)("video_format").notNull().default("horizontal"),
  cutPace: (0, import_pg_core.text)("cut_pace").notNull().default("balanced"),
  narrationMode: (0, import_pg_core.text)("narration_mode").notNull().default("per_scene"),
  llmModel: (0, import_pg_core.text)("llm_model"),
  imageModel: (0, import_pg_core.text)("image_model"),
  videoModel: (0, import_pg_core.text)("video_model"),
  ttsModel: (0, import_pg_core.text)("tts_model"),
  ttsVoice: (0, import_pg_core.text)("tts_voice").default("auto"),
  ttsSpeed: (0, import_pg_core.real)("tts_speed").notNull().default(1),
  ttsVoiceSettings: (0, import_pg_core.text)("tts_voice_settings").notNull().default("{}"),
  status: (0, import_pg_core.text)("status").notNull().default("draft"),
  avatarId: (0, import_pg_core.text)("avatar_id"),
  avatarIds: (0, import_pg_core.text)("avatar_ids").default("[]"),
  styleBible: (0, import_pg_core.text)("style_bible"),
  anchorImageUrl: (0, import_pg_core.text)("anchor_image_url"),
  anchorImagePrompt: (0, import_pg_core.text)("anchor_image_prompt"),
  musicPrompt: (0, import_pg_core.text)("music_prompt"),
  musicUrl: (0, import_pg_core.text)("music_url"),
  musicStatus: (0, import_pg_core.text)("music_status").notNull().default("none"),
  musicVolume: (0, import_pg_core.integer)("music_volume").notNull().default(30),
  narrationVolume: (0, import_pg_core.integer)("narration_volume").notNull().default(100),
  sceneVolume: (0, import_pg_core.integer)("scene_volume").notNull().default(60),
  masterVolume: (0, import_pg_core.integer)("master_volume").notNull().default(100),
  captionMode: (0, import_pg_core.text)("caption_mode").notNull().default("off"),
  folderId: (0, import_pg_core.text)("folder_id"),
  scriptDraft: (0, import_pg_core.text)("script_draft"),
  scriptDraftNotes: (0, import_pg_core.text)("script_draft_notes"),
  scriptDraftStatus: (0, import_pg_core.text)("script_draft_status").notNull().default("none"),
  scriptDraftVersion: (0, import_pg_core.integer)("script_draft_version"),
  createdAt: (0, import_pg_core.timestamp)("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: (0, import_pg_core.timestamp)("updated_at", { mode: "date" }).notNull().defaultNow()
});
var scriptVersions = (0, import_pg_core.pgTable)(
  "script_versions",
  {
    id: (0, import_pg_core.text)("id").primaryKey(),
    projectId: (0, import_pg_core.text)("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    version: (0, import_pg_core.integer)("version").notNull(),
    script: (0, import_pg_core.text)("script").notNull(),
    notes: (0, import_pg_core.text)("notes"),
    source: (0, import_pg_core.text)("source").notNull(),
    summary: (0, import_pg_core.text)("summary"),
    wordCount: (0, import_pg_core.integer)("word_count").notNull().default(0),
    createdAt: (0, import_pg_core.timestamp)("created_at", { mode: "date" }).notNull().defaultNow()
  },
  (table) => ({
    projectVersionUnique: (0, import_pg_core.uniqueIndex)("script_versions_project_version").on(
      table.projectId,
      table.version
    )
  })
);
var projectFolders = (0, import_pg_core.pgTable)("project_folders", {
  id: (0, import_pg_core.text)("id").primaryKey(),
  userId: (0, import_pg_core.text)("user_id").notNull(),
  name: (0, import_pg_core.text)("name").notNull(),
  position: (0, import_pg_core.integer)("position").notNull().default(0),
  createdAt: (0, import_pg_core.timestamp)("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: (0, import_pg_core.timestamp)("updated_at", { mode: "date" }).notNull().defaultNow()
});
var projectDna = (0, import_pg_core.pgTable)("project_dna", {
  id: (0, import_pg_core.text)("id").primaryKey(),
  userId: (0, import_pg_core.text)("user_id").notNull(),
  name: (0, import_pg_core.text)("name").notNull(),
  description: (0, import_pg_core.text)("description"),
  logoUrl: (0, import_pg_core.text)("logo_url"),
  createdAt: (0, import_pg_core.timestamp)("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: (0, import_pg_core.timestamp)("updated_at", { mode: "date" }).notNull().defaultNow()
});
var avatars = (0, import_pg_core.pgTable)("avatars", {
  id: (0, import_pg_core.text)("id").primaryKey(),
  userId: (0, import_pg_core.text)("user_id").notNull(),
  name: (0, import_pg_core.text)("name").notNull(),
  description: (0, import_pg_core.text)("description"),
  imageUrls: (0, import_pg_core.text)("image_urls").notNull().default("[]"),
  primaryImageUrl: (0, import_pg_core.text)("primary_image_url"),
  createdAt: (0, import_pg_core.timestamp)("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: (0, import_pg_core.timestamp)("updated_at", { mode: "date" }).notNull().defaultNow()
});
var storyBlocks = (0, import_pg_core.pgTable)("story_blocks", {
  id: (0, import_pg_core.text)("id").primaryKey(),
  projectId: (0, import_pg_core.text)("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  position: (0, import_pg_core.integer)("position").notNull(),
  segmentType: (0, import_pg_core.text)("segment_type").notNull(),
  narrativeText: (0, import_pg_core.text)("narrative_text").notNull(),
  visualPrompt: (0, import_pg_core.text)("visual_prompt").notNull(),
  locationTag: (0, import_pg_core.text)("location_tag"),
  durationSeconds: (0, import_pg_core.integer)("duration_seconds").notNull().default(8),
  narrationGroupId: (0, import_pg_core.text)("narration_group_id"),
  keyframeUrl: (0, import_pg_core.text)("keyframe_url"),
  videoUrl: (0, import_pg_core.text)("video_url"),
  videoJobId: (0, import_pg_core.text)("video_job_id"),
  videoPollingUrl: (0, import_pg_core.text)("video_polling_url"),
  audioUrl: (0, import_pg_core.text)("audio_url"),
  audioVolume: (0, import_pg_core.integer)("audio_volume").notNull().default(100),
  sceneAudioUrl: (0, import_pg_core.text)("scene_audio_url"),
  sceneAudioVolume: (0, import_pg_core.integer)("scene_audio_volume").notNull().default(60),
  avatarId: (0, import_pg_core.text)("avatar_id"),
  characterName: (0, import_pg_core.text)("character_name"),
  status: (0, import_pg_core.text)("status").notNull().default("draft"),
  errorMessage: (0, import_pg_core.text)("error_message"),
  createdAt: (0, import_pg_core.timestamp)("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: (0, import_pg_core.timestamp)("updated_at", { mode: "date" }).notNull().defaultNow()
});
var youtubeMetadata = (0, import_pg_core.pgTable)(
  "youtube_metadata",
  {
    id: (0, import_pg_core.text)("id").primaryKey(),
    projectId: (0, import_pg_core.text)("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    thumbnailUrl: (0, import_pg_core.text)("thumbnail_url"),
    thumbnailMode: (0, import_pg_core.text)("thumbnail_mode").default("with_title"),
    thumbnailPrompt: (0, import_pg_core.text)("thumbnail_prompt"),
    coverAvatarId: (0, import_pg_core.text)("cover_avatar_id"),
    titleOptions: (0, import_pg_core.text)("title_options").notNull().default("[]"),
    selectedTitle: (0, import_pg_core.text)("selected_title"),
    description: (0, import_pg_core.text)("description"),
    tags: (0, import_pg_core.text)("tags").notNull().default("[]"),
    createdAt: (0, import_pg_core.timestamp)("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: (0, import_pg_core.timestamp)("updated_at", { mode: "date" }).notNull().defaultNow()
  },
  (table) => ({
    projectIdUnique: (0, import_pg_core.uniqueIndex)("youtube_metadata_project_id_unique").on(
      table.projectId
    )
  })
);
var exports2 = (0, import_pg_core.pgTable)("exports", {
  id: (0, import_pg_core.text)("id").primaryKey(),
  projectId: (0, import_pg_core.text)("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  finalVideoUrl: (0, import_pg_core.text)("final_video_url"),
  resolution: (0, import_pg_core.text)("resolution"),
  status: (0, import_pg_core.text)("status").notNull().default("pending"),
  errorMessage: (0, import_pg_core.text)("error_message"),
  createdAt: (0, import_pg_core.timestamp)("created_at", { mode: "date" }).notNull().defaultNow()
});

// src/lib/db/pg-hotfixes.ts
var PG_SCHEMA_HOTFIXES = [
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "folder_id" text`,
  `ALTER TABLE "exports" ADD COLUMN IF NOT EXISTS "resolution" text`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "tts_speed" real DEFAULT 1 NOT NULL`,
  `ALTER TABLE "youtube_metadata" ADD COLUMN IF NOT EXISTS "cover_avatar_id" text`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "script_draft" text`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "script_draft_notes" text`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "script_draft_status" text DEFAULT 'none' NOT NULL`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "script_draft_version" integer`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "tts_voice_settings" text DEFAULT '{}' NOT NULL`,
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
  `CREATE UNIQUE INDEX IF NOT EXISTS "script_versions_project_version" ON "script_versions" ("project_id", "version")`
];
async function applyPgSchemaHotfixes(client) {
  for (const sql of PG_SCHEMA_HOTFIXES) {
    await client.unsafe(sql);
  }
}

// src/lib/db/url.ts
function isPostgresUrl(url) {
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}
function databaseUrl() {
  return process.env.DATABASE_URL ?? "./data/app.db";
}

// src/lib/db/migrate-pg.ts
async function main() {
  const url = databaseUrl();
  if (!isPostgresUrl(url)) {
    console.log("Skipping PostgreSQL migrations (DATABASE_URL is not postgres).");
    return;
  }
  const client = (0, import_postgres.default)(url, { max: 1 });
  const db = (0, import_postgres_js.drizzle)(client, { schema: schema_pg_exports });
  console.log("Applying migrations to PostgreSQL...");
  await (0, import_migrator.migrate)(db, { migrationsFolder: "./drizzle/pg" });
  console.log("Applying PostgreSQL schema hotfixes...");
  await applyPgSchemaHotfixes(client);
  await client.end();
  console.log("PostgreSQL migrations applied.");
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
