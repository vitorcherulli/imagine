ALTER TABLE projects ADD COLUMN timeline_free_edit INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE story_blocks ADD COLUMN video_timeline_start REAL;
--> statement-breakpoint
ALTER TABLE story_blocks ADD COLUMN narration_timeline_start REAL;
--> statement-breakpoint
ALTER TABLE story_blocks ADD COLUMN scene_timeline_start REAL;
