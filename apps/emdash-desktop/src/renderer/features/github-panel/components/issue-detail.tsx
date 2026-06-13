import { CircleDot, ExternalLink, RefreshCw } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { confirmOpenExternalLink } from '@renderer/lib/open-external-link';
import { Button } from '@renderer/lib/ui/button';
import { MarkdownRenderer } from '@renderer/lib/ui/markdown-renderer';
import { RelativeTime } from '@renderer/lib/ui/relative-time';
import { Separator } from '@renderer/lib/ui/separator';
import { Spinner } from '@renderer/lib/ui/spinner';
import { cn } from '@renderer/utils/utils';
import type { PanelIssue } from '@shared/github-panel';
import type { IssueDetailStore } from '../stores/issue-detail-store';
import { CommentComposer } from './comment-composer';
import { CommentThread } from './comment-thread';

function IssueHeader({ issue }: { issue: PanelIssue }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm leading-snug font-semibold text-foreground">{issue.title}</h2>
        <button
          type="button"
          onClick={() => confirmOpenExternalLink(issue.url)}
          className="shrink-0 text-foreground-passive hover:text-foreground"
        >
          <ExternalLink className="size-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
            issue.state === 'open'
              ? 'border-foreground-success/30 bg-foreground-success/10 text-foreground-success'
              : 'border-border bg-background-1 text-foreground-muted'
          )}
        >
          <CircleDot className="size-3" />
          {issue.state === 'open' ? 'Open' : 'Closed'}
        </span>
        <span className="font-mono text-[11px] text-foreground-passive">
          {issue.repoOwner}/{issue.repoName}#{issue.number}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-foreground-passive">
        <span>by {issue.author}</span>
        <RelativeTime value={issue.updatedAt} compact />
      </div>
      {issue.labels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {issue.labels.map((label) => (
            <span
              key={label}
              className="rounded-full border border-border px-2 py-0.5 text-[10px] text-foreground-muted"
            >
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export const IssueDetail = observer(function IssueDetail({
  issue,
  store,
}: {
  issue: PanelIssue;
  store: IssueDetailStore;
}) {
  const isLoading = store.comments.loading && (store.comments.data?.length ?? 0) === 0;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="sm" className="text-foreground-passive" />
      </div>
    );
  }

  if (store.comments.error && (store.comments.data?.length ?? 0) === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
        <p className="text-center text-xs text-foreground-error">{store.comments.error}</p>
        <Button variant="outline" size="sm" onClick={() => store.comments.invalidate()}>
          <RefreshCw className="mr-1.5 size-3" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex flex-col gap-4 p-4">
        <IssueHeader issue={issue} />

        <Separator />

        {issue.body ? (
          <MarkdownRenderer content={issue.body} variant="compact" className="text-xs" />
        ) : (
          <p className="text-xs text-foreground-passive italic">No description provided.</p>
        )}

        <Separator />

        <div>
          <h3 className="mb-3 text-xs font-medium text-foreground-muted">Comments</h3>
          <CommentThread
            comments={store.comments.data ?? []}
            loading={store.comments.loading && (store.comments.data?.length ?? 0) === 0}
          />
        </div>

        <Separator />

        <CommentComposer
          onSubmit={(body) => store.addComment(body)}
          error={store.commentError}
          loading={store.isAddingComment}
        />
      </div>
    </div>
  );
});
