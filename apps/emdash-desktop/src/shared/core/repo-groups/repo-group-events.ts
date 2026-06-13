import { defineEvent } from '@shared/lib/ipc/events';
import type { RepoGroup } from './repo-groups';

export type RepoGroupEvent =
  | { type: 'created'; group: RepoGroup }
  | { type: 'updated'; group: RepoGroup }
  | { type: 'deleted'; id: string };

export const repoGroupEventChannel = defineEvent<RepoGroupEvent>('repo-group:event');

import type { GroupTask } from './group-tasks';

export type GroupTaskEvent =
  | { type: 'created'; task: GroupTask }
  | { type: 'updated'; task: GroupTask }
  | { type: 'deleted'; id: string; repoGroupId: string };

export const groupTaskEventChannel = defineEvent<GroupTaskEvent>('group-task:event');
