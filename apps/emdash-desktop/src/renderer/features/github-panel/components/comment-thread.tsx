import { observer } from 'mobx-react-lite';
import { MarkdownRenderer } from '@renderer/lib/ui/markdown-renderer';
import { RelativeTime } from '@renderer/lib/ui/relative-time';
import { Spinner } from '@renderer/lib/ui/spinner';
import { cn } from '@renderer/utils/utils';
import type { PanelComment } from '@shared/github-panel';

function CommentAvatar({ login, avatarUrl }: { login: string; avatarUrl: string }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={login}
        className="size-6 rounded-full border border-border object-cover"
      />
    );
  }
  return (
    <div className="flex size-6 items-center justify-center rounded-full bg-background-2 text-[10px] font-medium text-foreground-muted">
      {login.slice(0, 2).toUpperCase()}
    </div>
  );
}

function DiffHunk({ hunk }: { hunk: string }) {
  const lines = hunk.split('\n');
  return (
    <pre className="mb-2 overflow-x-auto rounded-md border border-border bg-background p-2 text-[10px] leading-relaxed">
      {lines.map((line, i) => (
        <span
          key={i}
          className={cn(
            'block',
            line.startsWith('+') && 'text-foreground-success',
            line.startsWith('-') && 'text-foreground-error',
            line.startsWith('@@') && 'text-foreground-passive'
          )}
        >
          {line || ' '}
        </span>
      ))}
    </pre>
  );
}

function CommentCard({ comment }: { comment: PanelComment }) {
  return (
    <div className="flex gap-2.5 py-3">
      <div className="shrink-0 pt-0.5">
        <CommentAvatar login={comment.author} avatarUrl={comment.authorAvatarUrl} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs font-medium text-foreground">{comment.author}</span>
          {comment.isReviewComment && (
            <span className="rounded-sm bg-background-2 px-1 py-0.5 text-[10px] leading-none text-foreground-passive">
              review
            </span>
          )}
          <RelativeTime
            value={comment.createdAt}
            className="ml-auto text-[11px] text-foreground-passive"
            compact
          />
        </div>
        {comment.path && (
          <p className="mb-1.5 truncate font-mono text-[11px] text-foreground-passive">
            {comment.path}
            {comment.line ? `:${comment.line}` : ''}
          </p>
        )}
        {comment.diffHunk && <DiffHunk hunk={comment.diffHunk} />}
        <MarkdownRenderer
          content={comment.body || '_No content_'}
          variant="compact"
          className="text-xs text-foreground"
        />
      </div>
    </div>
  );
}

export const CommentThread = observer(function CommentThread({
  comments,
  loading,
}: {
  comments: PanelComment[];
  loading?: boolean;
}) {
  if (loading && comments.length === 0) {
    return (
      <div className="flex h-16 items-center justify-center">
        <Spinner size="sm" className="text-foreground-passive" />
      </div>
    );
  }

  if (comments.length === 0) {
    return <p className="py-4 text-center text-xs text-foreground-passive">No comments yet</p>;
  }

  return (
    <div className="divide-y divide-border">
      {comments.map((c) => (
        <CommentCard key={c.id} comment={c} />
      ))}
    </div>
  );
});
