CREATE TABLE `hosting_health` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`runtime` text NOT NULL,
	`projects` integer NOT NULL,
	`running` integer NOT NULL,
	`unknown` integer NOT NULL,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `telegram_widget_messages` (
	`chat_id` text NOT NULL,
	`message_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`resource_id` text DEFAULT '' NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`template_version` integer DEFAULT 1 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`chat_id`, `message_id`)
);
--> statement-breakpoint
CREATE INDEX `widget_resource_idx` ON `telegram_widget_messages` (`kind`,`resource_id`,`active`);--> statement-breakpoint
CREATE TABLE `telegram_widget_queries` (
	`id` text PRIMARY KEY NOT NULL,
	`update_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `widget_update_unique` ON `telegram_widget_queries` (`update_id`);--> statement-breakpoint
CREATE INDEX `widget_query_rate_idx` ON `telegram_widget_queries` (`user_id`,`created_at`);