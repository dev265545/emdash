import { execFile } from 'node:child_process';
import { resolveWorkspace } from '@main/core/projects/utils';
import { appSettingsService } from '@main/core/settings/settings-service';
import { buildExternalToolEnv } from '@main/utils/childProcessEnv';
import { createRPCController } from '@shared/lib/ipc/rpc';
import { err, ok } from '@shared/lib/result';
import {
  generateCommitMessage,
  generatePrDescription,
  getAvailableAgents,
} from './generation-service';

const GIT_DIFF_TIMEOUT_MS = 15_000;
const GIT_DIFF_MAX_BUFFER = 8 * 1024 * 1024;

function runGitDiff(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['diff', '--no-color', ...args],
      {
        cwd,
        maxBuffer: GIT_DIFF_MAX_BUFFER,
        timeout: GIT_DIFF_TIMEOUT_MS,
        env: buildExternalToolEnv(),
      },
      (error, stdout) => {
        if (error) return reject(error);
        resolve(stdout ?? '');
      }
    );
  });
}

async function resolveDiff(workspacePath: string): Promise<string> {
  const staged = await runGitDiff(workspacePath, ['--cached']).catch(() => '');
  if (staged.trim()) return staged;
  const unstaged = await runGitDiff(workspacePath, ['HEAD']).catch(() => '');
  return unstaged;
}

export const aiGenerationController = createRPCController({
  generateCommitMessage: async (projectId: string, workspaceId: string) => {
    const settings = await appSettingsService.get('aiGeneration');
    if (!settings.enabled) return err({ type: 'disabled' as const });

    const workspace = resolveWorkspace(projectId, workspaceId);
    if (!workspace) return err({ type: 'not_found' as const });

    const diff = await resolveDiff(workspace.path).catch(() => '');
    return generateCommitMessage(diff, settings);
  },

  generatePrDescription: async (projectId: string, workspaceId: string, branchName: string) => {
    const settings = await appSettingsService.get('aiGeneration');
    if (!settings.enabled) return err({ type: 'disabled' as const });

    const workspace = resolveWorkspace(projectId, workspaceId);
    if (!workspace) return err({ type: 'not_found' as const });

    const diff = await resolveDiff(workspace.path).catch(() => '');
    return generatePrDescription(diff, branchName, settings);
  },

  getAvailableGenerationAgents: async () => {
    const agents = await getAvailableAgents();
    return ok(agents);
  },
});
