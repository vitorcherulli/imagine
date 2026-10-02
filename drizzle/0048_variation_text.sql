ALTER TABLE `variation_sets` ADD `text_mode` text DEFAULT 'keep' NOT NULL;
--> statement-breakpoint
ALTER TABLE `variation_sets` ADD `custom_text` text;
--> statement-breakpoint
ALTER TABLE `variation_items` ADD `headline` text;
