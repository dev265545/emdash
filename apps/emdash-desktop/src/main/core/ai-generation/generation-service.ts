import { execFile } from 'node:child_process';
import { getDependencyManager } from '@main/core/dependencies/dependency-manager';
import { buildExternalToolEnv } from '@main/utils/childProcessEnv';
import type {
  GenerationError,
  GenerationResult,
  SupportedGenerationAgent,
} from '@shared/ai-generation';
import type { AiGenerationSettings } from '@shared/core/app-settings';
import { err, ok } from '@shared/lib/result';
import {
  SUPPORTED_AGENT_IDS,
  buildSupportedAgentInfo,
  getAgentConfig,
  resolveDefaultModel,
} from './generation-registry';

const GENERATION_TIMEOUT_MS = 30_000;
const MAX_DIFF_CHARS = 8_000;
const MAX_OUTPUT_BYTES = 512 * 1024;

export const COMMIT_PROMPT_TEMPLATE = `Generate a git commit message for this diff.
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
`;

export const PR_PROMPT_TEMPLATE = `Generate a GitHub pull request title and description for this branch.
Output ONLY the PR content. No explanation. No preamble.

Format:
Line 1: PR title (imperative, max 72 chars)
[blank line]
## Summary
[2-4 bullet points: what changed and why]

## Notes
[optional: breaking changes, migration steps, known issues]

Branch: `;

function truncateDiff(diff: string): string {
  if (diff.length <= MAX_DIFF_CHARS) return diff;
  return diff.slice(0, MAX_DIFF_CHARS) + '\n... (diff truncated)';
}

function parseOutput(stdout: string): GenerationResult {
  const lines = stdout.trim().split('\n');
  const title = lines[0]?.trim() ?? '';
  const body = lines.slice(1).join('\n').trim() || undefined;
  return { title, body };
}

async function resolveAgentId(settings: AiGenerationSettings): Promise<string | null> {
  const mgr = await getDependencyManager();

  const preferredId = settings.agentId !== 'auto' ? settings.agentId : null;
  const candidates = preferredId
    ? [preferredId, ...SUPPORTED_AGENT_IDS.filter((id) => id !== preferredId)]
    : SUPPORTED_AGENT_IDS;

  for (const agentId of candidates) {
    if (!getAgentConfig(agentId)) continue;
    const state = mgr.get(agentId as Parameters<typeof mgr.get>[0]);
    if (state?.status === 'available' && state.path) return agentId;
  }

  return null;
}

async function resolveCliPath(agentId: string): Promise<string | null> {
  const mgr = await getDependencyManager();
  const state = mgr.get(agentId as Parameters<typeof mgr.get>[0]);
  return state?.path ?? null;
}

function invokeCli(cliPath: string, args: string[]): Promise<{ stdout: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    execFile(
      cliPath,
      args,
      {
        maxBuffer: MAX_OUTPUT_BYTES,
        timeout: GENERATION_TIMEOUT_MS,
        env: buildExternalToolEnv(),
      },
      (error, stdout, _stderr) => {
        if (error) {
          if ((error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
            reject(Object.assign(error, { isTimeout: true }));
          } else {
            reject(error);
          }
          return;
        }
        resolve({ stdout: stdout ?? '', exitCode: 0 });
      }
    );
  });
}

export async function generateCommitMessage(
  diffText: string,
  settings: AiGenerationSettings
): Promise<{ success: true; data: GenerationResult } | { success: false; error: GenerationError }> {
  if (!diffText.trim()) return err({ type: 'no_diff' });

  const agentId = await resolveAgentId(settings);
  if (!agentId) return err({ type: 'no_supported_agent' });

  const cfg = getAgentConfig(agentId);
  if (!cfg) return err({ type: 'no_supported_agent' });

  const cliPath = await resolveCliPath(agentId);
  if (!cliPath) return err({ type: 'cli_not_found', agentId });

  const model =
    settings.commitModel !== 'auto' ? settings.commitModel : resolveDefaultModel(agentId);
  const prompt = COMMIT_PROMPT_TEMPLATE + truncateDiff(diffText);
  const args = cfg.buildArgs(prompt, model);

  try {
    const { stdout } = await invokeCli(cliPath, args);
    return ok(parseOutput(stdout));
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'isTimeout' in e) {
      return err({ type: 'timeout', agentId });
    }
    const message = e instanceof Error ? e.message : String(e);
    return err({ type: 'cli_error', agentId, message });
  }
}

export async function generatePrDescription(
  diffText: string,
  branchName: string,
  settings: AiGenerationSettings
): Promise<{ success: true; data: GenerationResult } | { success: false; error: GenerationError }> {
  if (!diffText.trim()) return err({ type: 'no_diff' });

  const agentId = await resolveAgentId(settings);
  if (!agentId) return err({ type: 'no_supported_agent' });

  const cfg = getAgentConfig(agentId);
  if (!cfg) return err({ type: 'no_supported_agent' });

  const cliPath = await resolveCliPath(agentId);
  if (!cliPath) return err({ type: 'cli_not_found', agentId });

  const model = settings.prModel !== 'auto' ? settings.prModel : resolveDefaultModel(agentId);
  const prompt = `${PR_PROMPT_TEMPLATE}${branchName}\nDiff:\n---\n${truncateDiff(diffText)}`;
  const args = cfg.buildArgs(prompt, model);

  try {
    const { stdout } = await invokeCli(cliPath, args);
    return ok(parseOutput(stdout));
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'isTimeout' in e) {
      return err({ type: 'timeout', agentId });
    }
    const message = e instanceof Error ? e.message : String(e);
    return err({ type: 'cli_error', agentId, message });
  }
}

export async function getAvailableAgents(): Promise<SupportedGenerationAgent[]> {
  const mgr = await getDependencyManager();
  const available: SupportedGenerationAgent[] = [];

  for (const agentId of SUPPORTED_AGENT_IDS) {
    const state = mgr.get(agentId as Parameters<typeof mgr.get>[0]);
    if (state?.status !== 'available') continue;
    const info = buildSupportedAgentInfo(agentId);
    if (info) available.push(info);
  }

  return available;
}
