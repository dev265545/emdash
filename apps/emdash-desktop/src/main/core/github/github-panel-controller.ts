import { log } from '@main/lib/logger';
import type {
  AddPrCommentParams,
  GithubPanelAddCommentResult,
  GithubPanelClosePrResult,
  GithubPanelGetCiStatusResult,
  GithubPanelGetCommentsResult,
  GithubPanelGetIssuesResult,
  GithubPanelGetPrDetailResult,
  GithubPanelGetPrFilesResult,
  GithubPanelGetPrsResult,
  GithubPanelSubmitReviewResult,
  ParsedGithubUrl,
  SubmitReviewParams,
} from '@shared/github-panel';
import { createRPCController } from '@shared/lib/ipc/rpc';
import { githubPanelService } from './services/github-panel-service';

export const githubPanelController = createRPCController({
  getMyPullRequests: async (params: { accountId?: string }): Promise<GithubPanelGetPrsResult> => {
    try {
      return await githubPanelService.getMyPullRequests(params.accountId);
    } catch (error) {
      log.error('githubPanelController: getMyPullRequests failed', error);
      return { success: false, error: String(error) };
    }
  },

  getReviewRequests: async (params: { accountId?: string }): Promise<GithubPanelGetPrsResult> => {
    try {
      return await githubPanelService.getReviewRequests(params.accountId);
    } catch (error) {
      log.error('githubPanelController: getReviewRequests failed', error);
      return { success: false, error: String(error) };
    }
  },

  getAssignedIssues: async (params: {
    accountId?: string;
  }): Promise<GithubPanelGetIssuesResult> => {
    try {
      return await githubPanelService.getAssignedIssues(params.accountId);
    } catch (error) {
      log.error('githubPanelController: getAssignedIssues failed', error);
      return { success: false, error: String(error) };
    }
  },

  getPrDetail: async (params: {
    owner: string;
    repo: string;
    pullNumber: number;
    accountId?: string;
  }): Promise<GithubPanelGetPrDetailResult> => {
    try {
      return await githubPanelService.getPrDetail(
        params.owner,
        params.repo,
        params.pullNumber,
        params.accountId
      );
    } catch (error) {
      log.error('githubPanelController: getPrDetail failed', error);
      return { success: false, error: String(error) };
    }
  },

  getPrFiles: async (params: {
    owner: string;
    repo: string;
    pullNumber: number;
    accountId?: string;
  }): Promise<GithubPanelGetPrFilesResult> => {
    try {
      return await githubPanelService.getPrFiles(
        params.owner,
        params.repo,
        params.pullNumber,
        params.accountId
      );
    } catch (error) {
      log.error('githubPanelController: getPrFiles failed', error);
      return { success: false, error: String(error) };
    }
  },

  getPrComments: async (params: {
    owner: string;
    repo: string;
    pullNumber: number;
    accountId?: string;
  }): Promise<GithubPanelGetCommentsResult> => {
    try {
      return await githubPanelService.getPrComments(
        params.owner,
        params.repo,
        params.pullNumber,
        params.accountId
      );
    } catch (error) {
      log.error('githubPanelController: getPrComments failed', error);
      return { success: false, error: String(error) };
    }
  },

  getIssueComments: async (params: {
    owner: string;
    repo: string;
    issueNumber: number;
    accountId?: string;
  }): Promise<GithubPanelGetCommentsResult> => {
    try {
      return await githubPanelService.getIssueComments(
        params.owner,
        params.repo,
        params.issueNumber,
        params.accountId
      );
    } catch (error) {
      log.error('githubPanelController: getIssueComments failed', error);
      return { success: false, error: String(error) };
    }
  },

  submitReview: async (
    params: SubmitReviewParams & { accountId?: string }
  ): Promise<GithubPanelSubmitReviewResult> => {
    try {
      const { accountId, ...reviewParams } = params;
      return await githubPanelService.submitReview(reviewParams, accountId);
    } catch (error) {
      log.error('githubPanelController: submitReview failed', error);
      return { success: false, error: String(error) };
    }
  },

  addPrComment: async (
    params: AddPrCommentParams & { accountId?: string }
  ): Promise<GithubPanelAddCommentResult> => {
    try {
      const { accountId, ...commentParams } = params;
      return await githubPanelService.addPrComment(commentParams, accountId);
    } catch (error) {
      log.error('githubPanelController: addPrComment failed', error);
      return { success: false, error: String(error) };
    }
  },

  closePr: async (params: {
    owner: string;
    repo: string;
    pullNumber: number;
    accountId?: string;
  }): Promise<GithubPanelClosePrResult> => {
    try {
      return await githubPanelService.closePr(
        params.owner,
        params.repo,
        params.pullNumber,
        params.accountId
      );
    } catch (error) {
      log.error('githubPanelController: closePr failed', error);
      return { success: false, error: String(error) };
    }
  },

  getPrCiStatus: async (params: {
    owner: string;
    repo: string;
    pullNumber: number;
    accountId?: string;
  }): Promise<GithubPanelGetCiStatusResult> => {
    try {
      return await githubPanelService.getPrCiStatus(
        params.owner,
        params.repo,
        params.pullNumber,
        params.accountId
      );
    } catch (error) {
      log.error('githubPanelController: getPrCiStatus failed', error);
      return { success: false, error: String(error) };
    }
  },

  parsePrUrl: async (params: { url: string }): Promise<ParsedGithubUrl> => {
    return githubPanelService.parsePrUrl(params.url);
  },
});
