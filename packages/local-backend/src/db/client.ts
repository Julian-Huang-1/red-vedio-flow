import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema.js'

export type LocalDatabase = ReturnType<typeof createDatabase>

export function createDatabase(databasePath: string) {
  mkdirSync(dirname(databasePath), { recursive: true })
  const sqlite = new Database(databasePath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  migrate(sqlite)

  return {
    sqlite,
    db: drizzle(sqlite, { schema }),
  }
}

function migrate(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      graph_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT,
      local_path TEXT NOT NULL,
      url TEXT NOT NULL,
      provider TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      status TEXT NOT NULL,
      prompt TEXT NOT NULL,
      result_json TEXT,
      error TEXT,
      started_at INTEGER NOT NULL,
      heartbeat_at INTEGER NOT NULL DEFAULT 0,
      finished_at INTEGER,
      FOREIGN KEY (workflow_id) REFERENCES workflows(id)
    );

    CREATE INDEX IF NOT EXISTS idx_runs_workflow_id ON runs(workflow_id);
    CREATE INDEX IF NOT EXISTS idx_runs_node_id ON runs(node_id);
    CREATE INDEX IF NOT EXISTS idx_assets_kind ON assets(kind);
  `)

  const columns = sqlite.prepare(`PRAGMA table_info(workflows)`).all() as Array<{ name: string }>
  if (!columns.some((column) => column.name === 'revision')) {
    sqlite.exec(`ALTER TABLE workflows ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;`)
  }

  const runColumns = sqlite.prepare(`PRAGMA table_info(runs)`).all() as Array<{ name: string }>
  if (!runColumns.some((column) => column.name === 'heartbeat_at')) {
    sqlite.exec(`ALTER TABLE runs ADD COLUMN heartbeat_at INTEGER NOT NULL DEFAULT 0;`)
    sqlite.exec(`UPDATE runs SET heartbeat_at = started_at WHERE heartbeat_at = 0;`)
  }
}
