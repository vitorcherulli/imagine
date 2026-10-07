CREATE TABLE IF NOT EXISTS `photo_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`folder_id` text,
	`name` text NOT NULL,
	`instructions` text,
	`image_model` text,
	`aspect_ratio` text DEFAULT 'original' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `photo_batch_items` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`user_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`original_name` text DEFAULT '' NOT NULL,
	`source_url` text NOT NULL,
	`width` integer,
	`height` integer,
	`status` text DEFAULT 'idle' NOT NULL,
	`result_url` text,
	`error` text,
	`image_model` text,
	`instructions` text,
	`approved` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `photo_batches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `photo_batch_items_batch` ON `photo_batch_items` (`batch_id`, `position`);
