import { observer } from 'mobx-react-lite';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@renderer/lib/ui/resizable';
import { DetailPane } from './components/detail-pane';
import { ListPane } from './components/list-pane';

export const GithubPanelMainPanel = observer(function GithubPanelMainPanel() {
  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
      <ResizablePanel defaultSize="320px" minSize="240px" maxSize="480px" id="github-list">
        <div className="h-full border-r border-border bg-background">
          <ListPane />
        </div>
      </ResizablePanel>
      <ResizableHandle className="transition-colors hover:bg-border/80" />
      <ResizablePanel id="github-detail" minSize="300px">
        <div className="h-full bg-background">
          <DetailPane />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
});
