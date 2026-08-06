CREATE TABLE IF NOT EXISTS scenarios (
	id text PRIMARY KEY NOT NULL,
	user_id text NOT NULL,
	name text NOT NULL,
	description text,
	image_urls text DEFAULT '[]' NOT NULL,
	primary_image_url text,
	created_at integer DEFAULT (unixepoch()) NOT NULL,
	updated_at integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
ALTER TABLE projects ADD COLUMN scenario_id text;
--> statement-breakpoint
ALTER TABLE story_blocks ADD COLUMN scenario_id text;
