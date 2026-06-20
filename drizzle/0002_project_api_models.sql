ALTER TABLE `projects` ADD `llm_model` text;
--> statement-breakpoint
ALTER TABLE `projects` ADD `image_model` text;
--> statement-breakpoint
ALTER TABLE `projects` ADD `video_model` text;
--> statement-breakpoint
ALTER TABLE `projects` ADD `tts_model` text;
--> statement-breakpoint
ALTER TABLE `projects` ADD `tts_voice` text DEFAULT 'auto';
