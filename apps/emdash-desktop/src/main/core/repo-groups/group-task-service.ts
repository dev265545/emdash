import { and, asc, eq } from 'drizzle-orm';
import { taskService } from '@main/core/tasks/task-service';
import { mapTaskRowToTask } from '@main/core/tasks/utils/utils';
import { db } from '@main/db/client';
import { groupTaskMembers, groupTasks, repoGroupMembers, tasks, workspaces } from '@main/db/schema';
import { events } from '@main/lib/events';
import { log } from '@main/lib/logger';
import type {
  CreateGroupTaskParams,
  GroupTask,
  GroupTaskError,
  GroupTaskMember,
  UpdateGroupTaskParams,
} from '@shared/core/repo-groups/group-tasks';
import { groupTaskEventChannel } from '@shared/core/repo-groups/repo-group-events';
import { err, ok, type Result } from '@shared/lib/result';
import { bootstrapGroupWorkspace } from './group-workspace-bootstrap';

function rowToGroupTask(
  row: typeof groupTasks.$inferSelect,
  members: GroupTaskMember[]
): GroupTask {
  const memberWorktreePaths: Record<string, string | null> = {};
  for (const m of members) memberWorktreePaths[m.projectId] = m.worktreePath;
  return {
    id: row.id,
    repoGroupId: row.repoGroupId,
    name: row.name,
    status: row.status as GroupTask['status'],
    archivedAt: row.archivedAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    workspacePath: row.workspacePath ?? undefined,
    agentTaskId: row.agentTaskId ?? undefined,
    memberWorktreePaths,
    members,
  };
}

async function loadMembers(groupTaskId: string): Promise<GroupTaskMember[]> {
  const members = await db
    .select()
    .from(groupTaskMembers)
    .where(eq(groupTaskMembers.groupTaskId, groupTaskId))
    .orderBy(asc(groupTaskMembers.sortOrder));
  return members.map((m) => ({
    projectId: m.projectId,
    worktreePath: m.worktreePath ?? null,
    taskId: m.taskId ?? null,
  }));
}

class GroupTaskService {
  async getAll(repoGroupId: string): Promise<GroupTask[]> {
    const rows = await db
      .select()
      .from(groupTasks)
      .where(eq(groupTasks.repoGroupId, repoGroupId))
      .orderBy(asc(groupTasks.createdAt));
    return Promise.all(rows.map(async (row) => rowToGroupTask(row, await loadMembers(row.id))));
  }

  async getById(id: string): Promise<GroupTask | null> {
    const [row] = await db.select().from(groupTasks).where(eq(groupTasks.id, id)).limit(1);
    if (!row) return null;
    return rowToGroupTask(row, await loadMembers(id));
  }

  /** Finds the group task whose bootstrapped agent task is `agentTaskId`, if any. */
  async getByAgentTaskId(agentTaskId: string): Promise<GroupTask | null> {
    const [row] = await db
      .select()
      .from(groupTasks)
      .where(eq(groupTasks.agentTaskId, agentTaskId))
      .limit(1);
    if (!row) return null;
    return rowToGroupTask(row, await loadMembers(row.id));
  }

  async create(params: CreateGroupTaskParams): Promise<Result<GroupTask, GroupTaskError>> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // 1. Get member project IDs for this group
    const members = await db
      .select()
      .from(repoGroupMembers)
      .where(eq(repoGroupMembers.repoGroupId, params.repoGroupId))
      .orderBy(asc(repoGroupMembers.sortOrder));

    if (members.length < 2) {
      return err({ type: 'group-not-found' });
    }

    // 2. Insert group_task + member rows immediately so the RPC returns fast.
    //    Heavy bootstrap (git worktree add + workspace/task rows) runs in background.
    try {
      db.transaction((tx) => {
        tx.insert(groupTasks)
          .values({
            id,
            repoGroupId: params.repoGroupId,
            name: params.name,
            status: 'in_progress',
            createdAt: now,
            updatedAt: now,
          })
          .run();
        tx.insert(groupTaskMembers)
          .values(
            members.map((m, i) => ({
              groupTaskId: id,
              projectId: m.projectId,
              worktreePath: null,
              sortOrder: i,
            }))
          )
          .run();
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return err({ type: 'error', message: msg });
    }

    const task = await this.getById(id);
    if (!task) return err({ type: 'error', message: 'Failed to read created group task' });

    events.emit(groupTaskEventChannel, { type: 'created', task });

    // 3. Bootstrap workspace in background (non-blocking).
    void this._bootstrapWorkspace(
      id,
      params,
      members.map((m) => m.projectId)
    );

    return ok(task);
  }

  private async _bootstrapWorkspace(
    id: string,
    params: CreateGroupTaskParams,
    memberProjectIds: string[]
  ): Promise<void> {
    const now = new Date().toISOString();
    log.info(
      `[group-task] _bootstrapWorkspace START id=${id} projects=${memberProjectIds.join(',')}`
    );

    // Bootstrap group workspace (creates git worktrees per repo)
    let groupDir: string;
    let worktreeResults: { projectId: string; worktreePath: string }[];

    try {
      const result = await bootstrapGroupWorkspace(id, memberProjectIds);
      groupDir = result.groupDir;
      worktreeResults = result.worktrees;
      log.info(
        `[group-task] bootstrap done groupDir=${groupDir} worktrees=${worktreeResults.length}`
      );
    } catch (e: unknown) {
      log.error('[group-task] workspace bootstrap failed:', e);
      return;
    }

    if (worktreeResults.length === 0) {
      log.error('[group-task] no worktrees created — all repos failed, aborting');
      return;
    }

    // Update member rows with worktree paths
    for (const wt of worktreeResults) {
      await db
        .update(groupTaskMembers)
        .set({ worktreePath: wt.worktreePath })
        .where(
          and(eq(groupTaskMembers.groupTaskId, id), eq(groupTaskMembers.projectId, wt.projectId))
        );
    }

    // Create ONE workspace + task record. Use kind='project-root' so the bootstrap
    // service uses workspaceRow.path directly (no allowed-roots check, no git ops).
    const primaryProjectId = memberProjectIds[0];
    const workspaceId = crypto.randomUUID();
    const agentTaskId = crypto.randomUUID();

    const repoNames = worktreeResults.map((wt) => wt.worktreePath.split('/').pop() ?? wt.projectId);
    const contextPrompt = params.initialPrompt
      ? `${params.initialPrompt}\n\nYou are working in a multi-repo workspace. The following repositories are available as subdirectories:\n${repoNames.map((n) => `  - ${n}/`).join('\n')}\n\nEach subdirectory is a separate git worktree. Use \`cd <repo>\` to navigate between them. Git operations (commit, diff, push) work independently per repo.`
      : `You are working in a multi-repo workspace. The following repositories are available as subdirectories:\n${repoNames.map((n) => `  - ${n}/`).join('\n')}\n\nEach subdirectory is a separate git worktree. Use \`cd <repo>\` to navigate between them. Git operations work independently per repo.`;

    log.info(
      `[group-task] creating workspace+task rows wsId=${workspaceId} taskId=${agentTaskId} groupDir=${groupDir}`
    );
    try {
      db.transaction((tx) => {
        // kind='project-root' tells WorkspaceBootstrapService to use workspaceRow.path directly.
        tx.insert(workspaces)
          .values({
            id: workspaceId,
            kind: 'project-root',
            location: 'local',
            type: 'local',
            path: groupDir,
            config: null,
          })
          .run();

        tx.insert(tasks)
          .values({
            id: agentTaskId,
            projectId: primaryProjectId,
            name: params.name,
            status: 'in_progress',
            workspaceId,
            type: 'task',
            createdAt: now,
            updatedAt: now,
            statusChangedAt: now,
            isPinned: 0,
            workspaceIntent: null,
          })
          .run();
      });

      const [taskRow] = await db.select().from(tasks).where(eq(tasks.id, agentTaskId)).limit(1);
      if (taskRow) {
        taskService.notifyTaskCreated(mapTaskRowToTask(taskRow), {
          id: agentTaskId,
          projectId: primaryProjectId,
          taskConfig: {
            version: '1',
            name: params.name,
            initialStatus: 'in_progress',
            initialConversation: {
              id: crypto.randomUUID(),
              provider: 'claude',
              title: params.name,
              initialPrompt: contextPrompt,
              autoApprove: false,
            },
          },
          workspaceConfig: {
            version: '2',
            git: { kind: 'none' },
            workspace: { kind: 'new-worktree' },
          },
        });
      }
    } catch (e: unknown) {
      log.error('[group-task] failed to create agent task:', e);
      return;
    }

    // Register each member worktree as its own workspace + diff-only child task so the
    // group view can reuse the standard single-repo changes panel and Monaco diff viewer
    // per repo. These tasks have no conversation (the shared agent above handles that).
    await this._createMemberDiffTasks(id, params.name, worktreeResults, now);

    log.info(
      `[group-task] setting workspace_path=${groupDir} agentTaskId=${agentTaskId} on groupTask ${id}`
    );
    // Update group_task with workspace_path and agent_task_id, then notify renderer
    await db
      .update(groupTasks)
      .set({ workspacePath: groupDir, agentTaskId, updatedAt: now })
      .where(eq(groupTasks.id, id));

    const updated = await this.getById(id);
    if (updated) {
      events.emit(groupTaskEventChannel, { type: 'updated', task: updated });
    }
    log.info(`[group-task] _bootstrapWorkspace COMPLETE id=${id}`);
  }

  /**
   * Creates a diff-only child task + workspace for each member worktree and stores
   * the task id on `group_task_members`. `kind:'project-root'` makes provisioning
   * use the existing worktree path directly (no new worktree, no git ops). These
   * tasks have no conversation — the shared group agent does the editing; the child
   * tasks exist so the renderer can mount the standard per-repo diff view.
   */
  private async _createMemberDiffTasks(
    groupTaskId: string,
    groupTaskName: string,
    worktreeResults: { projectId: string; worktreePath: string }[],
    now: string
  ): Promise<void> {
    for (const wt of worktreeResults) {
      const workspaceId = crypto.randomUUID();
      const taskId = crypto.randomUUID();
      try {
        db.transaction((tx) => {
          tx.insert(workspaces)
            .values({
              id: workspaceId,
              kind: 'project-root',
              location: 'local',
              type: 'local',
              path: wt.worktreePath,
              config: null,
            })
            .run();
          tx.insert(tasks)
            .values({
              id: taskId,
              projectId: wt.projectId,
              name: groupTaskName,
              status: 'in_progress',
              workspaceId,
              type: 'task',
              createdAt: now,
              updatedAt: now,
              statusChangedAt: now,
              isPinned: 0,
              workspaceIntent: null,
            })
            .run();
          tx.update(groupTaskMembers)
            .set({ taskId })
            .where(
              and(
                eq(groupTaskMembers.groupTaskId, groupTaskId),
                eq(groupTaskMembers.projectId, wt.projectId)
              )
            )
            .run();
        });
      } catch (e: unknown) {
        log.error(`[group-task] failed to create member diff task for ${wt.projectId}:`, e);
        continue;
      }

      const [taskRow] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
      if (taskRow) {
        // No initialConversation — diff-only. project-root workspace uses the path directly.
        taskService.notifyTaskCreated(mapTaskRowToTask(taskRow), {
          id: taskId,
          projectId: wt.projectId,
          taskConfig: { version: '1', name: groupTaskName, initialStatus: 'in_progress' },
          workspaceConfig: {
            version: '2',
            git: { kind: 'none' },
            workspace: { kind: 'new-worktree' },
          },
        });
      }
    }
  }

  async update(
    id: string,
    params: UpdateGroupTaskParams
  ): Promise<Result<GroupTask, GroupTaskError>> {
    const existing = await this.getById(id);
    if (!existing) return err({ type: 'not-found' });

    const now = new Date().toISOString();
    await db
      .update(groupTasks)
      .set({
        ...(params.name !== undefined ? { name: params.name } : {}),
        ...(params.status !== undefined ? { status: params.status } : {}),
        updatedAt: now,
      })
      .where(eq(groupTasks.id, id));

    const updated = await this.getById(id);
    if (!updated) return err({ type: 'error', message: 'Failed to read updated group task' });

    events.emit(groupTaskEventChannel, { type: 'updated', task: updated });
    return ok(updated);
  }

  async archive(id: string): Promise<Result<GroupTask, GroupTaskError>> {
    const existing = await this.getById(id);
    if (!existing) return err({ type: 'not-found' });

    const now = new Date().toISOString();
    await db
      .update(groupTasks)
      .set({ archivedAt: now, updatedAt: now })
      .where(eq(groupTasks.id, id));

    // Also archive the underlying agent task if it exists
    if (existing.agentTaskId) {
      await db
        .update(tasks)
        .set({ archivedAt: now, updatedAt: now })
        .where(eq(tasks.id, existing.agentTaskId));
    }

    const updated = await this.getById(id);
    if (!updated) return err({ type: 'error', message: 'Failed to read archived group task' });

    events.emit(groupTaskEventChannel, { type: 'updated', task: updated });
    return ok(updated);
  }

  async delete(id: string): Promise<Result<void, GroupTaskError>> {
    const existing = await this.getById(id);
    if (!existing) return err({ type: 'not-found' });

    await db.delete(groupTasks).where(eq(groupTasks.id, id));
    events.emit(groupTaskEventChannel, { type: 'deleted', id, repoGroupId: existing.repoGroupId });
    return ok(undefined);
  }
}

export const groupTaskService = new GroupTaskService();
