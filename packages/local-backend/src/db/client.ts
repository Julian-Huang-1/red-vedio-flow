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
      workflow_id TEXT,
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

    CREATE TABLE IF NOT EXISTS executions (
      id TEXT PRIMARY KEY,
      plugin_id TEXT NOT NULL,
      contribution_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      input_json TEXT,
      result_json TEXT,
      error_code TEXT,
      error_message TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      started_at INTEGER,
      finished_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS visual_tasks (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      node_kind TEXT NOT NULL,
      submit_id TEXT,
      status TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_poll_at INTEGER NOT NULL,
      timeout_at INTEGER NOT NULL,
      lease_owner TEXT,
      lease_expires_at INTEGER,
      last_error TEXT,
      result_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      completed_at INTEGER,
      projected_at INTEGER,
      FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      workflow_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'text',
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      status TEXT NOT NULL,
      agent_id TEXT,
      agent_label TEXT,
      model_id TEXT,
      error TEXT,
      run_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_runs_workflow_id ON runs(workflow_id);
    CREATE INDEX IF NOT EXISTS idx_runs_node_id ON runs(node_id);
    CREATE INDEX IF NOT EXISTS idx_assets_kind ON assets(kind);
    CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
    CREATE INDEX IF NOT EXISTS idx_executions_plugin ON executions(plugin_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_visual_tasks_provider_submit
      ON visual_tasks(provider, submit_id)
      WHERE submit_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_visual_tasks_active_node
      ON visual_tasks(workflow_id, node_id)
      WHERE status IN ('submitting', 'polling');
    CREATE INDEX IF NOT EXISTS idx_visual_tasks_due ON visual_tasks(status, next_poll_at);
    CREATE INDEX IF NOT EXISTS idx_visual_tasks_node ON visual_tasks(workflow_id, node_id);
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at);
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

  const assetColumns = sqlite.prepare(`PRAGMA table_info(assets)`).all() as Array<{ name: string }>
  if (!assetColumns.some((column) => column.name === 'workflow_id')) {
    sqlite.exec(`ALTER TABLE assets ADD COLUMN workflow_id TEXT;`)
  }
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_assets_workflow ON assets(workflow_id, created_at DESC);`)
}
