import { openFixture } from '@tooling/utils/db';
import { afterEach, describe, expect, it } from 'vitest';

describe('0016 repo_groups migration', () => {
  let fixture: Awaited<ReturnType<typeof openFixture>>;

  afterEach(() => {
    fixture?.close();
  });

  it('creates the repo_groups table with expected columns', async () => {
    fixture = await openFixture('empty');

    const tables = fixture.sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as { name: string }[];

    expect(tables.map((t) => t.name)).toContain('repo_groups');
  });

  it('repo_groups has id, name, created_at, updated_at columns', async () => {
    fixture = await openFixture('empty');

    const columns = fixture.sqlite.prepare(`PRAGMA table_info(repo_groups)`).all() as {
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
    }[];

    const colNames = columns.map((c) => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('name');
    expect(colNames).toContain('created_at');
    expect(colNames).toContain('updated_at');

    const nameCol = columns.find((c) => c.name === 'name')!;
    expect(nameCol.notnull).toBe(1);
  });

  it('creates the repo_group_members table with expected columns', async () => {
    fixture = await openFixture('empty');

    const tables = fixture.sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as { name: string }[];

    expect(tables.map((t) => t.name)).toContain('repo_group_members');
  });

  it('repo_group_members has repo_group_id, project_id, sort_order columns', async () => {
    fixture = await openFixture('empty');

    const columns = fixture.sqlite.prepare(`PRAGMA table_info(repo_group_members)`).all() as {
      name: string;
      notnull: number;
    }[];

    const colNames = columns.map((c) => c.name);
    expect(colNames).toContain('repo_group_id');
    expect(colNames).toContain('project_id');
    expect(colNames).toContain('sort_order');
  });

  it('enforces unique group names via idx_repo_groups_name', async () => {
    fixture = await openFixture('empty');

    fixture.sqlite.exec(`INSERT INTO repo_groups (id, name) VALUES ('g1', 'My Workspace')`);

    expect(() => {
      fixture.sqlite.exec(`INSERT INTO repo_groups (id, name) VALUES ('g2', 'My Workspace')`);
    }).toThrow();
  });

  it('cascades delete to repo_group_members when group is deleted', async () => {
    fixture = await openFixture('empty');

    // Insert a project first (FK requirement).
    fixture.sqlite.exec(
      `INSERT INTO projects (id, name, path, workspace_provider) VALUES ('p1', 'Project 1', '/tmp/p1', 'local')`
    );
    fixture.sqlite.exec(`INSERT INTO repo_groups (id, name) VALUES ('g1', 'Group 1')`);
    fixture.sqlite.exec(
      `INSERT INTO repo_group_members (repo_group_id, project_id, sort_order) VALUES ('g1', 'p1', 0)`
    );

    const before = fixture.sqlite
      .prepare(`SELECT count(*) as c FROM repo_group_members WHERE repo_group_id = 'g1'`)
      .get() as { c: number };
    expect(before.c).toBe(1);

    fixture.sqlite.exec(`DELETE FROM repo_groups WHERE id = 'g1'`);

    const after = fixture.sqlite
      .prepare(`SELECT count(*) as c FROM repo_group_members WHERE repo_group_id = 'g1'`)
      .get() as { c: number };
    expect(after.c).toBe(0);
  });
});
