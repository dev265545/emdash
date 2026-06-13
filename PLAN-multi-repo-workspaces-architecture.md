# Feature 3: Multi-Repo Workspaces — Architecture & Database Design

## Overview

This document covers the data model, DB schema changes, main-process service layer, and RPC
contracts for Multi-Repo Workspaces.

---

## Naming Conventions

| Layer | Name | Why |
|---|---|---|
| DB tables | `repo_groups`, `repo_group_members` | Avoid collision with existing `workspaces` table |
| Shared types | `RepoGroup`, `RepoGroupMember` | Mirror DB naming |
| Main-process domain | `src/main/core/repo-groups/` | Follows existing `projects/`, `workspaces/` pattern |
| RPC namespace | `rpc.repoGroups.*` | Follows `rpc.projects.*` pattern |
| Renderer feature | `src/renderer/features/repo-groups/` | Follows `features/projects/` pattern |

---

## Database Schema

### New Tables

#### `repo_groups`

```sql
CREATE TABLE repo_groups (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX idx_repo_groups_name ON repo_groups (name);
```

Drizzle definition (`src/main/db/schema.ts`):

```ts
export const repoGroups = sqliteTable(
  'repo_groups',
  {
    id:        text('id').primaryKey(),
    name:      text('name').notNull(),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({ nameIdx: uniqueIndex('idx_repo_groups_name').on(t.name) })
);
```

#### `repo_group_members`

```sql
CREATE TABLE repo_group_members (
  repo_group_id TEXT NOT NULL REFERENCES repo_groups(id) ON DELETE CASCADE,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (repo_group_id, project_id)
);
CREATE INDEX idx_repo_group_members_project ON repo_group_members (project_id);
```

Drizzle definition:

```ts
export const repoGroupMembers = sqliteTable(
  'repo_group_members',
  {
    repoGroupId: text('repo_group_id').notNull().references(() => repoGroups.id, { onDelete: 'cascade' }),
    projectId:   text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    sortOrder:   integer('sort_order').notNull().default(0),
  },
  (t) => ({
    pk:         primaryKey({ columns: [t.repoGroupId, t.projectId] }),
    projectIdx: index('idx_repo_group_members_project').on(t.projectId),
  })
);
```

#### `group_tasks` (Phase 3)

Links one logical group-task to per-repo task rows.

```sql
CREATE TABLE group_tasks (
  id            TEXT PRIMARY KEY,
  repo_group_id TEXT NOT NULL REFERENCES repo_groups(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE group_task_members (
  group_task_id TEXT NOT NULL REFERENCES group_tasks(id) ON DELETE CASCADE,
  task_id       TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY (group_task_id, task_id)
);
```

### Migration File

Generate via:
```bash
pnpm run db:generate
```

Migration file: `drizzle/0016_multi_repo_workspaces.sql` (number will be auto-assigned).
Update fixtures: `pnpm run db:fixtures`.
Run migration tests: `pnpm run test:migrations`.

---

## Shared Types (`src/shared/`)

### `src/shared/core/repo-groups/repo-groups.ts`

```ts
export type RepoGroup = {
  id: string;
  name: string;
  memberProjectIds: string[];  // ordered
  createdAt: string;
  updatedAt: string;
};

export type RepoGroupMember = {
  repoGroupId: string;
  projectId: string;
  sortOrder: number;
};

export type CreateRepoGroupParams = {
  id?: string;
  name: string;
  projectIds: string[];  // ordered; min 2
};

export type UpdateRepoGroupParams = {
  name?: string;
  projectIds?: string[];
};

export type RepoGroupError =
  | { type: 'not-found' }
  | { type: 'name-taken'; name: string }
  | { type: 'duplicate-projects' }
  | { type: 'min-members'; required: number }
  | { type: 'error'; message: string };
```

---

## Main-Process Domain (`src/main/core/repo-groups/`)

### File structure

```
src/main/core/repo-groups/
  controller.ts            # RPC controller (follows projects/controller.ts)
  repo-group-service.ts    # CRUD + query operations
  operations/
    createRepoGroup.ts
    updateRepoGroup.ts
    deleteRepoGroup.ts
    getRepoGroups.ts
  group-task-service.ts    # Phase 3: cross-repo task orchestration
```

### `repo-group-service.ts`

```ts
export class RepoGroupService {
  async getAll(): Promise<RepoGroup[]>
  async getById(id: string): Promise<RepoGroup | null>
  async create(params: CreateRepoGroupParams): Promise<Result<RepoGroup, RepoGroupError>>
  async update(id: string, params: UpdateRepoGroupParams): Promise<Result<RepoGroup, RepoGroupError>>
  async delete(id: string): Promise<Result<void, RepoGroupError>>
}

export const repoGroupService = new RepoGroupService();
```

Implementation notes:
- `getAll()` joins `repo_groups` with `repo_group_members` ordered by `sort_order`.
- `create()` validates: name uniqueness, min 2 project IDs, no duplicate project IDs.
- `delete()` is safe: cascade handles `repo_group_members`; does not touch `projects` or `tasks`.
- All mutations update `updated_at`.

### `controller.ts`

```ts
export const repoGroupController = createRPCController({
  getRepoGroups:    () => repoGroupService.getAll(),
  createRepoGroup:  (params) => repoGroupService.create(params),
  updateRepoGroup:  (id, params) => repoGroupService.update(id, params),
  deleteRepoGroup:  (id) => repoGroupService.delete(id),
});
```

Register in `src/main/rpc.ts`:
```ts
import { repoGroupController } from '@main/core/repo-groups/controller';
// ...
repoGroups: repoGroupController,
```

---

## RPC Contract

```ts
// src/shared/ipc/rpc-types.ts additions
repoGroups: {
  getRepoGroups:   () => Promise<RepoGroup[]>;
  createRepoGroup: (params: CreateRepoGroupParams) => Promise<Result<RepoGroup, RepoGroupError>>;
  updateRepoGroup: (id: string, params: UpdateRepoGroupParams) => Promise<Result<RepoGroup, RepoGroupError>>;
  deleteRepoGroup: (id: string) => Promise<Result<void, RepoGroupError>>;
};
```

---

## Events

```ts
// src/shared/core/repo-groups/repo-group-events.ts
export type RepoGroupEvent =
  | { type: 'created'; group: RepoGroup }
  | { type: 'updated'; group: RepoGroup }
  | { type: 'deleted'; id: string };

export const repoGroupEventChannel = 'repo-group-event';
```

Emitted from `RepoGroupService` after each mutation. Renderer subscribes via `events.on(repoGroupEventChannel, ...)`.

---

## Group Task Architecture (Phase 3)

When a user creates a task from a Repo Group context, the flow is:

1. Renderer calls `rpc.repoGroups.createGroupTask(repoGroupId, taskParams)`.
2. Main process creates one `group_tasks` row + one `tasks` row per member project.
3. For each member project, a worktree is created with branch `emdash/group-<groupTaskId>`.
4. The first agent turn receives a combined system prompt:
   ```
   You are working across N repositories as part of workspace "<name>":
   - <repo1>: path=<path>, branch=<branch>
   - <repo2>: path=<path>, branch=<branch>
   ...
   ```
5. Cross-repo context is assembled in `src/main/core/repo-groups/group-task-service.ts` using
   the existing `WorkspaceFileIndexService` per member repo.
6. Diff collection runs per-task via existing workspace diff infrastructure; results merge in
   renderer under a shared `GroupTaskStore`.

---

## Security Considerations

- `repo_group_members.project_id` has FK + cascade — no orphan groups.
- Project deletion cascades to remove membership (group still exists, just with one fewer member).
- If a group drops below 1 member due to cascaded deletion, expose a warning badge in the UI
  but do not auto-delete the group (user may want to re-add).
- No new shell escaping surface: group task branches use the same `emdash/<id>` naming scheme
  validated in `workspace-branch.ts`.
- Path construction for cross-repo context reuses `path-utils.ts` — no new path traversal risk.

---

## Related Plan Docs

- [Overview & UX Vision](./PLAN-multi-repo-workspaces-overview.md)
- [Renderer & UI](./PLAN-multi-repo-workspaces-renderer.md)
- [Implementation Phases](./PLAN-multi-repo-workspaces-phases.md)
