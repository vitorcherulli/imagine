CREATE TABLE IF NOT EXISTS "photo_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"folder_id" text,
	"name" text NOT NULL,
	"instructions" text,
	"image_model" text,
	"aspect_ratio" text DEFAULT 'original' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "photo_batch_items" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL REFERENCES "photo_batches"("id") ON DELETE cascade,
	"user_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"original_name" text DEFAULT '' NOT NULL,
	"source_url" text NOT NULL,
	"width" integer,
	"height" integer,
	"status" text DEFAULT 'idle' NOT NULL,
	"result_url" text,
	"error" text,
	"image_model" text,
	"instructions" text,
	"approved" boolean DEFAULT false NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "photo_batch_items_batch" ON "photo_batch_items" ("batch_id", "position");
