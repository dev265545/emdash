# Project Rules & Developer Instructions

## Overview

This is a fork/worktree of the official **Emdash** desktop app — a cross-platform Electron app
for orchestrating multiple AI coding agents in parallel. The worktree lives at:

```
~/emdash/worktrees/emdash/check-1-blp9w/
```

The main app code is under `apps/emdash-desktop/`. This is a pnpm monorepo workspace.

---

## Ground Rules

### 1. Stay upstream-compatible
All custom changes must be made in a way that allows the official emdash repo to merge in cleanly.
- Prefer **additive changes** (new files, new scripts, new config keys) over modifying existing logic
- When touching existing files, make changes **minimal and isolated** — one concern per edit
- Never restructure or refactor upstream code unless the task explicitly requires it
- If a change conflicts with upstream patterns, flag it before implementing

### 2. Linux build setup (this machine)
The dev machine runs Ubuntu Linux. Some workarounds are baked in for local development:

- Run the dev server with: `pnpm run dev:no-sandbox` (not `pnpm run dev`)
- The `--no-sandbox` and `--password-store=gnome-libsecret` flags are needed on this machine
- These are already baked into `src/main/index.ts` for all Linux production builds
- Official emdash AppImages conflict via second-instance detection — close official before running dev build

### 3. Building
- Dev: `pnpm run dev:no-sandbox` from `apps/emdash-desktop/`
- Package Linux AppImage: `pnpm run package:linux` from `apps/emdash-desktop/`
- AppImage output: `apps/emdash-desktop/release/emdash-x86_64.AppImage`
- The version is pinned to `1.1.32-dev` to avoid conflicts with the official `1.1.32` build
- RPM build always fails (no `rpmbuild` on this machine) — ignore it, AppImage and deb still build

### 4. Code style
Follow the conventions from `AGENTS.md` / `CLAUDE.md`:
- 2 spaces, semicolons, single quotes in TS, double quotes in JSX
- Sorted imports, trailing commas, 100-char line width
- No `any`, no `require()`, no re-exports as shortcuts
- Main-process RPC handlers in `src/main/core/*/controller.ts`
- Renderer features under `src/renderer/features/<feature>/`
- New modals → register in `src/renderer/app/modal-registry.ts`
- New views → register in `src/renderer/app/view-registry.ts`

### 5. Custom features
New features should be self-contained:
- New renderer feature → `src/renderer/features/<feature>/`
- New main-process domain → `src/main/core/<domain>/`
- New RPC methods → appropriate controller + registered in `src/main/rpc.ts`
- Avoid touching shared infrastructure files unless strictly necessary

### 6. Before merging anything upstream
Run the full gate:
```bash
pnpm run format
pnpm run lint
pnpm run typecheck
pnpm run test
```

### 7. Always rebuild after making changes
After completing any set of code changes, always kick off a Linux AppImage build:
```bash
pnpm run package:linux
```
- Run it in the background so it doesn't block — notify the user when done
- Output path: `apps/emdash-desktop/release/emdash-x86_64.AppImage`
- RPM failure is expected and can be ignored — AppImage and deb still build

---

## Planned Custom Features

- **GitHub sidebar panel** — repos, PRs, issues, review requests in a dedicated sidebar view
  - PR viewer with diff preview
  - Inline commenting and review submission
  - Notifications for new activity
