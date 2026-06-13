import { CheckCircle2, MessageSquare, XCircle } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { Button } from '@renderer/lib/ui/button';
import { Textarea } from '@renderer/lib/ui/textarea';
import { cn } from '@renderer/utils/utils';
import type { PrDetailStore } from '../stores/pr-detail-store';

type ReviewEvent = 'comment' | 'approve' | 'request_changes';

const EVENTS: { value: ReviewEvent; label: string; icon: typeof MessageSquare }[] = [
  { value: 'comment', label: 'Comment', icon: MessageSquare },
  { value: 'approve', label: 'Approve', icon: CheckCircle2 },
  { value: 'request_changes', label: 'Request changes', icon: XCircle },
];

export const ReviewComposer = observer(function ReviewComposer({
  store,
}: {
  store: PrDetailStore;
}) {
  const [event, setEvent] = useState<ReviewEvent>('comment');
  const [body, setBody] = useState('');

  const handleSubmit = async () => {
    if (!body.trim() || store.isSubmittingReview) return;
    const ok = await store.submitReview(event, body.trim());
    if (ok) setBody('');
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1">
        {EVENTS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setEvent(value)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-1.5 text-xs transition-colors',
              event === value
                ? 'border-ring bg-ring/10 text-foreground'
                : 'border-border bg-background text-foreground-muted hover:bg-background-1'
            )}
          >
            <Icon
              className={cn(
                'size-3.5',
                value === 'approve' && event === value && 'text-foreground-success',
                value === 'request_changes' && event === value && 'text-foreground-error'
              )}
            />
            {label}
          </button>
        ))}
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={
          event === 'approve'
            ? 'Optional approval comment…'
            : event === 'request_changes'
              ? 'Describe what needs to change…'
              : 'Leave a review comment…'
        }
        className="min-h-[80px] resize-none text-xs"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void handleSubmit();
        }}
      />
      {store.reviewError && (
        <p className="text-[11px] text-foreground-error">{store.reviewError}</p>
      )}
      <div className="flex justify-end">
        <Button
          size="sm"
          variant={
            event === 'approve'
              ? 'default'
              : event === 'request_changes'
                ? 'destructive'
                : 'outline'
          }
          onClick={() => void handleSubmit()}
          disabled={(event !== 'approve' && !body.trim()) || store.isSubmittingReview}
        >
          {event === 'approve'
            ? 'Approve'
            : event === 'request_changes'
              ? 'Request changes'
              : 'Submit review'}
        </Button>
      </div>
    </div>
  );
});
