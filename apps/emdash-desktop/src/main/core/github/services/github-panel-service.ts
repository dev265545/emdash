import type { Octokit } from '@octokit/rest';
import { log } from '@main/lib/logger';
import type {
  AddPrCommentParams,
  GithubPanelAddCommentResult,
  GithubPanelClosePrResult,
  GithubPanelGetCiStatusResult,
  GithubPanelGetCommentsResult,
  GithubPanelGetCurrentUserResult,
  GithubPanelGetIssuesResult,
  GithubPanelGetPrDetailResult,
  GithubPanelGetPrFilesResult,
  GithubPanelGetPrsResult,
  GithubPanelMergePrResult,
  GithubPanelSubmitReviewResult,
  PanelCheckRun,
  PanelCiStatus,
  PanelComment,
  PanelIssue,
  PanelPr,
  PanelPrDetail,
  PanelPrFile,
  PanelReview,
  ParsedGithubUrl,
  SubmitReviewParams,
} from '@shared/github-panel';
import { getOctokit } from './octokit-provider';

export class GithubPanelService {
  async getMyPullRequests(accountId?: string): Promise<GithubPanelGetPrsResult> {
    try {
      const octokit = await this._getOctokit(accountId);
      if (!octokit) return { success: false, error: 'No GitHub account connected' };

      const response = await octokit.rest.search.issuesAndPullRequests({
        q: 'is:pr is:open author:@me archived:false',
        sort: 'updated',
        order: 'desc',
        per_page: 50,
      });

      return { success: true, prs: response.data.items.map(mapSearchItemToPr) };
    } catch (error) {
      log.error('GithubPanelService: failed to get my pull requests', error);
      return { success: false, error: String(error) };
    }
  }

  async getReviewRequests(accountId?: string): Promise<GithubPanelGetPrsResult> {
    try {
      const octokit = await this._getOctokit(accountId);
      if (!octokit) return { success: false, error: 'No GitHub account connected' };

      const response = await octokit.rest.search.issuesAndPullRequests({
        q: 'is:pr is:open review-requested:@me archived:false',
        sort: 'updated',
        order: 'desc',
        per_page: 50,
      });

      return { success: true, prs: response.data.items.map(mapSearchItemToPr) };
    } catch (error) {
      log.error('GithubPanelService: failed to get review requests', error);
      return { success: false, error: String(error) };
    }
  }

  async getAssignedIssues(accountId?: string): Promise<GithubPanelGetIssuesResult> {
    try {
      const octokit = await this._getOctokit(accountId);
      if (!octokit) return { success: false, error: 'No GitHub account connected' };

      const response = await octokit.rest.search.issuesAndPullRequests({
        q: 'is:issue is:open assignee:@me archived:false',
        sort: 'updated',
        order: 'desc',
        per_page: 50,
      });

      return {
        success: true,
        issues: response.data.items.map(mapSearchItemToIssue),
      };
    } catch (error) {
      log.error('GithubPanelService: failed to get assigned issues', error);
      return { success: false, error: String(error) };
    }
  }

  async getPrDetail(
    owner: string,
    repo: string,
    pullNumber: number,
    accountId?: string
  ): Promise<GithubPanelGetPrDetailResult> {
    try {
      const octokit = await this._getOctokit(accountId);
      if (!octokit) return { success: false, error: 'No GitHub account connected' };

      const [prResp, reviewsResp] = await Promise.all([
        octokit.rest.pulls.get({ owner, repo, pull_number: pullNumber }),
        octokit.rest.pulls.listReviews({ owner, repo, pull_number: pullNumber, per_page: 50 }),
      ]);

      const pr = prResp.data;
      const reviews: PanelReview[] = reviewsResp.data.map((r) => ({
        id: r.id,
        author: r.user?.login ?? 'unknown',
        authorAvatarUrl: r.user?.avatar_url ?? '',
        state: (r.state.toLowerCase() as PanelReview['state']) ?? 'commented',
        body: r.body ?? '',
        submittedAt: r.submitted_at ?? new Date().toISOString(),
      }));

      const detail: PanelPrDetail = {
        id: pr.id,
        number: pr.number,
        title: pr.title,
        state: pr.merged_at ? 'merged' : (pr.state as 'open' | 'closed'),
        url: pr.html_url,
        repoOwner: owner,
        repoName: repo,
        author: pr.user?.login ?? 'unknown',
        authorAvatarUrl: pr.user?.avatar_url ?? '',
        isDraft: pr.draft ?? false,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        commentCount: pr.comments + pr.review_comments,
        additions: pr.additions,
        deletions: pr.deletions,
        reviewState: resolveReviewState(reviews),
        baseRef: pr.base.ref,
        headRef: pr.head.ref,
        body: pr.body ?? '',
        baseRefOid: pr.base.sha,
        headRefOid: pr.head.sha,
        changedFiles: pr.changed_files,
        mergeable:
          pr.mergeable === true ? 'mergeable' : pr.mergeable === false ? 'conflicting' : 'unknown',
        reviews,
        labels: pr.labels.map((l) => (typeof l === 'string' ? l : (l.name ?? ''))),
        assignees: pr.assignees?.map((a) => a.login) ?? [],
        requestedReviewers: pr.requested_reviewers?.map((r) => ('login' in r ? r.login : '')) ?? [],
      };

      return { success: true, pr: detail };
    } catch (error) {
      log.error('GithubPanelService: failed to get PR detail', error);
      return { success: false, error: String(error) };
    }
  }

  async getPrFiles(
    owner: string,
    repo: string,
    pullNumber: number,
    accountId?: string
  ): Promise<GithubPanelGetPrFilesResult> {
    try {
      const octokit = await this._getOctokit(accountId);
      if (!octokit) return { success: false, error: 'No GitHub account connected' };

      const response = await octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: pullNumber,
        per_page: 100,
      });

      const files: PanelPrFile[] = response.data.map((f) => ({
        filename: f.filename,
        status: f.status as PanelPrFile['status'],
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch ?? null,
        previousFilename: f.previous_filename ?? null,
      }));

      return { success: true, files };
    } catch (error) {
      log.error('GithubPanelService: failed to get PR files', error);
      return { success: false, error: String(error) };
    }
  }

  async getPrComments(
    owner: string,
    repo: string,
    pullNumber: number,
    accountId?: string
  ): Promise<GithubPanelGetCommentsResult> {
    try {
      const octokit = await this._getOctokit(accountId);
      if (!octokit) return { success: false, error: 'No GitHub account connected' };

      const [issueComments, reviewComments] = await Promise.all([
        octokit.rest.issues.listComments({ owner, repo, issue_number: pullNumber, per_page: 100 }),
        octokit.rest.pulls.listReviewComments({
          owner,
          repo,
          pull_number: pullNumber,
          per_page: 100,
        }),
      ]);

      const comments: PanelComment[] = [
        ...issueComments.data.map((c) => ({
          id: c.id,
          author: c.user?.login ?? 'unknown',
          authorAvatarUrl: c.user?.avatar_url ?? '',
          body: c.body ?? '',
          createdAt: c.created_at,
          updatedAt: c.updated_at,
          path: null,
          line: null,
          diffHunk: null,
          isReviewComment: false,
        })),
        ...reviewComments.data.map((c) => ({
          id: c.id,
          author: c.user?.login ?? 'unknown',
          authorAvatarUrl: c.user?.avatar_url ?? '',
          body: c.body,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
          path: c.path,
          line: c.line ?? c.original_line ?? null,
          diffHunk: c.diff_hunk,
          isReviewComment: true,
        })),
      ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      return { success: true, comments };
    } catch (error) {
      log.error('GithubPanelService: failed to get PR comments', error);
      return { success: false, error: String(error) };
    }
  }

  async getIssueComments(
    owner: string,
    repo: string,
    issueNumber: number,
    accountId?: string
  ): Promise<GithubPanelGetCommentsResult> {
    try {
      const octokit = await this._getOctokit(accountId);
      if (!octokit) return { success: false, error: 'No GitHub account connected' };

      const response = await octokit.rest.issues.listComments({
        owner,
        repo,
        issue_number: issueNumber,
        per_page: 100,
      });

      const comments: PanelComment[] = response.data.map((c) => ({
        id: c.id,
        author: c.user?.login ?? 'unknown',
        authorAvatarUrl: c.user?.avatar_url ?? '',
        body: c.body ?? '',
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        path: null,
        line: null,
        diffHunk: null,
        isReviewComment: false,
      }));

      return { success: true, comments };
    } catch (error) {
      log.error('GithubPanelService: failed to get issue comments', error);
      return { success: false, error: String(error) };
    }
  }

  async submitReview(
    params: SubmitReviewParams,
    accountId?: string
  ): Promise<GithubPanelSubmitReviewResult> {
    try {
      const octokit = await this._getOctokit(accountId);
      if (!octokit) return { success: false, error: 'No GitHub account connected' };

      await octokit.rest.pulls.createReview({
        owner: params.owner,
        repo: params.repo,
        pull_number: params.pullNumber,
        event:
          params.event === 'approve'
            ? 'APPROVE'
            : params.event === 'request_changes'
              ? 'REQUEST_CHANGES'
              : 'COMMENT',
        body: params.body,
      });

      return { success: true };
    } catch (error) {
      log.error('GithubPanelService: failed to submit review', error);
      return { success: false, error: String(error) };
    }
  }

  async addPrComment(
    params: AddPrCommentParams,
    accountId?: string
  ): Promise<GithubPanelAddCommentResult> {
    try {
      const octokit = await this._getOctokit(accountId);
      if (!octokit) return { success: false, error: 'No GitHub account connected' };

      await octokit.rest.issues.createComment({
        owner: params.owner,
        repo: params.repo,
        issue_number: params.pullNumber,
        body: params.body,
      });

      return { success: true };
    } catch (error) {
      log.error('GithubPanelService: failed to add PR comment', error);
      return { success: false, error: String(error) };
    }
  }

  async closePr(
    owner: string,
    repo: string,
    pullNumber: number,
    accountId?: string
  ): Promise<GithubPanelClosePrResult> {
    try {
      const octokit = await this._getOctokit(accountId);
      if (!octokit) return { success: false, error: 'No GitHub account connected' };

      await octokit.rest.pulls.update({ owner, repo, pull_number: pullNumber, state: 'closed' });
      return { success: true };
    } catch (error) {
      log.error('GithubPanelService: failed to close PR', error);
      return { success: false, error: String(error) };
    }
  }

  async mergePr(
    owner: string,
    repo: string,
    pullNumber: number,
    accountId?: string
  ): Promise<GithubPanelMergePrResult> {
    try {
      const octokit = await this._getOctokit(accountId);
      if (!octokit) return { success: false, error: 'No GitHub account connected' };

      await octokit.rest.pulls.merge({ owner, repo, pull_number: pullNumber });
      return { success: true };
    } catch (error) {
      log.error('GithubPanelService: failed to merge PR', error);
      return { success: false, error: String(error) };
    }
  }

  async getCurrentUserLogin(accountId?: string): Promise<GithubPanelGetCurrentUserResult> {
    try {
      const octokit = await this._getOctokit(accountId);
      if (!octokit) return { success: false, error: 'No GitHub account connected' };

      const { data } = await octokit.rest.users.getAuthenticated();
      return { success: true, login: data.login };
    } catch (error) {
      log.error('GithubPanelService: failed to get current user', error);
      return { success: false, error: String(error) };
    }
  }

  async getPrCiStatus(
    owner: string,
    repo: string,
    pullNumber: number,
    accountId?: string
  ): Promise<GithubPanelGetCiStatusResult> {
    try {
      const octokit = await this._getOctokit(accountId);
      if (!octokit) return { success: false, error: 'No GitHub account connected' };

      // Need head SHA — fetch from the PR endpoint first
      const prResp = await octokit.rest.pulls.get({ owner, repo, pull_number: pullNumber });
      const { checkRuns, ciStatus } = await fetchCiStatus(
        octokit,
        owner,
        repo,
        prResp.data.head.sha
      );
      return { success: true, result: { ciStatus, checkRuns } };
    } catch (error) {
      log.error('GithubPanelService: failed to get CI status', error);
      return { success: false, error: String(error) };
    }
  }

  parsePrUrl(url: string): ParsedGithubUrl {
    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.replace(/^\//, '').split('/');
      if (parts.length < 4) return { kind: 'unknown' };

      const [owner, repo, type, numberStr] = parts;
      const number = parseInt(numberStr, 10);
      if (isNaN(number)) return { kind: 'unknown' };

      const host = parsed.hostname;
      if (type === 'pull') return { kind: 'pr', host, owner, repo, number };
      if (type === 'issues') return { kind: 'issue', host, owner, repo, number };

      return { kind: 'unknown' };
    } catch {
      return { kind: 'unknown' };
    }
  }

  private async _getOctokit(accountId?: string) {
    const result = await getOctokit('github.com', { accountId });
    if (!result.success) {
      log.warn('GithubPanelService: failed to get octokit', result.error);
      return null;
    }
    return result.data;
  }
}

function mapSearchItemToPr(item: Record<string, unknown>): PanelPr {
  const repoUrl = String(item.repository_url ?? '');
  const repoParts = repoUrl.split('/');
  const repoName = repoParts[repoParts.length - 1] ?? '';
  const repoOwner = repoParts[repoParts.length - 2] ?? '';
  const prUrl = String(item.html_url ?? '');
  const urlParts = prUrl.split('/');
  const prNumber = parseInt(urlParts[urlParts.length - 1] ?? '0', 10);

  return {
    id: Number(item.id),
    number: prNumber,
    title: String(item.title ?? ''),
    state: item.pull_request
      ? (item.pull_request as Record<string, string>).merged_at
        ? 'merged'
        : (String(item.state ?? 'open') as 'open' | 'closed')
      : (String(item.state ?? 'open') as 'open' | 'closed'),
    url: prUrl,
    repoOwner,
    repoName,
    author: String((item.user as Record<string, string>)?.login ?? 'unknown'),
    authorAvatarUrl: String((item.user as Record<string, string>)?.avatar_url ?? ''),
    isDraft: Boolean(item.draft),
    createdAt: String(item.created_at ?? ''),
    updatedAt: String(item.updated_at ?? ''),
    commentCount: Number(item.comments ?? 0),
    additions: null,
    deletions: null,
    reviewState: null,
    baseRef: '',
    headRef: '',
  };
}

function mapSearchItemToIssue(item: Record<string, unknown>): PanelIssue {
  const repoUrl = String(item.repository_url ?? '');
  const repoParts = repoUrl.split('/');
  const repoName = repoParts[repoParts.length - 1] ?? '';
  const repoOwner = repoParts[repoParts.length - 2] ?? '';
  const labels = Array.isArray(item.labels)
    ? (item.labels as Array<Record<string, string>>).map((l) => l.name ?? '')
    : [];

  return {
    id: Number(item.id),
    number: Number(item.number),
    title: String(item.title ?? ''),
    state: String(item.state ?? 'open') as 'open' | 'closed',
    url: String(item.html_url ?? ''),
    repoOwner,
    repoName,
    author: String((item.user as Record<string, string>)?.login ?? 'unknown'),
    labels,
    createdAt: String(item.created_at ?? ''),
    updatedAt: String(item.updated_at ?? ''),
    commentCount: Number(item.comments ?? 0),
    body: String(item.body ?? ''),
  };
}

async function fetchCiStatus(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string
): Promise<{ checkRuns: PanelCheckRun[]; ciStatus: PanelCiStatus }> {
  try {
    const resp = await octokit.rest.checks.listForRef({
      owner,
      repo,
      ref,
      per_page: 100,
    });

    const checkRuns: PanelCheckRun[] = resp.data.check_runs.map((run) => ({
      name: run.name,
      status: run.status as PanelCheckRun['status'],
      conclusion: (run.conclusion as PanelCheckRun['conclusion']) ?? null,
      url: run.html_url ?? run.url,
    }));

    const ciStatus = resolveCiStatus(checkRuns);
    return { checkRuns, ciStatus };
  } catch (error) {
    log.warn('GithubPanelService: failed to fetch check runs', error);
    return { checkRuns: [], ciStatus: null };
  }
}

function resolveCiStatus(runs: PanelCheckRun[]): PanelCiStatus {
  if (runs.length === 0) return null;
  if (runs.some((r) => r.status === 'queued' || r.status === 'in_progress')) return 'running';
  if (runs.some((r) => r.conclusion === 'failure' || r.conclusion === 'timed_out'))
    return 'failure';
  if (
    runs.every(
      (r) => r.conclusion === 'success' || r.conclusion === 'neutral' || r.conclusion === 'skipped'
    )
  )
    return 'success';
  return 'pending';
}

function resolveReviewState(reviews: PanelReview[]): PanelPr['reviewState'] {
  if (reviews.some((r) => r.state === 'changes_requested')) return 'changes_requested';
  if (reviews.some((r) => r.state === 'approved')) return 'approved';
  if (reviews.some((r) => r.state === 'commented')) return 'commented';
  return null;
}

export const githubPanelService = new GithubPanelService();
