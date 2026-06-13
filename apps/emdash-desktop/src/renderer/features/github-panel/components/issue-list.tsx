import { RefreshCw } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import type { Resource } from '@renderer/lib/stores/resource';
import { Button } from '@renderer/lib/ui/button';
import { EmptyState } from '@renderer/lib/ui/empty-state';
import { Spinner } from '@renderer/lib/ui/spinner';
import type { PanelIssue } from '@shared/github-panel';
import { IssueListItem } from './issue-list-item';

export const IssueList = observer(function IssueList({
  resource,
}: {
  resource: Resource<PanelIssue[]>;
}) {
  const issues = resource.data ?? [];
  const isLoading = resource.loading && issues.length === 0;
  const hasError = !!resource.error && issues.length === 0;

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Spinner size="sm" className="text-foreground-passive" />
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="flex flex-col items-center gap-3 p-6 text-center">
        <p className="text-xs text-foreground-error">{resource.error}</p>
        <Button variant="outline" size="sm" onClick={() => resource.invalidate()}>
          <RefreshCw className="mr-1.5 size-3" />
          Retry
        </Button>
      </div>
    );
  }

  if (issues.length === 0) {
    return (
      <EmptyState
        label="No assigned issues"
        description="Issues assigned to you will appear here"
        className="bg-transparent"
      />
    );
  }

  return (
    <div className="flex flex-col">
      {resource.loading && (
        <div className="flex items-center justify-end px-3 py-1">
          <Spinner size="sm" className="text-foreground-passive" />
        </div>
      )}
      {issues.map((issue) => (
        <IssueListItem key={issue.url} issue={issue} />
      ))}
    </div>
  );
});
