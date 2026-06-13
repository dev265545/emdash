# Changes Made in This Worktree

All changes relative to the official `main` branch. Ordered newest-first.
Each entry notes the file, what changed, why, and upstream-conflict risk.

---

## Linux compatibility fixes

### `apps/emdash-desktop/src/main/index.ts`
**What:** Added two Chromium switches for Linux:
```ts
app.commandLine.appendSwitch('password-store', 'gnome-libsecret');
app.commandLine.appendSwitch('no-sandbox');
```
**Why:**
- `password-store=gnome-libsecret` — without this, Electron's `safeStorage` falls back to
  `basic_text` backend on Linux, which the app explicitly rejects, breaking GitHub CLI account
  import and any feature that stores secrets.
- `no-sandbox` — the `chrome-sandbox` binary is not setuid root on this machine, so Electron
  refuses to launch without this flag.

**Upstream risk:** Low. These are additive lines inside an existing `if (process.platform === 'linux')` block. A merge conflict is only possible if upstream also edits that block.

**Recommended for upstream:** Yes — `password-store=gnome-libsecret` especially benefits all Linux users.

---

### `apps/emdash-desktop/electron.vite.config.ts`
**What:** Added `build.externalizeDeps: { exclude: ['glob'] }` to the main process config.
```ts
build: {
  externalizeDeps: { exclude: ['glob'] },
},
```
**Why:** The pnpm workspace root has `glob@7` (CJS-only) hoisted, but the app requires `glob@13`
(ESM). Without this, the packaged app leaves `glob` as an external import that resolves to v7 at
runtime, crashing with `SyntaxError: Named export 'glob' not found`.

**Upstream risk:** Low. Additive config key inside the `main` block. Conflict only if upstream edits the same block.

**Recommended for upstream:** Yes — any Linux packaging would hit this.

---

## Dev tooling

### `apps/emdash-desktop/package.json`
**What 1:** Added `dev:no-sandbox` script:
```json
"dev:no-sandbox": "electron-vite dev -- --no-sandbox --password-store=gnome-libsecret"
```
**Why:** Standard `pnpm run dev` fails on this machine without these flags.
**Upstream risk:** None — purely additive script entry.

**What 2:** Version changed from `1.1.32` to `1.1.32-dev`.
**Why:** Prevents the packaged dev AppImage from conflicting with the installed official `1.1.32`
build (Electron's single-instance lock uses the app name/version for disambiguation via the
user-data directory).
**Upstream risk:** This MUST be reverted before opening a PR to upstream. Do not merge this change.

---

### `apps/emdash-desktop/electron-builder.config.ts`
**What:** Added `electronVersion: '40.10.2'`.
```ts
const config: Configuration = {
  electronVersion: '40.10.2',
  ...
```
**Why:** `electron-builder` requires a pinned version string. The `package.json` has `"electron": "^40.7.0"` (a range), which causes packaging to fail with "version is a range, not a fixed version."

**Upstream risk:** Low-medium. If upstream upgrades Electron past 40.10.2, this will pin to the
wrong version. **Keep in sync with the installed electron version.** Check with:
```bash
cat node_modules/electron/package.json | grep '"version"'
```
**Recommended for upstream:** Upstream should pin the electron version in `package.json` directly
instead — this is a workaround.

---

## GitHub Panel feature (new, custom — not in upstream)

A full-view GitHub sidebar panel accessible via a new "GitHub" button in the left sidebar.

### New files (all additive, zero upstream conflict risk):

| File | Purpose |
|------|---------|
| `src/shared/github-panel.ts` | Shared types: `PanelPr`, `PanelIssue`, `PanelComment`, `PanelPrDetail`, `PanelPrFile`, `ParsedGithubUrl`, result types |
| `src/main/core/github/services/github-panel-service.ts` | `GithubPanelService` — wraps Octokit REST calls for PRs, issues, comments, reviews, file diffs |
| `src/main/core/github/github-panel-controller.ts` | RPC controller exposing all service methods |
| `src/renderer/features/github-panel/stores/github-panel-store.ts` | Top-level MobX store: tabs, selection, 5-min polling Resources |
| `src/renderer/features/github-panel/stores/pr-detail-store.ts` | Per-PR MobX store: detail, files, comments, submitReview, addComment |
| `src/renderer/features/github-panel/stores/issue-detail-store.ts` | Per-issue MobX store: comments, addComment |
| `src/renderer/features/github-panel/components/url-open-bar.tsx` | Paste-GitHub-URL input that parses and selects a PR/issue |
| `src/renderer/features/github-panel/components/pr-list-item.tsx` | Single PR row with status icon, review badge, metadata |
| `src/renderer/features/github-panel/components/issue-list-item.tsx` | Single issue row with labels |
| `src/renderer/features/github-panel/components/pr-list.tsx` | PR list with loading/error/empty states |
| `src/renderer/features/github-panel/components/issue-list.tsx` | Issue list with loading/error/empty states |
| `src/renderer/features/github-panel/components/list-pane.tsx` | Left panel: tab bar + URL bar + list |
| `src/renderer/features/github-panel/components/comment-thread.tsx` | Comment list with avatar, markdown body, diff hunk |
| `src/renderer/features/github-panel/components/comment-composer.tsx` | Textarea + submit for comments |
| `src/renderer/features/github-panel/components/review-composer.tsx` | Review composer: comment/approve/request changes |
| `src/renderer/features/github-panel/components/pr-files-section.tsx` | Collapsible changed files list with inline diff patches |
| `src/renderer/features/github-panel/components/pr-detail.tsx` | Full PR detail: header, meta, body, files, comments, review |
| `src/renderer/features/github-panel/components/issue-detail.tsx` | Full issue detail: header, body, comments |
| `src/renderer/features/github-panel/components/detail-pane.tsx` | Routes to PrDetail or IssueDetail based on selection |
| `src/renderer/features/github-panel/main-panel.tsx` | Resizable split layout: list pane + detail pane |
| `src/renderer/features/github-panel/view.ts` | `ViewDefinition` for the view registry |

### Modified files:

| File | Change | Upstream risk |
|------|--------|---------------|
| `src/main/rpc.ts` | Added `githubPanel: githubPanelController` to router | Low — additive line |
| `src/renderer/app/view-registry.ts` | Added `githubPanel: githubPanelView` to views | Low — additive entry |
| `src/renderer/lib/stores/navigation-store.ts` | Added `githubPanel: 'github_panel_viewed'` to viewEvents | Low — additive entry |
| `src/renderer/features/sidebar/left-sidebar.tsx` | Added GitHub button to sidebar footer | Low — additive button |
| `src/shared/telemetry.ts` | Added `'githubPanel'` to `FocusView` union; added `github_panel_viewed` event | Low — additive union member and event entry |
