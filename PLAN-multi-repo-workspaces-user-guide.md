# Multi-Repo Workspaces — User Guide

**Feature:** Group multiple repos into a single workspace and navigate them together from the sidebar.

---

## What It Is

A **Workspace** (called a *Repo Group* internally) is a named container that holds 2 or more
of your local projects. It appears in the sidebar as a collapsible section. Clicking it opens a
dedicated panel showing all member repos at a glance.

---

## How to Create a Workspace

1. In the left sidebar, look for the **"+ New Workspace"** button near the top of the projects
   list (or right-click any project row to find the option).
2. A modal opens: enter a **Name** for the workspace.
3. Check off **at least 2 repos** from your project list.
4. Click **Create Workspace**.

The new workspace appears in the sidebar immediately and the view navigates to its panel.

---

## Sidebar Layout

```
▼ My Monorepo
    ├── frontend/
    └── backend/
  project-A
  project-B
```

- **Collapse/expand** a workspace by clicking the chevron next to its name.
- A **member count badge** shows how many repos are inside.
- A **warning indicator** appears if any member repo has an error or is unavailable.
- Drag-and-drop to reorder workspaces within the sidebar.

---

## Workspace Panel

Click a workspace name (or select it from the sidebar) to open its panel.

The panel shows:

| Section | What you see |
|---------|-------------|
| **Repos tab** | All member repos with their current status |

Click any repo row in the panel to jump directly to that project's view.

---

## Managing a Workspace

**Right-click** a workspace row in the sidebar to get the context menu:

| Menu item | Action |
|-----------|--------|
| Open Workspace | Navigate to the workspace panel |
| Manage Workspace | Edit name, add/remove repos |
| Remove Workspace | Delete the workspace (repos themselves are NOT deleted) |

### Edit Name or Members

1. Right-click → **Manage Workspace**.
2. Change the name in the text field.
3. Check/uncheck repos to add or remove them.
4. Click **Save**.

Minimum of 2 repos required at all times.

### Delete a Workspace

1. Right-click → **Remove Workspace**.
2. Confirm the action in the dialog.

Only the *workspace grouping* is deleted. All repos remain in your project list.

---

## Live Updates

Workspaces sync in real time. If another session (or a future background job) creates,
renames, or deletes a workspace, the sidebar and panel update automatically — no refresh needed.

---

## Keyboard / Navigation Notes

- Workspace views are tracked in navigation history — the Back button works.
- Closing and reopening the app restores which workspaces were expanded.
- The sidebar collapse/expand state for each workspace persists across sessions.

---

## Limitations (Phase 1)

- Cross-repo task creation and group-level task views are planned for Phase 3.
- Branch coordination and group-level status rollup are planned for Phase 4.
- Workspaces are local to this machine — they are not synced via Git.
