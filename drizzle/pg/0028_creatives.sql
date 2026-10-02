CREATE TABLE IF NOT EXISTS "creatives" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"code" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"product" text NOT NULL,
	"angle" text NOT NULL,
	"hook" text DEFAULT '' NOT NULL,
	"format" text NOT NULL,
	"creator" text DEFAULT '' NOT NULL,
	"aspect_ratio" text NOT NULL,
	"language" text DEFAULT 'PT' NOT NULL,
	"kind" text DEFAULT 'image' NOT NULL,
	"file_url" text NOT NULL,
	"thumb_url" text,
	"mime_type" text NOT NULL,
	"width" integer,
	"height" integer,
	"duration_seconds" real,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"original_name" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'upload' NOT NULL,
	"source_ref" text,
	"status" text,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creatives_user_code" ON "creatives" ("user_id", "code");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "creative_metrics" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"ad_name" text NOT NULL,
	"code" integer,
	"spend" real DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"results" real DEFAULT 0 NOT NULL,
	"source_file" text DEFAULT '' NOT NULL,
	"imported_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creative_metrics_user_code" ON "creative_metrics" ("user_id", "code");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "creative_folders" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "creative_folders_user_name" ON "creative_folders" ("user_id", "name");
