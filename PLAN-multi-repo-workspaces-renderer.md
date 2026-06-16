# Feature 3: Multi-Repo Workspaces — Renderer & UI Design

## Overview

This document covers renderer stores, component tree, sidebar integration, modals, and UI
specifications for Multi-Repo Workspaces.

---

## Renderer Architecture

### Store Hierarchy

```
app-state.ts
  └─ repoGroupManager: RepoGroupManagerStore   (new, analogous to projectManagerStore)
       └─ groups: ObservableMap<string, RepoGroupStore>
            └─ RepoGroupStore
                 ├─ data: RepoGroup
                 └─ memberStores: ProjectStore[]   (pointers into projectManager.projects)
```

### `RepoGroupStore` (`src/renderer/features/repo-groups/stores/repo-group-store.ts`)

```ts
export class RepoGroupStore {
  data: RepoGroup;

  get memberStores(): ProjectStore[] {
    return this.data.memberProjectIds
      .map((id) => getProjectStore(id))
      .filter(Boolean) as ProjectStore[];
  }

  get hasUnhealthyMember(): boolean {
    return this.memberStores.some(
      (s) => s.state === 'unmounted' && s.phase === 'error'
    );
  }

  constructor(data: RepoGroup) {
    this.data = data;
    makeAutoObservable(this);
  }
}
```

### `RepoGroupManagerStore` (`src/renderer/features/repo-groups/stores/repo-group-manager.ts`)

```ts
export class RepoGroupManagerStore {
  groups = observable.map<string, RepoGroupStore>();

  async load(): Promise<void>           // calls rpc.repoGroups.getRepoGroups(), subscribes to events
  async createGroup(params): Promise<string | undefined>
  async updateGroup(id, params): Promise<void>
  async deleteGroup(id): Promise<void>
}
```

Lifecycle:
- `load()` is called once in `app-state.ts` init alongside `projectManagerStore.load()`.
- Subscribes to `repoGroupEventChannel` to keep map in sync with main-process mutations.
- Uses `runInAction` for all mutations (follows `ProjectManagerStore` pattern).

---

## Sidebar Integration

### Sidebar Row Type Extension

`src/renderer/features/sidebar/sidebar-store.ts`:

```ts
export type SidebarRow =
  | { kind: 'project'; projectId: string }
  | { kind: 'task'; projectId: string; taskId: string }
  | { kind: 'repo-group'; repoGroupId: string }           // new
  | { kind: 'repo-group-member'; repoGroupId: string; projectId: string };  // new
```

Groups render **above** standalone projects in `orderedRows`. A project that belongs to a
group still also appears in the standalone project list (group membership is non-exclusive).

### Expanded/collapsed state

`SidebarStore`:
- Add `expandedGroupIds = observable.set<string>()`.
- `toggleGroupExpanded(id: string)`: mirrors `toggleProjectExpanded`.
- Persist in `SidebarSnapshot` under `expandedGroupIds: string[]`.

### `SidebarRepoGroupItem` component

`src/renderer/features/sidebar/repo-group-item.tsx`:

```tsx
export const SidebarRepoGroupItem = observer(function SidebarRepoGroupItem({
  repoGroupId,
}: { repoGroupId: string }) {
  // Structure mirrors SidebarProjectItem
  // Icon: Layers (lucide) — stack-of-folders motif
  // Expand/collapse chevron shows member projects
  // "+" button → showCreateGroupTaskModal({ repoGroupId })
  // Context menu: Rename, Manage Repos, Delete
  // Health badge: TriangleAlert if hasUnhealthyMember
});
```

Visual spec:
- Row height: `h-8` (same as project rows).
- Icon: `Layers` from lucide (distinguishes from single-folder project icon).
- Member count badge: `"3 repos"` rendered as a dim `text-xs` suffix in the label.
- Active state: highlighted when current view is `repoGroup` with matching `repoGroupId`.

### Sidebar virtual list changes

`SidebarVirtualList` (`sidebar-virtual-list.tsx`):
- Check `row.kind === 'repo-group'` → render `<SidebarRepoGroupItem>`.
- Check `row.kind === 'repo-group-member'` → render `<SidebarProjectItem>` with 8px left indent.

---

## View Registration

`src/renderer/app/view-registry.ts`:

```ts
import { repoGroupView } from '@renderer/features/repo-groups/view';

export const views = {
  // ...existing...
  repoGroup: repoGroupView,
};
```

View params: `{ repoGroupId: string }`.

### `canActivate` guard

```ts
canActivate: (params) => {
  if (!isRepoGroupParams(params)) return { ok: false, redirect: 'home' };
  const group = repoGroupManagerStore.groups.get(params.repoGroupId);
  if (!group) return { ok: false, redirect: 'home' };
  return { ok: true };
}
```

---

## Workspace Overview View

### File structure

```
src/renderer/features/repo-groups/
  view.ts                          # ViewDefinition for view-registry
  repo-group-view.tsx              # Root component (analogous to projects/view.tsx)
  components/
    repo-group-titlebar.tsx        # Name + settings gear
    repo-group-main-panel.tsx      # Tabs: Repos / Tasks
    repos-tab.tsx                  # Member repo list
    group-tasks-tab.tsx            # Group tasks list (Phase 3)
    repo-member-row.tsx            # One row per member repo
  stores/
    repo-group-store.ts
    repo-group-manager.ts
    repo-group-view.ts             # Tab state (active tab, etc.)
```

### Titlebar (`repo-group-titlebar.tsx`)

```
[ Layers icon ]  Payments Stack                    [ ⚙ Settings ]
```

Clicking **Settings** opens `<ManageRepoGroupModal>`.

### Main Panel: Repos Tab

```
┌──────────────────────────────────────────────────────┐
│  Repos  │  Tasks                                      │
├──────────────────────────────────────────────────────┤
│  ▷  backend-api          main  ●  2 active tasks  →  │
│  ▷  payments-frontend    main  ●  0 active tasks  →  │
│  ▷  shared-sdk           v2    ●  1 active task   →  │
│                                                       │
│  [+ Add Repo]                                         │
└──────────────────────────────────────────────────────┘
```

Each `RepoMemberRow`:
- Project icon + name (truncated).
- Current branch badge.
- Active task count badge.
- `→` arrow to navigate to the standalone project view.
- Error state if project is `path_not_found` or SSH disconnected.

### Main Panel: Tasks Tab (Phase 3)

Lists `GroupTask` rows. Columns: name, status, repos involved (count badge), last activity.
Empty state: "No group tasks yet. Create one to work across all repos simultaneously."

---

## Modals

### `CreateRepoGroupModal`

`src/renderer/features/repo-groups/components/create-repo-group-modal.tsx`

```
┌─────────────────────────────────────┐
│  New Workspace                      │
├─────────────────────────────────────┤
│  Name                               │
│  ┌─────────────────────────────┐    │
│  │ Payments Stack              │    │
│  └─────────────────────────────┘    │
│                                     │
│  Repos (select 2 or more)           │
│  ┌─────────────────────────────┐    │
│  │ ☑ backend-api               │    │
│  │ ☑ payments-frontend         │    │
│  │ ☐ data-pipeline             │    │
│  │ ☑ shared-sdk                │    │
│  └─────────────────────────────┘    │
│                                     │
│               [ Cancel ] [ Create ] │
└─────────────────────────────────────┘
```

- Inline validation: name required, 2+ repos required.
- `Create` disabled until valid.
- On success: navigate to `repoGroup` view with new group ID.

Register in `modal-registry.ts`:
```ts
createRepoGroupModal: createModal(CreateRepoGroupModal, { size: 'sm' }),
```

### `ManageRepoGroupModal`

```
┌──────────────────────────────────────┐
│  Workspace Settings                  │
├──────────────────────────────────────┤
│  Name                                │
│  ┌─────────────────────────────┐     │
│  │ Payments Stack              │     │
│  └─────────────────────────────┘     │
│                                      │
│  Repos                               │
│  ☑ backend-api        [✕]            │
│  ☑ payments-frontend  [✕]            │
│  ☑ shared-sdk         [✕]            │
│                                      │
│  [+ Add Repo]                        │
│                                      │
│  ──────────────────────────────────  │
│  [ Delete Workspace ] [ Save ]       │
└──────────────────────────────────────┘
```

- Remove repo: immediate from list (saved on **Save**).
- Delete Workspace: triggers `ConfirmActionDialog` (existing modal).
- Register as `manageRepoGroupModal` in modal-registry.

### `CreateGroupTaskModal` (Phase 3)

Extends existing `CreateTaskModal` pattern. Adds:
- "Workspace scope" selector (all repos or subset).
- Branch name preview showing `emdash/group-<id>` pattern.

---

## Command Registration

`src/renderer/lib/commands/registry.ts` additions:

```ts
{
  id: 'newRepoGroup',
  label: 'New Workspace',
  icon: Layers,
  handler: () => showModal('createRepoGroupModal', {}),
},
{
  id: 'manageRepoGroup',
  label: 'Manage Workspace',
  icon: Settings,
  handler: () => showModal('manageRepoGroupModal', { repoGroupId: currentGroupId }),
},
```

`commandProvider` in `repo-group-view.ts` exposes `manageRepoGroup` when in the group view.

---

## UI Component Reuse Strategy

| New component | Reuses |
|---|---|
| `SidebarRepoGroupItem` | `SidebarMenuRow`, `SidebarItemMiniButton`, `SidebarMenuAction` (from sidebar-primitives) |
| `RepoMemberRow` | `ConnectionStatusDot`, `Tooltip`, `Badge` |
| `CreateRepoGroupModal` | `ConfirmActionDialog` pattern, existing `Checkbox`, `Input` from `@renderer/lib/ui/` |
| `RepoGroupTitlebar` | Same layout as `ProjectTitlebar` |
| Group task list | Same `TaskList` component with `groupTaskId` prop |

**No new design primitives** — uses existing Tailwind classes, lucide icons, shadcn components.

---

## State Snapshots

`src/shared/view-state.ts` additions:

```ts
export type SidebarSnapshot = {
  // ...existing...
  expandedGroupIds?: string[];
};

export type RepoGroupViewSnapshot = {
  activeTab: 'repos' | 'tasks';
};
```

`repoGroupManagerStore` integrates with `snapshotRegistry` using key `repo-group:<id>`.

---

## Related Plan Docs

- [Overview & UX Vision](./PLAN-multi-repo-workspaces-overview.md)
- [Architecture & Database](./PLAN-multi-repo-workspaces-architecture.md)
- [Implementation Phases](./PLAN-multi-repo-workspaces-phases.md)
