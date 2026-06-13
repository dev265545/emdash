export type PanelPrState = 'open' | 'closed' | 'merged';

export type PanelReviewState =
  | 'approved'
  | 'changes_requested'
  | 'commented'
  | 'pending'
  | 'dismissed';

export type PanelPr = {
  id: number;
  number: number;
  title: string;
  state: PanelPrState;
  url: string;
  repoOwner: string;
  repoName: string;
  author: string;
  authorAvatarUrl: string;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  commentCount: number;
  additions: number | null;
  deletions: number | null;
  reviewState: PanelReviewState | null;
  baseRef: string;
  headRef: string;
};

export type PanelIssue = {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed';
  url: string;
  repoOwner: string;
  repoName: string;
  author: string;
  labels: string[];
  createdAt: string;
  updatedAt: string;
  commentCount: number;
  body: string;
};

export type PanelPrFile = {
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'unchanged';
  additions: number;
  deletions: number;
  patch: string | null;
  previousFilename: string | null;
};

export type PanelComment = {
  id: number;
  author: string;
  authorAvatarUrl: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  path: string | null;
  line: number | null;
  diffHunk: string | null;
  isReviewComment: boolean;
};

export type PanelReview = {
  id: number;
  author: string;
  authorAvatarUrl: string;
  state: PanelReviewState;
  body: string;
  submittedAt: string;
};

export type PanelCiStatus = 'success' | 'failure' | 'pending' | 'running' | null;

export type PanelCheckRun = {
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion:
    | 'success'
    | 'failure'
    | 'neutral'
    | 'cancelled'
    | 'skipped'
    | 'timed_out'
    | 'action_required'
    | null;
  url: string;
};

export type PanelPrDetail = PanelPr & {
  body: string;
  baseRefOid: string;
  headRefOid: string;
  changedFiles: number;
  mergeable: 'mergeable' | 'conflicting' | 'unknown';
  reviews: PanelReview[];
  labels: string[];
  assignees: string[];
  requestedReviewers: string[];
};

export type PanelCiResult = {
  ciStatus: PanelCiStatus;
  checkRuns: PanelCheckRun[];
};

export type ParsedPrUrl = {
  kind: 'pr';
  host: string;
  owner: string;
  repo: string;
  number: number;
};

export type ParsedIssueUrl = {
  kind: 'issue';
  host: string;
  owner: string;
  repo: string;
  number: number;
};

export type ParsedGithubUrl = ParsedPrUrl | ParsedIssueUrl | { kind: 'unknown' };

export type SubmitReviewParams = {
  owner: string;
  repo: string;
  pullNumber: number;
  event: 'approve' | 'request_changes' | 'comment';
  body: string;
};

export type AddPrCommentParams = {
  owner: string;
  repo: string;
  pullNumber: number;
  body: string;
};

export type GithubPanelGetPrsResult =
  | { success: true; prs: PanelPr[] }
  | { success: false; error: string };
export type GithubPanelGetIssuesResult =
  | { success: true; issues: PanelIssue[] }
  | { success: false; error: string };
export type GithubPanelGetPrDetailResult =
  | { success: true; pr: PanelPrDetail }
  | { success: false; error: string };
export type GithubPanelGetCiStatusResult =
  | { success: true; result: PanelCiResult }
  | { success: false; error: string };
export type GithubPanelClosePrResult = { success: true } | { success: false; error: string };
export type GithubPanelGetPrFilesResult =
  | { success: true; files: PanelPrFile[] }
  | { success: false; error: string };
export type GithubPanelGetCommentsResult =
  | { success: true; comments: PanelComment[] }
  | { success: false; error: string };
export type GithubPanelSubmitReviewResult = { success: true } | { success: false; error: string };
export type GithubPanelAddCommentResult = { success: true } | { success: false; error: string };
