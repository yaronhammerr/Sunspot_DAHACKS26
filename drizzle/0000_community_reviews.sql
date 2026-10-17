CREATE TABLE `viewpoint_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`viewpoint_id` text NOT NULL,
	`visitor_id` text NOT NULL,
	`display_name` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `comments_viewpoint_time` ON `viewpoint_comments` (`viewpoint_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `comments_visitor_time` ON `viewpoint_comments` (`visitor_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `viewpoint_ratings` (
	`viewpoint_id` text NOT NULL,
	`visitor_id` text NOT NULL,
	`stars` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`viewpoint_id`, `visitor_id`)
);
