ALTER TABLE `projects` ADD COLUMN `narration_volume` integer DEFAULT 100 NOT NULL;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `master_volume` integer DEFAULT 100 NOT NULL;
--> statement-breakpoint
ALTER TABLE `story_blocks` ADD COLUMN `audio_volume` integer DEFAULT 100 NOT NULL;
