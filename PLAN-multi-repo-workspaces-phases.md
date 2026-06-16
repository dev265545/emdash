# Feature 3: Multi-Repo Workspaces — Implementation Phases

## Overview

Four phases. Each phase is independently mergeable and adds user-visible value.
Phase 1 is the foundation; later phases build on it. Run the full merge gate after each phase:
```bash
pnpm run format && pnpm run lint && pnpm run typecheck && pnpm run test
```

---

## Phase 1: Data Model & CRUD Foundation

**Goal:** Repo groups exist in the DB; users can create, rename, add/remove repos, and delete them.
No task integration yet.

**User value:** Organize repos into named groups; view them in the UI.

### Tasks

#### 1.1 DB Schema

- [ ] Add `repoGroups` and `repoGroupMembers` Drizzle table definitions to
  `src/main/db/schema.ts`.
- [ ] Run `pnpm run db:generate` to produce `drizzle/0016_multi_repo_workspaces.sql`.
- [ ] Update `pnpm run db:fixtures` fixture data to include one example repo group.
- [ ] Run `pnpm run test:migrations` — all pass.

#### 1.2 Shared Types

- [ ] Create `src/shared/core/repo-groups/repo-groups.ts` with types:
  `RepoGroup`, `RepoGroupMember`, `CreateRepoGroupParams`, `UpdateRepoGroupParams`,
  `RepoGroupError`.
- [ ] Create `src/shared/core/repo-groups/repo-group-events.ts` with
  `RepoGroupEvent` union type and `repoGroupEventChannel` constant.

#### 1.3 Main-Process Service

- [ ] Create `src/main/core/repo-groups/repo-group-service.ts` — `RepoGroupService` class with
  `getAll`, `getById`, `create`, `update`, `delete`. Validates name uniqueness and min-2-member
  constraint. Emits `repoGroupEventChannel` events after mutations.
- [ ] Create `src/main/core/repo-groups/controller.ts` — `repoGroupController` wiring to service.
- [ ] Register controller in `src/main/rpc.ts`: `repoGroups: repoGroupController`.
- [ ] Add `repoGroups` RPC type surface to `src/shared/ipc/rpc-types.ts` (or equivalent preload
  type file — follow existing pattern).

#### 1.4 Renderer Stores

- [ ] Create `src/renderer/features/repo-groups/stores/repo-group-store.ts` — `RepoGroupStore`
  MobX class.
- [ ] Create `src/renderer/features/repo-groups/stores/repo-group-manager.ts` —
  `RepoGroupManagerStore` with `load()`, `createGroup()`, `updateGroup()`, `deleteGroup()`.
  Subscribes to `repoGroupEventChannel`.
- [ ] Add `repoGroupManager: new RepoGroupManagerStore()` to `src/renderer/lib/stores/app-state.ts`
  and call `repoGroupManager.load()` alongside existing `projectManager.load()`.
- [ ] Export `getRepoGroupStore` and `getRepoGroupManagerStore` selectors from
  `src/renderer/features/repo-groups/stores/repo-group-selectors.ts` (mirrors
  `project-selectors.ts`).

#### 1.5 Tests

- [ ] Unit test: `repo-group-service.test.ts` covering create/update/delete/cascade.
- [ ] Unit test: `repo-group-manager.test.ts` covering store sync from events.

**Acceptance:** `pnpm run test` passes. Can create a repo group via RPC call in dev console.

---

## Phase 2: Sidebar & Workspace Overview UI

**Goal:** Workspace groups appear in the sidebar; users can navigate to the group overview,
manage repos, and see member project health.

**User value:** Full CRUD from the UI; workspace is a first-class navigation destination.

### Tasks

#### 2.1 Sidebar Row Types & Store

- [ ] Add `'repo-group'` and `'repo-group-member'` kinds to `SidebarRow` type in
  `src/renderer/features/sidebar/sidebar-store.ts`.
- [ ] Add `expandedGroupIds = observable.set<string>()` and `toggleGroupExpanded()` to
  `SidebarStore`.
- [ ] Update `orderedRows` computed to prepend group rows before standalone project rows.
  Expanded groups inject `repo-group-member` rows for each `memberProjectId`.
- [ ] Persist `expandedGroupIds` in `SidebarSnapshot` (update `src/shared/view-state.ts`).

#### 2.2 Sidebar Components

- [ ] Create `src/renderer/features/sidebar/repo-group-item.tsx` — `SidebarRepoGroupItem`
  component (see renderer plan for spec). Uses `Layers` lucide icon, mirrors
  `SidebarProjectItem` structure.
- [ ] Update `src/renderer/features/sidebar/sidebar-virtual-list.tsx` to render
  `<SidebarRepoGroupItem>` and indented `<SidebarProjectItem>` for group-member rows.
- [ ] Update `src/renderer/features/sidebar/left-sidebar.tsx`: add **"+ New Workspace"** button
  in the Projects group label area (next to existing `ProjectsGroupLabel`).

#### 2.3 View Registration & Route

- [ ] Create `src/renderer/features/repo-groups/view.ts` — `repoGroupView` `ViewDefinition`
  with `canActivate` guard.
- [ ] Register `repoGroup` in `src/renderer/app/view-registry.ts`.
- [ ] Create `src/renderer/features/repo-groups/repo-group-view.tsx` root component.
- [ ] Create `src/renderer/features/repo-groups/components/repo-group-titlebar.tsx`.
- [ ] Create `src/renderer/features/repo-groups/components/repo-group-main-panel.tsx` with
  **Repos** tab (Tasks tab is empty-state placeholder until Phase 3).
- [ ] Create `src/renderer/features/repo-groups/components/repos-tab.tsx` with
  `RepoMemberRow` list.

#### 2.4 Modals

- [ ] Create `src/renderer/features/repo-groups/components/create-repo-group-modal.tsx`.
- [ ] Create `src/renderer/features/repo-groups/components/manage-repo-group-modal.tsx`
  (rename + add/remove repos + delete).
- [ ] Register both modals in `src/renderer/app/modal-registry.ts`:
  `createRepoGroupModal` and `manageRepoGroupModal`.

#### 2.5 Commands

- [ ] Add `newRepoGroup` command to command registry.
- [ ] Add `commandProvider` in `repo-group-view.ts` exposing `manageRepoGroup` command.

#### 2.6 Tests

- [ ] Browser test: `src/renderer/tests/browser/repo-group-sidebar.test.tsx` — create group,
  verify sidebar rows, navigate to group view.
- [ ] Unit test: `sidebar-store.test.ts` — cover new group/member row ordering logic.

**Acceptance:** User can create a workspace with 2+ repos, see it in the sidebar, expand it to
show members, navigate to the group overview, and delete the workspace.

---

## Phase 3: Group Tasks & Cross-Repo Context

**Goal:** Create a task from a workspace group that gives the agent context from all member repos.
One task per repo, linked under a group task. Unified task list in the group view.

**User value:** Agent can read/write across repos in one task without manual coordination.

### Tasks

#### 3.1 DB Schema Additions

- [ ] Add `group_tasks` and `group_task_members` Drizzle definitions to `schema.ts`.
- [ ] Run `pnpm run db:generate` for migration `0017_group_tasks.sql`.
- [ ] Update fixtures and migration tests.

#### 3.2 Shared Types

- [ ] Create `src/shared/core/repo-groups/group-tasks.ts`:
  `GroupTask`, `GroupTaskMember`, `CreateGroupTaskParams`, `GroupTaskEvent`.

#### 3.3 Main-Process Group Task Service

- [ ] Create `src/main/core/repo-groups/group-task-service.ts`:
  - `createGroupTask(repoGroupId, params)`:
    1. Creates one `group_tasks` row.
    2. For each member project, creates one `tasks` row (reuses existing `createTask` operation).
    3. For each member project, creates a worktree with branch `emdash/group-<groupTaskId>`.
    4. Returns `GroupTask` with member task IDs.
  - `getGroupTasks(repoGroupId)`: joins `group_tasks` + `group_task_members`.
  - Assembles cross-repo context string for agent initial prompt (uses per-project
    `WorkspaceFileIndexService`).
- [ ] Add `createGroupTask` and `getGroupTasks` to `repoGroupController`.
- [ ] Extend RPC type surface.

#### 3.4 Context Assembly

- [ ] `group-context-assembler.ts`: builds multi-repo context block injected into the first
  agent turn. Format:
  ```
  ## Multi-Repo Workspace Context: "<name>"
  Working across N repositories:
  - <repo>: <path> (branch: <branch>)
    Recent changes: <summary from file index>
  ```
- [ ] Unit test: `group-context-assembler.test.ts`.

#### 3.5 Renderer Group Task Support

- [ ] Create `GroupTaskStore` and `GroupTaskManagerStore` (similar to `TaskStore` / `TaskManagerStore`).
- [ ] Add `groupTaskManager` to `RepoGroupStore`.
- [ ] Implement `group-tasks-tab.tsx` in the workspace overview view.
- [ ] Create `CreateGroupTaskModal` (extends `CreateTaskModal` pattern) — register in modal-registry.
- [ ] Wire **"+ New Group Task"** button in group overview and sidebar workspace row.

#### 3.6 Diff View Integration

- [ ] Extend `DiffView` to accept `groupTaskId`; render diffs grouped by repo with a repo
  header separator between them.
- [ ] No structural changes to individual task diff components.

#### 3.7 Tests

- [ ] Integration test: `group-task-service.db.test.ts` — create group task, verify per-repo
  task rows and `group_task_members` join.
- [ ] Unit test: `group-context-assembler.test.ts`.
- [ ] Browser test: create group task, verify both member tasks appear under group view.

**Acceptance:** User can create a group task; agent receives multi-repo context on first turn;
diff view shows cross-repo changes grouped by repo.

---

## Phase 4: Cross-Repo Branch Coordination & Polish

**Goal:** Coordinated branch naming, status rollup, and group task lifecycle management
(archive, rename, status sync).

**User value:** Production-quality cross-repo workflow; group task status reflects all member tasks.

### Tasks

#### 4.1 Coordinated Branch Management

- [ ] `group-branch-service.ts`: ensures all member worktrees use the same logical branch name.
  Handles the case where a branch already exists in one repo (suffix with `-<n>`).
- [ ] Expose branch name in group overview: "Branch: `emdash/group-abc123` (all repos)".

#### 4.2 Group Task Status Rollup

- [ ] `groupTaskStatus` computed in `GroupTaskStore`: derives aggregate status from member task
  statuses (e.g., if any is `active`, group is `active`; all `done` → group `done`).
- [ ] Display aggregate status badge in group task list and sidebar.

#### 4.3 Group Task Lifecycle

- [ ] Rename group task (propagates name to all member tasks).
- [ ] Archive group task (archives all member tasks atomically via a transaction).
- [ ] Delete group task (deletes member tasks; worktrees cleaned up per existing teardown logic).

#### 4.4 Sidebar Polish

- [ ] Active group task count badge on workspace sidebar row (mirrors task-count on project rows).
- [ ] Drag-to-reorder workspace rows (reuses `use-sidebar-drop.ts` pattern).
- [ ] Keyboard shortcut: `newGroupTask` command (register in settings).

#### 4.5 Error Handling & Edge Cases

- [ ] If a member project is deleted, remove it from `repo_group_members` (DB cascade handles this).
  Show warning in group view: "1 repo was removed from this workspace."
- [ ] If a group drops below 2 members, show a persistent warning banner in the group overview
  ("Add at least one more repo to use group tasks").
- [ ] Group task creation fails gracefully if any member project is SSH-disconnected: show
  which repos failed, allow retry of failed repos.

#### 4.6 Tests

- [ ] End-to-end test: full group task lifecycle (create → agent turn → archive).
- [ ] Edge case tests: member deletion, SSH disconnection during group task creation.
- [ ] Snapshot tests for sidebar group item (collapsed, expanded, with health badge).

**Acceptance:** Full group task lifecycle works. Status rollup is accurate. All edge cases
(deletion, SSH failure) show correct UI feedback.

---

## Files Created / Modified Summary

### New files

| File | Phase |
|---|---|
| `drizzle/0016_multi_repo_workspaces.sql` | 1 |
| `drizzle/0017_group_tasks.sql` | 3 |
| `src/shared/core/repo-groups/repo-groups.ts` | 1 |
| `src/shared/core/repo-groups/repo-group-events.ts` | 1 |
| `src/shared/core/repo-groups/group-tasks.ts` | 3 |
| `src/main/core/repo-groups/repo-group-service.ts` | 1 |
| `src/main/core/repo-groups/controller.ts` | 1 |
| `src/main/core/repo-groups/group-task-service.ts` | 3 |
| `src/main/core/repo-groups/group-context-assembler.ts` | 3 |
| `src/main/core/repo-groups/group-branch-service.ts` | 4 |
| `src/renderer/features/repo-groups/stores/repo-group-store.ts` | 1 |
| `src/renderer/features/repo-groups/stores/repo-group-manager.ts` | 1 |
| `src/renderer/features/repo-groups/stores/repo-group-selectors.ts` | 1 |
| `src/renderer/features/repo-groups/stores/repo-group-view.ts` | 2 |
| `src/renderer/features/repo-groups/view.ts` | 2 |
| `src/renderer/features/repo-groups/repo-group-view.tsx` | 2 |
| `src/renderer/features/repo-groups/components/repo-group-titlebar.tsx` | 2 |
| `src/renderer/features/repo-groups/components/repo-group-main-panel.tsx` | 2 |
| `src/renderer/features/repo-groups/components/repos-tab.tsx` | 2 |
| `src/renderer/features/repo-groups/components/group-tasks-tab.tsx` | 3 |
| `src/renderer/features/repo-groups/components/create-repo-group-modal.tsx` | 2 |
| `src/renderer/features/repo-groups/components/manage-repo-group-modal.tsx` | 2 |
| `src/renderer/features/repo-groups/components/create-group-task-modal.tsx` | 3 |
| `src/renderer/features/sidebar/repo-group-item.tsx` | 2 |

### Modified files

| File | Phase | Change |
|---|---|---|
| `src/main/db/schema.ts` | 1 | Add `repoGroups`, `repoGroupMembers`, `groupTasks`, `groupTaskMembers` |
| `src/main/rpc.ts` | 1 | Register `repoGroupController` |
| `src/shared/ipc/rpc-types.ts` (or equivalent) | 1 | Add `repoGroups` type surface |
| `src/renderer/lib/stores/app-state.ts` | 1 | Add `repoGroupManager` |
| `src/renderer/features/sidebar/sidebar-store.ts` | 2 | New row kinds, `expandedGroupIds` |
| `src/renderer/features/sidebar/sidebar-virtual-list.tsx` | 2 | Render group + member rows |
| `src/renderer/features/sidebar/left-sidebar.tsx` | 2 | "+ New Workspace" button |
| `src/renderer/app/view-registry.ts` | 2 | Register `repoGroup` view |
| `src/renderer/app/modal-registry.ts` | 2+3 | Register group modals |
| `src/shared/view-state.ts` | 2 | Add `expandedGroupIds` to `SidebarSnapshot` |
| `src/renderer/lib/commands/registry.ts` | 2 | Add group commands |
| diff view component | 3 | Accept `groupTaskId`, render per-repo sections |

---

## Risk Notes

1. **DB migration ordering**: do not hand-edit the generated migration number. Let Drizzle assign
   it. Verify with `pnpm run test:migrations` before merging each phase.
2. **Cascade on project delete**: `repo_group_members` FK cascade is intentional — test this
   explicitly in Phase 1 integration tests.
3. **Cross-repo worktree creation**: reuses existing worktree bootstrap logic per project.
   The only new surface is the shared branch naming in Phase 3. Follow `workspace-branch.ts`
   rules — do not bypass validation.
4. **SSH mixed workspaces**: Phase 1–3 are local-only. Phase 4 can extend `group-task-service.ts`
   to handle SSH member projects, but this requires SSH-specific worktree bootstrap which is
   high-risk (see `agents/risky-areas/ssh.md`).
5. **Sidebar performance**: `orderedRows` is a MobX computed. With 50+ projects and 10+ groups,
   the virtual list must remain the source of rendering. Do not re-introduce non-virtualized lists.

---

## Related Plan Docs

- [Overview & UX Vision](./PLAN-multi-repo-workspaces-overview.md)
- [Architecture & Database](./PLAN-multi-repo-workspaces-architecture.md)
- [Renderer & UI](./PLAN-multi-repo-workspaces-renderer.md)
