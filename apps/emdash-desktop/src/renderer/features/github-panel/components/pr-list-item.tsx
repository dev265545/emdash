import {
  CheckCircle2,
  GitMerge,
  GitPullRequestArrow,
  GitPullRequestClosed,
  GitPullRequestDraft,
  MessageSquare,
} from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { RelativeTime } from '@renderer/lib/ui/relative-time';
import { cn } from '@renderer/utils/utils';
import type { PanelPr } from '@shared/github-panel';
import { githubPanelStore } from '../stores/github-panel-store';

function PrStatusDot({ pr }: { pr: PanelPr }) {
  if (pr.state === 'merged') {
    return <GitMerge className="size-3.5 shrink-0 text-foreground-merged" />;
  }
  if (pr.state === 'closed') {
    return <GitPullRequestClosed className="size-3.5 shrink-0 text-foreground-error" />;
  }
  if (pr.isDraft) {
    return <GitPullRequestDraft className="size-3.5 shrink-0 text-foreground-muted" />;
  }
  if (pr.reviewState === 'approved') {
    return <CheckCircle2 className="size-3.5 shrink-0 text-foreground-success" />;
  }
  return <GitPullRequestArrow className="size-3.5 shrink-0 text-foreground-success" />;
}

function ReviewStateBadge({ state }: { state: PanelPr['reviewState'] }) {
  if (!state) return null;
  const label =
    state === 'approved' ? 'Approved' : state === 'changes_requested' ? 'Changes requested' : null;
  if (!label) return null;
  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5 text-[10px] font-medium leading-none',
        state === 'approved' && 'bg-foreground-success/10 text-foreground-success',
        state === 'changes_requested' && 'bg-foreground-error/10 text-foreground-error'
      )}
    >
      {label}
    </span>
  );
}

export const PrListItem = observer(function PrListItem({ pr }: { pr: PanelPr }) {
  const isSelected =
    githubPanelStore.selection?.kind === 'pr' && githubPanelStore.selection.url === pr.url;

  return (
    <button
      type="button"
      onClick={() => githubPanelStore.selectPr(pr)}
      className={cn(
        'group w-full text-left px-3 py-2.5 transition-colors',
        'hover:bg-background-1',
        isSelected && 'bg-background-2 hover:bg-background-2'
      )}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0">
          <PrStatusDot pr={pr} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm leading-snug text-foreground">{pr.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="text-[11px] text-foreground-passive">
              {pr.repoOwner}/{pr.repoName}
            </span>
            <span className="text-[11px] text-foreground-passive">·</span>
            <span className="font-mono text-[11px] text-foreground-muted">#{pr.number}</span>
            <span className="text-[11px] text-foreground-passive">·</span>
            <RelativeTime
              value={pr.updatedAt}
              className="text-[11px] text-foreground-passive"
              compact
            />
            {pr.reviewState && (
              <>
                <span className="text-[11px] text-foreground-passive">·</span>
                <ReviewStateBadge state={pr.reviewState} />
              </>
            )}
          </div>
        </div>
        {pr.commentCount > 0 && (
          <span className="mt-0.5 flex shrink-0 items-center gap-0.5 text-[11px] text-foreground-passive">
            <MessageSquare className="size-3" />
            {pr.commentCount}
          </span>
        )}
      </div>
    </button>
  );
});
