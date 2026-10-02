ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "social_art" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "social_references" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "social_reference_notes" text;--> statement-breakpoint
ALTER TABLE "social_slides" ADD COLUMN IF NOT EXISTS "art" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_art_brand_kits" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"project_dna_id" text NOT NULL REFERENCES "project_dna"("id") ON DELETE cascade,
	"handle" text DEFAULT '' NOT NULL,
	"colors" text DEFAULT '{}' NOT NULL,
	"accent_shine" boolean DEFAULT true NOT NULL,
	"font_heading" text DEFAULT 'Montserrat' NOT NULL,
	"font_body" text DEFAULT 'Montserrat' NOT NULL,
	"uppercase_titles" boolean DEFAULT true NOT NULL,
	"decor_color" text DEFAULT '#f59e0b' NOT NULL,
	"decor_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "social_art_brand_kits_project_dna_id_unique" ON "social_art_brand_kits" ("project_dna_id");
