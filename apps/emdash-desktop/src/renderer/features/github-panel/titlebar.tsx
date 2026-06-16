import { Github } from 'lucide-react';
import { Titlebar } from '@renderer/lib/components/titlebar/Titlebar';

export function GithubPanelTitlebar() {
  return (
    <Titlebar
      leftSlot={
        <div className="flex items-center gap-2 px-3 text-sm font-medium text-foreground">
          <Github className="size-4" />
          GitHub
        </div>
      }
    />
  );
}
