ALTER TABLE "variation_sets" ADD COLUMN IF NOT EXISTS "folder_id" text;
--> statement-breakpoint
ALTER TABLE "image_chats" ADD COLUMN IF NOT EXISTS "folder_id" text;
--> statement-breakpoint
ALTER TABLE "person_swaps" ADD COLUMN IF NOT EXISTS "folder_id" text;
