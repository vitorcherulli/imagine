CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`story_description` text NOT NULL,
	`genre` text NOT NULL,
	`visual_style` text NOT NULL,
	`voice_tone` text NOT NULL,
	`target_duration_seconds` integer DEFAULT 180 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `story_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`position` integer NOT NULL,
	`segment_type` text NOT NULL,
	`narrative_text` text NOT NULL,
	`visual_prompt` text NOT NULL,
	`duration_seconds` integer DEFAULT 8 NOT NULL,
	`keyframe_url` text,
	`video_url` text,
	`video_job_id` text,
	`video_polling_url` text,
	`audio_url` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`error_message` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `youtube_metadata` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`thumbnail_url` text,
	`title_options` text DEFAULT '[]' NOT NULL,
	`selected_title` text,
	`description` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `youtube_metadata_project_id_unique` ON `youtube_metadata` (`project_id`);
--> statement-breakpoint
CREATE TABLE `exports` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`final_video_url` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`error_message` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
