CREATE TABLE `receipt_chunks` (
	`image_key` text NOT NULL,
	`position` integer NOT NULL,
	`data` blob NOT NULL,
	PRIMARY KEY(`image_key`, `position`),
	FOREIGN KEY (`image_key`) REFERENCES `receipt_images`(`key`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `receipt_images` (
	`key` text PRIMARY KEY NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text NOT NULL
);
