import path from 'node:path';
import { asc, eq } from 'drizzle-orm';
import { LocalExecutionContext } from '@main/core/execution-context/local-execution-context';
import { LocalFileSystem } from '@main/core/fs/impl/local-fs';
import { GitService } from '@main/core/git/impl/git-service';
import { db } from '@main/db/client';
import { groupTaskMembers, projects } from '@main/db/schema';
import { log } from '@main/lib/logger';
import type { CommitError, DiffMode, DiffResult } from '@shared/core/git/git';
import type { GroupRepoChanges } from '@shared/core/repo-groups/group-changes';
import { err, type Result } from '@shared/lib/result';

type MemberRepo = {
  projectId: string;
  projectName: string;
  worktreePath: string;
};

/** Builds a short-lived GitService rooted at a worktree subdir. Caller disposes. */
function gitFor(worktreePath: string): GitService {
  const ctx = new LocalExecutionContext({ root: worktreePath });
  const fs = new LocalFileSystem(worktreePath);
  return new GitService(ctx, fs);
}

class GroupChangesService {
  /** Resolves member repos (with worktree paths) for a group task, in sort order. */
  private async getMembers(groupTaskId: string): Promise<MemberRepo[]> {
    const rows = await db
      .select()
      .from(groupTaskMembers)
      .where(eq(groupTaskMembers.groupTaskId, groupTaskId))
      .orderBy(asc(groupTaskMembers.sortOrder));

    const members: MemberRepo[] = [];
    for (const row of rows) {
      if (!row.worktreePath) continue;
      const [project] = await db
        .select({ name: projects.name })
        .from(projects)
        .where(eq(projects.id, row.projectId))
        .limit(1);
      members.push({
        projectId: row.projectId,
        projectName: project?.name ?? path.basename(row.worktreePath),
        worktreePath: row.worktreePath,
      });
    }
    return members;
  }

  /** Resolves the worktree path for one member, validating it belongs to the group task. */
  private async resolveWorktreePath(
    groupTaskId: string,
    projectId: string
  ): Promise<string | null> {
    const member = (await this.getMembers(groupTaskId)).find((m) => m.projectId === projectId);
    return member?.worktreePath ?? null;
  }

  async getRepoChanges(groupTaskId: string): Promise<GroupRepoChanges[]> {
    const members = await this.getMembers(groupTaskId);
    return Promise.all(
      members.map(async (m) => {
        const git = gitFor(m.worktreePath);
        try {
          const status = await git.getFullStatus();
          return {
            projectId: m.projectId,
            projectName: m.projectName,
            worktreePath: m.worktreePath,
            branch: status.currentBranch,
            staged: status.staged,
            unstaged: status.unstaged,
            totalAdded: status.totalAdded,
            totalDeleted: status.totalDeleted,
          } satisfies GroupRepoChanges;
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          log.warn(`[group-changes] status failed for ${m.worktreePath}:`, message);
          return {
            projectId: m.projectId,
            projectName: m.projectName,
            worktreePath: m.worktreePath,
            branch: null,
            staged: [],
            unstaged: [],
            totalAdded: 0,
            totalDeleted: 0,
            error: message,
          } satisfies GroupRepoChanges;
        } finally {
          git.dispose();
        }
      })
    );
  }

  async getFileDiff(
    groupTaskId: string,
    projectId: string,
    filePath: string,
    base?: DiffMode
  ): Promise<DiffResult | null> {
    const worktreePath = await this.resolveWorktreePath(groupTaskId, projectId);
    if (!worktreePath) return null;
    const git = gitFor(worktreePath);
    try {
      return await git.getFileDiff(filePath, base);
    } finally {
      git.dispose();
    }
  }

  private async withGit<T>(
    groupTaskId: string,
    projectId: string,
    fn: (git: GitService) => Promise<T>
  ): Promise<T | null> {
    const worktreePath = await this.resolveWorktreePath(groupTaskId, projectId);
    if (!worktreePath) return null;
    const git = gitFor(worktreePath);
    try {
      return await fn(git);
    } finally {
      git.dispose();
    }
  }

  async stageAll(groupTaskId: string, projectId: string): Promise<void> {
    await this.withGit(groupTaskId, projectId, (git) => git.stageAllFiles());
  }

  async unstageAll(groupTaskId: string, projectId: string): Promise<void> {
    await this.withGit(groupTaskId, projectId, (git) => git.unstageAllFiles());
  }

  async stageFiles(groupTaskId: string, projectId: string, filePaths: string[]): Promise<void> {
    await this.withGit(groupTaskId, projectId, (git) => git.stageFiles(filePaths));
  }

  async unstageFiles(groupTaskId: string, projectId: string, filePaths: string[]): Promise<void> {
    await this.withGit(groupTaskId, projectId, (git) => git.unstageFiles(filePaths));
  }

  async revertFiles(groupTaskId: string, projectId: string, filePaths: string[]): Promise<void> {
    await this.withGit(groupTaskId, projectId, (git) => git.revertFiles(filePaths));
  }

  async commit(
    groupTaskId: string,
    projectId: string,
    message: string
  ): Promise<Result<{ hash: string }, CommitError>> {
    const result = await this.withGit(groupTaskId, projectId, (git) => git.commit(message));
    if (result === null) return err({ type: 'error', message: 'Repo not found in group task' });
    return result;
  }
}

export const groupChangesService = new GroupChangesService();
