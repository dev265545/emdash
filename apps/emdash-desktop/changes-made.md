# Changes Made

## GitHub Panel — Bug Fixes & Feature Additions

### 1. Merge PR
- `src/main/core/github/services/github-panel-service.ts` — added `mergePr()` using `octokit.rest.pulls.merge()`
- `src/main/core/github/github-panel-controller.ts` — added `mergePr` RPC endpoint
- `src/renderer/features/github-panel/stores/pr-detail-store.ts` — added `isMergingPr`, `mergeError`, `mergePr()` method
- `src/renderer/features/github-panel/components/pr-detail.tsx` — two-step confirm UI (Merge PR → Confirm / Cancel), disabled when conflicting, shows merge error

### 2. Approve button blocked on own PRs
GitHub's API rejects approving your own PR. Fixed by hiding Approve + Request Changes for own PRs.
- `src/main/core/github/services/github-panel-service.ts` — added `getCurrentUserLogin()` using `octokit.rest.users.getAuthenticated()`
- `src/main/core/github/github-panel-controller.ts` — added `getCurrentUserLogin` RPC endpoint
- `src/shared/github-panel.ts` — added `GithubPanelMergePrResult` and `GithubPanelGetCurrentUserResult` types
- `src/renderer/features/github-panel/stores/github-panel-store.ts` — added `currentUserLogin` observable, `loadCurrentUser()`, `reload()` now resets and refreshes it
- `src/renderer/features/github-panel/components/pr-detail.tsx` — computes `isOwnPr` from `pr.author === currentUserLogin`, passes it to `ReviewComposer`
- `src/renderer/features/github-panel/components/review-composer.tsx` — hides Approve + Request Changes when `isOwnPr=true`

### 3. GitHub account change doesn't refresh the panel
- `src/renderer/lib/hooks/useGithubAccounts.ts` — `invalidateGitHubAccountState()` now calls `githubPanelStore.reload()`, covering add, remove, import, and set-default

### 4. Creating a PR doesn't refresh the GitHub panel list
- `src/renderer/features/tasks/diff-view/changes-panel/pr-section.tsx` — both `onSuccess` callbacks now call `githubPanelStore.myPrs.invalidate()`
- `src/renderer/features/tasks/diff-view/changes-panel/components/commit-card.tsx` — same fix in the Commit & Create PR flow

### 5. Sidebar toggle button missing + empty space when sidebar closed
- `src/renderer/features/github-panel/titlebar.tsx` — new `GithubPanelTitlebar` component wrapping the existing `Titlebar` with a GitHub icon and label
- `src/renderer/features/github-panel/view.ts` — added `TitlebarSlot: GithubPanelTitlebar`; the `Titlebar` component automatically handles `pl-18` padding and renders the toggle button when the sidebar is collapsed

---

**Build output:** `release/emdash-x86_64.AppImage`
