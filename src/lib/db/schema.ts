import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";
import { DEFAULT_PROJECT_DURATION_SECONDS } from "@/lib/project-durations";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  /** @deprecated legacy inline DNA — use projectDnaId */
  projectIdentity: text("project_identity").notNull().default(""),
  /** Selected brand/series DNA from the user's library */
  projectDnaId: text("project_dna_id"),
  storyDescription: text("story_description").notNull(),
  genre: text("genre").notNull(),
  visualStyle: text("visual_style").notNull(),
  voiceTone: text("voice_tone").notNull(),
  targetDurationSeconds: integer("target_duration_seconds")
    .notNull()
    .default(DEFAULT_PROJECT_DURATION_SECONDS),
  /** video = timeline export · social = static feed posts / carousels */
  contentType: text("content_type").notNull().default("video"),
  /** carousel | single — social publications only */
  postFormat: text("post_format").notNull().default("carousel"),
  /** 4:5 | 1:1 — social feed aspect ratio */
  socialAspectRatio: text("social_aspect_ratio").notNull().default("4:5"),
  /** educational | list | quote | promo | story | mixed */
  postKind: text("post_kind").notNull().default("educational"),
  /** Target slide count for carousels (3–10) */
  slideCount: integer("slide_count").notNull().default(7),
  /** When 1, include project avatar in slide images */
  socialUseAvatar: integer("social_use_avatar", { mode: "boolean" }).notNull().default(false),
  /** horizontal = 16:9 YouTube · vertical = 9:16 Reels/Shorts/TikTok */
  videoFormat: text("video_format").notNull().default("horizontal"),
  /** calm | balanced | dynamic | hyper — how fast visuals change */
  cutPace: text("cut_pace").notNull().default("balanced"),
  /** continuous = long narration with multiple visual cuts per segment */
  narrationMode: text("narration_mode").notNull().default("continuous"),
  /** en | pt | es — base language for script narration and generated copy */
  scriptLanguage: text("script_language").notNull().default("en"),
  llmModel: text("llm_model"),
  imageModel: text("image_model"),
  videoModel: text("video_model"),
  /** default = provider default · on/off → OpenRouter generate_audio */
  videoClipAudio: text("video_clip_audio").notNull().default("default"),
  ttsModel: text("tts_model"),
  ttsVoice: text("tts_voice").default("auto"),
  /** Narration playback speed multiplier (0.75–1.35). */
  ttsSpeed: real("tts_speed").notNull().default(1),
  /** JSON — provider-specific voice tuning (e.g. ElevenLabs stability). */
  ttsVoiceSettings: text("tts_voice_settings").notNull().default("{}"),
  status: text("status").notNull().default("draft"),
  avatarId: text("avatar_id"),
  /** JSON array of avatar ids participating in this project */
  avatarIds: text("avatar_ids").default("[]"),
  styleBible: text("style_bible"),
  anchorImageUrl: text("anchor_image_url"),
  anchorImagePrompt: text("anchor_image_prompt"),
  musicPrompt: text("music_prompt"),
  musicUrl: text("music_url"),
  musicStatus: text("music_status").notNull().default("none"),
  musicVolume: integer("music_volume").notNull().default(30),
  /** Seconds into the music file where playback begins. */
  musicStartSeconds: real("music_start_seconds").notNull().default(0),
  /** Timeline length for music; null = match full video duration. */
  musicSpanSeconds: real("music_span_seconds"),
  /** Optional continuation track when the primary score is shorter than the timeline. */
  music2Url: text("music2_url"),
  music2Status: text("music2_status").notNull().default("none"),
  music2Prompt: text("music2_prompt"),
  /** Timeline second where music2 begins (default: end of music1 playable length). */
  music2TimelineStartSeconds: real("music2_timeline_start_seconds"),
  music2FileStartSeconds: real("music2_file_start_seconds").notNull().default(0),
  narrationVolume: integer("narration_volume").notNull().default(100),
  sceneVolume: integer("scene_volume").notNull().default(60),
  masterVolume: integer("master_volume").notNull().default(100),
  /** off = no on-screen text · bottom | center = narration captions on export/preview */
  captionMode: text("caption_mode").notNull().default("off"),
  /** auto | proxy | keyframe | full | off — in-app preview playback */
  previewMode: text("preview_mode").notNull().default("auto"),
  folderId: text("folder_id"),
  /** Script Studio: pre-timeline narration draft (plain text). */
  scriptDraft: text("script_draft"),
  /** JSON: { narratorSuggestion, sourceMode, generatedAt, revision } */
  scriptDraftNotes: text("script_draft_notes"),
  /** none | draft | applied */
  scriptDraftStatus: text("script_draft_status").notNull().default("none"),
  /** Current script version number (script_versions.version). */
  scriptDraftVersion: integer("script_draft_version"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const scriptVersions = sqliteTable(
  "script_versions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    script: text("script").notNull(),
    notes: text("notes"),
    source: text("source").notNull(),
    summary: text("summary"),
    wordCount: integer("word_count").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    projectVersionUnique: uniqueIndex("script_versions_project_version").on(
      table.projectId,
      table.version,
    ),
  }),
);

export const projectFolders = sqliteTable("project_folders", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const mediaLibraryFolders = sqliteTable("media_library_folders", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  parentId: text("parent_id"),
  /** Set only on the project root folder (parentId null). */
  projectId: text("project_id"),
  /** Set on DNA brand root folder (parentId null). */
  projectDnaId: text("project_dna_id"),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const mediaLibraryAssets = sqliteTable("media_library_assets", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  folderId: text("folder_id"),
  name: text("name").notNull(),
  url: text("url").notNull(),
  mimeType: text("mime_type").notNull().default("image/jpeg"),
  kind: text("kind").notNull().default("image"),
  source: text("source").notNull().default("upload"),
  projectId: text("project_id"),
  blockId: text("block_id"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const projectDna = sqliteTable("project_dna", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  logoUrl: text("logo_url"),
  /** Saved creative defaults — applied when this DNA is picked */
  genre: text("genre"),
  visualStyle: text("visual_style"),
  voiceTone: text("voice_tone"),
  /** Brand colors, e.g. "sky blue, coral, mint green" */
  colorPalette: text("color_palette"),
  /** Extra aesthetic notes — lighting, textures, mood */
  visualMood: text("visual_mood"),
  /** Episode insights accumulated over time (append-only bullets). */
  /** Folder id for client brand photos (child of DNA root in media library) */
  galleryFolderId: text("gallery_folder_id"),
  learnedNotes: text("learned_notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const avatars = sqliteTable("avatars", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  imageUrls: text("image_urls").notNull().default("[]"),
  primaryImageUrl: text("primary_image_url"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const storyBlocks = sqliteTable("story_blocks", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  segmentType: text("segment_type").notNull(),
  narrativeText: text("narrative_text").notNull(),
  visualPrompt: text("visual_prompt").notNull(),
  locationTag: text("location_tag"),
  durationSeconds: integer("duration_seconds").notNull().default(8),
  /** Shared id for continuous narration across visual cuts */
  narrationGroupId: text("narration_group_id"),
  keyframeUrl: text("keyframe_url"),
  videoUrl: text("video_url"),
  videoJobId: text("video_job_id"),
  videoPollingUrl: text("video_polling_url"),
  audioUrl: text("audio_url"),
  audioVolume: integer("audio_volume").notNull().default(100),
  sceneAudioUrl: text("scene_audio_url"),
  sceneAudioVolume: integer("scene_audio_volume").notNull().default(60),
  /** Absolute start (seconds) on the video track. */
  videoTimelineStart: real("video_timeline_start"),
  /** Absolute start (seconds) on the narration track (lead block in a group). */
  narrationTimelineStart: real("narration_timeline_start"),
  /** Absolute start (seconds) on the scene-audio track. */
  sceneTimelineStart: real("scene_timeline_start"),
  videoShotCount: integer("video_shot_count").notNull().default(1),
  /** contain = letterbox full image · cover = fill project frame (crop edges) */
  keyframeFitMode: text("keyframe_fit_mode").notNull().default("cover"),
  /** Pexels (or other stock) clip id when video was imported from stock search. */
  stockVideoId: text("stock_video_id"),
  /** Last OpenRouter charge for block video generation (USD). */
  openRouterCostUsd: real("open_router_cost_usd"),
  avatarId: text("avatar_id"),
  characterName: text("character_name"),
  status: text("status").notNull().default("draft"),
  errorMessage: text("error_message"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const socialSlides = sqliteTable("social_slides", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  slideRole: text("slide_role").notNull().default("body"),
  headline: text("headline").notNull().default(""),
  bodyText: text("body_text").notNull().default(""),
  visualPrompt: text("visual_prompt").notNull().default(""),
  imageUrl: text("image_url"),
  /** Client gallery asset used as photo base / AI reference */
  referenceAssetId: text("reference_asset_id"),
  status: text("status").notNull().default("draft"),
  avatarId: text("avatar_id"),
  errorMessage: text("error_message"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const socialMetadata = sqliteTable("social_metadata", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: "cascade" }),
  hookLine: text("hook_line"),
  caption: text("caption"),
  hashtags: text("hashtags").notNull().default("[]"),
  slideNotes: text("slide_notes").notNull().default("[]"),
  status: text("status").notNull().default("draft"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const youtubeMetadata = sqliteTable("youtube_metadata", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: "cascade" }),
  thumbnailUrl: text("thumbnail_url"),
  thumbnailMode: text("thumbnail_mode").default("with_title"),
  thumbnailPrompt: text("thumbnail_prompt"),
  /** Avatar used for cover/thumbnail generation (reference photos) */
  coverAvatarId: text("cover_avatar_id"),
  titleOptions: text("title_options").notNull().default("[]"),
  selectedTitle: text("selected_title"),
  description: text("description"),
  tags: text("tags").notNull().default("[]"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const exports = sqliteTable("exports", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  finalVideoUrl: text("final_video_url"),
  resolution: text("resolution"),
  quality: text("quality"),
  status: text("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  progressPercent: integer("progress_percent").notNull().default(0),
  progressStage: text("progress_stage"),
  progressMessage: text("progress_message"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type ProjectFolder = typeof projectFolders.$inferSelect;
export type NewProjectFolder = typeof projectFolders.$inferInsert;
export type MediaLibraryFolder = typeof mediaLibraryFolders.$inferSelect;
export type NewMediaLibraryFolder = typeof mediaLibraryFolders.$inferInsert;
export type MediaLibraryAsset = typeof mediaLibraryAssets.$inferSelect;
export type NewMediaLibraryAsset = typeof mediaLibraryAssets.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ScriptVersion = typeof scriptVersions.$inferSelect;
export type NewScriptVersion = typeof scriptVersions.$inferInsert;
export type StoryBlock = typeof storyBlocks.$inferSelect;
export type NewStoryBlock = typeof storyBlocks.$inferInsert;
export type SocialSlide = typeof socialSlides.$inferSelect;
export type NewSocialSlide = typeof socialSlides.$inferInsert;
export type SocialMetadata = typeof socialMetadata.$inferSelect;
export type NewSocialMetadata = typeof socialMetadata.$inferInsert;
export type YoutubeMetadata = typeof youtubeMetadata.$inferSelect;
export type Export = typeof exports.$inferSelect;
export type ProjectDna = typeof projectDna.$inferSelect;
export type NewProjectDna = typeof projectDna.$inferInsert;
export type Avatar = typeof avatars.$inferSelect;
export type NewAvatar = typeof avatars.$inferInsert;
