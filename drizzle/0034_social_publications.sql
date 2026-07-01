ALTER TABLE `projects` ADD COLUMN `content_type` text DEFAULT 'video' NOT NULL;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `post_format` text DEFAULT 'carousel' NOT NULL;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `social_aspect_ratio` text DEFAULT '4:5' NOT NULL;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `post_kind` text DEFAULT 'educational' NOT NULL;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `slide_count` integer DEFAULT 7 NOT NULL;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `social_use_avatar` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE `social_slides` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`position` integer NOT NULL,
	`slide_role` text DEFAULT 'body' NOT NULL,
	`headline` text DEFAULT '' NOT NULL,
	`body_text` text DEFAULT '' NOT NULL,
	`visual_prompt` text DEFAULT '' NOT NULL,
	`image_url` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`avatar_id` text,
	`error_message` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `social_metadata` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`hook_line` text,
	`caption` text,
	`hashtags` text DEFAULT '[]' NOT NULL,
	`slide_notes` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_metadata_project_id_unique` ON `social_metadata` (`project_id`);
