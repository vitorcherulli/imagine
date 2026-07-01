ALTER TABLE `project_dna` ADD COLUMN `gallery_folder_id` text;
--> statement-breakpoint
ALTER TABLE `media_library_folders` ADD COLUMN `project_dna_id` text;
--> statement-breakpoint
ALTER TABLE `social_slides` ADD COLUMN `reference_asset_id` text;
