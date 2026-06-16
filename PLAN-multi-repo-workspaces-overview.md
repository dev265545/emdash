# Feature 3: Multi-Repo Workspaces — Overview & UX Vision

## What This Feature Is

Multi-Repo Workspaces (internally: **Repo Groups**) let users define a named collection of
repositories and treat them as a single unit of work. An agent task launched from a Repo Group
gets full context across every member repo: unified diff review, cross-repo branching, and
cross-repo code search. The feature builds on top of the existing `Project` + `Workspace`
primitives without replacing them.

---

## Problem Being Solved

Today, every project in Emdash is a single git repository. Agent tasks are scoped to one repo.
When a real engineering initiative spans multiple repos (backend + frontend + shared SDK, or a
monorepo split across multiple remote machines), users must:

- Launch separate tasks in each project and manually coordinate
- Copy context between conversations
- Diff across repos mentally instead of in the tool

Multi-Repo Workspaces eliminate this friction by making "a collection of repos" a first-class
entity in the app.

---

## User-Facing Concepts

| Concept | User name | Internal name | Notes |
|---|---|---|---|
| Named collection of repos | **Workspace** | `RepoGroup` | Distinct from DB `workspaces` table (those are git worktrees) |
| Member of a workspace | **Repo** | `RepoGroupMember` | A pointer to an existing `Project` |
| Task spanning all repos | **Group Task** | `GroupTask` | One logical task, one worktree per member repo |
| Unified diff across repos | **Cross-repo diff** | — | Rendered in existing diff view, grouped by repo |

> **Naming note:** The existing `workspaces` DB table represents individual git worktrees
> (one per task branch). The new user-facing "Workspace" concept maps to the `repo_groups` DB
> table to avoid collision.

---

## UX Flows

### Creating a Workspace

1. Click **+ New Workspace** in the sidebar (above the Projects list).
2. Enter a name (e.g., "Payments Stack").
3. Pick 2–N existing projects from a multi-select list.
4. Confirm → workspace appears in the sidebar as a collapsible group.

### Viewing a Workspace

- Sidebar: Workspace header row (folder-stack icon) with expand/collapse.
- Expanded: shows each member repo as a sub-row (same style as current project rows).
- Click workspace header → navigate to the **Workspace Overview** view.

### Workspace Overview View

- Header: workspace name + member count + aggregated last-activity timestamp.
- **Repos tab**: list of member repos with quick-open, branch badge, last-task badge.
- **Tasks tab**: tasks that were created in this workspace context (group tasks), sorted by
  last interaction.
- **New Group Task button**: launches the create-task modal pre-configured for the group.

### Creating a Group Task

1. From the Workspace Overview (or sidebar `+` button on the workspace row).
2. Create-task modal has a "Scope" field defaulting to "All repos in workspace" with option
   to restrict to a subset.
3. Agent receives combined context: repo paths, active branches, recent diffs across all
   member repos.
4. A worktree is created in each member repo under a shared branch name
   (e.g., `emdash/group-task/<task-id>`).
5. Diff view shows cross-repo diff grouped by repo.

### Managing a Workspace

- Rename: via workspace settings (settings icon in the workspace header).
- Add/remove repos: same settings panel.
- Delete workspace: right-click context menu → confirm dialog.
  - Deletes the group record only; member projects and their tasks are untouched.

---

## Non-Goals (explicitly out of scope for this feature)

- Cross-workspace dependencies or "super-workspaces".
- Merging repos or modifying git history.
- SSH-mixed workspaces (Phase 1 is local-only; SSH support is Phase 3+).
- Syncing branches across repos automatically.
- Any changes to how individual project tasks work.

---

## Design Principles

1. **Additive only**: existing project / task / workspace DB semantics are unchanged.
2. **No forced adoption**: users can continue using standalone projects; workspace groups are opt-in.
3. **UI consistency**: workspace rows in the sidebar look like enhanced project rows — same
   primitives, same context menus, same hover/active states.
4. **Graceful degradation**: if a member repo is unavailable (SSH disconnected, path missing),
   that slot shows an error badge; the rest of the workspace still works.

---

## Success Metrics

- User can create a repo group with 2+ projects in under 30 seconds.
- A group task provides combined context to the agent on first turn (no extra prompting).
- Cross-repo diff renders in the existing diff view without layout regressions.
- All existing single-repo flows continue working unchanged.

---

## Related Plan Docs

- [Architecture & Database](./PLAN-multi-repo-workspaces-architecture.md)
- [Renderer & UI](./PLAN-multi-repo-workspaces-renderer.md)
- [Implementation Phases](./PLAN-multi-repo-workspaces-phases.md)
