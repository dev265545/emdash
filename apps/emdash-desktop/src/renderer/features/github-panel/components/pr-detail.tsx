import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  CircleDot,
  CircleX,
  ExternalLink,
  GitBranch,
  GitMerge,
  GitPullRequestArrow,
  GitPullRequestClosed,
  GitPullRequestDraft,
  Loader2,
  MessageSquare,
  RefreshCw,
  X,
  XCircle,
} from 'lucide-react';
import { observer } from 'mobx-react-lite';
import React, { useState, useEffect, useRef } from 'react';
import { confirmOpenExternalLink } from '@renderer/lib/open-external-link';
import { Button } from '@renderer/lib/ui/button';
import { MarkdownRenderer } from '@renderer/lib/ui/markdown-renderer';
import { RelativeTime } from '@renderer/lib/ui/relative-time';
import { Separator } from '@renderer/lib/ui/separator';
import { Spinner } from '@renderer/lib/ui/spinner';
import { cn } from '@renderer/utils/utils';
import type { PanelCiStatus, PanelPrDetail } from '@shared/github-panel';
import { githubPanelStore } from '../stores/github-panel-store';
import type { PrDetailStore } from '../stores/pr-detail-store';
import { CommentComposer } from './comment-composer';
import { CommentThread } from './comment-thread';
import { PrFilesSection } from './pr-files-section';
import { ReviewComposer } from './review-composer';

function PrStateIcon({ pr }: { pr: PanelPrDetail }) {
  if (pr.state === 'merged') return <GitMerge className="size-4 shrink-0 text-purple-400" />;
  if (pr.state === 'closed')
    return <GitPullRequestClosed className="size-4 shrink-0 text-foreground-error" />;
  if (pr.isDraft) return <GitPullRequestDraft className="size-4 shrink-0 text-foreground-muted" />;
  return <GitPullRequestArrow className="size-4 shrink-0 text-foreground-success" />;
}

function PrStateBadge({ pr }: { pr: PanelPrDetail }) {
  const label =
    pr.state === 'merged'
      ? 'Merged'
      : pr.state === 'closed'
        ? 'Closed'
        : pr.isDraft
          ? 'Draft'
          : 'Open';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        pr.state === 'merged' && 'border-purple-500/30 bg-purple-500/10 text-purple-400',
        pr.state === 'closed' &&
          'border-foreground-error/30 bg-foreground-error/10 text-foreground-error',
        pr.isDraft && pr.state === 'open' && 'border-border bg-background-1 text-foreground-muted',
        pr.state === 'open' &&
          !pr.isDraft &&
          'border-foreground-success/30 bg-foreground-success/10 text-foreground-success'
      )}
    >
      <PrStateIcon pr={pr} />
      {label}
    </span>
  );
}

function CiBadge({ status }: { status: PanelCiStatus }) {
  if (!status) return null;

  const configs = {
    success: {
      icon: <CircleCheck className="size-3" />,
      label: 'CI passed',
      className: 'border-foreground-success/30 bg-foreground-success/10 text-foreground-success',
    },
    failure: {
      icon: <CircleX className="size-3" />,
      label: 'CI failed',
      className: 'border-foreground-error/30 bg-foreground-error/10 text-foreground-error',
    },
    running: {
      icon: <Loader2 className="size-3 animate-spin" />,
      label: 'CI running',
      className: 'border-border bg-background-1 text-foreground-muted',
    },
    pending: {
      icon: <CircleDot className="size-3" />,
      label: 'CI pending',
      className: 'border-border bg-background-1 text-foreground-muted',
    },
  } satisfies Record<
    NonNullable<PanelCiStatus>,
    { icon: React.ReactNode; label: string; className: string }
  >;

  const cfg = configs[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        cfg.className
      )}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function ReviewSummary({ pr }: { pr: PanelPrDetail }) {
  if (pr.reviews.length === 0) return null;
  const approved = pr.reviews.filter((r) => r.state === 'approved').length;
  const changesRequested = pr.reviews.filter((r) => r.state === 'changes_requested').length;

  return (
    <div className="flex flex-wrap gap-2">
      {approved > 0 && (
        <span className="flex items-center gap-1 text-[11px] text-foreground-success">
          <CheckCircle2 className="size-3" />
          {approved} approval{approved !== 1 ? 's' : ''}
        </span>
      )}
      {changesRequested > 0 && (
        <span className="flex items-center gap-1 text-[11px] text-foreground-error">
          <XCircle className="size-3" />
          {changesRequested} change{changesRequested !== 1 ? 's' : ''} requested
        </span>
      )}
    </div>
  );
}

function PrMeta({ pr }: { pr: PanelPrDetail }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-foreground-passive">
        <span className="flex items-center gap-1">
          <GitBranch className="size-3" />
          <span className="font-mono">{pr.headRef}</span>
          <span>→</span>
          <span className="font-mono">{pr.baseRef}</span>
        </span>
        <span>by {pr.author}</span>
        <RelativeTime value={pr.updatedAt} compact />
        <span className="flex items-center gap-1">
          <span className="text-foreground-success">+{pr.additions ?? 0}</span>
          <span className="text-foreground-error">−{pr.deletions ?? 0}</span>
        </span>
        {pr.changedFiles > 0 && (
          <span className="flex items-center gap-1">
            <MessageSquare className="size-3" />
            {pr.changedFiles} file{pr.changedFiles !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      {(pr.labels.length > 0 || pr.assignees.length > 0 || pr.requestedReviewers.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {pr.labels.map((label) => (
            <span
              key={label}
              className="rounded-full border border-border px-2 py-0.5 text-[10px] text-foreground-muted"
            >
              {label}
            </span>
          ))}
          {pr.requestedReviewers.map((reviewer) => (
            <span
              key={reviewer}
              className="border-ring/40 rounded-full border px-2 py-0.5 text-[10px] text-foreground-muted"
            >
              @{reviewer}
            </span>
          ))}
        </div>
      )}
      <ReviewSummary pr={pr} />
      {pr.mergeable === 'conflicting' && (
        <p className="text-[11px] text-foreground-error">⚠ Merge conflict</p>
      )}
    </div>
  );
}

export const PrDetail = observer(function PrDetail({ store }: { store: PrDetailStore }) {
  const [showFiles, setShowFiles] = useState(false);
  const [showReviewComposer, setShowReviewComposer] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmMerge, setConfirmMerge] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const pr = store.detail.data;
  const isLoading = store.detail.loading && !pr;
  const isOwnPr =
    pr != null && githubPanelStore.currentUserLogin != null
      ? pr.author === githubPanelStore.currentUserLogin
      : false;

  useEffect(() => {
    if (pr) {
      store.files.invalidate();
      store.ciStatus.invalidate();
    }
  }, [pr, store]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="sm" className="text-foreground-passive" />
      </div>
    );
  }

  if (store.detail.error && !pr) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
        <p className="text-center text-xs text-foreground-error">{store.detail.error}</p>
        <Button variant="outline" size="sm" onClick={() => store.detail.invalidate()}>
          <RefreshCw className="mr-1.5 size-3" />
          Retry
        </Button>
      </div>
    );
  }

  if (!pr) return null;

  return (
    <div ref={scrollRef} className="flex h-full flex-col overflow-y-auto">
      <div className="flex flex-col gap-4 p-4">
        {/* Header */}
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-sm leading-snug font-semibold text-foreground">{pr.title}</h2>
            <div className="flex shrink-0 items-center gap-2">
              {pr.state === 'open' && (
                <>
                  {confirmMerge ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-foreground-passive">Merge PR?</span>
                      <Button
                        size="sm"
                        className="h-6 px-2 text-[11px]"
                        disabled={store.isMergingPr || pr.mergeable === 'conflicting'}
                        onClick={async () => {
                          await store.mergePr();
                          setConfirmMerge(false);
                        }}
                      >
                        {store.isMergingPr ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          'Confirm'
                        )}
                      </Button>
                      <button
                        type="button"
                        onClick={() => setConfirmMerge(false)}
                        className="text-foreground-passive hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmMerge(true)}
                      disabled={pr.mergeable === 'conflicting'}
                      className="text-[11px] text-foreground-passive hover:text-foreground-success disabled:opacity-40"
                    >
                      Merge PR
                    </button>
                  )}
                  {confirmClose ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-foreground-passive">Close PR?</span>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-6 px-2 text-[11px]"
                        disabled={store.isClosingPr}
                        onClick={async () => {
                          await store.closePr();
                          setConfirmClose(false);
                        }}
                      >
                        {store.isClosingPr ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          'Confirm'
                        )}
                      </Button>
                      <button
                        type="button"
                        onClick={() => setConfirmClose(false)}
                        className="text-foreground-passive hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmClose(true)}
                      className="text-[11px] text-foreground-passive hover:text-foreground-error"
                    >
                      Close PR
                    </button>
                  )}
                </>
              )}
              <button
                type="button"
                onClick={() => confirmOpenExternalLink(pr.url)}
                className="text-foreground-passive hover:text-foreground"
              >
                <ExternalLink className="size-3.5" />
              </button>
            </div>
          </div>
          {store.closeError && (
            <p className="text-[11px] text-foreground-error">{store.closeError}</p>
          )}
          {store.mergeError && (
            <p className="text-[11px] text-foreground-error">{store.mergeError}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <PrStateBadge pr={pr} />
            <CiBadge status={store.ciStatus.data?.ciStatus ?? null} />
            <span className="font-mono text-[11px] text-foreground-passive">
              {pr.repoOwner}/{pr.repoName}#{pr.number}
            </span>
          </div>
          <PrMeta pr={pr} />
        </div>

        <Separator />

        {/* Body */}
        {pr.body ? (
          <MarkdownRenderer content={pr.body} variant="compact" className="text-xs" />
        ) : (
          <p className="text-xs text-foreground-passive italic">No description provided.</p>
        )}

        <Separator />

        {/* Changed files */}
        <div>
          <button
            type="button"
            onClick={() => setShowFiles((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-background-1"
          >
            <span>
              Changed files
              {(store.files.data?.length ?? 0) > 0 && (
                <span className="ml-1.5 text-foreground-passive">({store.files.data?.length})</span>
              )}
            </span>
            {showFiles ? (
              <ChevronUp className="size-3.5 text-foreground-passive" />
            ) : (
              <ChevronDown className="size-3.5 text-foreground-passive" />
            )}
          </button>
          {showFiles && (
            <div className="mt-2">
              <PrFilesSection store={store} />
            </div>
          )}
        </div>

        <Separator />

        {/* Comments */}
        <div>
          <h3 className="mb-3 text-xs font-medium text-foreground-muted">Comments</h3>
          <CommentThread
            comments={store.comments.data ?? []}
            loading={store.comments.loading && (store.comments.data?.length ?? 0) === 0}
          />
        </div>

        <Separator />

        {/* Comment composer */}
        <div>
          <CommentComposer
            onSubmit={(body) => store.addComment(body)}
            error={store.commentError}
            loading={store.isAddingComment}
          />
        </div>

        <Separator />

        {/* Review composer */}
        <div>
          <button
            type="button"
            onClick={() => setShowReviewComposer((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-background-1"
          >
            Submit review
            {showReviewComposer ? (
              <ChevronUp className="size-3.5 text-foreground-passive" />
            ) : (
              <ChevronDown className="size-3.5 text-foreground-passive" />
            )}
          </button>
          {showReviewComposer && (
            <div className="mt-3">
              <ReviewComposer store={store} isOwnPr={isOwnPr} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
