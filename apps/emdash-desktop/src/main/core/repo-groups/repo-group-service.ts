import { asc, eq } from 'drizzle-orm';
import { db } from '@main/db/client';
import { repoGroupMembers, repoGroups } from '@main/db/schema';
import { events } from '@main/lib/events';
import { log } from '@main/lib/logger';
import { repoGroupEventChannel } from '@shared/core/repo-groups/repo-group-events';
import type {
  CreateRepoGroupParams,
  RepoGroup,
  RepoGroupError,
  UpdateRepoGroupParams,
} from '@shared/core/repo-groups/repo-groups';
import { err, ok, type Result } from '@shared/lib/result';

function rowsToGroup(
  groupRow: { id: string; name: string; createdAt: string; updatedAt: string },
  memberRows: { projectId: string; sortOrder: number }[]
): RepoGroup {
  const sorted = [...memberRows].sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    id: groupRow.id,
    name: groupRow.name,
    memberProjectIds: sorted.map((m) => m.projectId),
    createdAt: groupRow.createdAt,
    updatedAt: groupRow.updatedAt,
  };
}

class RepoGroupService {
  async getAll(): Promise<RepoGroup[]> {
    const groups = await db.select().from(repoGroups).orderBy(asc(repoGroups.createdAt));
    if (groups.length === 0) return [];

    const members = await db
      .select()
      .from(repoGroupMembers)
      .orderBy(asc(repoGroupMembers.sortOrder));

    return groups.map((g) =>
      rowsToGroup(
        g,
        members.filter((m) => m.repoGroupId === g.id)
      )
    );
  }

  async getById(id: string): Promise<RepoGroup | null> {
    const [group] = await db.select().from(repoGroups).where(eq(repoGroups.id, id)).limit(1);
    if (!group) return null;

    const members = await db
      .select()
      .from(repoGroupMembers)
      .where(eq(repoGroupMembers.repoGroupId, id))
      .orderBy(asc(repoGroupMembers.sortOrder));

    return rowsToGroup(group, members);
  }

  async create(params: CreateRepoGroupParams): Promise<Result<RepoGroup, RepoGroupError>> {
    if (params.projectIds.length < 2) {
      return err({ type: 'min-members', required: 2 });
    }

    // Pre-flight uniqueness check avoids UNIQUE constraint unhandled rejections.
    const existing = await db
      .select({ id: repoGroups.id })
      .from(repoGroups)
      .where(eq(repoGroups.name, params.name))
      .limit(1);
    if (existing.length > 0) {
      return err({ type: 'name-taken', name: params.name });
    }

    const id = params.id ?? crypto.randomUUID();
    const now = new Date().toISOString();

    try {
      db.transaction((tx) => {
        tx.insert(repoGroups)
          .values({ id, name: params.name, createdAt: now, updatedAt: now })
          .run();
        if (params.projectIds.length > 0) {
          tx.insert(repoGroupMembers)
            .values(
              params.projectIds.map((projectId, i) => ({
                repoGroupId: id,
                projectId,
                sortOrder: i,
              }))
            )
            .run();
        }
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error('[repo-group-service] create transaction failed:', { msg, params });
      if (msg.includes('UNIQUE constraint failed: repo_groups.name')) {
        return err({ type: 'name-taken', name: params.name });
      }
      return err({ type: 'error', message: msg });
    }

    const group = await this.getById(id);
    if (!group) {
      log.error('[repo-group-service] getById returned null after successful insert:', { id });
      return err({ type: 'error', message: 'Failed to read created group' });
    }

    events.emit(repoGroupEventChannel, { type: 'created', group });
    return ok(group);
  }

  async update(
    id: string,
    params: UpdateRepoGroupParams
  ): Promise<Result<RepoGroup, RepoGroupError>> {
    const existing = await this.getById(id);
    if (!existing) return err({ type: 'not-found' });

    if (params.projectIds !== undefined && params.projectIds.length < 2) {
      return err({ type: 'min-members', required: 2 });
    }

    const now = new Date().toISOString();

    try {
      db.transaction((tx) => {
        if (params.name !== undefined) {
          tx.update(repoGroups)
            .set({ name: params.name, updatedAt: now })
            .where(eq(repoGroups.id, id))
            .run();
        } else {
          tx.update(repoGroups).set({ updatedAt: now }).where(eq(repoGroups.id, id)).run();
        }

        if (params.projectIds !== undefined) {
          tx.delete(repoGroupMembers).where(eq(repoGroupMembers.repoGroupId, id)).run();
          if (params.projectIds.length > 0) {
            tx.insert(repoGroupMembers)
              .values(
                params.projectIds.map((projectId, i) => ({
                  repoGroupId: id,
                  projectId,
                  sortOrder: i,
                }))
              )
              .run();
          }
        }
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('UNIQUE constraint failed: repo_groups.name')) {
        return err({ type: 'name-taken', name: params.name ?? existing.name });
      }
      return err({ type: 'error', message: msg });
    }

    const group = await this.getById(id);
    if (!group) return err({ type: 'error', message: 'Failed to read updated group' });

    events.emit(repoGroupEventChannel, { type: 'updated', group });
    return ok(group);
  }

  async delete(id: string): Promise<Result<void, RepoGroupError>> {
    const existing = await this.getById(id);
    if (!existing) return err({ type: 'not-found' });

    await db.delete(repoGroups).where(eq(repoGroups.id, id));
    events.emit(repoGroupEventChannel, { type: 'deleted', id });
    return ok(undefined);
  }
}

export const repoGroupService = new RepoGroupService();
