CREATE TABLE IF NOT EXISTS "scenarios" (
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
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "scenario_id" text;
--> statement-breakpoint
ALTER TABLE "story_blocks" ADD COLUMN IF NOT EXISTS "scenario_id" text;
