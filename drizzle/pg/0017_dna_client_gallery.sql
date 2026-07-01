ALTER TABLE "project_dna" ADD COLUMN IF NOT EXISTS "gallery_folder_id" text;
--> statement-breakpoint
ALTER TABLE "media_library_folders" ADD COLUMN IF NOT EXISTS "project_dna_id" text;
--> statement-breakpoint
ALTER TABLE "social_slides" ADD COLUMN IF NOT EXISTS "reference_asset_id" text;
