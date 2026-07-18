import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const workflows = sqliteTable('workflows', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  schemaVersion: integer('schema_version').notNull(),
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
  finishedAt: integer('finished_at'),
})
