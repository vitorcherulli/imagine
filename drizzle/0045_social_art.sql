ALTER TABLE `projects` ADD `social_art` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `social_references` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `social_reference_notes` text;--> statement-breakpoint
ALTER TABLE `social_slides` ADD `art` text;--> statement-breakpoint
CREATE TABLE `social_art_brand_kits` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_dna_id` text NOT NULL,
	`handle` text DEFAULT '' NOT NULL,
	`colors` text DEFAULT '{}' NOT NULL,
	`accent_shine` integer DEFAULT true NOT NULL,
	`font_heading` text DEFAULT 'Montserrat' NOT NULL,
	`font_body` text DEFAULT 'Montserrat' NOT NULL,
	`uppercase_titles` integer DEFAULT true NOT NULL,
	`decor_color` text DEFAULT '#f59e0b' NOT NULL,
	`decor_default` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`project_dna_id`) REFERENCES `project_dna`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `social_art_brand_kits_project_dna_id_unique` ON `social_art_brand_kits` (`project_dna_id`);
