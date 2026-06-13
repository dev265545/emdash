import { makeAutoObservable } from 'mobx';
import type { GroupTask, GroupTaskStatus } from '@shared/core/repo-groups/group-tasks';

export class GroupTaskStore {
  data: GroupTask;

  constructor(data: GroupTask) {
    this.data = data;
    makeAutoObservable(this);
  }

  get isArchived(): boolean {
    return !!this.data.archivedAt;
  }

  get rollupStatus(): GroupTaskStatus {
    return this.data.status;
  }

  get agentTaskId(): string | undefined {
    return this.data.agentTaskId;
  }

  get workspacePath(): string | undefined {
    return this.data.workspacePath;
  }

  get hasWorkspace(): boolean {
    return !!this.data.workspacePath && !!this.data.agentTaskId;
  }

  get memberCount(): number {
    return Object.values(this.data.memberWorktreePaths).filter(Boolean).length;
  }
}
