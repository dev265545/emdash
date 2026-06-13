CREATE TABLE `group_tasks` (
  `id` text PRIMARY KEY NOT NULL,
  `repo_group_id` text NOT NULL REFERENCES `repo_groups`(`id`) ON DELETE CASCADE,
  `name` text NOT NULL,
  `status` text NOT NULL DEFAULT 'todo',
  `archived_at` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `idx_group_tasks_repo_group_id` ON `group_tasks` (`repo_group_id`);
CREATE TABLE `group_task_members` (
  `group_task_id` text NOT NULL REFERENCES `group_tasks`(`id`) ON DELETE CASCADE,
  `project_id` text NOT NULL REFERENCES `projects`(`id`) ON DELETE CASCADE,
  `task_id` text REFERENCES `tasks`(`id`) ON DELETE SET NULL,
  `sort_order` integer NOT NULL DEFAULT 0,
  PRIMARY KEY (`group_task_id`, `project_id`)
);
CREATE INDEX `idx_group_task_members_task_id` ON `group_task_members` (`task_id`);
