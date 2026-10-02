import {
  pgTable,
  text,
  integer,
  real,
  boolean,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { DEFAULT_PROJECT_DURATION_SECONDS } from "@/lib/project-durations";

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  projectIdentity: text("project_identity").notNull().default(""),
  projectDnaId: text("project_dna_id"),
  storyDescription: text("story_description").notNull(),
  genre: text("genre").notNull(),
  visualStyle: text("visual_style").notNull(),
  voiceTone: text("voice_tone").notNull(),
  targetDurationSeconds: integer("target_duration_seconds")
    .notNull()
    .default(DEFAULT_PROJECT_DURATION_SECONDS),
  contentType: text("content_type").notNull().default("video"),
  postFormat: text("post_format").notNull().default("carousel"),
  socialAspectRatio: text("social_aspect_ratio").notNull().default("4:5"),
  postKind: text("post_kind").notNull().default("educational"),
  slideCount: integer("slide_count").notNull().default(7),
  socialUseAvatar: boolean("social_use_avatar").notNull().default(false),
  socialArt: text("social_art"),
  socialReferences: text("social_references"),
  socialReferenceNotes: text("social_reference_notes"),
  videoFormat: text("video_format").notNull().default("horizontal"),
  cutPace: text("cut_pace").notNull().default("balanced"),
  narrationMode: text("narration_mode").notNull().default("continuous"),
  scriptLanguage: text("script_language").notNull().default("en"),
  llmModel: text("llm_model"),
  imageModel: text("image_model"),
  videoModel: text("video_model"),
  videoClipAudio: text("video_clip_audio").notNull().default("default"),
  ttsModel: text("tts_model"),
  ttsVoice: text("tts_voice").default("auto"),
  ttsSpeed: real("tts_speed").notNull().default(1),
  ttsVoiceSettings: text("tts_voice_settings").notNull().default("{}"),
  status: text("status").notNull().default("draft"),
  avatarId: text("avatar_id"),
  avatarIds: text("avatar_ids").default("[]"),
  scenarioId: text("scenario_id"),
  styleBible: text("style_bible"),
  anchorImageUrl: text("anchor_image_url"),
  anchorImagePrompt: text("anchor_image_prompt"),
  musicPrompt: text("music_prompt"),
  musicUrl: text("music_url"),
  musicStatus: text("music_status").notNull().default("none"),
  musicVolume: integer("music_volume").notNull().default(30),
  musicStartSeconds: real("music_start_seconds").notNull().default(0),
  musicSpanSeconds: real("music_span_seconds"),
  music2Url: text("music2_url"),
  music2Status: text("music2_status").notNull().default("none"),
  music2Prompt: text("music2_prompt"),
  music2TimelineStartSeconds: real("music2_timeline_start_seconds"),
  music2FileStartSeconds: real("music2_file_start_seconds").notNull().default(0),
  narrationVolume: integer("narration_volume").notNull().default(100),
  sceneVolume: integer("scene_volume").notNull().default(60),
  masterVolume: integer("master_volume").notNull().default(100),
  captionMode: text("caption_mode").notNull().default("off"),
  previewMode: text("preview_mode").notNull().default("auto"),
  folderId: text("folder_id"),
  scriptDraft: text("script_draft"),
  scriptDraftNotes: text("script_draft_notes"),
  scriptDraftStatus: text("script_draft_status").notNull().default("none"),
  scriptDraftVersion: integer("script_draft_version"),
  dubTargetLanguage: text("dub_target_language"),
  dubBackgroundGain: real("dub_background_gain").notNull().default(0),
  dubUseVoiceClone: boolean("dub_use_voice_clone").notNull().default(false),
  dubClonedVoiceId: text("dub_cloned_voice_id"),
  dubPipelineStage: text("dub_pipeline_stage"),
  dubPipelineMessage: text("dub_pipeline_message"),
  dubPipelineCurrent: integer("dub_pipeline_current"),
  dubPipelineTotal: integer("dub_pipeline_total"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const scriptVersions = pgTable(
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
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    projectVersionUnique: uniqueIndex("script_versions_project_version").on(
      table.projectId,
      table.version,
    ),
  }),
);

export const projectFolders = pgTable("project_folders", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const mediaLibraryFolders = pgTable("media_library_folders", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  parentId: text("parent_id"),
  projectId: text("project_id"),
  projectDnaId: text("project_dna_id"),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const mediaLibraryAssets = pgTable("media_library_assets", {
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
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const projectDna = pgTable("project_dna", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  logoUrl: text("logo_url"),
  genre: text("genre"),
  visualStyle: text("visual_style"),
  voiceTone: text("voice_tone"),
  colorPalette: text("color_palette"),
  visualMood: text("visual_mood"),
  llmModel: text("llm_model"),
  imageModel: text("image_model"),
  videoModel: text("video_model"),
  videoClipAudio: text("video_clip_audio"),
  ttsModel: text("tts_model"),
  ttsVoice: text("tts_voice"),
  videoFormat: text("video_format"),
  cutPace: text("cut_pace"),
  scriptLanguage: text("script_language"),
  targetDurationSeconds: integer("target_duration_seconds"),
  learnedNotes: text("learned_notes"),
  galleryFolderId: text("gallery_folder_id"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const avatars = pgTable("avatars", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  imageUrls: text("image_urls").notNull().default("[]"),
  primaryImageUrl: text("primary_image_url"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const scenarios = pgTable("scenarios", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  imageUrls: text("image_urls").notNull().default("[]"),
  primaryImageUrl: text("primary_image_url"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const variationSets = pgTable("variation_sets", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  sourceImageUrl: text("source_image_url").notNull(),
  instructions: text("instructions"),
  aspectRatio: text("aspect_ratio").notNull().default("1:1"),
  imageModel: text("image_model"),
  videoModel: text("video_model"),
  textMode: text("text_mode").notNull().default("keep"),
  customText: text("custom_text"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const variationItems = pgTable("variation_items", {
  id: text("id").primaryKey(),
  setId: text("set_id")
    .notNull()
    .references(() => variationSets.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  direction: text("direction"),
  imageUrl: text("image_url"),
  status: text("status").notNull().default("generating"),
  error: text("error"),
  videoUrl: text("video_url"),
  videoStatus: text("video_status"),
  videoError: text("video_error"),
  imageModel: text("image_model"),
  videoModel: text("video_model"),
  headline: text("headline"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const creatives = pgTable("creatives", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  code: integer("code").notNull(),
  version: integer("version").notNull().default(1),
  product: text("product").notNull(),
  angle: text("angle").notNull(),
  hook: text("hook").notNull().default(""),
  format: text("format").notNull(),
  creator: text("creator").notNull().default(""),
  aspectRatio: text("aspect_ratio").notNull(),
  language: text("language").notNull().default("PT"),
  kind: text("kind").notNull().default("image"),
  fileUrl: text("file_url").notNull(),
  thumbUrl: text("thumb_url"),
  mimeType: text("mime_type").notNull(),
  width: integer("width"),
  height: integer("height"),
  durationSeconds: real("duration_seconds"),
  sizeBytes: integer("size_bytes").notNull().default(0),
  originalName: text("original_name").notNull().default(""),
  source: text("source").notNull().default("upload"),
  sourceRef: text("source_ref"),
  status: text("status"),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const creativeMetrics = pgTable("creative_metrics", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  adName: text("ad_name").notNull(),
  code: integer("code"),
  spend: real("spend").notNull().default(0),
  impressions: integer("impressions").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  results: real("results").notNull().default(0),
  sourceFile: text("source_file").notNull().default(""),
  importId: text("import_id"),
  importedAt: timestamp("imported_at", { mode: "date" }).notNull().defaultNow(),
});

export const creativeMetricImports = pgTable("creative_metric_imports", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  sourceFile: text("source_file").notNull().default(""),
  periodStart: text("period_start"),
  periodEnd: text("period_end"),
  rows: integer("rows").notNull().default(0),
  matched: integer("matched").notNull().default(0),
  importedAt: timestamp("imported_at", { mode: "date" }).notNull().defaultNow(),
});

export const creativeShares = pgTable("creative_shares", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  token: text("token").notNull(),
  scope: text("scope").notNull(),
  scopeValue: text("scope_value").notNull().default(""),
  expiresAt: timestamp("expires_at", { mode: "date" }),
  views: integer("views").notNull().default(0),
  lastViewedAt: timestamp("last_viewed_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const creativeFolders = pgTable("creative_folders", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const imageChats = pgTable("image_chats", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull().default("New chat"),
  imageModel: text("image_model"),
  aspectRatio: text("aspect_ratio").notNull().default("1:1"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const imageChatMessages = pgTable("image_chat_messages", {
  id: text("id").primaryKey(),
  chatId: text("chat_id")
    .notNull()
    .references(() => imageChats.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull().default(""),
  imageUrls: text("image_urls").notNull().default("[]"),
  status: text("status").notNull().default("ready"),
  error: text("error"),
  prompt: text("prompt"),
  model: text("model"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const storyBlocks = pgTable("story_blocks", {
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
  narrationGroupId: text("narration_group_id"),
  keyframeUrl: text("keyframe_url"),
  videoUrl: text("video_url"),
  videoJobId: text("video_job_id"),
  videoPollingUrl: text("video_polling_url"),
  audioUrl: text("audio_url"),
  audioVolume: integer("audio_volume").notNull().default(100),
  sceneAudioUrl: text("scene_audio_url"),
  sceneAudioVolume: integer("scene_audio_volume").notNull().default(60),
  videoTimelineStart: real("video_timeline_start"),
  narrationTimelineStart: real("narration_timeline_start"),
  sceneTimelineStart: real("scene_timeline_start"),
  videoShotCount: integer("video_shot_count").notNull().default(1),
  videoCameraAngle: text("video_camera_angle").notNull().default("auto"),
  keyframeFitMode: text("keyframe_fit_mode").notNull().default("cover"),
  stockVideoId: text("stock_video_id"),
  openRouterCostUsd: real("open_router_cost_usd"),
  keyframeAiModel: text("keyframe_ai_model"),
  videoAiModel: text("video_ai_model"),
  narrationAiModel: text("narration_ai_model"),
  sceneAudioAiModel: text("scene_audio_ai_model"),
  avatarId: text("avatar_id"),
  characterName: text("character_name"),
  scenarioId: text("scenario_id"),
  status: text("status").notNull().default("draft"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const socialSlides = pgTable("social_slides", {
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
  referenceAssetId: text("reference_asset_id"),
  art: text("art"),
  status: text("status").notNull().default("draft"),
  avatarId: text("avatar_id"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const socialMetadata = pgTable(
  "social_metadata",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    hookLine: text("hook_line"),
    caption: text("caption"),
    hashtags: text("hashtags").notNull().default("[]"),
    slideNotes: text("slide_notes").notNull().default("[]"),
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    projectIdUnique: uniqueIndex("social_metadata_project_id_unique").on(table.projectId),
  }),
);

export const socialArtBrandKits = pgTable(
  "social_art_brand_kits",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    projectDnaId: text("project_dna_id")
      .notNull()
      .references(() => projectDna.id, { onDelete: "cascade" }),
    handle: text("handle").notNull().default(""),
    colors: text("colors").notNull().default("{}"),
    accentShine: boolean("accent_shine").notNull().default(true),
    fontHeading: text("font_heading").notNull().default("Montserrat"),
    fontBody: text("font_body").notNull().default("Montserrat"),
    uppercaseTitles: boolean("uppercase_titles").notNull().default(true),
    decorColor: text("decor_color").notNull().default("#f59e0b"),
    decorDefault: boolean("decor_default").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    projectDnaIdUnique: uniqueIndex("social_art_brand_kits_project_dna_id_unique").on(table.projectDnaId),
  }),
);

export const youtubeMetadata = pgTable(
  "youtube_metadata",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    thumbnailUrl: text("thumbnail_url"),
    thumbnailMode: text("thumbnail_mode").default("with_title"),
    thumbnailPrompt: text("thumbnail_prompt"),
    coverAvatarId: text("cover_avatar_id"),
    titleOptions: text("title_options").notNull().default("[]"),
    selectedTitle: text("selected_title"),
    description: text("description"),
    tags: text("tags").notNull().default("[]"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    projectIdUnique: uniqueIndex("youtube_metadata_project_id_unique").on(
      table.projectId,
    ),
  }),
);

export const exports = pgTable("exports", {
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
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const dubbingSources = pgTable("dubbing_sources", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull(),
  sourceUrl: text("source_url").notNull(),
  extractedAudioUrl: text("extracted_audio_url"),
  originalFilename: text("original_filename"),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes"),
  durationSeconds: real("duration_seconds"),
  detectedLanguage: text("detected_language"),
  transcriptEngine: text("transcript_engine"),
  transcribedAt: timestamp("transcribed_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const dubbingSegments = pgTable("dubbing_segments", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  startSeconds: real("start_seconds").notNull(),
  endSeconds: real("end_seconds").notNull(),
  sourceText: text("source_text").notNull().default(""),
  sourceLanguage: text("source_language"),
  translatedText: text("translated_text").notNull().default(""),
  targetLanguage: text("target_language"),
  ttsAudioUrl: text("tts_audio_url"),
  ttsDurationSeconds: real("tts_duration_seconds"),
  ttsModel: text("tts_model"),
  ttsVoice: text("tts_voice"),
  stretchRatio: real("stretch_ratio"),
  status: text("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  speakerId: text("speaker_id"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const dubbingRenders = pgTable("dubbing_renders", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  url: text("url").notNull(),
  targetLanguage: text("target_language"),
  trackId: text("track_id"),
  backgroundGain: real("background_gain").notNull().default(0),
  durationSeconds: real("duration_seconds"),
  sizeBytes: integer("size_bytes"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const dubbingTracks = pgTable("dubbing_tracks", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  languageId: text("language_id").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  ttsVoice: text("tts_voice"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const dubbingSegmentLocales = pgTable("dubbing_segment_locales", {
  id: text("id").primaryKey(),
  segmentId: text("segment_id")
    .notNull()
    .references(() => dubbingSegments.id, { onDelete: "cascade" }),
  trackId: text("track_id")
    .notNull()
    .references(() => dubbingTracks.id, { onDelete: "cascade" }),
  translatedText: text("translated_text").notNull().default(""),
  ttsAudioUrl: text("tts_audio_url"),
  ttsDurationSeconds: real("tts_duration_seconds"),
  ttsModel: text("tts_model"),
  ttsVoice: text("tts_voice"),
  stretchRatio: real("stretch_ratio"),
  status: text("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
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
export type SocialArtBrandKit = typeof socialArtBrandKits.$inferSelect;
export type NewSocialArtBrandKit = typeof socialArtBrandKits.$inferInsert;
export type YoutubeMetadata = typeof youtubeMetadata.$inferSelect;
export type Export = typeof exports.$inferSelect;
export type ProjectDna = typeof projectDna.$inferSelect;
export type NewProjectDna = typeof projectDna.$inferInsert;
export type Avatar = typeof avatars.$inferSelect;
export type NewAvatar = typeof avatars.$inferInsert;
export type Scenario = typeof scenarios.$inferSelect;
export type NewScenario = typeof scenarios.$inferInsert;
export type VariationSet = typeof variationSets.$inferSelect;
export type VariationItem = typeof variationItems.$inferSelect;
export type ImageChat = typeof imageChats.$inferSelect;
export type ImageChatMessage = typeof imageChatMessages.$inferSelect;
export type DubbingSource = typeof dubbingSources.$inferSelect;
export type NewDubbingSource = typeof dubbingSources.$inferInsert;
export type DubbingSegment = typeof dubbingSegments.$inferSelect;
export type NewDubbingSegment = typeof dubbingSegments.$inferInsert;
export type DubbingRender = typeof dubbingRenders.$inferSelect;
export type NewDubbingRender = typeof dubbingRenders.$inferInsert;
export type DubbingTrack = typeof dubbingTracks.$inferSelect;
export type NewDubbingTrack = typeof dubbingTracks.$inferInsert;
export type DubbingSegmentLocale = typeof dubbingSegmentLocales.$inferSelect;
export type NewDubbingSegmentLocale = typeof dubbingSegmentLocales.$inferInsert;
export type Creative = typeof creatives.$inferSelect;
export type NewCreative = typeof creatives.$inferInsert;
export type CreativeMetric = typeof creativeMetrics.$inferSelect;
