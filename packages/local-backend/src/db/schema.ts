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
  workflowId: text('workflow_id'),
  kind: text('kind').notNull(),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type'),
  localPath: text('local_path').notNull(),
  url: text('url').notNull(),
  provider: text('provider'),
  createdAt: integer('created_at').notNull(),
})

export const resources = sqliteTable('resources', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  kind: text('kind').notNull(),
  name: text('name').notNull(),
  mimeType: text('mime_type'),
  textContent: text('text_content'),
  url: text('url'),
  localPath: text('local_path'),
  fileName: text('file_name'),
  metadataJson: text('metadata_json'),
  source: text('source').notNull(),
  sourceNodeId: text('source_node_id'),
  sourceRunId: text('source_run_id'),
  sourceResultId: text('source_result_id'),
  providerId: text('provider_id'),
  modelId: text('model_id'),
  prompt: text('prompt'),
  generationConfigJson: text('generation_config_json'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
}, (table) => [
  index('idx_resources_workspace').on(table.workspaceId, table.updatedAt),
  index('idx_resources_kind').on(table.workspaceId, table.kind),
])

export const resourceBindings = sqliteTable('resource_bindings', {
  id: text('id').primaryKey(),
  resourceId: text('resource_id').notNull().references(() => resources.id, { onDelete: 'cascade' }),
  workflowId: text('workflow_id').notNull(),
  nodeId: text('node_id'),
  runId: text('run_id'),
  resultId: text('result_id'),
  relation: text('relation').notNull(),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('idx_resource_bindings_resource').on(table.resourceId),
  index('idx_resource_bindings_node').on(table.workflowId, table.nodeId),
])

export const runs = sqliteTable('runs', {
  id: text('id').primaryKey(),
  workflowId: text('workflow_id').notNull(),
  nodeId: text('node_id').notNull(),
  status: text('status').notNull(),
  prompt: text('prompt').notNull(),
  kind: text('kind').notNull().default('text'),
  inputJson: text('input_json'),
  providerId: text('provider_id'),
  providerTaskId: text('provider_task_id'),
  providerResponseId: text('provider_response_id'),
  resultIdsJson: text('result_ids_json').notNull().default('[]'),
  resultJson: text('result_json'),
  traceJson: text('trace_json'),
  error: text('error'),
  errorCode: text('error_code'),
  errorRetryable: integer('error_retryable'),
  createdAt: integer('created_at').notNull().default(0),
  updatedAt: integer('updated_at').notNull().default(0),
  startedAt: integer('started_at').notNull(),
  heartbeatAt: integer('heartbeat_at').notNull(),
  finishedAt: integer('finished_at'),
}, (table) => [
  index('idx_runs_workflow_updated').on(table.workflowId, table.updatedAt),
  index('idx_runs_status').on(table.status),
])

export const nodeRunEvents = sqliteTable('node_run_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  runId: text('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  dataJson: text('data_json').notNull(),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('idx_node_run_events_run').on(table.runId, table.id),
])

export const workflowAppRuns = sqliteTable('workflow_app_runs', {
  id: text('id').primaryKey(),
  workflowId: text('workflow_id').notNull(),
  revision: integer('revision').notNull(),
  status: text('status').notNull(),
  dataJson: text('data_json').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  index('idx_workflow_app_runs_workflow').on(table.workflowId, table.updatedAt),
  index('idx_workflow_app_runs_status').on(table.status),
])

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
  runId: text('run_id'),
  inputJson: text('input_json'),
  modelId: text('model_id'),
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

export const chatSessions = sqliteTable('chat_sessions', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  workflowId: text('workflow_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const chatMessages = sqliteTable('chat_messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => chatSessions.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  role: text('role').notNull(),
  text: text('text').notNull(),
  status: text('status').notNull(),
  agentId: text('agent_id'),
  agentLabel: text('agent_label'),
  modelId: text('model_id'),
  error: text('error'),
  runJson: text('run_json'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  index('idx_chat_messages_session').on(table.sessionId, table.createdAt),
])
