import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { eq } from 'drizzle-orm';
import { db } from '@main/db/client';
import { resolveDefaultUserDataPath } from '@main/db/default-path';
import { projects } from '@main/db/schema';
import { log } from '@main/lib/logger';

const execFileAsync = promisify(execFile);

export interface GroupWorktreeResult {
  projectId: string;
  projectName: string;
  worktreePath: string;
  branchName: string;
}

export interface GroupWorkspaceResult {
  groupDir: string;
  worktrees: GroupWorktreeResult[];
}

function safeSegment(name: string, id: string): string {
  const safe = name
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);
  return safe || id.slice(0, 8);
}

async function getDefaultBranch(repoPath: string): Promise<string> {
  try {
    // Try to get the remote default branch from origin/HEAD
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoPath, 'rev-parse', '--abbrev-ref', 'origin/HEAD'],
      { timeout: 5000 }
    );
    const branch = stdout.trim().replace('origin/', '');
    if (branch && branch !== 'HEAD') return branch;
  } catch {}
  try {
    // Fall back to current branch
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoPath, 'rev-parse', '--abbrev-ref', 'HEAD'],
      { timeout: 5000 }
    );
    const branch = stdout.trim();
    if (branch && branch !== 'HEAD') return branch;
  } catch {}
  return 'main';
}

export async function bootstrapGroupWorkspace(
  groupTaskId: string,
  memberProjectIds: string[]
): Promise<GroupWorkspaceResult> {
  const userDataPath = resolveDefaultUserDataPath();
  const groupDir = path.join(userDataPath, 'group-workspaces', groupTaskId);
  await mkdir(groupDir, { recursive: true });

  const worktrees: GroupWorktreeResult[] = [];
  const shortId = groupTaskId.replace(/-/g, '').slice(0, 8);

  for (const projectId of memberProjectIds) {
    const [projectRow] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!projectRow?.path) {
      log.warn(`[group-workspace] project ${projectId} not found in DB, skipping`);
      continue;
    }

    const repoPath = projectRow.path;
    const projectName = safeSegment(path.basename(repoPath), projectId);
    const worktreePath = path.join(groupDir, projectName);
    const branchName = `emdash/group-${shortId}/${projectName}`;

    try {
      const fromBranch = await getDefaultBranch(repoPath);
      await execFileAsync(
        'git',
        ['-C', repoPath, 'worktree', 'add', '-b', branchName, worktreePath, fromBranch],
        { timeout: 30000 }
      );
      worktrees.push({ projectId, projectName, worktreePath, branchName });
      log.info(`[group-workspace] created worktree for ${projectName} at ${worktreePath}`);
    } catch (e) {
      log.warn(`[group-workspace] failed to create worktree for ${projectId}:`, e);
      // Try without -b (branch may already exist from a previous attempt)
      try {
        await execFileAsync('git', ['-C', repoPath, 'worktree', 'add', worktreePath, branchName], {
          timeout: 30000,
        });
        worktrees.push({ projectId, projectName, worktreePath, branchName });
      } catch (e2) {
        log.error(`[group-workspace] giving up on ${projectId}:`, e2);
      }
    }
  }

  await writeWorkspaceContextFiles(groupDir, worktrees);

  return { groupDir, worktrees };
}

/**
 * Writes durable context files into the group root so every agent session — in
 * any conversation, not just the first prompt — understands the multi-repo
 * layout. Without this, an agent started in the bare group folder loads no
 * project instructions and tends to focus on a single repo.
 *
 * - `CLAUDE.md` / `AGENTS.md`: human- and agent-readable map of the workspace.
 * - `.emdash-workspace.json`: machine-readable manifest for future tooling.
 */
async function writeWorkspaceContextFiles(
  groupDir: string,
  worktrees: GroupWorktreeResult[]
): Promise<void> {
  if (worktrees.length === 0) return;

  const repoLines = worktrees
    .map((wt) => `- \`${wt.projectName}/\` — git worktree on branch \`${wt.branchName}\``)
    .join('\n');

  const doc = `# Multi-Repo Workspace

This directory is an emdash multi-repo workspace — think of it like a VS Code
multi-root workspace. It is **not** a git repository itself; each subdirectory
below is an independent git worktree for a separate repository.

## Repositories

${repoLines}

## How to work here

- All repositories above are in scope. You may read and edit files in **any** of
  them as needed to complete the task — changes are not limited to one repo.
- \`cd <repo>/\` to enter a repository before running git commands. Each repo has
  its own history, branches, and (where present) its own \`CLAUDE.md\` / \`AGENTS.md\`
  with repo-specific instructions — read them when working in that repo.
- Git operations (status, diff, commit, push) are per-repository. Run them from
  inside the relevant subdirectory, not from this workspace root.
- When a change spans repositories, coordinate the edits across them and commit
  each repository separately.
`;

  // The group root is not a git repo, but emdash's workspace file-indexer looks
  // for a .gitignore here; provide one to silence the ENOENT warning and to keep
  // agent-local settings out of indexing.
  const gitignore = `.claude/settings.local.json\n.emdash-workspace.json\n`;

  try {
    await Promise.all([
      writeFile(path.join(groupDir, '.gitignore'), gitignore, 'utf8'),
      writeFile(path.join(groupDir, 'CLAUDE.md'), doc, 'utf8'),
      writeFile(path.join(groupDir, 'AGENTS.md'), doc, 'utf8'),
      writeFile(
        path.join(groupDir, '.emdash-workspace.json'),
        `${JSON.stringify(
          {
            kind: 'multi-repo-workspace',
            repos: worktrees.map((wt) => ({
              name: wt.projectName,
              path: wt.projectName,
              branch: wt.branchName,
            })),
          },
          null,
          2
        )}\n`,
        'utf8'
      ),
    ]);
  } catch (e) {
    log.warn('[group-workspace] failed to write workspace context files:', e);
  }
}

export async function teardownGroupWorkspace(
  groupDir: string,
  memberProjectIds: string[]
): Promise<void> {
  for (const projectId of memberProjectIds) {
    const [projectRow] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!projectRow?.path) continue;
    try {
      await execFileAsync('git', ['-C', projectRow.path, 'worktree', 'prune'], { timeout: 10000 });
    } catch {}
  }
}
