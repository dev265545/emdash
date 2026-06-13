# GitHub Panel — Implementation Plan

## Overview

A dedicated GitHub sidebar view giving full visibility into your PRs, review requests,
and assigned issues — with an inline diff viewer, commenting, and review submission.
Built entirely on top of existing emdash infrastructure (RPC, MobX, Monaco diff, toast).

---

## UI Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Left Nav  │  GitHub Panel                                       │
│            │                                                     │
│  [home]    │  ┌──────────────────┬────────────────────────────┐ │
│  [proj]    │  │  List Pane       │  Detail Pane               │ │
│  ...       │  │                  │                            │ │
│  [github]◄─┼─►│  [My PRs]        │  PR Title                  │ │
│  [auto]    │  │  [Reviews]       │  #42 · open · main←feat    │ │
│  [lib]     │  │  [Issues]        │  ─────────────────────────  │ │
│  [set]     │  │  ────────────    │  Files Changed (3)          │ │
│            │  │  ● PR title      │  ┌────────────────────────┐ │ │
│            │  │    repo · #42    │  │  Monaco Diff Viewer    │ │ │
│            │  │    2h ago        │  │  (reuse existing)      │ │ │
│            │  │                  │  └────────────────────────┘ │ │
│            │  │  ● PR title 2    │  ─────────────────────────  │ │
│            │  │    repo · #38    │  Comments (4)               │ │
│            │  │    1d ago        │  [comment thread list]      │ │
│            │  │                  │  ─────────────────────────  │ │
│            │  │  [+ Enter URL]   │  Review Actions             │ │
│            │  │                  │  [Approve] [Request Changes]│ │
│            │  │                  │  [Comment only]             │ │
│            │  └──────────────────┴────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Architecture

### Layer Map

```
Renderer                          Main Process
──────────────────────────────    ──────────────────────────────
github-panel/view.ts              (no new main files for routing)
github-panel/main-panel.tsx
github-panel/stores/
  github-panel-store.ts     ←──►  src/main/core/github/
  pr-detail-store.ts               services/github-panel-service.ts  (NEW)
github-panel/components/           controller.ts  (extend existing)
  list-pane.tsx
  pr-list.tsx               ←──►  rpc.githubPanel.*  (NEW namespace)
  issue-list.tsx
  pr-detail.tsx
  issue-detail.tsx
  url-open-bar.tsx
  review-composer.tsx
  comment-thread.tsx

left-sidebar.tsx  (add icon)
view-registry.ts  (register view)
modal-registry.ts (no new modals needed)
```

---

## Phase 1 — Main Process: New RPC Methods

### File: `src/main/core/github/services/github-panel-service.ts` (NEW)

Wraps Octokit to fetch cross-repo GitHub data for the authenticated user.

**Methods:**
```ts
getMyPullRequests(accountId: string): Promise<PanelPr[]>
getReviewRequests(accountId: string): Promise<PanelPr[]>
getAssignedIssues(accountId: string): Promise<PanelIssue[]>
getPrDetails(accountId: string, owner: string, repo: string, number: number): Promise<PrDetail>
getPrFiles(accountId: string, owner: string, repo: string, number: number): Promise<PrFile[]>
getPrComments(accountId: string, owner: string, repo: string, number: number): Promise<PrComment[]>
submitReview(accountId: string, params: SubmitReviewParams): Promise<void>
addPrComment(accountId: string, params: AddCommentParams): Promise<void>
```

Uses GitHub's search API:
- My PRs: `search/issues?q=is:pr+author:@me+state:open`
- Reviews: `search/issues?q=is:pr+review-requested:@me+state:open`
- Issues:  `search/issues?q=is:issue+assignee:@me+state:open`

### File: `src/main/core/github/github-panel-controller.ts` (NEW)

```ts
export const githubPanelController = createRPCController({
  getMyPullRequests: async ({ accountId }) => { ... },
  getReviewRequests:  async ({ accountId }) => { ... },
  getAssignedIssues:  async ({ accountId }) => { ... },
  getPrDetails:       async ({ accountId, owner, repo, number }) => { ... },
  getPrFiles:         async ({ accountId, owner, repo, number }) => { ... },
  getPrComments:      async ({ accountId, owner, repo, number }) => { ... },
  submitReview:       async ({ accountId, ...params }) => { ... },
  addPrComment:       async ({ accountId, ...params }) => { ... },
  parsePrUrl:         async ({ url }) => { ... }, // parse owner/repo/number from any GH URL
});
```

### File: `src/main/rpc.ts` (EXTEND — additive)

Add one line to register the new namespace:
```ts
githubPanel: githubPanelController,
```

### Shared Types: `src/shared/github-panel.ts` (NEW)

```ts
export type PanelPr = {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  url: string;
  repoOwner: string;
  repoName: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  reviewState?: 'approved' | 'changes_requested' | 'pending';
  isDraft: boolean;
  commentCount: number;
};

export type PanelIssue = {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed';
  url: string;
  repoOwner: string;
  repoName: string;
  labels: string[];
  createdAt: string;
  updatedAt: string;
  commentCount: number;
};

export type PrDetail = PanelPr & {
  body: string;
  baseRef: string;
  headRef: string;
  baseRefOid: string;
  headRefOid: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  mergeable: boolean;
  reviews: PrReview[];
};

export type PrFile = {
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'renamed';
  additions: number;
  deletions: number;
  patch?: string;
};

export type PrComment = {
  id: number;
  author: string;
  authorAvatarUrl: string;
  body: string;
  createdAt: string;
  path?: string;    // for inline comments
  line?: number;
};

export type PrReview = {
  id: number;
  author: string;
  state: 'approved' | 'changes_requested' | 'commented' | 'pending';
  body: string;
  submittedAt: string;
};
```

---

## Phase 2 — Renderer: Stores

### File: `src/renderer/features/github-panel/stores/github-panel-store.ts` (NEW)

```ts
export type GithubPanelTab = 'my-prs' | 'review-requests' | 'issues';

export class GithubPanelStore {
  activeTab: GithubPanelTab = 'my-prs';
  selectedPrUrl: string | null = null;
  selectedIssueUrl: string | null = null;

  myPrs: Resource<PanelPr[]>;
  reviewRequests: Resource<PanelPr[]>;
  assignedIssues: Resource<PanelIssue[]>;

  constructor() {
    makeAutoObservable(this, { myPrs: false, reviewRequests: false, assignedIssues: false });

    this.myPrs = new Resource(
      () => rpc.githubPanel.getMyPullRequests({}),
      [{ kind: 'poll', intervalMs: 5 * 60 * 1000, pauseWhenHidden: true }]
    );
    // same for reviewRequests, assignedIssues

    this.myPrs.start();
    this.reviewRequests.start();
    this.assignedIssues.start();
  }

  setTab(tab: GithubPanelTab) { this.activeTab = tab; }
  selectPr(url: string) { this.selectedPrUrl = url; this.selectedIssueUrl = null; }
  selectIssue(url: string) { this.selectedIssueUrl = url; this.selectedPrUrl = null; }
  clearSelection() { this.selectedPrUrl = null; this.selectedIssueUrl = null; }

  dispose() {
    this.myPrs.dispose();
    this.reviewRequests.dispose();
    this.assignedIssues.dispose();
  }
}

export const githubPanelStore = new GithubPanelStore();
```

### File: `src/renderer/features/github-panel/stores/pr-detail-store.ts` (NEW)

```ts
export class PrDetailStore {
  detail: Resource<PrDetail>;
  files: Resource<PrFile[]>;
  comments: Resource<PrComment[]>;
  isSubmittingReview = false;
  isAddingComment = false;

  constructor(private readonly prUrl: string, private readonly accountId: string) {
    makeAutoObservable(this, { detail: false, files: false, comments: false });

    const parsed = parsePrUrl(prUrl); // { owner, repo, number }
    this.detail   = new Resource(() => rpc.githubPanel.getPrDetails({ accountId, ...parsed }), [...]);
    this.files    = new Resource(() => rpc.githubPanel.getPrFiles({ accountId, ...parsed }), [...]);
    this.comments = new Resource(() => rpc.githubPanel.getPrComments({ accountId, ...parsed }), [...]);

    this.detail.start(); this.files.start(); this.comments.start();
  }

  async submitReview(params: { event: 'approve' | 'request_changes' | 'comment'; body: string }) {
    runInAction(() => { this.isSubmittingReview = true; });
    try { await rpc.githubPanel.submitReview({ prUrl: this.prUrl, ...params }); }
    finally { runInAction(() => { this.isSubmittingReview = false; }); }
    this.comments.reload();
  }

  async addComment(body: string, path?: string, line?: number) {
    runInAction(() => { this.isAddingComment = true; });
    try { await rpc.githubPanel.addPrComment({ prUrl: this.prUrl, body, path, line }); }
    finally { runInAction(() => { this.isAddingComment = false; }); }
    this.comments.reload();
  }

  dispose() { this.detail.dispose(); this.files.dispose(); this.comments.dispose(); }
}
```

---

## Phase 3 — Renderer: Components

### File structure

```
src/renderer/features/github-panel/
├── view.ts                      ← view definition (registered in view-registry)
├── main-panel.tsx               ← two-pane layout
├── stores/
│   ├── github-panel-store.ts
│   └── pr-detail-store.ts
└── components/
    ├── list-pane.tsx            ← left pane: tabs + lists + URL bar
    ├── pr-list.tsx              ← scrollable PR list
    ├── pr-list-item.tsx         ← single PR row
    ├── issue-list.tsx           ← scrollable issue list
    ├── issue-list-item.tsx      ← single issue row
    ├── detail-pane.tsx          ← right pane: dispatcher
    ├── pr-detail.tsx            ← PR detail (files + comments + review)
    ├── pr-files-section.tsx     ← file list + Monaco diff (reuse diff-file-renderer)
    ├── issue-detail.tsx         ← issue body + comments
    ├── comment-thread.tsx       ← renders a list of PrComment
    ├── comment-composer.tsx     ← textarea + submit for new comment
    ├── review-composer.tsx      ← approve / request-changes / comment with body
    └── url-open-bar.tsx         ← "paste GitHub URL" input
```

### Key component sketches

**`main-panel.tsx`**
```tsx
export const GithubMainPanel = observer(() => {
  return (
    <div className="flex h-full overflow-hidden">
      <ListPane className="w-80 shrink-0 border-r border-border" />
      <DetailPane className="flex-1 overflow-auto" />
    </div>
  );
});
```

**`list-pane.tsx`**
```tsx
export const ListPane = observer(() => {
  const store = githubPanelStore;
  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1 p-2 border-b border-border">
        <TabButton tab="my-prs" label="My PRs" />
        <TabButton tab="review-requests" label="Reviews" />
        <TabButton tab="issues" label="Issues" />
      </div>
      <UrlOpenBar />
      <div className="flex-1 overflow-auto">
        {store.activeTab === 'my-prs' && <PrList resource={store.myPrs} />}
        {store.activeTab === 'review-requests' && <PrList resource={store.reviewRequests} />}
        {store.activeTab === 'issues' && <IssueList resource={store.assignedIssues} />}
      </div>
    </div>
  );
});
```

**`pr-list-item.tsx`**
```tsx
export const PrListItem = observer(({ pr }: { pr: PanelPr }) => {
  const isSelected = githubPanelStore.selectedPrUrl === pr.url;
  return (
    <button
      className={cn(
        "w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors",
        isSelected && "bg-muted"
      )}
      onClick={() => githubPanelStore.selectPr(pr.url)}
    >
      <div className="flex items-center gap-2">
        <PrStatusIcon state={pr.state} isDraft={pr.isDraft} />
        <span className="text-sm font-medium truncate">{pr.title}</span>
      </div>
      <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
        <span>{pr.repoOwner}/{pr.repoName}</span>
        <span>·</span>
        <span>#{pr.number}</span>
        <span>·</span>
        <span>{formatRelative(pr.updatedAt)}</span>
        {pr.commentCount > 0 && (
          <span className="ml-auto flex items-center gap-0.5">
            <MessageSquare className="h-3 w-3" />
            {pr.commentCount}
          </span>
        )}
      </div>
    </button>
  );
});
```

**`pr-detail.tsx`** — wires PrDetailStore, renders sections:
1. Header (title, number, state badge, base←head, meta)
2. `<PrFilesSection />` — file list with diff viewer per file
3. `<CommentThread comments={store.comments.value} />`
4. `<ReviewComposer store={store} />`

**`pr-files-section.tsx`** — reuses `DiffFileRenderer` from existing
`src/renderer/features/tasks/diff-view/diff-file-renderer.tsx` with patch content
converted to unified diff format.

**`review-composer.tsx`**
```tsx
export const ReviewComposer = observer(({ store }: { store: PrDetailStore }) => {
  const [body, setBody] = useState('');
  return (
    <div className="border-t border-border p-4 space-y-3">
      <p className="text-sm font-medium">Submit Review</p>
      <Textarea value={body} onChange={e => setBody(e.target.value)} rows={3}
        placeholder="Leave a comment (optional)" />
      <div className="flex gap-2">
        <Button variant="default" size="sm"
          onClick={() => store.submitReview({ event: 'approve', body })}
          disabled={store.isSubmittingReview}>
          Approve
        </Button>
        <Button variant="outline" size="sm"
          onClick={() => store.submitReview({ event: 'request_changes', body })}
          disabled={store.isSubmittingReview || !body}>
          Request Changes
        </Button>
        <Button variant="ghost" size="sm"
          onClick={() => store.submitReview({ event: 'comment', body })}
          disabled={store.isSubmittingReview || !body}>
          Comment
        </Button>
      </div>
    </div>
  );
});
```

**`url-open-bar.tsx`** — Input that validates a GitHub PR/issue URL and opens it:
```tsx
const handleOpen = async () => {
  const parsed = await rpc.githubPanel.parsePrUrl({ url: input });
  if (parsed.kind === 'pr') githubPanelStore.selectPr(input);
  if (parsed.kind === 'issue') githubPanelStore.selectIssue(input);
};
```

---

## Phase 4 — Navigation Integration

### `src/renderer/app/view-registry.ts` (EXTEND — 1 line)

```ts
import { githubPanelView } from '@renderer/features/github-panel/view';

export const views = {
  // ... existing
  githubPanel: githubPanelView,   // ← add this
};
```

### `src/renderer/features/github-panel/view.ts` (NEW)

```ts
import type { ViewDefinition } from '@renderer/app/view-registry';
import { GithubMainPanel } from './main-panel';

export const githubPanelView: ViewDefinition = {
  MainPanel: GithubMainPanel,
};
```

### `src/renderer/features/sidebar/left-sidebar.tsx` (EXTEND — additive)

Add GitHub icon button to sidebar footer, alongside Automations / Library / Settings:
```tsx
<SidebarMenuButton
  isActive={navigation.activeView === 'githubPanel'}
  onClick={() => navigation.navigate({ view: 'githubPanel' })}
  tooltip="GitHub"
>
  <GithubIcon className="h-4 w-4" />
</SidebarMenuButton>
```

---

## Phase 5 — Notifications

Poll interval is 5 min via Resource. On new items detected (compare previous count vs new count),
fire toast:

```ts
// In github-panel-store.ts, reaction on reviewRequests resource:
reaction(
  () => this.reviewRequests.value?.length ?? 0,
  (newCount, oldCount) => {
    if (newCount > oldCount) {
      toast({
        title: 'New review request',
        description: `${newCount - oldCount} new PR(s) awaiting your review`,
        action: { label: 'View', onClick: () => navigation.navigate({ view: 'githubPanel' }) }
      });
    }
  }
);
```

---

## Phase 6 — Error States & Loading

Every list and detail view handles three states using the Resource pattern:
- `resource.status === 'loading'` → skeleton rows
- `resource.status === 'error'`  → inline error with retry button
- `resource.status === 'ready'`  → data

Empty states:
- No PRs: "No open pull requests" with GitHub icon
- No reviews: "No review requests"
- No issues: "No assigned issues"
- No selection: "Select a PR or paste a GitHub URL"

---

## Implementation Order

| Step | What | Est. complexity |
|------|------|----------------|
| 1 | Shared types (`src/shared/github-panel.ts`) | Small |
| 2 | `github-panel-service.ts` — GitHub API calls | Medium |
| 3 | `github-panel-controller.ts` + register in `rpc.ts` | Small |
| 4 | `github-panel-store.ts` + `pr-detail-store.ts` | Medium |
| 5 | `main-panel.tsx` + `list-pane.tsx` + `detail-pane.tsx` | Medium |
| 6 | `pr-list.tsx` + `pr-list-item.tsx` | Small |
| 7 | `issue-list.tsx` + `issue-list-item.tsx` | Small |
| 8 | `pr-detail.tsx` + `pr-files-section.tsx` (reuse diff) | Medium |
| 9 | `comment-thread.tsx` + `comment-composer.tsx` | Small |
| 10 | `review-composer.tsx` | Small |
| 11 | `url-open-bar.tsx` | Small |
| 12 | `issue-detail.tsx` | Small |
| 13 | View registration + sidebar icon | Small |
| 14 | Notifications (toast reactions) | Small |

---

## Files Changed vs Upstream

| File | Change type | Upstream conflict risk |
|------|-------------|----------------------|
| `src/main/rpc.ts` | +1 line (new namespace) | Very low |
| `src/renderer/app/view-registry.ts` | +1 line (new view) | Very low |
| `src/renderer/features/sidebar/left-sidebar.tsx` | +1 button | Low |
| All `github-panel/` files | Brand new | None |
| `src/shared/github-panel.ts` | Brand new | None |
| `src/main/core/github/github-panel-controller.ts` | Brand new | None |
| `src/main/core/github/services/github-panel-service.ts` | Brand new | None |

All upstream-touching changes are **single-line additive** — zero risk of merge conflicts.

---

## What We Are NOT Building (to keep scope clean)

- Repo browser (browsing arbitrary repos)
- Creating issues from within the panel
- Push / merge PRs (too risky, keep read+review only for v1)
- Notifications via OS native notifications (toast is enough for v1)
- GHE (GitHub Enterprise) support in v1 — uses existing account host resolution so it should mostly work, but not tested
