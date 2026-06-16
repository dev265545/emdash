import type { TaskLifecycleStatus } from '@shared/core/tasks/tasks';

export type GroupTaskStatus = TaskLifecycleStatus;

export type GroupTask = {
  id: string;
  repoGroupId: string;
  name: string;
  status: GroupTaskStatus;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
  /** Path to the group workspace parent directory (contains all repo worktrees as subdirs). */
  workspacePath?: string;
  /** ID of the single underlying task that hosts the PTY/conversation for this group task. */
  agentTaskId?: string;
  /** projectId -> worktreePath for each member repo */
  memberWorktreePaths: Record<string, string | null>;
  /**
   * Per-member diff-only child tasks. Each member repo's worktree is registered
   * as a real workspace + task so the group view can reuse the standard
   * single-repo changes panel and Monaco diff viewer per repo. `taskId` is null
   * until the child task has been created during bootstrap.
   */
  members: GroupTaskMember[];
};

export type GroupTaskMember = {
  projectId: string;
  worktreePath: string | null;
  /** The diff-only child task that owns this member repo's worktree workspace. */
  taskId: string | null;
};

export type CreateGroupTaskParams = {
  repoGroupId: string;
  name: string;
  /** Optional initial prompt injected into the agent's first conversation. */
  initialPrompt?: string;
};

export type UpdateGroupTaskParams = {
  name?: string;
  status?: GroupTaskStatus;
};

export type GroupTaskError =
  | { type: 'not-found' }
  | { type: 'group-not-found' }
  | { type: 'workspace-bootstrap-failed'; message: string }
  | { type: 'error'; message: string };
