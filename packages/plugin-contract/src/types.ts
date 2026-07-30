export const PLUGIN_API_VERSION = '1'

export type JsonSchema = Record<string, unknown>
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

export type PluginBackendManifest = {
  runtime: 'process'
  command: string
  args?: string[]
  cwd?: string
}

export type PluginCommandContribution = {
  id: string
  title: string
  description?: string
  inputSchema?: JsonSchema
  outputSchema?: JsonSchema
}

export type VisualCapability =
  | 'text-to-image'
  | 'image-to-image'
  | 'text-to-video'
  | 'image-to-video'
  | 'frames-to-video'
  | 'image-upscale'

export type PluginVisualProviderContribution = {
  id: string
  title: string
  vendor?: string
  capabilities: VisualCapability[]
  optionsSchema?: JsonSchema
}

export type PluginAgentProviderContribution = {
  id: string
  title: string
  vendor?: string
  models?: Array<{ id: string; label: string }>
}

export type PluginNodeExecutorContribution = {
  id: string
  nodeTypes: string[]
  inputSchema?: JsonSchema
  outputSchema?: JsonSchema
}

export type PluginBackgroundWorkerContribution = {
  id: string
  autoStart?: boolean
}

export type PluginContributions = {
  commands?: PluginCommandContribution[]
  visualProviders?: PluginVisualProviderContribution[]
  agentProviders?: PluginAgentProviderContribution[]
  nodeExecutors?: PluginNodeExecutorContribution[]
  backgroundWorkers?: PluginBackgroundWorkerContribution[]
}

export type PluginManifest = {
  id: string
  name: string
  version: string
  apiVersion: string
  backend: PluginBackendManifest
  activationEvents?: Array<'onStartup'>
  contributes?: PluginContributions
  secrets?: Record<string, string>
}

export type SanitizedPluginManifest = Omit<PluginManifest, 'secrets'> & {
  secretsConfigured?: Record<string, true>
}

export type PluginStatus = 'discovered' | 'starting' | 'active' | 'stopping' | 'inactive' | 'failed'

export type PluginDescriptor = {
  manifest: SanitizedPluginManifest
  status: PluginStatus
  error?: string
}

export type PluginAsset = {
  remoteUrl?: string
  localPath?: string
  base64?: string
  fileName?: string
  mimeType?: string
  role?: 'output' | 'last_frame' | 'preview'
}

export type VisualSubmitInput = {
  executionId: string
  capability: VisualCapability
  prompt: string
  inputs?: PluginAsset[]
  options?: Record<string, unknown>
  idempotencyKey: string
}

export type VisualSubmitResult =
  | { status: 'completed'; assets: PluginAsset[]; text?: string; metadata?: Record<string, JsonValue> }
  | { status: 'pending'; externalTaskId: string; nextPollAfterMs?: number; text?: string }

export type VisualQueryInput = {
  executionId: string
  externalTaskId: string
}

export type VisualQueryResult =
  | { status: 'pending'; progress?: number; text?: string }
  | { status: 'succeeded'; assets: PluginAsset[]; text?: string; metadata?: Record<string, JsonValue> }
  | { status: 'failed'; code: string; message: string; retryable?: boolean }

export type AgentExecutionInput = {
  executionId: string
  agentId: string
  prompt: string
  model?: string
  cwd?: string
  context?: {
    workflowId?: string
    nodeId?: string
    baseRevision?: number
    baseUrl?: string
    rvfCommand?: string
  }
}

export type AgentExecutionResult = {
  exitCode: number | null
  output: string
}

export type ExecutionEventType =
  | 'started'
  | 'delta'
  | 'stderr'
  | 'progress'
  | 'submitted'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type ExecutionEvent = {
  executionId: string
  sequence: number
  timestamp: number
  type: ExecutionEventType
  data?: unknown
}

export type PluginExecutionKind = 'command' | 'visual' | 'agent' | 'node'
export type PluginExecutionStatus =
  | 'queued'
  | 'running'
  | 'waiting_provider'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'timed_out'
  | 'interrupted'

export type PluginExecutionRecord = {
  id: string
  pluginId: string
  contributionId: string
  kind: PluginExecutionKind
  status: PluginExecutionStatus
  input?: unknown
  result?: unknown
  errorCode?: string
  errorMessage?: string
  createdAt: number
  updatedAt: number
  startedAt?: number
  finishedAt?: number
}
