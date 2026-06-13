import { Link2 } from 'lucide-react';
import { useState } from 'react';
import { rpc } from '@renderer/lib/ipc';
import { Button } from '@renderer/lib/ui/button';
import { cn } from '@renderer/utils/utils';
import { githubPanelStore } from '../stores/github-panel-store';

export function UrlOpenBar() {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleOpen = async () => {
    if (!value.trim()) return;
    setError('');
    setLoading(true);
    try {
      const parsed = await rpc.githubPanel.parsePrUrl({ url: value.trim() });
      if (parsed.kind === 'pr' || parsed.kind === 'issue') {
        githubPanelStore.selectByParsedUrl(parsed);
        setValue('');
      } else {
        setError('Not a valid GitHub PR or issue URL');
      }
    } catch {
      setError('Failed to parse URL');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border-b border-border px-3 py-2">
      <div
        className={cn(
          'flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 transition-colors',
          'focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/30',
          error && 'border-destructive'
        )}
      >
        <Link2 className="size-3.5 shrink-0 text-foreground-passive" />
        <input
          type="url"
          placeholder="Paste GitHub PR or issue URL…"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError('');
          }}
          onKeyDown={(e) => e.key === 'Enter' && void handleOpen()}
          className="flex-1 bg-transparent text-xs text-foreground placeholder:text-foreground-passive focus:outline-none"
        />
        {value.trim() && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => void handleOpen()}
            disabled={loading}
            className="shrink-0"
          >
            <span className="text-xs">↵</span>
          </Button>
        )}
      </div>
      {error && <p className="mt-1 text-[11px] text-foreground-error">{error}</p>}
    </div>
  );
}
