ALTER TABLE "creative_metrics" ADD COLUMN IF NOT EXISTS "import_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "creative_metric_imports" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "source_file" text DEFAULT '' NOT NULL,
  "period_start" text,
  "period_end" text,
  "rows" integer DEFAULT 0 NOT NULL,
  "matched" integer DEFAULT 0 NOT NULL,
  "imported_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creative_metric_imports_user" ON "creative_metric_imports" ("user_id");
