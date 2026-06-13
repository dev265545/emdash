import { Layers } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import React, { useState } from 'react';
import { useParams } from '@renderer/lib/layout/navigation-provider';
import { cn } from '@renderer/utils/utils';
import { getRepoGroupStore } from '../stores/repo-group-selectors';
import { GroupTasksTab } from './group-tasks-tab';
import { ReposTab } from './repos-tab';

type Tab = 'repos' | 'tasks';

export const RepoGroupMainPanel = observer(function RepoGroupMainPanel() {
  const { params } = useParams('repoGroup');
  const group = getRepoGroupStore(params.repoGroupId);
  const [activeTab, setActiveTab] = useState<Tab>('tasks');

  if (!group) {
    return (
      <div className="flex flex-1 items-center justify-center text-foreground-tertiary-muted">
        <Layers className="mr-2 h-5 w-5" />
        <span>Workspace not found</span>
      </div>
    );
  }

  const repoGroupId = params.repoGroupId;
  const memberCount = group.data.memberProjectIds.length;
  const belowMinMembers = memberCount < 2;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Layers className="h-4 w-4 shrink-0 text-foreground-tertiary-muted" />
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{group.data.name}</h1>
        <span className="shrink-0 text-xs text-foreground-tertiary-muted">
          {memberCount} repo{memberCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Warning banner if below min members */}
      {belowMinMembers && (
        <div className="border-b bg-yellow-500/10 px-4 py-2 text-xs text-yellow-600 dark:text-yellow-400">
          Add at least one more repo to enable group tasks.
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b px-4">
        {(['repos', 'tasks'] as Tab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              'border-b-2 px-3 py-2 text-sm capitalize transition-colors',
              activeTab === tab
                ? 'border-accent text-foreground'
                : 'border-transparent text-foreground-tertiary-muted hover:text-foreground'
            )}
          >
            {tab}
            {tab === 'tasks' && group.activeGroupTaskCount > 0 && (
              <span className="bg-accent text-accent-foreground ml-1.5 rounded-full px-1.5 text-xs font-medium">
                {group.activeGroupTaskCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {activeTab === 'repos' ? (
          <ReposTab repoGroupId={repoGroupId} />
        ) : (
          <GroupTasksTab repoGroupId={repoGroupId} />
        )}
      </div>
    </div>
  );
});
