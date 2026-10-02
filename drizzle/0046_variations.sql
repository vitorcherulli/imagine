CREATE TABLE IF NOT EXISTS `variation_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`source_image_url` text NOT NULL,
	`instructions` text,
	`aspect_ratio` text DEFAULT '1:1' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `variation_items` (
	`id` text PRIMARY KEY NOT NULL,
	`set_id` text NOT NULL,
	`user_id` text NOT NULL,
	`direction` text,
	`image_url` text,
	`status` text DEFAULT 'generating' NOT NULL,
	`error` text,
	`video_url` text,
	`video_status` text,
	`video_error` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`set_id`) REFERENCES `variation_sets`(`id`) ON UPDATE no action ON DELETE cascade
);
