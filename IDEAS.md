# Ideas, Features & Issues

A living document of planned features and improvements for this Emdash fork.
Updated with codebase-specific implementation notes.

---

## Feature 1: AI-Assisted Commit / PR Message Generation

### Problem
Writing commit messages and PR descriptions is manual and tedious. The diff is already
available in the app — it should be trivial for AI to draft these.

### What It Does
- A "Generate with AI" button in the commit/push flow drafts a commit message from the staged diff
- Same in the PR creation flow — AI drafts title + description from the branch diff and linked issue
- A model picker in Settings controls which model is used for these generations

### Codebase Touchpoints

**Existing infrastructure to leverage:**
- `src/main/core/git/controller.ts` — already exposes `getStagedChanges()`, `getFullStatus()`,
  `getStatus()` — the raw material for generation is already an RPC call away
- `src/main/core/pull-requests/` — PR creation flow lives here; extend it with a
  `generatePrDescription(taskId)` method
- `src/main/core/settings/schema.ts` — add a new `aiGenerationSettingsSchema` with
  `{ model: string; enabled: boolean }` alongside the existing `defaultAgentSchema`
- `src/main/core/settings/settings-registry.ts` — register defaults for the new schema keys
- `src/renderer/features/github-panel/components/review-composer.tsx` — PR review composer
  is already built; the generation button slots in here naturally

**New code needed:**
1. `src/main/core/ai-generation/` — new domain
   - `generation-service.ts` — calls the configured model with a diff + prompt template,
     returns `Result<string, GenerationError>`
   - `controller.ts` — RPC methods: `generateCommitMessage(workspaceId)`,
     `generatePrDescription(taskId, targetBranch)`
2. `src/shared/ai-generation.ts` — shared types: `GenerationRequest`, `GenerationResult`,
   `GenerationSettings`
3. Register controller in `src/main/rpc.ts` under `aiGeneration`
4. Renderer: add "Generate" button + loading state to the commit panel and PR creation modal

**Settings schema addition** (in `src/main/core/settings/schema.ts`):
```typescript
const aiGenerationSettingsSchema = z.object({
  commitMessageModel: z.string().default('claude-haiku-4-5'),
  prDescriptionModel: z.string().default('claude-sonnet-4-6'),
  enabled: z.boolean().default(true),
});
```

### Implementation Order
1. Settings schema + UI (model picker dropdown in Settings → AI section)
2. `generation-service.ts` with commit message generation
3. Button in commit/push flow
4. Extend to PR description in `pull-requests` controller
5. Button in PR creation modal / GitHub panel

### Complexity: Medium
The hardest part is the model API call from the main process — need to decide whether
to call Anthropic directly or reuse the agent PTY path. Direct API call is cleaner for
short synchronous generations.

---

## Feature 2: Session Browser — Persistent Session View ~~[CLOSED — existing UI covers this for now]~~

### Problem
Every agent session (Claude, Codex, Cursor) creates a `Conversation` record with a
`providerSessionId` that enables resumption. But there's no UI to see all past sessions,
their status, or resume them without knowing the ID. The data is already there in the DB.

**What already exists (don't reimplement):**
- `src/renderer/features/tasks/conversations/sidebar-conversations-list.tsx` — shows
  conversations scoped to a single task in the task sidebar. Agent icon shown, rename/delete
  available. This is task-scoped only — not a global view.
- `src/main/core/conversations/getConversationsForProject.ts` — backend query exists and
  returns all conversations for a project, but is **never called from the renderer**.
- `Conversation` type already has `providerSessionId`, `resume`, `agentStatus`,
  `lastInteractedAt`, `providerId` — everything needed, just not surfaced.
- Resume flag exists in the data model (`conversation.resume = true` + `providerSessionId`)
  but there is **no resume button anywhere in the UI**.

**The gap:** no global "Sessions" tab, no cross-task view, no resume button, no filters.

### What It Does
- A "Sessions" view per project listing all past conversations across all tasks
- Each row: agent type, task name, first prompt/title, created at, last active, status badge
- One-click "Resume" button that opens the task and resumes the conversation
- Filter by agent type, task, date range, status (active / completed / error)

### Codebase Touchpoints

**Existing infrastructure:**
- `src/shared/core/conversations/conversations.ts` — `Conversation` type already has
  `providerSessionId`, `agentStatus`, `lastInteractedAt`, `providerId`, `resume` flag —
  everything needed for a session list row is already modeled
- `src/main/core/conversations/getConversationsForProject.ts` — already queries all
  conversations for a project; just needs to be surfaced in a new view
- `src/main/core/conversations/controller.ts` — add `getSessionsForProject(projectId, filters?)`
  or reuse the existing `getConversationsForProject` with a richer return type
- `src/main/core/conversations/conversation-session-supervisor.ts` — manages session
  lifecycle; the resume path runs through here
- `src/renderer/features/conversations/` — existing conversation UI to reference for
  patterns (how conversations are rendered inside a task view)
- `src/renderer/app/view-registry.ts` — register the new Sessions view here

**New code needed:**
1. `src/renderer/features/sessions/` — new renderer feature
   - `sessions-view.tsx` — top-level view (register in `view-registry.ts`)
   - `sessions-list.tsx` — table/list component with filters
   - `session-row.tsx` — single row with resume action
   - `stores/sessions-store.ts` — MobX store, calls `rpc.conversations.getSessionsForProject()`
2. Extend `src/shared/core/conversations/conversations.ts` with a `SessionSummary` type
   for the list view (denormalized: task name, project name, first prompt, etc.)
3. Add `getSessionsForProject` to `src/main/core/conversations/controller.ts` with
   join to tasks table to pull task name alongside each conversation

**Session Resume flow (already exists, just needs UI entry point):**
- Renderer sets `conversation.resume = true` and navigates to the task view
- `conversation-session-supervisor.ts` sees `resume: true` + `providerSessionId` and
  passes the resume flag/ID to the PTY agent spawn

### Implementation Order
1. Backend: add `getSessionsForProject` RPC method with task name join
2. `sessions-store.ts` MobX store
3. `sessions-view.tsx` + `sessions-list.tsx` UI
4. Register view in `view-registry.ts` and add to sidebar nav
5. Wire Resume button → navigate to task + trigger resume

### Complexity: Low–Medium
All the data is already in the DB and the resume mechanism exists. This is primarily
a UI + one new query.

---

## Feature 3: Multi-Repo Workspaces

### Problem
A "project" in Emdash maps 1:1 to a single git repo. Real-world work spans multiple
repos (frontend, backend, infra, shared libs). There's no way to run an agent with
context across all of them, or see a unified diff view.

### What It Does
- A **Workspace Group** is a named collection of 2–15 projects (repos)
- When you open a Workspace Group task, the agent gets access to all repos simultaneously
  (each in its own worktree, mounted in the same working environment)
- **Per-repo change panels** — each repo gets its own collapsible diff/status panel,
  shown side-by-side or stacked. Not one flattened list — you always know which repo
  a change belongs to. Think VS Code source control but actually usable: repo name
  clearly labelled, branch shown, stats (±lines) at a glance, expand to see files.
- Workspace-level terminals with all repo paths in the env
- Agents can create branches, commit, and push across repos in one session

**Change view design:**
- Sidebar or dedicated tab: "Changes" shows N repo panels, one card per repo
- Each card: repo name, current branch, `+X -Y` stat, list of changed files (collapsed by default)
- Click a file → opens diff viewer already present in the app
- "Commit all" or per-repo commit — each repo gets its own commit message (AI-assisted, see Feature 1)
- Status indicators: clean / dirty / ahead / behind / conflict — color-coded per repo card

### Codebase Touchpoints

**Existing infrastructure:**
- `src/main/core/projects/project-manager.ts` — singleton `ProjectManager`; a workspace
  would hold a set of `ProjectProvider` references from here
- `src/main/core/workspaces/workspace-bootstrap-service.ts` — handles worktree setup per
  repo; for multi-repo, call this N times (one per repo in the workspace group)
- `src/main/db/schema.ts` — add `workspaceGroups` and `workspaceGroupMembers` tables
- `src/shared/core/workspaces/workspace-config.ts` — extend `WorkspaceConfig` or add a
  parallel `MultiRepoWorkspaceConfig` type
- `src/main/core/tasks/task-service.ts` — `createTask()` calls
  `WorkspaceBootstrapService.ensureWorkspaceSetup()` once; for multi-repo, fan out across
  all member repos and collect results
- `src/renderer/features/projects/` — project list/creation UI to reference for the
  workspace group creation UI

**DB schema additions** (in `src/main/db/schema.ts`):
```typescript
// New tables
workspaceGroups: {
  id, name, description, createdAt, updatedAt
}
workspaceGroupMembers: {
  groupId, projectId, role: 'primary' | 'member', order
}
```

**New code needed:**
1. `src/main/core/workspace-groups/` — new domain
   - `workspace-group-service.ts` — CRUD for groups + members
   - `multi-repo-bootstrap-service.ts` — fans out workspace setup across member repos,
     returns `MultiRepoBootstrapResult { repos: WorkspaceBootstrapResult[] }`
   - `controller.ts` — RPC: `createGroup`, `getGroups`, `addMember`, `removeMember`,
     `createGroupTask`
2. Extend `src/shared/core/tasks/tasks.ts` — `Task` gets optional `workspaceGroupId`
3. `src/renderer/features/workspace-groups/` — UI for group management + group task view
4. Unified diff view: aggregate `rpc.git.getFullStatus()` calls across all member projects
   and render in a combined diff panel

**Agent context spanning repos:**
- Each repo gets its own worktree path on disk
- Pass all paths to the agent as `--add-dir` / context flags (provider-dependent)
- PTY env setup in `src/main/core/pty/` would need to set working directory + expose
  all repo paths to the agent

### Implementation Order
1. DB schema: `workspaceGroups` + `workspaceGroupMembers` tables + migration
2. `workspace-group-service.ts` + controller + RPC registration
3. UI: group creation modal + member management
4. `multi-repo-bootstrap-service.ts` — fan-out worktree setup
5. Unified diff view (aggregate existing git status RPCs)
6. Agent multi-repo context (provider-specific, tackle per provider)

### Complexity: High
The worktree fan-out and agent multi-context passing are the hard parts. Start with
group management + unified diff view (data layer), then tackle agent context.

---

## Feature 4: Auto Project Setup on Worktree Launch

### Problem
When a worktree opens, you still have to go to the terminal and manually run install,
start the dev server, etc. The `.emdash.json` `scripts.setup` / `scripts.run` hooks exist
but aren't automatically triggered with visible feedback.

### What It Does
- When a worktree is provisioned, automatically detect and run setup scripts
- Shows a setup progress panel in the UI (step-by-step: install deps → start server → ready)
- Dev server output is piped to a visible terminal panel, not silently swallowed
- On re-open of an existing worktree, detect if the dev server is already running
  (check PID/port) and skip re-launch
- "Open in terminal" shortcut that pre-`cd`s into the worktree directory with the
  env already loaded

### Codebase Touchpoints

**Existing infrastructure:**
- `src/main/core/workspaces/workspace-lifecycle-service.ts` — already has lifecycle hooks
  for setup/teardown; `scripts.setup` and `scripts.run` are already parsed from
  `.emdash.json`. This is the right place to trigger auto-run.
- `src/main/core/workspaces/workspace-bootstrap-service.ts` — `ensureWorkspaceSetup()`
  already runs bootstrap; it emits events we can hook
- `src/main/core/tasks/task-service.ts` — emits `task:workspace-ready` lifecycle hook;
  auto-setup should trigger here
- `src/main/core/pty/` — PTY spawning infrastructure already exists; use it to run
  setup scripts in a visible terminal panel
- `src/renderer/features/tasks/` — task view where the setup progress panel would live
- `src/shared/core/workspaces/workspace-setup-spec.ts` — `WorkspaceSetupSpec` already
  models the setup steps declaratively

**New code needed:**
1. `src/main/core/workspaces/auto-setup-service.ts` — listens for `task:workspace-ready`,
   checks if `scripts.setup` / `scripts.run` are defined in `.emdash.json`,
   spawns PTY sessions for each, emits progress events
2. `src/shared/core/workspaces/setup-progress.ts` — typed events:
   `SetupProgressEvent { taskId, step, status: 'pending'|'running'|'done'|'error', output? }`
3. `src/renderer/features/tasks/components/setup-progress-panel.tsx` — UI panel showing
   setup steps, subscribes to `setupProgressChannel` events
4. Settings: add `autoRunSetupScripts: boolean` (default `true`) to
   `src/main/core/settings/schema.ts`
5. Dev server PID tracking in `workspace-registry.ts` — store `{ pid, port }` for
   already-running servers so re-open skips re-launch

**"Open terminal here" UX:**
- `src/main/core/terminals/` already manages terminal sessions
- Add a `openTerminalInWorktree(workspaceId)` RPC method that spawns a terminal
  pre-`cd`'d to the worktree path with the workspace env loaded
- Surface as a button in the task header / workspace toolbar

### Implementation Order
1. Settings: `autoRunSetupScripts` toggle
2. `auto-setup-service.ts` — hook into `task:workspace-ready`, spawn setup PTY
3. `SetupProgressEvent` shared type + event channel
4. `setup-progress-panel.tsx` — subscribe to events, show step-by-step UI
5. Dev server PID tracking + skip-if-running logic
6. "Open terminal here" button + `openTerminalInWorktree` RPC

### Complexity: Medium
The PTY + event infrastructure is solid. Main work is the progress event pipeline
from main → renderer and the PID/port tracking for idempotent re-opens.

---

## Feature 5: Session-Scoped Change Tracking

### Problem
When an agent session ends you have no clean way to see "exactly what did this session
change" — the normal git diff view mixes all sessions together. There's no per-session
history of what each agent call actually produced.

### Core Design: Store the Diff in the App DB, Never Touch Git

**Do not use git tags, refs, or any git writes.** The approach is read-only against git:

- At session start: record the HEAD sha (read-only) + run `git diff HEAD` to snapshot
  any existing uncommitted working tree state — store both in the app's SQLite DB
  against the conversation row
- At session end (or on demand): run `git diff <start-sha>..HEAD` (commits made during
  session) + `git diff HEAD` (still-uncommitted changes) — combine into one diff string,
  store it in the DB as the "session snapshot"
- Show in a **"Session Changes" panel** that reads from the DB, completely separate from
  the normal git status/diff view
- On push: mark session records as `pushed: true`, hide from active view (or delete)

Zero git interference — no tags, no refs, no new commits. Just reading `git diff` output
(read-only) and saving the text to SQLite.

### Codebase Touchpoints

- `src/shared/core/conversations/conversation-config.ts` — versioned schema, add:
  ```typescript
  startSnapshotSha?: string;        // HEAD sha at session start (read from git, stored in DB)
  startWorkingTreeDiff?: string;    // git diff HEAD at session start (raw diff text)
  sessionDiffSnapshot?: string;     // full session diff captured at end
  parallelSessionWarning?: boolean; // flagged if another session was active on same worktree
  pushed?: boolean;                 // true once branch is pushed, hide from active view
  ```
- `src/main/core/conversations/conversation-session-supervisor.ts` — capture SHA +
  working tree diff before spawning agent; write session diff snapshot on session end
- `src/main/core/conversations/controller.ts` — add `getSessionDiff(conversationId)`,
  `captureSessionSnapshot(conversationId)`
- `src/renderer/features/sessions/` (Feature 2) — session browser rows show `+X -Y`
  from stored snapshot
- New component: `src/renderer/features/conversations/session-diff-panel.tsx` — renders
  stored diff, separate from the git diff viewer

### Cleanup on Push
- Hook into the existing push flow in `src/main/core/git/controller.ts`
- After a successful push, mark all conversations for that task/worktree as `pushed: true`
- Session diff records can be deleted or archived — they've served their purpose

---

### The Parallel Sessions Problem

**This is an open/unsolved design problem.** Notes from design discussion:

If two agent sessions (e.g. two Claude windows) are open on the **same worktree**
simultaneously, their changes interleave in the working tree with no clean boundary.
Git does not track "which session changed which line" for uncommitted work — it just
sees the file as it currently is. The diff-in-DB approach breaks down because both
sessions snapshot the same starting state and their working tree changes overlap.

**Three partial options identified (none fully satisfying):**

**Option A — Warn and merge**
Detect when a second session opens on the same worktree (check `conversation-session-supervisor.ts`
for active sessions on that `workspaceId`). Flag both sessions as `parallelSessionWarning: true`
in their config. Show their diffs combined with a note: "2 sessions were active simultaneously
— changes cannot be cleanly separated."

**Option B — Coarse-grained tracking only**
Don't attempt line-level diff attribution for parallel sessions. Instead track:
- Which files were modified while this session was active (file list from `git status`)
- Timestamps of file modifications vs session active window
- Session message history as the human-readable record of what was asked/done
The message history already tells you what the agent was doing — often more useful than
a raw diff anyway.

**Option C — Discourage parallel sessions on same worktree**
UI warning when opening a second agent session on a worktree that already has an active
session: "Session change tracking won't be accurate for parallel sessions." Not a hard
block — just a heads up.

**Likely implementation: Option B + C together.**
Track what's reliably attributable (file list, timestamps, message history), warn on
parallel, don't promise line-level attribution.

**⚠️ TODO: revisit this section** — better resolution ideas pending. Come back before
implementing.

### Complexity: Medium
The single-session path is straightforward — the schema, SHA capture, and diff storage
are all small pieces. The parallel session problem is the open design question.
Implement single-session first, ship it, then tackle parallel.

---

## Feature 6: LAN Server Mode — Access Emdash from Your Phone

### Problem
Emdash only runs as a desktop Electron app. If you want to do a quick task review,
check on a running agent, or kick off a task from your phone (on the same Wi-Fi),
you're stuck walking back to your desk. Tools like T3 Chat and some local Codex/Claude
wrappers already expose a local web UI on `192.168.x.x` for exactly this use case.

### What It Does
- A **LAN Server** toggle in Settings spins up a local HTTP server inside the Electron
  main process on a configurable port (default `7788`)
- The server serves a lightweight web UI (a subset of the renderer — task list, active
  agent status, conversation view, basic chat/prompt input)
- Accessible at `http://192.168.x.x:7788` from any device on the same network
- QR code shown in Settings to scan from your phone — one tap to open
- Read-heavy by default: view tasks, running agents, conversation history
- Optional write mode (toggle in Settings): send messages to a running agent, create
  tasks, trigger actions — basically a mobile companion UI
- PIN or token auth so only you can access it (not anyone on the network)

### What You Can Do From Your Phone
- See all projects and tasks
- Watch a running agent's conversation stream live (Server-Sent Events)
- Send a message to a running agent
- Create a new task with a prompt (if write mode is on)
- View diffs and file changes

### Codebase Touchpoints

**Existing infrastructure to leverage:**
- `src/main/index.ts` — main process entry point; this is where the HTTP server
  would be started alongside the Electron window
- `src/main/core/settings/schema.ts` — add `lanServer: { enabled, port, pin, writeMode }` settings
- `src/main/rpc.ts` — the existing RPC layer already has all the data access methods;
  the LAN server handlers can call the same controller methods directly (no IPC needed
  in the main process)
- `src/main/core/conversations/controller.ts` — existing `getConversations`, message
  streaming — already the right source for the mobile conversation view
- `src/main/core/tasks/task-service.ts` — existing task listing and creation
- Typed events system — existing event bus can be bridged to SSE for live streaming

**New code needed:**
1. `src/main/core/lan-server/` — new domain
   - `lan-server.ts` — creates and manages the HTTP server (Node `http` module or
     lightweight `express`/`fastify` — no new heavy deps preferred); handles routing,
     auth middleware, SSE endpoint for event streaming
   - `lan-server-controller.ts` — RPC methods: `getLanServerStatus()`,
     `startLanServer()`, `stopLanServer()`, `getLanServerUrl()` (resolves local IP)
   - `lan-ip-resolver.ts` — uses `os.networkInterfaces()` to find the primary LAN IP
     (prefer the non-loopback IPv4 address on the active interface)
2. `src/main/core/lan-server/routes/` — route handlers that call existing controllers
   - `tasks.ts`, `conversations.ts`, `stream.ts` (SSE), `actions.ts` (write endpoints)
3. `src/main/core/lan-server/web/` — the served mobile web UI
   - A separate small Vite build target (or a self-contained HTML bundle) — NOT the
     full Electron renderer. Keep it tiny: React or vanilla JS, mobile-first CSS,
     dark mode, no Electron-specific APIs.
   - Alternatively: build the mobile UI as a second renderer target in
     `electron.vite.config.ts` alongside the existing renderer
4. `src/renderer/features/settings/` — Settings UI: toggle, port field, PIN config,
   live status (running / stopped), QR code display (use a QR library like `qrcode`)
5. `src/shared/lan-server.ts` — shared types: `LanServerConfig`, `LanServerStatus`

**Auth approach:**
- On first enable, generate a random 6-digit PIN and store it in settings
- All routes check `?pin=XXXXXX` or `Authorization: Bearer <pin>` header
- The QR code encodes the full URL with PIN embedded so scanning auto-authenticates
- No TLS for now (LAN only); add a "this exposes your agent — use on trusted networks" warning

**Settings schema addition** (in `src/main/core/settings/schema.ts`):
```typescript
const lanServerSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  port: z.number().default(7788),
  pin: z.string().default(''),        // auto-generated on first enable
  writeMode: z.boolean().default(false),
  autoStartOnLaunch: z.boolean().default(false),
});
```

### Implementation Order
1. `lan-ip-resolver.ts` + `lan-server.ts` — basic HTTP server starts/stops, serves a
   placeholder page, resolves local IP
2. Settings schema + Settings UI (toggle, port, PIN, QR code)
3. REST API routes backed by existing controllers (tasks list, conversation list,
   conversation messages)
4. SSE streaming endpoint — bridge the existing typed event bus to an SSE stream for
   the active conversation
5. Mobile web UI — static HTML/JS served by the LAN server
6. Write mode endpoints (send message, create task) — gated by `writeMode` setting
7. `getLanServerStatus` RPC + status indicator in the desktop app title bar / tray

### Complexity: Medium
The HTTP server itself is trivial (Node built-ins). The interesting parts are:
- Resolving the correct LAN IP (multiple interfaces, Docker, VPN edge cases)
- The mobile web UI build pipeline (separate Vite target or self-contained bundle)
- SSE event bridging from the Electron event bus to HTTP clients
- Keeping the mobile UI genuinely useful without duplicating the full renderer

Start with the server + static page + task list API — that alone is useful as a
read-only status dashboard from your phone.

---

## Cross-Cutting Notes

### Model Selection (Feature 1 + others)
Any feature that calls an AI model should use a shared model selector component and
pull from the same settings key. Define `aiGenerationSettingsSchema` once in
`src/main/core/settings/schema.ts` and reuse it everywhere — don't create per-feature
model settings.

### New DB Migrations
All schema additions need:
1. Edit `src/main/db/schema.ts`
2. Run `pnpm run db:generate` (generates the Drizzle migration file)
3. Update `db:fixtures` test fixtures
4. Run `pnpm run test:migrations` to validate

Never hand-edit files under `drizzle/`.

### Merge Gate
Before any PR: `pnpm run format && pnpm run lint && pnpm run typecheck && pnpm run test`

---

## Feature 7: Multi-Account Switching — Use Multiple Claude / Codex Accounts Without Friction

### Problem
Developers often have two Claude subscriptions (personal + work email) or a Claude account
alongside a Codex/OpenAI account. Right now there's no way to register multiple accounts for
the same provider and switch between them per-project or on demand — you have to log out,
log back in, and reconfigure everything.

### What It Does
- Add multiple accounts per provider (e.g. `claude@personal.com` + `claude@work.com`)
- Each project can pin a default account; tasks inherit it automatically
- A quick-switch control in the sidebar or titlebar lets you change the active account
  for the current project in one click — no re-login required
- Account credentials are stored separately in Electron safe storage under a keyed slot
  per account; switching just flips which credential is passed to the PTY env
- Visual indicator (avatar initials or email chip) shows which account is active at a glance

### Codebase Touchpoints

**Existing infrastructure:**
- `src/main/core/account/` — existing account management; currently assumes one credential
  per provider — extend to support a list of named credentials per provider
- `src/main/core/pty/pty-env.ts` — PTY env passthrough allowlist; the active account's
  token/credential is injected here — needs to read from the selected account slot
- `src/renderer/lib/hooks/useGithubAccounts.ts` — pattern to follow for a
  `useProviderAccounts` hook that exposes the list + active selection
- `src/main/core/settings/schema.ts` — store the per-project default account id
- Electron safe storage — already used for secrets; extend with per-account keyed slots

**New code needed:**
1. `src/main/core/account/multi-account-service.ts` — CRUD for named credential slots
   per provider: `addAccount(provider, label, credential)`, `removeAccount(id)`,
   `listAccounts(provider)`, `setActiveAccount(projectId, accountId)`
2. `src/main/core/account/controller.ts` — new or extended RPC:
   `listProviderAccounts(provider)`, `addProviderAccount(...)`, `removeProviderAccount(id)`,
   `setProjectDefaultAccount(projectId, accountId)`
3. `src/shared/accounts.ts` — `ProviderAccount` type:
   `{ id, provider, label, email?, createdAt }` (no credential in shared type — stays main-side)
4. Settings: per-project "Default account" dropdown in project settings UI
5. `src/renderer/features/account-switcher/` — quick-switch UI component
   - `AccountSwitcherDropdown.tsx` — lists accounts for the current project's provider,
     highlights active, one-click to switch
   - Render in the sidebar footer or titlebar next to the project name
6. PTY env update: when active account changes, re-read the credential from its safe-storage
   slot and pass the correct token into the next spawned PTY session

### Implementation Order
1. `multi-account-service.ts` — credential slot CRUD + safe storage keying
2. RPC methods + register in `rpc.ts`
3. Settings UI — add/remove accounts per provider in Settings → Accounts
4. Per-project default account picker in project settings
5. `AccountSwitcherDropdown` component in sidebar/titlebar
6. PTY env wiring — active account credential passed on session spawn

### Complexity: Low–Medium
Credential storage and PTY env injection already exist. Main work is the per-account
key scheme in safe storage and the switcher UI. No re-login flow needed — credentials
are stored once and selected by key.

---

## Priority Order

| # | Feature | Complexity | Value | Start With |
|---|---------|-----------|-------|-----------|
| 2 | Session Browser | Low–Med | High | ~~CLOSED~~ |
| 5 | Session Change Tracking | Low–Med | High | Versioned schema + SHA capture |
| 4 | Auto Setup | Medium | High | Settings + event hook |
| 1 | AI Commit/PR Msg | Medium | High | Settings schema + service |
| 6 | LAN Server / Mobile Access | Medium | High | HTTP server + IP resolver |
| 7 | Multi-Account Switching | Low–Med | High | multi-account-service + safe storage slots |
| 3 | Multi-Repo Workspaces | High | Very High | DB schema + group CRUD |
