import { makeAutoObservable, observable, runInAction } from 'mobx';
import type { ProjectStore } from '@renderer/features/projects/stores/project';
import { events, rpc } from '@renderer/lib/ipc';
import { groupTaskEventChannel } from '@shared/core/repo-groups/repo-group-events';
import type { RepoGroup } from '@shared/core/repo-groups/repo-groups';
import { GroupTaskStore } from './group-task-store';

export class RepoGroupStore {
  data: RepoGroup;
  groupTasks = observable.map<string, GroupTaskStore>();
  groupTasksLoaded = false;

  constructor(
    data: RepoGroup,
    private readonly getProjectStore: (id: string) => ProjectStore | undefined
  ) {
    this.data = data;
    makeAutoObservable(this, { groupTasks: observable });

    events.on(groupTaskEventChannel, (event) => {
      if (event.type === 'created' || event.type === 'updated') {
        if (event.task.repoGroupId !== this.data.id) return;
        runInAction(() => {
          const existing = this.groupTasks.get(event.task.id);
          if (existing) {
            existing.data = event.task;
          } else {
            this.groupTasks.set(event.task.id, new GroupTaskStore(event.task));
          }
        });
      } else if (event.type === 'deleted') {
        if (event.repoGroupId !== this.data.id) return;
        runInAction(() => {
          this.groupTasks.delete(event.id);
        });
      }
    });
  }

  async loadGroupTasks(): Promise<void> {
    if (this.groupTasksLoaded) return;
    const tasks = await rpc.repoGroups.getGroupTasks(this.data.id);
    runInAction(() => {
      for (const t of tasks) {
        if (!this.groupTasks.has(t.id)) {
          this.groupTasks.set(t.id, new GroupTaskStore(t));
        }
      }
      this.groupTasksLoaded = true;
    });
  }

  get memberStores(): (ProjectStore | undefined)[] {
    return this.data.memberProjectIds.map((id) => this.getProjectStore(id));
  }

  get hasUnhealthyMember(): boolean {
    return this.memberStores.some((s) => s?.state === 'unmounted' && s.phase === 'error');
  }

  get activeMemberCount(): number {
    return this.memberStores.filter(Boolean).length;
  }

  get activeGroupTaskCount(): number {
    return Array.from(this.groupTasks.values()).filter((t) => !t.isArchived).length;
  }
}
