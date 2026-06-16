CREATE TABLE `repo_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_repo_groups_name` ON `repo_groups` (`name`);
--> statement-breakpoint
CREATE TABLE `repo_group_members` (
	`repo_group_id` text NOT NULL REFERENCES `repo_groups`(`id`) ON DELETE CASCADE,
	`project_id` text NOT NULL REFERENCES `projects`(`id`) ON DELETE CASCADE,
	`sort_order` integer NOT NULL DEFAULT 0,
	PRIMARY KEY (`repo_group_id`, `project_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_repo_group_members_project` ON `repo_group_members` (`project_id`);
