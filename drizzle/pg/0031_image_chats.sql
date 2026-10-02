CREATE TABLE IF NOT EXISTS "image_chats" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text DEFAULT 'New chat' NOT NULL,
	"image_model" text,
	"aspect_ratio" text DEFAULT '1:1' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "image_chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL REFERENCES "image_chats"("id") ON DELETE cascade,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"image_urls" text DEFAULT '[]' NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"error" text,
	"prompt" text,
	"model" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
