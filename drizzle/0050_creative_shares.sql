CREATE TABLE IF NOT EXISTS creative_shares (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL,
  token text NOT NULL,
  scope text NOT NULL,
  scope_value text DEFAULT '' NOT NULL,
  expires_at integer,
  views integer DEFAULT 0 NOT NULL,
  last_viewed_at integer,
  created_at integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS creative_shares_token ON creative_shares (token);
