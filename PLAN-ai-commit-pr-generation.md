# Plan: AI-Assisted Commit / PR Message Generation

**Feature:** Feature 1 from `IDEAS.md`  
**Status:** Planning complete — ready to implement  
**Complexity:** Medium  
**Files to touch:** 11

---

## Problem

Writing commit messages and PR descriptions is manual and tedious. The diff is already
available in the app. The user already has one or more agent CLIs installed and
authenticated. We should generate high-quality messages from the diff using whatever
agent is available — zero extra setup.

---

## Core Architecture Decision: Use Any Installed Agent CLI

**Do NOT call any model API directly. Do NOT require any API key.**

Every agent CLI the app already orchestrates (claude, codex, opencode, gemini, etc.)
has some form of non-interactive / one-shot mode. We invoke the CLI via `execFileAsync`,
capture stdout, done. The CLI handles its own auth.

```
<agent-cli> <print-flags> [--model <model-id>] "<prompt + diff>"
```

This means:
- Zero extra auth setup — CLI already authenticated
- Works with whatever agent the user has installed
- Consistent with how the rest of the app works
- Graceful fallback if the preferred agent is unavailable

---

## Agent Generation Registry

Not all 31 agents support non-interactive print mode cleanly. We maintain an internal
registry of **agents known to support one-shot generation**. Skip agents using
`useKeystrokeInjection` or `initialPromptViaStdinPipe` — they're TUI-only.

Defined in `generation-service.ts`:

```typescript
type AgentGenerationConfig = {
  // Build CLI args array from prompt + model
  buildArgs: (prompt: string, model: string) => string[];
  // Known models for this agent, cheapest first
  models: AgentModelOption[];
};

type AgentModelOption = {
  id: string;       // passed to --model flag
  label: string;    // shown in UI dropdown
  isDefault: boolean;
};
```

### Supported Agents & Their Models

| Agent ID | CLI | One-shot invocation | Default model (cheapest) |
|----------|-----|---------------------|--------------------------|
| `claude` | `claude` | `claude --print --model <m> "<prompt>"` | `claude-haiku-4-5-20251001` |
| `opencode` | `opencode` | `opencode run --print --model <m> "<prompt>"` | `gpt-4o-mini` (depends on provider config) |
| `gemini` | `gemini` | `gemini --non-interactive -i "<prompt>" --model <m>` | `gemini-2.0-flash` |
| `codex` | `codex` | `codex -q --model <m> "<prompt>"` | `gpt-4o-mini` |
| `copilot` | `copilot` | `copilot -i "<prompt>"` | *(uses copilot default)* |
| `goose` | `goose` | `goose run -t "<prompt>"` | *(uses goose default)* |
| `junie` | `junie` | `junie --task "<prompt>" --headless` | *(uses junie default)* |
| `autohand` | `autohand` | `autohand -p "<prompt>" --headless` | *(uses autohand default)* |
| `qwen` | `qwen` | `qwen -i "<prompt>" --yolo` | `qwen-plus` |
| `kilo` | `kilo` | `kilo "<prompt>" --yolo` | *(uses kilo default)* |

**Model lists per agent (full):**

```
claude:   claude-haiku-4-5-20251001 (default) · claude-sonnet-4-6 · claude-opus-4-8
codex:    gpt-4o-mini (default) · gpt-4o · o4-mini · o3
opencode: gpt-4o-mini (default) · gpt-4o · claude-sonnet-4-6 · gemini-2.0-flash
gemini:   gemini-2.0-flash (default) · gemini-2.5-flash · gemini-2.5-pro
qwen:     qwen-plus (default) · qwen-max · qwen-turbo
```

For agents without known model flag support (copilot, goose, junie, autohand, kilo),
the model picker is hidden — those agents use their own internal model config.

---

## Agent Selection Logic

Priority at generation time:

```
1. Use aiGeneration.agentId if set (user override in settings)
2. Else use appSettings.defaultAgent if it's in the supported list
3. Else fall back through supported list in priority order:
   claude → opencode → gemini → codex → copilot → goose → ...
4. None available → err({ type: 'no_supported_agent' })
```

At each step: check `localDependencyManager.getState(agentId)?.status === 'available'`.

---

## Settings Schema

### `src/main/core/settings/schema.ts` — add:

```typescript
export const aiGenerationSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  // 'auto' = use defaultAgent or fallback; or a specific agent id
  agentId: z.string().default('auto'),
  // model id string — interpreted per agent; 'auto' = cheapest for that agent
  commitModel: z.string().default('auto'),
  prModel: z.string().default('auto'),
});
```

### `src/main/core/settings/settings-registry.ts` — add defaults:

```typescript
aiGeneration: {
  enabled: true,
  agentId: 'auto',
  commitModel: 'auto',
  prModel: 'auto',
},
```

Add `aiGeneration: aiGenerationSettingsSchema` to `APP_SETTINGS_SCHEMA_MAP` and
`appSettingsSchema`.

---

## Implementation Plan

### Step 1 — Shared types: `src/shared/ai-generation.ts` (NEW)

```typescript
export type GenerationError =
  | { type: 'no_supported_agent' }
  | { type: 'cli_not_found'; agentId: string }
  | { type: 'cli_error'; agentId: string; message: string }
  | { type: 'no_diff' }
  | { type: 'timeout'; agentId: string };

export type GenerationResult = {
  title: string;
  body?: string;
};

export type AgentModelOption = {
  id: string;
  label: string;
  isDefault: boolean;
};

export type SupportedGenerationAgent = {
  agentId: string;
  name: string;
  models: AgentModelOption[];
  supportsModelFlag: boolean;
};
```

---

### Step 2 — Settings schema (as above)

`schema.ts` + `settings-registry.ts` — adds `aiGeneration` key.

---

### Step 3 — Main-process domain: `src/main/core/ai-generation/`

#### `generation-registry.ts` (NEW)

Defines the supported agents table and `buildArgs` per agent. Single source of truth.
Exports:
- `GENERATION_REGISTRY: Record<string, AgentGenerationConfig>`
- `SUPPORTED_AGENT_IDS: string[]` — ordered priority list
- `getModelsForAgent(agentId): AgentModelOption[]`
- `resolveDefaultModel(agentId): string`

#### `generation-service.ts` (NEW)

```
Responsibilities:
- resolveAgent(settings) → finds first available supported agent
- invoke(agentId, prompt, model) → execFileAsync with timeout 30s, maxBuffer 500KB
- parseOutput(stdout) → first line = title, rest = body
- truncateDiff(diff, maxChars=8000) → avoids context limit issues
- Returns Result<GenerationResult, GenerationError>

CLI path: prefer providerCustomConfig[agentId].cli → fall back to AGENT_PROVIDERS[id].cli
```

**Prompt templates:**

Commit message:
```
Generate a git commit message for this diff.
Output ONLY the commit message. No explanation. No markdown. No preamble.

Format:
- Line 1: short imperative summary, max 72 chars, Conventional Commits style
  (feat/fix/refactor/chore/docs/test/style/perf + optional scope)
- Blank line
- Optional extended description (wrap at 72 chars)

Examples:
  feat(auth): add OAuth2 login flow
  fix(git): handle empty staged changes on push

Staged diff:
---
<diff>
```

PR description:
```
Generate a GitHub pull request title and description for this branch.
Output ONLY the PR content. No explanation. No preamble.

Format:
Line 1: PR title (imperative, max 72 chars)
[blank line]
## Summary
[2-4 bullet points: what changed and why]

## Notes
[optional: breaking changes, migration steps, known issues]

Branch: <branchName>
Diff:
---
<diff>
```

#### `controller.ts` (NEW)

```typescript
export const aiGenerationController = createRPCController({
  generateCommitMessage: async (projectId: string, workspaceId: string) => {
    const settings = appSettingsService.get().aiGeneration;
    if (!settings.enabled) return err({ type: 'disabled' as const });
    const env = resolveWorkspace(projectId, workspaceId);
    if (!env) return err({ type: 'not_found' as const });
    const staged = await env.git.getStagedChanges();
    const diff = staged.length > 0 ? staged : await env.git.getFullStatus();
    // serialize diff to text, truncate
    return generationService.generateCommitMessage(diff, settings);
  },

  generatePrDescription: async (
    projectId: string,
    workspaceId: string,
    branchName: string
  ) => {
    const settings = appSettingsService.get().aiGeneration;
    if (!settings.enabled) return err({ type: 'disabled' as const });
    const env = resolveWorkspace(projectId, workspaceId);
    if (!env) return err({ type: 'not_found' as const });
    const status = await env.git.getFullStatus();
    return generationService.generatePrDescription(status, branchName, settings);
  },

  // Used by settings UI to list available agents + their models
  getAvailableGenerationAgents: async () => {
    const available = await generationService.getAvailableAgents();
    return ok(available); // SupportedGenerationAgent[]
  },
});
```

---

### Step 4 — Register in `src/main/rpc.ts`

```typescript
import { aiGenerationController } from './core/ai-generation/controller';

aiGeneration: aiGenerationController,
```

---

### Step 5 — Renderer: Generate button in commit card

**File:** `src/renderer/features/tasks/diff-view/changes-panel/components/commit-card.tsx`

**Changes:**

1. Add `isGenerating: boolean` state
2. Read settings via `useAppSettingsKey('aiGeneration')`
3. `doGenerate()`:
   - `setIsGenerating(true)`
   - `rpc.aiGeneration.generateCommitMessage(projectId, workspaceId)`
   - success → `setCommitMessage(result.title)`, `setDescription(result.body ?? '')`
   - error → inline error message (auto-dismiss 4s)
   - `setIsGenerating(false)`
4. Sparkles button inline with Input, right-aligned:
   - Renders only when `aiGeneration.enabled`
   - Shows `Loader2` when `isGenerating`
   - Disabled during `isInFlight || isGenerating`
   - Tooltip: "Generate commit message with AI"

**UI layout:**

```
┌─ mx-2 mb-2 rounded-xl border bg-background-1 p-2 ─────────────┐
│                                                                   │
│  ┌─ flex gap-1 ──────────────────────────────────────────────┐   │
│  │  [Input: Commit message...                           ]     │   │
│  │  [✨]  ← ghost button sm, Sparkles icon, tooltip          │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                   │
│  [Textarea: Description...                                    ]   │
│                                                                   │
│  {error line, text-destructive text-xs, if any}                   │
│                                                                   │
│                    [   Commit ▼   ]                               │
└───────────────────────────────────────────────────────────────────┘
```

---

### Step 6 — Renderer: Generate button in PR modal

**File:** `src/renderer/features/tasks/diff-view/changes-panel/components/pr-entry/create-pr-modal.tsx`

**Changes:**

1. Add `isGenerating` state
2. Read settings
3. `doGenerate()`:
   - `setIsGenerating(true)`
   - `rpc.aiGeneration.generatePrDescription(projectId, workspaceId, branchName)`
   - success → `setTitle(result.title)`, `setDescription(result.body ?? '')`
   - error → `setError(mappedMessage)`
   - `setIsGenerating(false)`
4. Button in DialogHeader right slot:
   - `<Sparkles className="size-3.5" />` + "Generate" text
   - Ghost variant, sm size
   - Only renders when `aiGeneration.enabled`

**UI layout:**

```
┌─ DialogHeader ──────────────────────── [✨ Generate] ─┐
│  Create Pull Request                                    │
├─────────────────────────────────────────────────────────┤
│  Title                                                   │
│  [branch-name                                      ]     │
│                                                          │
│  Description                                             │
│  [                                                 ]     │
│  [                                                 ]     │
│                                                          │
│  Base branch                 Target remote               │
│  [   main ▼   ]              [   origin ▼   ]            │
├─────────────────────────────────────────────────────────┤
│                        [Cancel]  [Create PR ▼]           │
└─────────────────────────────────────────────────────────┘
```

---

### Step 7 — Settings UI: `AiGenerationSettingsCard.tsx` (NEW)

**File:** `src/renderer/features/settings/components/AiGenerationSettingsCard.tsx`

Uses `SettingRow` pattern. Calls `rpc.aiGeneration.getAvailableGenerationAgents()` on
mount to know what's installed and which models are available.

**Rows:**

```
┌─ AI Message Generation ───────────────────────────────────────┐
│                                                                 │
│  Enable AI generation                          [ ● Toggle ]    │
│  Adds Generate buttons to the commit and PR creation flows.    │
│                                                                 │
│  Agent                                  [ Auto-detect  ▼ ]    │
│  Which agent CLI to use for generation.                        │
│  Options: Auto-detect · Claude Code · Codex · Gemini · ...    │
│  (only installed agents shown)                                 │
│                                                                 │
│  Commit message model               [ Haiku (cheapest) ▼ ]    │
│  (hidden when agent doesn't support --model flag)              │
│                                                                 │
│  PR description model               [ Haiku (cheapest) ▼ ]    │
│  (hidden when agent doesn't support --model flag)              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Model dropdown items (example for Claude):**

```
● Haiku 4.5  — fastest, cheapest  (default)
  Sonnet 4.6 — balanced
  Opus 4.8   — highest quality
```

**Agent dropdown:** populated from `getAvailableGenerationAgents()` response.
- First option always: "Auto-detect" (`agentId = 'auto'`)
- Then one entry per available supported agent
- Unavailable agents not shown

Add card to `SettingsPage.tsx` under `clis-models` tab, after `DefaultAgentSettingsCard`.

---

## File Map

| File | Status | Change |
|------|--------|--------|
| `src/shared/ai-generation.ts` | **New** | Shared types |
| `src/main/core/settings/schema.ts` | **Edit** | Add `aiGenerationSettingsSchema` |
| `src/main/core/settings/settings-registry.ts` | **Edit** | Add `aiGeneration` defaults |
| `src/main/core/ai-generation/generation-registry.ts` | **New** | Per-agent invocation configs + model lists |
| `src/main/core/ai-generation/generation-service.ts` | **New** | Agent resolution, CLI invocation, output parsing |
| `src/main/core/ai-generation/controller.ts` | **New** | RPC: `generateCommitMessage`, `generatePrDescription`, `getAvailableGenerationAgents` |
| `src/main/rpc.ts` | **Edit** | Register `aiGeneration` controller |
| `src/renderer/features/tasks/.../commit-card.tsx` | **Edit** | Add Generate button + generating state |
| `src/renderer/features/tasks/.../create-pr-modal.tsx` | **Edit** | Add Generate button in DialogHeader |
| `src/renderer/features/settings/components/AiGenerationSettingsCard.tsx` | **New** | Settings: toggle, agent picker, model pickers |
| `src/renderer/features/settings/components/SettingsPage.tsx` | **Edit** | Add card to Agents tab |

---

## Implementation Order

1. `src/shared/ai-generation.ts` — shared types first
2. Settings schema + registry — unblocks settings read/write everywhere
3. `generation-registry.ts` — agent configs + model lists
4. `generation-service.ts` — core logic, isolated, testable
5. `controller.ts` + `rpc.ts` — expose to renderer
6. `commit-card.tsx` — highest value UI entry point
7. `create-pr-modal.tsx` — second UI entry point
8. `AiGenerationSettingsCard.tsx` + `SettingsPage.tsx` — settings UI last

---

## Default Models (cheapest per agent)

| Agent | Default model | Why it's cheapest |
|-------|---------------|-------------------|
| `claude` | `claude-haiku-4-5-20251001` | Fastest, lowest cost Anthropic model |
| `codex` | `gpt-4o-mini` | Cheapest capable OpenAI model |
| `opencode` | `gpt-4o-mini` | Same — opencode defaults to OpenAI |
| `gemini` | `gemini-2.0-flash` | Fast, low-cost Google model |
| `qwen` | `qwen-plus` | Mid-tier Qwen, good for short tasks |
| others | *(agent default)* | No `--model` flag support |

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No supported agent installed | Button tooltip: "No supported agent installed" — button disabled |
| Selected agent not found | Falls back to next available agent automatically |
| CLI times out (>30s) | Inline error: "Timed out — try a smaller diff" |
| No staged/unstaged diff | Inline error: "Nothing to generate from — stage some changes first" |
| CLI exits non-zero | Inline error: "Generation failed — is [agent] authenticated?" |
| `enabled = false` | Generate button not rendered |
| `agentId = 'auto'` and nothing available | Same as "no supported agent" |

---

## Constraints & Non-Goals

- **No new npm dependencies** — `execFileAsync` from `node:child_process`
- **No direct API calls** — CLIs handle their own auth
- **No streaming** — await the full response, then set state
- **No auto-generation** — user explicitly clicks Generate
- **Diff cap at 8000 chars** — prevent accidental huge prompts
- **TUI-only agents skipped** — those using `useKeystrokeInjection` or
  `initialPromptViaStdinPipe` are not in the generation registry
- **Model picker scope** — only agents where `--model` flag is known supported;
  otherwise model managed by agent itself
- **No new modal** — inline loading state in existing components
