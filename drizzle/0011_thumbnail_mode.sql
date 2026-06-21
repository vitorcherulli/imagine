ALTER TABLE `youtube_metadata` ADD `thumbnail_mode` text DEFAULT 'with_title';
--> statement-breakpoint
ALTER TABLE `youtube_metadata` ADD `thumbnail_prompt` text;
