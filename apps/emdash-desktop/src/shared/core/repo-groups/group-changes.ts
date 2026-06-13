import type { GitChange } from '@shared/core/git/git';

/**
 * Per-repository working-tree status for a single member repo of a group task.
 * A group task's agent works in the group root (a folder of worktrees), so git
 * status must be computed per worktree subdirectory rather than against the
 * group root (which is not itself a git repository).
 */
export type GroupRepoChanges = {
  projectId: string;
  projectName: string;
  worktreePath: string;
  branch: string | null;
  staged: GitChange[];
  unstaged: GitChange[];
  totalAdded: number;
  totalDeleted: number;
  /** Set when git status failed for this repo (e.g. worktree missing). */
  error?: string;
};
