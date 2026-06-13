import { observer } from 'mobx-react-lite';
import { useEffect, useRef } from 'react';
import { EmptyState } from '@renderer/lib/ui/empty-state';
import { githubPanelStore } from '../stores/github-panel-store';
import { IssueDetailStore } from '../stores/issue-detail-store';
import { PrDetailStore } from '../stores/pr-detail-store';
import { IssueDetail } from './issue-detail';
import { PrDetail } from './pr-detail';

function usePrDetailStore(
  owner: string,
  repo: string,
  pullNumber: number,
  accountId: string | undefined
) {
  const ref = useRef<PrDetailStore | null>(null);
  const key = `${owner}/${repo}/${pullNumber}`;
  const prevKeyRef = useRef<string>('');

  if (ref.current === null || prevKeyRef.current !== key) {
    ref.current?.dispose();
    ref.current = new PrDetailStore(owner, repo, pullNumber, accountId);
    prevKeyRef.current = key;
  }

  useEffect(() => {
    return () => {
      ref.current?.dispose();
    };
  }, []);

  return ref.current;
}

function useIssueDetailStore(
  owner: string,
  repo: string,
  issueNumber: number,
  accountId: string | undefined
) {
  const ref = useRef<IssueDetailStore | null>(null);
  const key = `${owner}/${repo}/${issueNumber}`;
  const prevKeyRef = useRef<string>('');

  if (ref.current === null || prevKeyRef.current !== key) {
    ref.current?.dispose();
    ref.current = new IssueDetailStore(owner, repo, issueNumber, accountId);
    prevKeyRef.current = key;
  }

  useEffect(() => {
    return () => {
      ref.current?.dispose();
    };
  }, []);

  return ref.current;
}

const PrDetailPane = observer(function PrDetailPane({
  owner,
  repo,
  pullNumber,
  accountId,
}: {
  owner: string;
  repo: string;
  pullNumber: number;
  accountId: string | undefined;
}) {
  const store = usePrDetailStore(owner, repo, pullNumber, accountId);
  return <PrDetail store={store} />;
});

const IssueDetailPane = observer(function IssueDetailPane({
  owner,
  repo,
  issueNumber,
  accountId,
}: {
  owner: string;
  repo: string;
  issueNumber: number;
  accountId: string | undefined;
}) {
  const store = useIssueDetailStore(owner, repo, issueNumber, accountId);

  const allIssues = [...(githubPanelStore.assignedIssues.data ?? [])];
  const issue = allIssues.find(
    (i) => i.repoOwner === owner && i.repoName === repo && i.number === issueNumber
  );

  if (!issue) {
    return (
      <EmptyState label="Issue not found in list" description="Reload issues to fetch details" />
    );
  }

  return <IssueDetail issue={issue} store={store} />;
});

export const DetailPane = observer(function DetailPane() {
  const { selection, accountId } = githubPanelStore;

  if (!selection) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          label="Nothing selected"
          description="Select a PR or issue from the list to view details"
        />
      </div>
    );
  }

  if (selection.kind === 'pr') {
    return (
      <PrDetailPane
        owner={selection.owner}
        repo={selection.repo}
        pullNumber={selection.number}
        accountId={accountId}
      />
    );
  }

  return (
    <IssueDetailPane
      owner={selection.owner}
      repo={selection.repo}
      issueNumber={selection.number}
      accountId={accountId}
    />
  );
});
