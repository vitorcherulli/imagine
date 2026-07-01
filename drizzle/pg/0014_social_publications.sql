ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "content_type" text DEFAULT 'video' NOT NULL;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "post_format" text DEFAULT 'carousel' NOT NULL;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "social_aspect_ratio" text DEFAULT '4:5' NOT NULL;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "post_kind" text DEFAULT 'educational' NOT NULL;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "slide_count" integer DEFAULT 7 NOT NULL;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "social_use_avatar" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_slides" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "position" integer NOT NULL,
  "slide_role" text DEFAULT 'body' NOT NULL,
  "headline" text DEFAULT '' NOT NULL,
  "body_text" text DEFAULT '' NOT NULL,
  "visual_prompt" text DEFAULT '' NOT NULL,
  "image_url" text,
  "status" text DEFAULT 'draft' NOT NULL,
  "avatar_id" text,
  "error_message" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_metadata" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "hook_line" text,
  "caption" text,
  "hashtags" text DEFAULT '[]' NOT NULL,
  "slide_notes" text DEFAULT '[]' NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "social_metadata_project_id_unique" ON "social_metadata" ("project_id");
