import { openFixture } from '@tooling/utils/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Prevent module-level DB singleton from opening the Electron app DB.
vi.mock('@main/db/client', () => ({ db: {}, sqlite: {} }));

const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
}));

vi.mock('@main/lib/events', () => ({ events: { emit: mocks.emit } }));

describe('RepoGroupService', () => {
  let fixture: Awaited<ReturnType<typeof openFixture>>;

  beforeEach(async () => {
    fixture = await openFixture('empty');
    vi.resetModules();
    // Patch the db module to use our fixture db
    vi.doMock('@main/db/client', () => ({ db: fixture.db, sqlite: fixture.sqlite }));
  });

  afterEach(() => {
    fixture?.close();
    vi.clearAllMocks();
  });

  async function getService() {
    const { repoGroupService } = await import('./repo-group-service');
    return repoGroupService;
  }

  function insertProject(id: string, name: string) {
    fixture.sqlite.exec(
      `INSERT INTO projects (id, name, path, workspace_provider) VALUES ('${id}', '${name}', '/tmp/${id}', 'local')`
    );
  }

  it('returns empty array when no groups exist', async () => {
    const svc = await getService();
    const groups = await svc.getAll();
    expect(groups).toEqual([]);
  });

  it('creates a group with ordered members', async () => {
    insertProject('p1', 'Alpha');
    insertProject('p2', 'Beta');

    const svc = await getService();
    const result = await svc.create({ name: 'My Workspace', projectIds: ['p1', 'p2'] });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.name).toBe('My Workspace');
    expect(result.data.memberProjectIds).toEqual(['p1', 'p2']);
    expect(mocks.emit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'repo-group:event' }),
      expect.objectContaining({ type: 'created' })
    );
  });

  it('rejects creation with fewer than 2 members', async () => {
    insertProject('p1', 'Alpha');

    const svc = await getService();
    const result = await svc.create({ name: 'Solo', projectIds: ['p1'] });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe('min-members');
  });

  it('rejects duplicate group names', async () => {
    insertProject('p1', 'Alpha');
    insertProject('p2', 'Beta');

    const svc = await getService();
    await svc.create({ name: 'Dup', projectIds: ['p1', 'p2'] });
    const second = await svc.create({ name: 'Dup', projectIds: ['p1', 'p2'] });

    expect(second.success).toBe(false);
    if (second.success) return;
    expect(second.error.type).toBe('name-taken');
  });

  it('updates group name and emits updated event', async () => {
    insertProject('p1', 'Alpha');
    insertProject('p2', 'Beta');

    const svc = await getService();
    const created = await svc.create({ name: 'Old Name', projectIds: ['p1', 'p2'] });
    expect(created.success).toBe(true);
    if (!created.success) return;

    mocks.emit.mockClear();
    const updated = await svc.update(created.data.id, { name: 'New Name' });

    expect(updated.success).toBe(true);
    if (!updated.success) return;
    expect(updated.data.name).toBe('New Name');
    expect(mocks.emit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'updated' })
    );
  });

  it('updates group members and preserves new order', async () => {
    insertProject('p1', 'Alpha');
    insertProject('p2', 'Beta');
    insertProject('p3', 'Gamma');

    const svc = await getService();
    const created = await svc.create({ name: 'Group', projectIds: ['p1', 'p2'] });
    expect(created.success).toBe(true);
    if (!created.success) return;

    const updated = await svc.update(created.data.id, { projectIds: ['p3', 'p1', 'p2'] });
    expect(updated.success).toBe(true);
    if (!updated.success) return;
    expect(updated.data.memberProjectIds).toEqual(['p3', 'p1', 'p2']);
  });

  it('returns not-found when updating non-existent group', async () => {
    const svc = await getService();
    const result = await svc.update('nonexistent', { name: 'X' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe('not-found');
  });

  it('deletes group and emits deleted event', async () => {
    insertProject('p1', 'Alpha');
    insertProject('p2', 'Beta');

    const svc = await getService();
    const created = await svc.create({ name: 'To Delete', projectIds: ['p1', 'p2'] });
    expect(created.success).toBe(true);
    if (!created.success) return;

    mocks.emit.mockClear();
    const deleted = await svc.delete(created.data.id);

    expect(deleted.success).toBe(true);
    expect(mocks.emit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'deleted', id: created.data.id })
    );

    const after = await svc.getAll();
    expect(after).toHaveLength(0);
  });

  it('returns not-found when deleting non-existent group', async () => {
    const svc = await getService();
    const result = await svc.delete('nonexistent');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe('not-found');
  });

  it('getAll returns groups with correct member order', async () => {
    insertProject('p1', 'Alpha');
    insertProject('p2', 'Beta');
    insertProject('p3', 'Gamma');

    const svc = await getService();
    await svc.create({ name: 'WS-A', projectIds: ['p2', 'p1'] });
    await svc.create({ name: 'WS-B', projectIds: ['p3', 'p1', 'p2'] });

    const groups = await svc.getAll();
    expect(groups).toHaveLength(2);

    const wsA = groups.find((g) => g.name === 'WS-A')!;
    expect(wsA.memberProjectIds).toEqual(['p2', 'p1']);

    const wsB = groups.find((g) => g.name === 'WS-B')!;
    expect(wsB.memberProjectIds).toEqual(['p3', 'p1', 'p2']);
  });
});
