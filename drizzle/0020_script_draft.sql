ALTER TABLE `projects` ADD `script_draft` text;
--> statement-breakpoint
ALTER TABLE `projects` ADD `script_draft_notes` text;
--> statement-breakpoint
ALTER TABLE `projects` ADD `script_draft_status` text DEFAULT 'none' NOT NULL;
