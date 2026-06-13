import { makeAutoObservable, runInAction } from 'mobx';
import { rpc } from '@renderer/lib/ipc';
import { Resource } from '@renderer/lib/stores/resource';
import type { PanelComment } from '@shared/github-panel';

export class IssueDetailStore {
  readonly comments: Resource<PanelComment[]>;

  isAddingComment = false;
  commentError: string | null = null;

  constructor(
    readonly owner: string,
    readonly repo: string,
    readonly issueNumber: number,
    readonly accountId: string | undefined
  ) {
    this.comments = new Resource(
      () =>
        rpc.githubPanel.getIssueComments({ owner, repo, issueNumber, accountId }).then((r) => {
          if (!r.success) throw new Error(r.error);
          return r.comments;
        }),
      [{ kind: 'poll', intervalMs: 2 * 60 * 1000, pauseWhenHidden: true, demandGated: true }],
      { init: [] }
    );

    makeAutoObservable(this, { comments: false });
  }

  async addComment(body: string) {
    runInAction(() => {
      this.isAddingComment = true;
      this.commentError = null;
    });
    try {
      const result = await rpc.githubPanel.addPrComment({
        owner: this.owner,
        repo: this.repo,
        pullNumber: this.issueNumber,
        body,
        accountId: this.accountId,
      });
      if (!result.success) {
        runInAction(() => {
          this.commentError = result.error;
        });
        return false;
      }
      this.comments.invalidate();
      return true;
    } catch (err) {
      runInAction(() => {
        this.commentError = String(err);
      });
      return false;
    } finally {
      runInAction(() => {
        this.isAddingComment = false;
      });
    }
  }

  dispose() {
    this.comments.dispose();
  }
}
