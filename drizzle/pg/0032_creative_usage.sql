ALTER TABLE "creatives" ADD COLUMN IF NOT EXISTS "usage" text;
--> statement-breakpoint
ALTER TABLE "creatives" ADD COLUMN IF NOT EXISTS "trashed_at" timestamp;
