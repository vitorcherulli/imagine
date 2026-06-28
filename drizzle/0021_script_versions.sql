CREATE TABLE `script_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`version` integer NOT NULL,
	`script` text NOT NULL,
	`notes` text,
	`source` text NOT NULL,
	`summary` text,
	`word_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `script_versions_project_version` ON `script_versions` (`project_id`,`version`);
--> statement-breakpoint
ALTER TABLE `projects` ADD `script_draft_version` integer;
