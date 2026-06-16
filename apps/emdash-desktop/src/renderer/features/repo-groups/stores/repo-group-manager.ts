import { makeObservable, observable, runInAction } from 'mobx';
import type { ProjectManagerStore } from '@renderer/features/projects/stores/project-manager';
import { events, rpc } from '@renderer/lib/ipc';
import { repoGroupEventChannel } from '@shared/core/repo-groups/repo-group-events';
import type {
  CreateRepoGroupParams,
  RepoGroupError,
  UpdateRepoGroupParams,
} from '@shared/core/repo-groups/repo-groups';
import type { Result } from '@shared/lib/result';
import { RepoGroupStore } from './repo-group-store';

export class RepoGroupManagerStore {
  groups = observable.map<string, RepoGroupStore>();

  constructor(private readonly projectManager: ProjectManagerStore) {
    makeObservable(this, { groups: observable });

    events.on(repoGroupEventChannel, (event) => {
      if (event.type === 'created' || event.type === 'updated') {
        runInAction(() => {
          const existing = this.groups.get(event.group.id);
          if (existing) {
            existing.data = event.group;
          } else {
            this.groups.set(
              event.group.id,
              new RepoGroupStore(event.group, (id) => this.projectManager.projects.get(id))
            );
          }
        });
      } else if (event.type === 'deleted') {
        runInAction(() => {
          this.groups.delete(event.id);
        });
      }
    });
  }

  async load(): Promise<void> {
    const rawGroups = await rpc.repoGroups.getRepoGroups();
    const stores: RepoGroupStore[] = [];
    runInAction(() => {
      for (const g of rawGroups) {
        let store = this.groups.get(g.id);
        if (!store) {
          store = new RepoGroupStore(g, (id) => this.projectManager.projects.get(id));
          this.groups.set(g.id, store);
        }
        stores.push(store);
      }
    });
    // Eager-load group tasks so the sidebar can list them under each workspace.
    // Per-group failures must not break app bootstrap.
    await Promise.all(stores.map((s) => s.loadGroupTasks().catch(() => undefined)));
  }

  async createGroup(params: CreateRepoGroupParams): Promise<Result<string, RepoGroupError>> {
    const result = await rpc.repoGroups.createRepoGroup(params);
    if (!result.success) return result;
    return { success: true, data: result.data.id };
  }

  async updateGroup(
    id: string,
    params: UpdateRepoGroupParams
  ): Promise<Result<void, RepoGroupError>> {
    const result = await rpc.repoGroups.updateRepoGroup(id, params);
    if (!result.success) return result;
    return { success: true, data: undefined };
  }

  async deleteGroup(id: string): Promise<Result<void, RepoGroupError>> {
    return rpc.repoGroups.deleteRepoGroup(id);
  }
}
