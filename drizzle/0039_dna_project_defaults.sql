ALTER TABLE `project_dna` ADD COLUMN `llm_model` text;
--> statement-breakpoint
ALTER TABLE `project_dna` ADD COLUMN `image_model` text;
--> statement-breakpoint
ALTER TABLE `project_dna` ADD COLUMN `video_model` text;
--> statement-breakpoint
ALTER TABLE `project_dna` ADD COLUMN `video_clip_audio` text;
--> statement-breakpoint
ALTER TABLE `project_dna` ADD COLUMN `tts_model` text;
--> statement-breakpoint
ALTER TABLE `project_dna` ADD COLUMN `tts_voice` text;
--> statement-breakpoint
ALTER TABLE `project_dna` ADD COLUMN `video_format` text;
--> statement-breakpoint
ALTER TABLE `project_dna` ADD COLUMN `cut_pace` text;
--> statement-breakpoint
ALTER TABLE `project_dna` ADD COLUMN `script_language` text;
--> statement-breakpoint
ALTER TABLE `project_dna` ADD COLUMN `target_duration_seconds` integer;
