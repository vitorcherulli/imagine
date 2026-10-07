CREATE TABLE IF NOT EXISTS `person_swaps` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`source_url` text NOT NULL,
	`audio_url` text,
	`duration_seconds` real NOT NULL,
	`aspect_ratio` text DEFAULT '9:16' NOT NULL,
	`video_model` text,
	`image_model` text,
	`mode` text DEFAULT 'person' NOT NULL,
	`scenario_id` text,
	`instructions` text,
	`voice_mode` text DEFAULT 'original' NOT NULL,
	`voice_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `person_swap_items` (
	`id` text PRIMARY KEY NOT NULL,
	`swap_id` text NOT NULL,
	`user_id` text NOT NULL,
	`avatar_id` text,
	`avatar_name` text DEFAULT '' NOT NULL,
	`reference_urls` text DEFAULT '[]' NOT NULL,
	`keyframe_url` text,
	`raw_video_url` text,
	`video_url` text,
	`voice_id` text,
	`status` text DEFAULT 'frame' NOT NULL,
	`error` text,
	`video_model` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`swap_id`) REFERENCES `person_swaps`(`id`) ON UPDATE no action ON DELETE cascade
);
