import { makeAutoObservable, reaction } from 'mobx';
import { rpc } from '@renderer/lib/ipc';
import { Resource } from '@renderer/lib/stores/resource';
import type { PanelIssue, PanelPr } from '@shared/github-panel';

export type GithubPanelTab = 'my-prs' | 'review-requests' | 'issues';

export type GithubPanelSelection =
  | { kind: 'pr'; url: string; owner: string; repo: string; number: number }
  | { kind: 'issue'; url: string; owner: string; repo: string; number: number }
  | null;

export class GithubPanelStore {
  activeTab: GithubPanelTab = 'my-prs';
  selection: GithubPanelSelection = null;
  accountId: string | undefined = undefined;

  readonly myPrs: Resource<PanelPr[]>;
  readonly reviewRequests: Resource<PanelPr[]>;
  readonly assignedIssues: Resource<PanelIssue[]>;

  private _prevReviewCount = 0;
  private _onNewReviewRequests: ((count: number) => void) | null = null;

  constructor() {
    this.myPrs = new Resource(
      () =>
        rpc.githubPanel
          .getMyPullRequests({ accountId: this.accountId })
          .then((r) => (r.success ? r.prs : [])),
      [{ kind: 'poll', intervalMs: 5 * 60 * 1000, pauseWhenHidden: true, demandGated: true }],
      { init: [] }
    );

    this.reviewRequests = new Resource(
      () =>
        rpc.githubPanel
          .getReviewRequests({ accountId: this.accountId })
          .then((r) => (r.success ? r.prs : [])),
      [{ kind: 'poll', intervalMs: 5 * 60 * 1000, pauseWhenHidden: true, demandGated: true }],
      { init: [] }
    );

    this.assignedIssues = new Resource(
      () =>
        rpc.githubPanel
          .getAssignedIssues({ accountId: this.accountId })
          .then((r) => (r.success ? r.issues : [])),
      [{ kind: 'poll', intervalMs: 5 * 60 * 1000, pauseWhenHidden: true, demandGated: true }],
      { init: [] }
    );

    makeAutoObservable(this, {
      myPrs: false,
      reviewRequests: false,
      assignedIssues: false,
    });

    reaction(
      () => this.reviewRequests.data?.length ?? 0,
      (newCount) => {
        if (this._prevReviewCount > 0 && newCount > this._prevReviewCount) {
          this._onNewReviewRequests?.(newCount - this._prevReviewCount);
        }
        this._prevReviewCount = newCount;
      }
    );
  }

  setTab(tab: GithubPanelTab) {
    this.activeTab = tab;
    this.selection = null;
  }

  selectPr(pr: PanelPr) {
    const parts = pr.url.split('/');
    this.selection = {
      kind: 'pr',
      url: pr.url,
      owner: pr.repoOwner,
      repo: pr.repoName,
      number: pr.number,
    };
    void parts;
  }

  selectIssue(issue: PanelIssue) {
    this.selection = {
      kind: 'issue',
      url: issue.url,
      owner: issue.repoOwner,
      repo: issue.repoName,
      number: issue.number,
    };
  }

  selectByParsedUrl(parsed: {
    kind: 'pr' | 'issue';
    owner: string;
    repo: string;
    number: number;
    host: string;
  }) {
    if (parsed.kind === 'pr') {
      this.selection = {
        kind: 'pr',
        url: `https://${parsed.host}/${parsed.owner}/${parsed.repo}/pull/${parsed.number}`,
        owner: parsed.owner,
        repo: parsed.repo,
        number: parsed.number,
      };
    } else {
      this.selection = {
        kind: 'issue',
        url: `https://${parsed.host}/${parsed.owner}/${parsed.repo}/issues/${parsed.number}`,
        owner: parsed.owner,
        repo: parsed.repo,
        number: parsed.number,
      };
    }
  }

  clearSelection() {
    this.selection = null;
  }

  onNewReviewRequests(handler: (count: number) => void) {
    this._onNewReviewRequests = handler;
  }

  reload() {
    this.myPrs.invalidate();
    this.reviewRequests.invalidate();
    this.assignedIssues.invalidate();
  }

  dispose() {
    this.myPrs.dispose();
    this.reviewRequests.dispose();
    this.assignedIssues.dispose();
  }
}

export const githubPanelStore = new GithubPanelStore();
