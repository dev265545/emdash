import { appState } from '@renderer/lib/stores/app-state';
import type { RepoGroupManagerStore } from './repo-group-manager';
import type { RepoGroupStore } from './repo-group-store';

export function getRepoGroupManagerStore(): RepoGroupManagerStore {
  return appState.repoGroups;
}

export function getRepoGroupStore(repoGroupId: string): RepoGroupStore | undefined {
  return getRepoGroupManagerStore().groups.get(repoGroupId);
}

/**
 * If `agentTaskId` is the bootstrapped agent task of a group task, returns the
 * owning group task's id (and group id). Reactive — reads observable stores, so
 * components re-render when group tasks load or update. Returns undefined for
 * ordinary single-repo tasks.
 */
export function getGroupContextForAgentTask(
  agentTaskId: string
): { repoGroupId: string; groupTaskId: string } | undefined {
  for (const group of getRepoGroupManagerStore().groups.values()) {
    for (const task of group.groupTasks.values()) {
      if (task.agentTaskId === agentTaskId) {
        return { repoGroupId: group.data.id, groupTaskId: task.data.id };
      }
    }
  }
  return undefined;
}
