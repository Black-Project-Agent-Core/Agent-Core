import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { MemoryService } from '../src/memory/service.js';
import { MEMORY_SCHEMA_VERSION, initializeMemorySchema } from '../src/memory/schema.js';
import { MemoryStore } from '../src/memory/store.js';

const roots: string[] = [];
const services: MemoryService[] = [];

const CONTINUITY_TABLES = [
  'continuity_turns',
  'continuity_tasks',
  'continuity_task_dependencies',
  'continuity_checkpoints',
  'continuity_frontier',
] as const;

function tableNames(db: DatabaseSync): Set<string> {
  return new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>)
    .map((row) => row.name));
}

function columns(db: DatabaseSync, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((row) => row.name);
}

function downgradeToV1(dbPath: string): void {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`
      DROP TABLE IF EXISTS memory_context_lifecycle;
      DROP TABLE IF EXISTS memory_remote_state;
      DROP TABLE IF EXISTS memory_node_metadata;
      DROP TABLE IF EXISTS memory_edge_events;
      DROP TABLE IF EXISTS memory_recall_expansions;
      DROP TABLE IF EXISTS memory_write_decisions;
      DROP TABLE IF EXISTS continuity_turns;
      DROP TABLE IF EXISTS continuity_task_dependencies;
      DROP TABLE IF EXISTS continuity_checkpoints;
      DROP TABLE IF EXISTS continuity_frontier;
      DROP TABLE IF EXISTS continuity_tasks;
      DELETE FROM memory_schema_migrations WHERE version >= 2;
      PRAGMA user_version = 1;
    `);
  } finally {
    db.close();
  }
}

function downgradeToV2(dbPath: string): void {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`
      DROP TABLE IF EXISTS memory_context_lifecycle;
      DROP TABLE IF EXISTS memory_remote_state;
      DROP TABLE IF EXISTS memory_node_metadata;
      DROP TABLE IF EXISTS memory_edge_events;
      DROP TABLE IF EXISTS memory_recall_expansions;
      DROP TABLE IF EXISTS memory_write_decisions;
      DELETE FROM memory_schema_migrations WHERE version >= 3;
      PRAGMA user_version = 2;
    `);
  } finally {
    db.close();
  }
}

function downgradeToV3(dbPath: string): void {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`
      DROP TABLE IF EXISTS memory_context_lifecycle;
      DELETE FROM memory_schema_migrations WHERE version >= 4;
      PRAGMA user_version = 3;
    `);
  } finally {
    db.close();
  }
}

async function fileFixture(label: string) {
  const root = await mkdtemp(path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), `agent-core-continuity-schema-${label}-`));
  roots.push(root);
  const base = loadConfig({}, root).memory;
  const dbPath = path.join(root, 'runtime', 'memory', 'continuity.sqlite');
  const config = { ...base, enabled: true, dbPath, busyTimeoutMs: 1000 };
  const scope = { principalId: 'principal-continuity-schema', projectId: root };
  const service = new MemoryService(config);
  services.push(service);
  return { root, dbPath, config, scope, service };
}

afterEach(async () => {
  await Promise.all(services.splice(0).map(async (service) => {
    try { await service.close(); } catch {}
  }));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('DMF schema v4 hard lifecycle, cognition, and continuity ledger', () => {
  it('creates schema v4 idempotently with continuity preserved and all migration records', () => {
    const db = new DatabaseSync(':memory:');
    try {
      initializeMemorySchema(db);
      initializeMemorySchema(db);

      expect(MEMORY_SCHEMA_VERSION).toBe(4);
      expect(Number(db.prepare('PRAGMA user_version').get()!.user_version)).toBe(4);
      expect(db.prepare('SELECT version, name FROM memory_schema_migrations ORDER BY version').all()).toEqual([
        { version: 1, name: '001_initial_memory' },
        { version: 2, name: '002_continuity_ledger' },
        { version: 3, name: '003_memory_cognition_ledgers' },
        { version: 4, name: '004_hard_memory_lifecycle' },
      ]);

      const tables = tableNames(db);
      for (const table of CONTINUITY_TABLES) expect(tables.has(table)).toBe(true);

      expect(columns(db, 'continuity_turns')).toEqual(expect.arrayContaining([
        'id', 'principal_id', 'project_id', 'route_context_id', 'task_id',
        'input_text', 'input_hash', 'context_text', 'state', 'created_at', 'closed_at',
      ]));
      expect(columns(db, 'continuity_tasks')).toEqual(expect.arrayContaining([
        'id', 'principal_id', 'project_id', 'parent_task_id', 'title', 'objective',
        'acceptance_json', 'constraints_json', 'status', 'priority', 'blocker_json',
        'last_checkpoint_id', 'created_at', 'updated_at', 'completed_at',
      ]));
      expect(columns(db, 'continuity_task_dependencies')).toEqual(expect.arrayContaining([
        'task_id', 'depends_on_task_id', 'dependency_type', 'created_at',
      ]));
      expect(columns(db, 'continuity_checkpoints')).toEqual(expect.arrayContaining([
        'id', 'principal_id', 'project_id', 'task_id', 'route_context_id',
        'phase', 'summary_json', 'evidence_json', 'state_hash', 'created_at',
      ]));
      expect(columns(db, 'continuity_frontier')).toEqual(expect.arrayContaining([
        'id', 'principal_id', 'project_id', 'source_task_id', 'title', 'rationale',
        'status', 'dependency_task_ids_json', 'priority', 'created_at', 'updated_at',
      ]));

      expect(String(db.prepare('PRAGMA quick_check').get()!.quick_check)).toBe('ok');
    } finally {
      db.close();
    }
  });

  it('migrates a populated v3 database to v4 with a verified backup and preserves cognition truth', async () => {
    const f = await fileFixture('v3-to-v4');
    const committed = await f.service.commit({
      scope: f.scope,
      canonicalKey: 'continuity.schema.v3-to-v4.memory',
      kind: 'decision',
      value: 'Preserve cognition truth while adding hard lifecycle state.',
      sourceType: 'test',
    });
    await f.service.close();
    services.splice(services.indexOf(f.service), 1);
    downgradeToV3(f.dbPath);

    const store = new MemoryStore();
    const opened = await store.open({ dbPath: f.dbPath, busyTimeoutMs: 1000 });
    try {
      expect(opened.priorUserVersion).toBe(3);
      expect(opened.schemaVersion).toBe(4);
      expect(opened.migrationBackup?.backupPath).toContain('pre-migration-v3-to-v4');
    } finally {
      await store.close();
    }

    const verify = new DatabaseSync(f.dbPath);
    try {
      expect(Number(verify.prepare('PRAGMA user_version').get()!.user_version)).toBe(4);
      expect(Number(verify.prepare('SELECT count(*) AS count FROM memory_items WHERE id = ?').get(committed.memoryId)!.count)).toBe(1);
      expect(tableNames(verify).has('memory_context_lifecycle')).toBe(true);
      expect(verify.prepare('SELECT version, name FROM memory_schema_migrations WHERE version = 4').get()).toEqual({
        version: 4,
        name: '004_hard_memory_lifecycle',
      });
      expect(String(verify.prepare('PRAGMA integrity_check').get()!.integrity_check)).toBe('ok');
    } finally {
      verify.close();
    }
  });

  it('migrates a populated v2 database to v4 without changing memory or continuity truth', async () => {
    const f = await fileFixture('v2-to-v4');
    const committed = await f.service.commit({
      scope: f.scope,
      canonicalKey: 'continuity.schema.v2-to-v4.memory',
      kind: 'fact',
      value: 'Preserve memory while adding cognition ledgers.',
      sourceType: 'test',
    });
    await f.service.close();
    services.splice(services.indexOf(f.service), 1);

    const taskId = 'task-v2-to-v3';
    const checkpointId = 'checkpoint-v2-to-v3';
    const seeded = new DatabaseSync(f.dbPath);
    try {
      const now = Date.now();
      seeded.prepare(`INSERT INTO continuity_tasks(
        id, principal_id, project_id, parent_task_id, title, objective,
        acceptance_json, constraints_json, status, priority, blocker_json,
        last_checkpoint_id, created_at, updated_at, completed_at
      ) VALUES (?, ?, ?, NULL, ?, ?, '[]', '[]', 'running', 1, '[]', ?, ?, ?, NULL)`)
        .run(taskId, f.scope.principalId, f.scope.projectId, 'Schema v4 migration task', 'Preserve continuity state', checkpointId, now, now);
      seeded.prepare(`INSERT INTO continuity_checkpoints(
        id, principal_id, project_id, task_id, route_context_id, phase,
        summary_json, evidence_json, state_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, '[]', ?, ?)`)
        .run(checkpointId, f.scope.principalId, f.scope.projectId, taskId, 'route-v2-to-v4', 'phase-1', '{"status":"running"}', 'state-v2-to-v4', now);
    } finally {
      seeded.close();
    }
    downgradeToV2(f.dbPath);

    const store = new MemoryStore();
    const opened = await store.open({ dbPath: f.dbPath, busyTimeoutMs: 1000 });
    try {
      expect(opened.priorUserVersion).toBe(2);
      expect(opened.schemaVersion).toBe(4);
      expect(opened.migrationBackup?.backupPath).toContain('pre-migration-v2-to-v4');
    } finally {
      await store.close();
    }

    const verify = new DatabaseSync(f.dbPath);
    try {
      expect(Number(verify.prepare('PRAGMA user_version').get()!.user_version)).toBe(4);
      expect(Number(verify.prepare('SELECT count(*) AS count FROM memory_items WHERE id = ?').get(committed.memoryId)!.count)).toBe(1);
      expect(Number(verify.prepare('SELECT count(*) AS count FROM continuity_tasks WHERE id = ?').get(taskId)!.count)).toBe(1);
      expect(Number(verify.prepare('SELECT count(*) AS count FROM continuity_checkpoints WHERE id = ?').get(checkpointId)!.count)).toBe(1);
      expect(verify.prepare('SELECT version, name FROM memory_schema_migrations WHERE version = 3').get()).toEqual({
        version: 3,
        name: '003_memory_cognition_ledgers',
      });
      expect(String(verify.prepare('PRAGMA integrity_check').get()!.integrity_check)).toBe('ok');
    } finally {
      verify.close();
    }
  });

  it('rolls a failed v2-to-v4 migration back, preserving v2 memory and continuity plus a verified backup', async () => {
    const f = await fileFixture('v2-to-v3-rollback');
    const committed = await f.service.commit({
      scope: f.scope,
      canonicalKey: 'continuity.schema.v2-to-v3.rollback',
      kind: 'fact',
      value: 'Must survive a failed cognition-ledger migration.',
      sourceType: 'test',
    });
    await f.service.close();
    services.splice(services.indexOf(f.service), 1);

    const taskId = 'task-v2-rollback';
    const checkpointId = 'checkpoint-v2-rollback';
    const seeded = new DatabaseSync(f.dbPath);
    try {
      const now = Date.now();
      seeded.prepare(`INSERT INTO continuity_tasks(
        id, principal_id, project_id, parent_task_id, title, objective,
        acceptance_json, constraints_json, status, priority, blocker_json,
        last_checkpoint_id, created_at, updated_at, completed_at
      ) VALUES (?, ?, ?, NULL, ?, ?, '[]', '[]', 'running', 1, '[]', ?, ?, ?, NULL)`)
        .run(taskId, f.scope.principalId, f.scope.projectId, 'Rollback migration task', 'Preserve v2 state', checkpointId, now, now);
      seeded.prepare(`INSERT INTO continuity_checkpoints(
        id, principal_id, project_id, task_id, route_context_id, phase,
        summary_json, evidence_json, state_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, '[]', ?, ?)`)
        .run(checkpointId, f.scope.principalId, f.scope.projectId, taskId, 'route-v2-rollback', 'phase-1', '{"status":"running"}', 'state-v2-rollback', now);
    } finally {
      seeded.close();
    }
    downgradeToV2(f.dbPath);

    const sabotage = new DatabaseSync(f.dbPath);
    try {
      sabotage.exec('CREATE VIEW memory_write_decisions AS SELECT 1 AS id');
    } finally {
      sabotage.close();
    }

    const store = new MemoryStore();
    try {
      await expect(store.open({ dbPath: f.dbPath, busyTimeoutMs: 1000 })).rejects.toBeTruthy();
    } finally {
      await store.close();
    }

    const verify = new DatabaseSync(f.dbPath);
    try {
      expect(Number(verify.prepare('PRAGMA user_version').get()!.user_version)).toBe(2);
      expect(Number(verify.prepare('SELECT count(*) AS count FROM memory_schema_migrations WHERE version = 3').get()!.count)).toBe(0);
      expect(Number(verify.prepare('SELECT count(*) AS count FROM memory_items WHERE id = ?').get(committed.memoryId)!.count)).toBe(1);
      expect(Number(verify.prepare('SELECT count(*) AS count FROM continuity_tasks WHERE id = ?').get(taskId)!.count)).toBe(1);
      expect(Number(verify.prepare('SELECT count(*) AS count FROM continuity_checkpoints WHERE id = ?').get(checkpointId)!.count)).toBe(1);
      expect(String(verify.prepare('PRAGMA integrity_check').get()!.integrity_check)).toBe('ok');
    } finally {
      verify.close();
    }

    const backups = await readdir(path.join(path.dirname(f.dbPath), 'backups'));
    expect(backups.some((name) => name.includes('pre-migration-v2-to-v4') && name.endsWith('.sqlite'))).toBe(true);
  });

  it('rolls a failed v1-to-v4 migration back, preserves v1 memory, and leaves a verified pre-migration backup', async () => {
    const f = await fileFixture('rollback');
    const committed = await f.service.commit({
      scope: f.scope,
      canonicalKey: 'continuity.schema.rollback.proof',
      kind: 'fact',
      value: 'Must survive a failed continuity migration.',
      sourceType: 'test',
    });
    await f.service.close();
    services.splice(services.indexOf(f.service), 1);
    downgradeToV1(f.dbPath);

    const sabotage = new DatabaseSync(f.dbPath);
    try {
      sabotage.exec('CREATE TABLE continuity_tasks(id TEXT PRIMARY KEY)');
    } finally {
      sabotage.close();
    }

    const store = new MemoryStore();
    try {
      await expect(store.open({ dbPath: f.dbPath, busyTimeoutMs: 1000 })).rejects.toBeTruthy();
    } finally {
      await store.close();
    }

    const verify = new DatabaseSync(f.dbPath);
    try {
      expect(Number(verify.prepare('PRAGMA user_version').get()!.user_version)).toBe(1);
      expect(Number(verify.prepare('SELECT count(*) AS count FROM memory_schema_migrations WHERE version = 2').get()!.count)).toBe(0);
      expect(tableNames(verify).has('continuity_turns')).toBe(false);
      expect(Number(verify.prepare('SELECT count(*) AS count FROM memory_items WHERE id = ?').get(committed.memoryId)!.count)).toBe(1);
      expect(String(verify.prepare('PRAGMA integrity_check').get()!.integrity_check)).toBe('ok');
    } finally {
      verify.close();
    }

    const backupDir = path.join(path.dirname(f.dbPath), 'backups');
    const backups = await readdir(backupDir);
    expect(backups.some((name) => name.includes('pre-migration-v1-to-v4') && name.endsWith('.sqlite'))).toBe(true);
  });
});
