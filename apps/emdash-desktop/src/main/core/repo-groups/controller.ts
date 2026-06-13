import type { DiffMode } from '@shared/core/git/git';
import { createRPCController } from '@shared/lib/ipc/rpc';
import { groupChangesService } from './group-changes-service';
import { groupTaskService } from './group-task-service';
import { repoGroupService } from './repo-group-service';

export const repoGroupController = createRPCController({
  getRepoGroups: () => repoGroupService.getAll(),
  createRepoGroup: (params: Parameters<typeof repoGroupService.create>[0]) =>
    repoGroupService.create(params),
  updateRepoGroup: (id: string, params: Parameters<typeof repoGroupService.update>[1]) =>
    repoGroupService.update(id, params),
  deleteRepoGroup: (id: string) => repoGroupService.delete(id),

  getGroupTasks: (repoGroupId: string) => groupTaskService.getAll(repoGroupId),
  getGroupTaskByAgentTaskId: (agentTaskId: string) =>
    groupTaskService.getByAgentTaskId(agentTaskId),
  createGroupTask: (params: Parameters<typeof groupTaskService.create>[0]) =>
    groupTaskService.create(params),
  updateGroupTask: (id: string, params: Parameters<typeof groupTaskService.update>[1]) =>
    groupTaskService.update(id, params),
  archiveGroupTask: (id: string) => groupTaskService.archive(id),
  deleteGroupTask: (id: string) => groupTaskService.delete(id),

  // Per-repo working-tree changes for a group task (one git repo per worktree subdir).
  getGroupTaskChanges: (groupTaskId: string) => groupChangesService.getRepoChanges(groupTaskId),
  getGroupTaskFileDiff: (
    groupTaskId: string,
    projectId: string,
    filePath: string,
    base?: DiffMode
  ) => groupChangesService.getFileDiff(groupTaskId, projectId, filePath, base),
  stageGroupTaskFiles: (groupTaskId: string, projectId: string, filePaths: string[]) =>
    groupChangesService.stageFiles(groupTaskId, projectId, filePaths),
  unstageGroupTaskFiles: (groupTaskId: string, projectId: string, filePaths: string[]) =>
    groupChangesService.unstageFiles(groupTaskId, projectId, filePaths),
  stageAllGroupTaskFiles: (groupTaskId: string, projectId: string) =>
    groupChangesService.stageAll(groupTaskId, projectId),
  unstageAllGroupTaskFiles: (groupTaskId: string, projectId: string) =>
    groupChangesService.unstageAll(groupTaskId, projectId),
  revertGroupTaskFiles: (groupTaskId: string, projectId: string, filePaths: string[]) =>
    groupChangesService.revertFiles(groupTaskId, projectId, filePaths),
  commitGroupTaskRepo: (groupTaskId: string, projectId: string, message: string) =>
    groupChangesService.commit(groupTaskId, projectId, message),
});
