import { makeAutoObservable, reaction, runInAction } from 'mobx';
import { toast } from '@renderer/lib/hooks/use-toast';
import { rpc } from '@renderer/lib/ipc';
import { Resource } from '@renderer/lib/stores/resource';
import type {
  PanelCiResult,
  PanelCiStatus,
  PanelComment,
  PanelPrDetail,
  PanelPrFile,
} from '@shared/github-panel';

export class PrDetailStore {
  readonly detail: Resource<PanelPrDetail>;
  readonly files: Resource<PanelPrFile[]>;
  readonly comments: Resource<PanelComment[]>;
  readonly ciStatus: Resource<PanelCiResult>;

  isSubmittingReview = false;
  isAddingComment = false;
  isClosingPr = false;
  isMergingPr = false;
  reviewError: string | null = null;
  commentError: string | null = null;
  closeError: string | null = null;
  mergeError: string | null = null;

  private _disposeCiReaction: (() => void) | null = null;

  constructor(
    readonly owner: string,
    readonly repo: string,
    readonly pullNumber: number,
    readonly accountId: string | undefined
  ) {
    const poll = [
      {
        kind: 'poll' as const,
        intervalMs: 2 * 60 * 1000,
        pauseWhenHidden: true,
        demandGated: true,
      },
    ];

    this.detail = new Resource(
      () =>
        rpc.githubPanel.getPrDetail({ owner, repo, pullNumber, accountId }).then((r) => {
          if (!r.success) throw new Error(r.error);
          return r.pr;
        }),
      poll
    );

    this.files = new Resource(
      () =>
        rpc.githubPanel.getPrFiles({ owner, repo, pullNumber, accountId }).then((r) => {
          if (!r.success) throw new Error(r.error);
          return r.files;
        }),
      [{ kind: 'demand' }],
      { init: [] }
    );

    this.comments = new Resource(
      () =>
        rpc.githubPanel.getPrComments({ owner, repo, pullNumber, accountId }).then((r) => {
          if (!r.success) throw new Error(r.error);
          return r.comments;
        }),
      poll,
      { init: [] }
    );

    // Demand-only: only fetches when explicitly invalidated (on PR open, or manual refresh).
    // Never polls on a timer — avoids wasting API quota on CI checks every 2 minutes.
    this.ciStatus = new Resource(
      () =>
        rpc.githubPanel.getPrCiStatus({ owner, repo, pullNumber, accountId }).then((r) => {
          if (!r.success) throw new Error(r.error);
          return r.result;
        }),
      [{ kind: 'demand' }]
    );

    makeAutoObservable(this, {
      detail: false,
      files: false,
      comments: false,
      ciStatus: false,
    });

    // Watch CI status for failure transitions while this PR is open.
    // Reads from the demand-only ciStatus Resource — only fires after the user opens the PR.
    let prevCiStatus: PanelCiStatus = null;
    let firstRun = true;
    this._disposeCiReaction = reaction(
      () => this.ciStatus.data?.ciStatus ?? null,
      (curr) => {
        if (firstRun) {
          prevCiStatus = curr;
          firstRun = false;
          return;
        }
        if (curr === 'failure' && prevCiStatus !== 'failure') {
          const label = `${owner}/${repo} #${pullNumber}`;
          toast({
            title: 'CI Failed',
            description: `GitHub Actions failed on ${label}`,
            variant: 'destructive',
          });
        }
        prevCiStatus = curr;
      }
    );
  }

  async submitReview(event: 'approve' | 'request_changes' | 'comment', body: string) {
    runInAction(() => {
      this.isSubmittingReview = true;
      this.reviewError = null;
    });
    try {
      const result = await rpc.githubPanel.submitReview({
        owner: this.owner,
        repo: this.repo,
        pullNumber: this.pullNumber,
        event,
        body,
        accountId: this.accountId,
      });
      if (!result.success) {
        runInAction(() => {
          this.reviewError = result.error;
        });
        return false;
      }
      this.comments.invalidate();
      this.detail.invalidate();
      return true;
    } catch (err) {
      runInAction(() => {
        this.reviewError = String(err);
      });
      return false;
    } finally {
      runInAction(() => {
        this.isSubmittingReview = false;
      });
    }
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
        pullNumber: this.pullNumber,
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

  async closePr() {
    runInAction(() => {
      this.isClosingPr = true;
      this.closeError = null;
    });
    try {
      const result = await rpc.githubPanel.closePr({
        owner: this.owner,
        repo: this.repo,
        pullNumber: this.pullNumber,
        accountId: this.accountId,
      });
      if (!result.success) {
        runInAction(() => {
          this.closeError = result.error;
        });
        return false;
      }
      this.detail.invalidate();
      return true;
    } catch (err) {
      runInAction(() => {
        this.closeError = String(err);
      });
      return false;
    } finally {
      runInAction(() => {
        this.isClosingPr = false;
      });
    }
  }

  async mergePr() {
    runInAction(() => {
      this.isMergingPr = true;
      this.mergeError = null;
    });
    try {
      const result = await rpc.githubPanel.mergePr({
        owner: this.owner,
        repo: this.repo,
        pullNumber: this.pullNumber,
        accountId: this.accountId,
      });
      if (!result.success) {
        runInAction(() => {
          this.mergeError = result.error;
        });
        return false;
      }
      this.detail.invalidate();
      return true;
    } catch (err) {
      runInAction(() => {
        this.mergeError = String(err);
      });
      return false;
    } finally {
      runInAction(() => {
        this.isMergingPr = false;
      });
    }
  }

  dispose() {
    this._disposeCiReaction?.();
    this.detail.dispose();
    this.files.dispose();
    this.comments.dispose();
    this.ciStatus.dispose();
  }
}
