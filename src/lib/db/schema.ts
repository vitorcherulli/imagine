import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
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
  /** horizontal = 16:9 YouTube · vertical = 9:16 Reels/Shorts/TikTok */
  videoFormat: text("video_format").notNull().default("horizontal"),
  /** calm | balanced | dynamic | hyper — how fast visuals change */
  cutPace: text("cut_pace").notNull().default("balanced"),
  /** per_scene = narration per cut · continuous = long narration with visual cuts */
  narrationMode: text("narration_mode").notNull().default("per_scene"),
  llmModel: text("llm_model"),
  imageModel: text("image_model"),
  videoModel: text("video_model"),
  ttsModel: text("tts_model"),
  ttsVoice: text("tts_voice").default("auto"),
  /** Narration playback speed multiplier (0.75–1.35). */
  ttsSpeed: real("tts_speed").notNull().default(1),
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
  narrationVolume: integer("narration_volume").notNull().default(100),
  sceneVolume: integer("scene_volume").notNull().default(60),
  masterVolume: integer("master_volume").notNull().default(100),
  /** off = no on-screen text · bottom | center = narration captions on export/preview */
  captionMode: text("caption_mode").notNull().default("off"),
  folderId: text("folder_id"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

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

export const projectDna = sqliteTable("project_dna", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  logoUrl: text("logo_url"),
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
  status: text("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type ProjectFolder = typeof projectFolders.$inferSelect;
export type NewProjectFolder = typeof projectFolders.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type StoryBlock = typeof storyBlocks.$inferSelect;
export type NewStoryBlock = typeof storyBlocks.$inferInsert;
export type YoutubeMetadata = typeof youtubeMetadata.$inferSelect;
export type Export = typeof exports.$inferSelect;
export type ProjectDna = typeof projectDna.$inferSelect;
export type NewProjectDna = typeof projectDna.$inferInsert;
export type Avatar = typeof avatars.$inferSelect;
export type NewAvatar = typeof avatars.$inferInsert;
