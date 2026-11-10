ALTER TABLE `telegram_widget_messages` ADD `fallback_message_id` integer;--> statement-breakpoint
ALTER TABLE `telegram_widget_messages` ADD `widget_available` integer DEFAULT 1 NOT NULL;