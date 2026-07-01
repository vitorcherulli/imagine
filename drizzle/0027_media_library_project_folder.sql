ALTER TABLE `media_library_folders` ADD `project_id` text;
--> statement-breakpoint
CREATE INDEX `media_library_folders_user_project` ON `media_library_folders` (`user_id`, `project_id`);
