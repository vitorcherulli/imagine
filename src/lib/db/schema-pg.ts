import {
  pgTable,
  text,
  integer,
  real,
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
  videoFormat: text("video_format").notNull().default("horizontal"),
  cutPace: text("cut_pace").notNull().default("balanced"),
  narrationMode: text("narration_mode").notNull().default("per_scene"),
  llmModel: text("llm_model"),
  imageModel: text("image_model"),
  videoModel: text("video_model"),
  ttsModel: text("tts_model"),
  ttsVoice: text("tts_voice").default("auto"),
  ttsSpeed: real("tts_speed").notNull().default(1),
  status: text("status").notNull().default("draft"),
  avatarId: text("avatar_id"),
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
  captionMode: text("caption_mode").notNull().default("off"),
  folderId: text("folder_id"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const projectFolders = pgTable("project_folders", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const projectDna = pgTable("project_dna", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  logoUrl: text("logo_url"),
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
  avatarId: text("avatar_id"),
  characterName: text("character_name"),
  status: text("status").notNull().default("draft"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

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
  status: text("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
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
