CREATE TABLE IF NOT EXISTS dubbing_tracks (
  id text PRIMARY KEY NOT NULL,
  project_id text NOT NULL,
  language_id text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  tts_voice text,
  created_at integer DEFAULT (unixepoch()) NOT NULL,
  updated_at integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS dubbing_tracks_project_language
  ON dubbing_tracks (project_id, language_id);

CREATE TABLE IF NOT EXISTS dubbing_segment_locales (
  id text PRIMARY KEY NOT NULL,
  segment_id text NOT NULL,
  track_id text NOT NULL,
  translated_text text DEFAULT '' NOT NULL,
  tts_audio_url text,
  tts_duration_seconds real,
  tts_model text,
  tts_voice text,
  stretch_ratio real,
  status text DEFAULT 'pending' NOT NULL,
  error_message text,
  created_at integer DEFAULT (unixepoch()) NOT NULL,
  updated_at integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (segment_id) REFERENCES dubbing_segments(id) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (track_id) REFERENCES dubbing_tracks(id) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS dubbing_segment_locales_segment_track
  ON dubbing_segment_locales (segment_id, track_id);

CREATE INDEX IF NOT EXISTS dubbing_segment_locales_track
  ON dubbing_segment_locales (track_id);

ALTER TABLE dubbing_renders ADD COLUMN track_id text;
