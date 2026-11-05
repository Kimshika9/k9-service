CREATE TABLE `hosting_jobs` (
	`id` integer PRIMARY KEY NOT NULL,
	`payload` text,
	`created_at` integer NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`lease` text
);
