CREATE TABLE `bot_sessions` (
	`chat_id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_key` text NOT NULL,
	`customer` text NOT NULL,
	`contact` text NOT NULL,
	`service_id` text NOT NULL,
	`service_name` text NOT NULL,
	`details` text NOT NULL,
	`budget` text DEFAULT '' NOT NULL,
	`deadline` text DEFAULT '' NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`source` text NOT NULL,
	`status` text DEFAULT 'New' NOT NULL,
	`history` text NOT NULL,
	`telegram_chat` text,
	`notification` text DEFAULT 'pending' NOT NULL,
	`notification_message` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `orders_customer_idx` ON `orders` (`customer_key`);--> statement-breakpoint
CREATE INDEX `orders_created_idx` ON `orders` (`created_at`);--> statement-breakpoint
CREATE TABLE `services` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `webhook_updates` (
	`id` integer PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL
);
