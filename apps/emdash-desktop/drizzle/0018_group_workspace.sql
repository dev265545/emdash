ALTER TABLE `group_tasks` ADD COLUMN `workspace_path` text;
ALTER TABLE `group_tasks` ADD COLUMN `agent_task_id` text REFERENCES `tasks`(`id`) ON DELETE SET NULL;
ALTER TABLE `group_task_members` ADD COLUMN `worktree_path` text;
