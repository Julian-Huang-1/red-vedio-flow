import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const workflows = sqliteTable('workflows', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  schemaVersion: integer('schema_version').notNull(),
  revision: integer('revision').notNull(),
  graphJson: text('graph_json').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const assets = sqliteTable('assets', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type'),
  localPath: text('local_path').notNull(),
  url: text('url').notNull(),
  provider: text('provider'),
  createdAt: integer('created_at').notNull(),
})

export const runs = sqliteTable('runs', {
  id: text('id').primaryKey(),
  workflowId: text('workflow_id').notNull(),
  nodeId: text('node_id').notNull(),
  status: text('status').notNull(),
  prompt: text('prompt').notNull(),
  resultJson: text('result_json'),
  error: text('error'),
  startedAt: integer('started_at').notNull(),
  heartbeatAt: integer('heartbeat_at').notNull(),
  finishedAt: integer('finished_at'),
})

export const executions = sqliteTable('executions', {
  id: text('id').primaryKey(),
  pluginId: text('plugin_id').notNull(),
  contributionId: text('contribution_id').notNull(),
  kind: text('kind').notNull(),
  status: text('status').notNull(),
  inputJson: text('input_json'),
  resultJson: text('result_json'),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  startedAt: integer('started_at'),
  finishedAt: integer('finished_at'),
}, (table) => [
  index('idx_executions_status').on(table.status),
  index('idx_executions_plugin').on(table.pluginId),
])

export const visualTasks = sqliteTable('visual_tasks', {
  id: text('id').primaryKey(),
  workflowId: text('workflow_id').notNull().references(() => workflows.id, { onDelete: 'cascade' }),
  nodeId: text('node_id').notNull(),
  provider: text('provider').notNull(),
  nodeKind: text('node_kind').notNull(),
  submitId: text('submit_id'),
  status: text('status').notNull(),
  attemptCount: integer('attempt_count').notNull(),
  nextPollAt: integer('next_poll_at').notNull(),
  timeoutAt: integer('timeout_at').notNull(),
  leaseOwner: text('lease_owner'),
  leaseExpiresAt: integer('lease_expires_at'),
  lastError: text('last_error'),
  resultJson: text('result_json'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  completedAt: integer('completed_at'),
  projectedAt: integer('projected_at'),
}, (table) => [
  uniqueIndex('idx_visual_tasks_provider_submit')
    .on(table.provider, table.submitId)
    .where(sql`${table.submitId} IS NOT NULL`),
  uniqueIndex('idx_visual_tasks_active_node')
    .on(table.workflowId, table.nodeId)
    .where(sql`${table.status} IN ('submitting', 'polling')`),
  index('idx_visual_tasks_due').on(table.status, table.nextPollAt),
  index('idx_visual_tasks_node').on(table.workflowId, table.nodeId),
])
