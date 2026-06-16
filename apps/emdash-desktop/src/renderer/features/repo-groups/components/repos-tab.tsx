import { ArrowRight, FolderClosed, TriangleAlert } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import React from 'react';
import { getProjectStore } from '@renderer/features/projects/stores/project-selectors';
import { useNavigate } from '@renderer/lib/layout/navigation-provider';
import { getRepoGroupStore } from '../stores/repo-group-selectors';

export const ReposTab = observer(function ReposTab({ repoGroupId }: { repoGroupId: string }) {
  const { navigate } = useNavigate();
  const group = getRepoGroupStore(repoGroupId);

  if (!group) return null;

  if (group.data.memberProjectIds.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-foreground-tertiary-muted">
        No repos in this workspace yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 p-3">
      {group.data.memberProjectIds.map((projectId) => {
        const project = getProjectStore(projectId);
        const name = project?.name ?? projectId;
        const isMissing = !project || (project.state === 'unmounted' && project.phase === 'error');

        return (
          <div
            key={projectId}
            className="hover:bg-accent/50 flex h-9 cursor-pointer items-center justify-between rounded-md px-3 py-1.5 text-sm"
            onClick={() => navigate('project', { projectId })}
          >
            <div className="flex min-w-0 items-center gap-2">
              <FolderClosed className="h-4 w-4 shrink-0 text-foreground-tertiary-muted" />
              <span className="truncate">{name}</span>
              {isMissing && (
                <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-foreground-destructive" />
              )}
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-foreground-tertiary-muted opacity-0 group-hover:opacity-100" />
          </div>
        );
      })}
    </div>
  );
});
