ALTER TABLE projects ADD COLUMN music_start_seconds real NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE projects ADD COLUMN music_span_seconds real;
