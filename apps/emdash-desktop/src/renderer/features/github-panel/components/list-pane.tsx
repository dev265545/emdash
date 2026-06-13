import { RefreshCw } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { Button } from '@renderer/lib/ui/button';
import { PanelTabs } from '@renderer/lib/ui/panel-tabs';
import { Separator } from '@renderer/lib/ui/separator';
import { githubPanelStore, type GithubPanelTab } from '../stores/github-panel-store';
import { IssueList } from './issue-list';
import { PrList } from './pr-list';
import { UrlOpenBar } from './url-open-bar';

const TABS: { value: GithubPanelTab; label: string }[] = [
  { value: 'my-prs', label: 'My PRs' },
  { value: 'review-requests', label: 'Review' },
  { value: 'issues', label: 'Issues' },
];

export const ListPane = observer(function ListPane() {
  const { activeTab, myPrs, reviewRequests, assignedIssues } = githubPanelStore;

  return (
    <div className="flex h-full flex-col">
      {/* Tabs */}
      <div className="flex items-center gap-2 px-3 py-2">
        <PanelTabs
          value={activeTab}
          onChange={(v) => githubPanelStore.setTab(v as GithubPanelTab)}
          tabs={TABS}
        />
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => githubPanelStore.reload()}
          className="shrink-0"
          title="Refresh"
        >
          <RefreshCw className="size-3.5" />
        </Button>
      </div>

      <Separator />

      {/* URL open bar */}
      <UrlOpenBar />

      {/* List content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeTab === 'my-prs' && (
          <PrList
            resource={myPrs}
            emptyLabel="No open PRs"
            emptyDescription="Your open pull requests will appear here"
          />
        )}
        {activeTab === 'review-requests' && (
          <PrList
            resource={reviewRequests}
            emptyLabel="No review requests"
            emptyDescription="PRs requesting your review will appear here"
          />
        )}
        {activeTab === 'issues' && <IssueList resource={assignedIssues} />}
      </div>
    </div>
  );
});
