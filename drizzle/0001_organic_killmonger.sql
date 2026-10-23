CREATE TABLE `order_events` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_role` text NOT NULL,
	`event` text NOT NULL,
	`from_status` text NOT NULL,
	`to_status` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `events_order_idx` ON `order_events` (`order_id`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`provider` text DEFAULT 'KBZPay' NOT NULL,
	`transaction_id` text NOT NULL,
	`payer_name` text NOT NULL,
	`amount` integer NOT NULL,
	`status` text DEFAULT 'Proof Submitted' NOT NULL,
	`proof_key` text NOT NULL,
	`proof_type` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`verified_at` text,
	`verified_by` text,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_transaction_unique` ON `payments` (`provider`,`transaction_id`);--> statement-breakpoint
CREATE INDEX `payment_order_idx` ON `payments` (`order_id`);--> statement-breakpoint
ALTER TABLE `orders` ADD `amount` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `currency` text DEFAULT 'MMK' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `service_snapshot` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_status` text DEFAULT 'Unpaid' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `internal_note` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `delivery_note` text DEFAULT '' NOT NULL;