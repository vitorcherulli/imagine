ALTER TABLE `story_blocks` ADD COLUMN `scene_audio_url` text;
--> statement-breakpoint
ALTER TABLE `story_blocks` ADD COLUMN `scene_audio_volume` integer NOT NULL DEFAULT 60;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `scene_volume` integer NOT NULL DEFAULT 60;
