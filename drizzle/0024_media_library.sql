CREATE TABLE `media_library_folders` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `parent_id` text,
  `name` text NOT NULL,
  `position` integer DEFAULT 0 NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `media_library_assets` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `folder_id` text,
  `name` text NOT NULL,
  `url` text NOT NULL,
  `mime_type` text DEFAULT 'image/jpeg' NOT NULL,
  `kind` text DEFAULT 'image' NOT NULL,
  `source` text DEFAULT 'upload' NOT NULL,
  `project_id` text,
  `block_id` text,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `media_library_assets_user_folder` ON `media_library_assets` (`user_id`, `folder_id`);
--> statement-breakpoint
CREATE INDEX `media_library_assets_user_url` ON `media_library_assets` (`user_id`, `url`);
