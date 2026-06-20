ALTER TABLE `projects` ADD COLUMN `music_prompt` text;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `music_url` text;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `music_status` text DEFAULT 'none' NOT NULL;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `music_volume` integer DEFAULT 30 NOT NULL;
