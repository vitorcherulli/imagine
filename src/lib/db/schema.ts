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
  /** 4:5 | 1:1 | 9:16 — social post aspect ratio */
  socialAspectRatio: text("social_aspect_ratio").notNull().default("4:5"),
  /** educational | list | quote | promo | story | mixed */
  postKind: text("post_kind").notNull().default("educational"),
  /** Target slide count for carousels (3–10) */
  slideCount: integer("slide_count").notNull().default(7),
  /** When 1, include project avatar in slide images */
  socialUseAvatar: integer("social_use_avatar", { mode: "boolean" }).notNull().default(false),
  /** JSON SocialArtSettings — brand art overlay toggles (handle, logo, shapes, counter) */
  socialArt: text("social_art"),
  /** JSON SocialReference[] — inspiration images for this publication */
  socialReferences: text("social_references"),
  /** AI read of the reference images (style, content, palette) fed into prompts */
  socialReferenceNotes: text("social_reference_notes"),
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
  /** Selected environment/scenario from the user's library */
  scenarioId: text("scenario_id"),
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
  /** Dubbing: target language for AI dub (e.g. en, pt, es, fr, …). */
  dubTargetLanguage: text("dub_target_language"),
  /** Dubbing: gain (0–1) applied to the original audio behind the new voice. */
  dubBackgroundGain: real("dub_background_gain").notNull().default(0),
  /** Dubbing: 1 = clone source speaker with ElevenLabs IVC instead of picker voice. */
  dubUseVoiceClone: integer("dub_use_voice_clone", { mode: "boolean" })
    .notNull()
    .default(false),
  /** Dubbing: cached ElevenLabs voice_id created from the source (IVC). */
  dubClonedVoiceId: text("dub_cloned_voice_id"),
  /** Dubbing pipeline progress (live while processing). */
  dubPipelineStage: text("dub_pipeline_stage"),
  dubPipelineMessage: text("dub_pipeline_message"),
  dubPipelineCurrent: integer("dub_pipeline_current"),
  dubPipelineTotal: integer("dub_pipeline_total"),
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
  /** Per-DNA new-video defaults — prefilled when this DNA is picked on a new project. */
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

export const scenarios = sqliteTable("scenarios", {
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

export const variationSets = sqliteTable("variation_sets", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  folderId: text("folder_id"),
  name: text("name").notNull(),
  sourceImageUrl: text("source_image_url").notNull(),
  instructions: text("instructions"),
  aspectRatio: text("aspect_ratio").notNull().default("1:1"),
  imageModel: text("image_model"),
  videoModel: text("video_model"),
  textMode: text("text_mode").notNull().default("keep"),
  customText: text("custom_text"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const variationItems = sqliteTable("variation_items", {
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
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** One file of an ad creative. Pieces sharing `code` are the same concept (hook). */
export const creatives = sqliteTable("creatives", {
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
  /** Manual override; null = suggested from Meta metrics. */
  status: text("status"),
  /** unused | used | published | old — null = not used yet. */
  usage: text("usage"),
  /** Set = in the trash (whole concept); purged after CREATIVE_TRASH_DAYS. */
  trashedAt: integer("trashed_at", { mode: "timestamp" }),
  notes: text("notes").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** Rows of each Meta Ads Manager export, matched to creatives by the C### code in the ad name. */
export const creativeMetrics = sqliteTable("creative_metrics", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  adName: text("ad_name").notNull(),
  code: integer("code"),
  spend: real("spend").notNull().default(0),
  impressions: integer("impressions").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  results: real("results").notNull().default(0),
  sourceFile: text("source_file").notNull().default(""),
  /** creative_metric_imports.id — null only for rows imported before periods existed. */
  importId: text("import_id"),
  importedAt: integer("imported_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** One imported Meta Ads export = one reporting period. */
export const creativeMetricImports = sqliteTable("creative_metric_imports", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  sourceFile: text("source_file").notNull().default(""),
  /** "YYYY-MM-DD" from the export's reporting columns, null when it has none. */
  periodStart: text("period_start"),
  periodEnd: text("period_end"),
  rows: integer("rows").notNull().default(0),
  matched: integer("matched").notNull().default(0),
  importedAt: integer("imported_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** Read-only public links to part of the creatives library. `scope`: all | folder | concept. */
export const creativeShares = sqliteTable("creative_shares", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  token: text("token").notNull(),
  scope: text("scope").notNull(),
  /** Folder name or concept code, "" for all. */
  scopeValue: text("scope_value").notNull().default(""),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  views: integer("views").notNull().default(0),
  lastViewedAt: integer("last_viewed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** Creative folders are products; this keeps empty ones around. `name` matches `creatives.product`. */
export const creativeFolders = sqliteTable("creative_folders", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const imageChats = sqliteTable("image_chats", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  folderId: text("folder_id"),
  title: text("title").notNull().default("New chat"),
  imageModel: text("image_model"),
  aspectRatio: text("aspect_ratio").notNull().default("1:1"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const imageChatMessages = sqliteTable("image_chat_messages", {
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
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** Person swap: one source video, re-cast with one or more avatars. */
export const personSwaps = sqliteTable("person_swaps", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  folderId: text("folder_id"),
  name: text("name").notNull(),
  /** Prepared copy (H.264, ≤ 720p, ≤ 30 s). */
  sourceUrl: text("source_url").notNull(),
  /** Original soundtrack (mp3); null when the video is silent. */
  audioUrl: text("audio_url"),
  durationSeconds: real("duration_seconds").notNull(),
  aspectRatio: text("aspect_ratio").notNull().default("9:16"),
  videoModel: text("video_model"),
  imageModel: text("image_model"),
  /** person = only the person changes · scene = person and background change */
  mode: text("mode").notNull().default("person"),
  scenarioId: text("scenario_id"),
  instructions: text("instructions"),
  /** original = keep the voice in the video · voice = convert it to voiceId (ElevenLabs) */
  voiceMode: text("voice_mode").notNull().default("original"),
  voiceId: text("voice_id"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const personSwapItems = sqliteTable("person_swap_items", {
  id: text("id").primaryKey(),
  swapId: text("swap_id")
    .notNull()
    .references(() => personSwaps.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  avatarId: text("avatar_id"),
  avatarName: text("avatar_name").notNull().default(""),
  /** JSON array of the avatar photos used as references. */
  referenceUrls: text("reference_urls").notNull().default("[]"),
  /** First frame with the new person — guides the video model. */
  keyframeUrl: text("keyframe_url"),
  /** Video as returned by the model, before our audio pass. */
  rawVideoUrl: text("raw_video_url"),
  videoUrl: text("video_url"),
  /** Voice applied to videoUrl; null = original voice. */
  voiceId: text("voice_id"),
  /** frame | video | voice | ready | error */
  status: text("status").notNull().default("frame"),
  error: text("error"),
  videoModel: text("video_model"),
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
  /** Camera angle / perspective applied to the video clip (prompt only). */
  videoCameraAngle: text("video_camera_angle").notNull().default("auto"),
  /** contain = letterbox full image · cover = fill project frame (crop edges) */
  keyframeFitMode: text("keyframe_fit_mode").notNull().default("cover"),
  /** Pexels (or other stock) clip id when video was imported from stock search. */
  stockVideoId: text("stock_video_id"),
  /** Last OpenRouter charge for block video generation (USD). */
  openRouterCostUsd: real("open_router_cost_usd"),
  /** OpenRouter model slug (or MEDIA_AI_SOURCE) used for the current keyframe. */
  keyframeAiModel: text("keyframe_ai_model"),
  videoAiModel: text("video_ai_model"),
  narrationAiModel: text("narration_ai_model"),
  sceneAudioAiModel: text("scene_audio_ai_model"),
  avatarId: text("avatar_id"),
  characterName: text("character_name"),
  scenarioId: text("scenario_id"),
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
  /** JSON SocialSlideArt — layout, text position, small line, label, photo framing */
  art: text("art"),
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

/** Brand art kit per DNA — exact colors and fonts for the publication art overlay. */
export const socialArtBrandKits = sqliteTable("social_art_brand_kits", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  projectDnaId: text("project_dna_id")
    .notNull()
    .unique()
    .references(() => projectDna.id, { onDelete: "cascade" }),
  handle: text("handle").notNull().default(""),
  /** JSON { dark, accent, light } hex colors */
  colors: text("colors").notNull().default("{}"),
  accentShine: integer("accent_shine", { mode: "boolean" }).notNull().default(true),
  fontHeading: text("font_heading").notNull().default("Montserrat"),
  fontBody: text("font_body").notNull().default("Montserrat"),
  uppercaseTitles: integer("uppercase_titles", { mode: "boolean" }).notNull().default(true),
  decorColor: text("decor_color").notNull().default("#f59e0b"),
  decorDefault: integer("decor_default", { mode: "boolean" }).notNull().default(false),
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

export const dubbingSources = sqliteTable("dubbing_sources", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: "cascade" }),
  /** "video" (MP4/MOV) or "audio" (MP3/M4A/WAV). */
  sourceType: text("source_type").notNull(),
  /** URL of the uploaded original file (video or audio). */
  sourceUrl: text("source_url").notNull(),
  /** URL of the extracted mono audio (MP3) used for STT/clone. */
  extractedAudioUrl: text("extracted_audio_url"),
  originalFilename: text("original_filename"),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes"),
  durationSeconds: real("duration_seconds"),
  /** BCP-47-ish language code detected by STT (en, pt, es, …). */
  detectedLanguage: text("detected_language"),
  /** Which STT engine produced the transcript. */
  transcriptEngine: text("transcript_engine"),
  transcribedAt: integer("transcribed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const dubbingSegments = sqliteTable("dubbing_segments", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  startSeconds: real("start_seconds").notNull(),
  endSeconds: real("end_seconds").notNull(),
  /** Original transcribed text (source language). */
  sourceText: text("source_text").notNull().default(""),
  sourceLanguage: text("source_language"),
  /** Translated text (target language). */
  translatedText: text("translated_text").notNull().default(""),
  targetLanguage: text("target_language"),
  /** URL of the synthesized dub for this segment (MP3). */
  ttsAudioUrl: text("tts_audio_url"),
  ttsDurationSeconds: real("tts_duration_seconds"),
  ttsModel: text("tts_model"),
  ttsVoice: text("tts_voice"),
  /** atempo ratio applied to fit original span (1 = no stretch). */
  stretchRatio: real("stretch_ratio"),
  /** pending | transcribed | translated | synthesized | error */
  status: text("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  /** Optional speaker id if diarization becomes available (Phase 2). */
  speakerId: text("speaker_id"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const dubbingRenders = sqliteTable("dubbing_renders", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  /** "video" = MP4 remuxed · "audio" = MP3 only */
  kind: text("kind").notNull(),
  url: text("url").notNull(),
  targetLanguage: text("target_language"),
  /** FK to dubbing_tracks when exported from a specific timeline row. */
  trackId: text("track_id"),
  backgroundGain: real("background_gain").notNull().default(0),
  durationSeconds: real("duration_seconds"),
  sizeBytes: integer("size_bytes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** One timeline row per target language (EN, ES, …). */
export const dubbingTracks = sqliteTable("dubbing_tracks", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  languageId: text("language_id").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  ttsVoice: text("tts_voice"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** Per-segment translation + TTS for a given language track. */
export const dubbingSegmentLocales = sqliteTable("dubbing_segment_locales", {
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
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
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
export type PersonSwap = typeof personSwaps.$inferSelect;
export type PersonSwapItem = typeof personSwapItems.$inferSelect;
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
export type CreativeMetricImport = typeof creativeMetricImports.$inferSelect;
export type CreativeShare = typeof creativeShares.$inferSelect;
