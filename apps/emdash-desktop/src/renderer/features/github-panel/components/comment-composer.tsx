import { Send } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@renderer/lib/ui/button';
import { Textarea } from '@renderer/lib/ui/textarea';

interface CommentComposerProps {
  onSubmit: (body: string) => Promise<boolean>;
  placeholder?: string;
  error?: string | null;
  loading?: boolean;
}

export function CommentComposer({
  onSubmit,
  placeholder = 'Leave a comment…',
  error,
  loading = false,
}: CommentComposerProps) {
  const [body, setBody] = useState('');

  const handleSubmit = async () => {
    if (!body.trim() || loading) return;
    const ok = await onSubmit(body.trim());
    if (ok) setBody('');
  };

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        className="min-h-[80px] resize-none text-xs"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void handleSubmit();
        }}
      />
      {error && <p className="text-[11px] text-foreground-error">{error}</p>}
      <div className="flex justify-end">
        <Button size="sm" onClick={() => void handleSubmit()} disabled={!body.trim() || loading}>
          <Send className="mr-1.5 size-3.5" />
          Comment
        </Button>
      </div>
    </div>
  );
}
