CREATE TABLE IF NOT EXISTS "projects" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "title" text NOT NULL,
  "project_identity" text DEFAULT '' NOT NULL,
  "project_dna_id" text,
  "story_description" text NOT NULL,
  "genre" text NOT NULL,
  "visual_style" text NOT NULL,
  "voice_tone" text NOT NULL,
  "target_duration_seconds" integer DEFAULT 180 NOT NULL,
  "video_format" text DEFAULT 'horizontal' NOT NULL,
  "cut_pace" text DEFAULT 'balanced' NOT NULL,
  "narration_mode" text DEFAULT 'per_scene' NOT NULL,
  "llm_model" text,
  "image_model" text,
  "video_model" text,
  "tts_model" text,
  "tts_voice" text DEFAULT 'auto',
  "status" text DEFAULT 'draft' NOT NULL,
  "avatar_id" text,
  "avatar_ids" text DEFAULT '[]',
  "style_bible" text,
  "anchor_image_url" text,
  "anchor_image_prompt" text,
  "music_prompt" text,
  "music_url" text,
  "music_status" text DEFAULT 'none' NOT NULL,
  "music_volume" integer DEFAULT 30 NOT NULL,
  "narration_volume" integer DEFAULT 100 NOT NULL,
  "scene_volume" integer DEFAULT 60 NOT NULL,
  "master_volume" integer DEFAULT 100 NOT NULL,
  "caption_mode" text DEFAULT 'off' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_dna" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "logo_url" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "avatars" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "image_urls" text DEFAULT '[]' NOT NULL,
  "primary_image_url" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "story_blocks" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL,
  "position" integer NOT NULL,
  "segment_type" text NOT NULL,
  "narrative_text" text NOT NULL,
  "visual_prompt" text NOT NULL,
  "location_tag" text,
  "duration_seconds" integer DEFAULT 8 NOT NULL,
  "narration_group_id" text,
  "keyframe_url" text,
  "video_url" text,
  "video_job_id" text,
  "video_polling_url" text,
  "audio_url" text,
  "audio_volume" integer DEFAULT 100 NOT NULL,
  "scene_audio_url" text,
  "scene_audio_volume" integer DEFAULT 60 NOT NULL,
  "avatar_id" text,
  "character_name" text,
  "status" text DEFAULT 'draft' NOT NULL,
  "error_message" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "story_blocks_project_id_projects_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "youtube_metadata" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL,
  "thumbnail_url" text,
  "thumbnail_mode" text DEFAULT 'with_title',
  "thumbnail_prompt" text,
  "title_options" text DEFAULT '[]' NOT NULL,
  "selected_title" text,
  "description" text,
  "tags" text DEFAULT '[]' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "youtube_metadata_project_id_projects_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "youtube_metadata_project_id_unique"
  ON "youtube_metadata" ("project_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exports" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL,
  "final_video_url" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "error_message" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "exports_project_id_projects_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade
);
