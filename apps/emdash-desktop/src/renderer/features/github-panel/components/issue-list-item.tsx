import { CircleDot, MessageSquare } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { RelativeTime } from '@renderer/lib/ui/relative-time';
import { cn } from '@renderer/utils/utils';
import type { PanelIssue } from '@shared/github-panel';
import { githubPanelStore } from '../stores/github-panel-store';

export const IssueListItem = observer(function IssueListItem({ issue }: { issue: PanelIssue }) {
  const isSelected =
    githubPanelStore.selection?.kind === 'issue' && githubPanelStore.selection.url === issue.url;

  return (
    <button
      type="button"
      onClick={() => githubPanelStore.selectIssue(issue)}
      className={cn(
        'group w-full text-left px-3 py-2.5 transition-colors',
        'hover:bg-background-1',
        isSelected && 'bg-background-2 hover:bg-background-2'
      )}
    >
      <div className="flex items-start gap-2">
        <CircleDot
          className={cn(
            'mt-0.5 size-3.5 shrink-0',
            issue.state === 'open' ? 'text-foreground-success' : 'text-foreground-muted'
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm leading-snug text-foreground">{issue.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="text-[11px] text-foreground-passive">
              {issue.repoOwner}/{issue.repoName}
            </span>
            <span className="text-[11px] text-foreground-passive">·</span>
            <span className="font-mono text-[11px] text-foreground-muted">#{issue.number}</span>
            <span className="text-[11px] text-foreground-passive">·</span>
            <RelativeTime
              value={issue.updatedAt}
              className="text-[11px] text-foreground-passive"
              compact
            />
          </div>
          {issue.labels.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {issue.labels.slice(0, 3).map((label) => (
                <span
                  key={label}
                  className="rounded-full border border-border px-1.5 py-0.5 text-[10px] leading-none text-foreground-muted"
                >
                  {label}
                </span>
              ))}
              {issue.labels.length > 3 && (
                <span className="text-[10px] text-foreground-passive">
                  +{issue.labels.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
        {issue.commentCount > 0 && (
          <span className="mt-0.5 flex shrink-0 items-center gap-0.5 text-[11px] text-foreground-passive">
            <MessageSquare className="size-3" />
            {issue.commentCount}
          </span>
        )}
      </div>
    </button>
  );
});
