import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AiGenerationSettings } from '@shared/core/app-settings';
import { COMMIT_PROMPT_TEMPLATE, PR_PROMPT_TEMPLATE } from './generation-service';

// Mock external dependencies
vi.mock('@main/utils/childProcessEnv', () => ({
  buildExternalToolEnv: () => ({}),
}));

vi.mock('@main/core/dependencies/dependency-manager', () => ({
  getDependencyManager: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

const { getDependencyManager } = await import('@main/core/dependencies/dependency-manager');
const childProcess = await import('node:child_process');

const { generateCommitMessage, generatePrDescription, getAvailableAgents } =
  await import('./generation-service');

function makeSettings(overrides: Partial<AiGenerationSettings> = {}): AiGenerationSettings {
  return {
    enabled: true,
    agentId: 'auto',
    commitModel: 'auto',
    prModel: 'auto',
    ...overrides,
  };
}

function mockManager(states: Record<string, { status: string; path?: string }>) {
  vi.mocked(getDependencyManager).mockResolvedValue({
    get: (id: string) => {
      const s = states[id];
      return s ? { id, status: s.status, path: s.path ?? null } : undefined;
    },
  } as ReturnType<typeof getDependencyManager> extends Promise<infer T> ? T : never);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockExecFile(stdout: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(childProcess.execFile as any).mockImplementation(
    (_file: unknown, _args: unknown, _opts: unknown, cb: (err: null, stdout: string) => void) => {
      cb(null, stdout);
    }
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockExecFileError(error: Error & { isTimeout?: boolean }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(childProcess.execFile as any).mockImplementation(
    (_file: unknown, _args: unknown, _opts: unknown, cb: (err: Error) => void) => {
      cb(error);
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generateCommitMessage', () => {
  it('returns no_diff when diff is empty', async () => {
    const result = await generateCommitMessage('', makeSettings());
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe('no_diff');
  });

  it('returns no_diff when diff is whitespace only', async () => {
    const result = await generateCommitMessage('   \n  ', makeSettings());
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe('no_diff');
  });

  it('returns no_supported_agent when no agents available', async () => {
    mockManager({});
    const result = await generateCommitMessage('diff content', makeSettings());
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe('no_supported_agent');
  });

  it('returns no_supported_agent when agents exist but none in registry', async () => {
    mockManager({ someUnknown: { status: 'available', path: '/usr/bin/unknown' } });
    const result = await generateCommitMessage('diff content', makeSettings());
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe('no_supported_agent');
  });

  it('generates successfully with claude agent', async () => {
    mockManager({ claude: { status: 'available', path: '/usr/bin/claude' } });
    mockExecFile('feat(auth): add login flow\n\nExtended description here.');

    const result = await generateCommitMessage('diff -u file.ts', makeSettings());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('feat(auth): add login flow');
      expect(result.data.body).toBe('Extended description here.');
    }
  });

  it('uses title-only when no body', async () => {
    mockManager({ claude: { status: 'available', path: '/usr/bin/claude' } });
    mockExecFile('fix(ui): correct button alignment');

    const result = await generateCommitMessage('diff content', makeSettings());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('fix(ui): correct button alignment');
      expect(result.data.body).toBeUndefined();
    }
  });

  it('falls back to next agent when preferred not available', async () => {
    mockManager({
      claude: { status: 'missing' },
      codex: { status: 'available', path: '/usr/bin/codex' },
    });
    mockExecFile('chore: update dependencies');

    const result = await generateCommitMessage('diff content', makeSettings());
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.title).toBe('chore: update dependencies');
  });

  it('uses specified agent when agentId is set', async () => {
    mockManager({
      claude: { status: 'available', path: '/usr/bin/claude' },
      codex: { status: 'available', path: '/usr/bin/codex' },
    });
    mockExecFile('feat: from codex');

    const result = await generateCommitMessage('diff content', makeSettings({ agentId: 'codex' }));
    expect(result.success).toBe(true);
    const execFileMock = vi.mocked(childProcess.execFile);
    const callArgs = execFileMock.mock.calls[0];
    expect(callArgs?.[0]).toBe('/usr/bin/codex');
  });

  it('returns timeout error on CLI timeout', async () => {
    mockManager({ claude: { status: 'available', path: '/usr/bin/claude' } });
    const timeoutErr = Object.assign(new Error('ETIMEDOUT'), { isTimeout: true });
    mockExecFileError(timeoutErr);

    const result = await generateCommitMessage('diff content', makeSettings());
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe('timeout');
  });

  it('returns cli_error on non-timeout failure', async () => {
    mockManager({ claude: { status: 'available', path: '/usr/bin/claude' } });
    mockExecFileError(new Error('Authentication failed'));

    const result = await generateCommitMessage('diff content', makeSettings());
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('cli_error');
      if (result.error.type === 'cli_error') {
        expect(result.error.message).toContain('Authentication failed');
      }
    }
  });

  it('truncates large diffs to 8000 chars', async () => {
    mockManager({ claude: { status: 'available', path: '/usr/bin/claude' } });
    mockExecFile('feat: big change');

    const largeDiff = 'x'.repeat(10_000);
    await generateCommitMessage(largeDiff, makeSettings());

    const execFileMock = vi.mocked(childProcess.execFile);
    const promptArg = execFileMock.mock.calls[0]?.[1]?.at(-1) as string;
    expect(promptArg.length).toBeLessThan(largeDiff.length + COMMIT_PROMPT_TEMPLATE.length);
    expect(promptArg).toContain('(diff truncated)');
  });
});

describe('generatePrDescription', () => {
  it('returns no_diff when diff is empty', async () => {
    const result = await generatePrDescription('', 'my-branch', makeSettings());
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe('no_diff');
  });

  it('generates PR title and body', async () => {
    mockManager({ claude: { status: 'available', path: '/usr/bin/claude' } });
    mockExecFile('feat: add new feature\n\n## Summary\n- Added thing\n\n## Notes\nNone');

    const result = await generatePrDescription('diff content', 'feat/my-feature', makeSettings());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('feat: add new feature');
      expect(result.data.body).toContain('## Summary');
    }
  });

  it('includes branch name in prompt', async () => {
    mockManager({ claude: { status: 'available', path: '/usr/bin/claude' } });
    mockExecFile('feat: branch thing');

    await generatePrDescription('diff', 'my-special-branch', makeSettings());

    const execFileMock = vi.mocked(childProcess.execFile);
    const promptArg = execFileMock.mock.calls[0]?.[1]?.at(-1) as string;
    expect(promptArg).toContain('my-special-branch');
  });

  it('uses custom pr model when specified', async () => {
    mockManager({ claude: { status: 'available', path: '/usr/bin/claude' } });
    mockExecFile('feat: custom model');

    await generatePrDescription('diff', 'branch', makeSettings({ prModel: 'claude-opus-4-8' }));

    const execFileMock = vi.mocked(childProcess.execFile);
    const args = execFileMock.mock.calls[0]?.[1] as string[];
    expect(args).toContain('claude-opus-4-8');
  });
});

describe('getAvailableAgents', () => {
  it('returns empty when no agents available', async () => {
    mockManager({});
    const agents = await getAvailableAgents();
    expect(agents).toHaveLength(0);
  });

  it('returns only supported registered agents', async () => {
    mockManager({
      claude: { status: 'available', path: '/usr/bin/claude' },
      codex: { status: 'available', path: '/usr/bin/codex' },
      unknownAgent: { status: 'available', path: '/usr/bin/unknown' },
    });

    const agents = await getAvailableAgents();
    const ids = agents.map((a) => a.agentId);
    expect(ids).toContain('claude');
    expect(ids).toContain('codex');
    expect(ids).not.toContain('unknownAgent');
  });

  it('skips missing agents', async () => {
    mockManager({
      claude: { status: 'missing' },
      codex: { status: 'available', path: '/usr/bin/codex' },
    });

    const agents = await getAvailableAgents();
    const ids = agents.map((a) => a.agentId);
    expect(ids).not.toContain('claude');
    expect(ids).toContain('codex');
  });

  it('returns correct agent metadata', async () => {
    mockManager({ claude: { status: 'available', path: '/usr/bin/claude' } });

    const agents = await getAvailableAgents();
    const claude = agents.find((a) => a.agentId === 'claude');
    expect(claude).toBeDefined();
    expect(claude?.name).toBe('Claude Code');
    expect(claude?.supportsModelFlag).toBe(true);
    expect(claude?.models.length).toBeGreaterThan(0);
    expect(claude?.models.some((m) => m.isDefault)).toBe(true);
  });
});

describe('prompt templates', () => {
  it('COMMIT_PROMPT_TEMPLATE contains expected format instructions', () => {
    expect(COMMIT_PROMPT_TEMPLATE).toContain('Conventional Commits');
    expect(COMMIT_PROMPT_TEMPLATE).toContain('72 chars');
    expect(COMMIT_PROMPT_TEMPLATE).toContain('Output ONLY');
  });

  it('PR_PROMPT_TEMPLATE contains expected format instructions', () => {
    expect(PR_PROMPT_TEMPLATE).toContain('pull request');
    expect(PR_PROMPT_TEMPLATE).toContain('Summary');
    expect(PR_PROMPT_TEMPLATE).toContain('Branch:');
  });
});
