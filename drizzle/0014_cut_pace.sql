ALTER TABLE `projects` ADD `cut_pace` text DEFAULT 'balanced' NOT NULL;
--> statement-breakpoint
ALTER TABLE `projects` ADD `narration_mode` text DEFAULT 'per_scene' NOT NULL;
--> statement-breakpoint
ALTER TABLE `story_blocks` ADD `narration_group_id` text;
