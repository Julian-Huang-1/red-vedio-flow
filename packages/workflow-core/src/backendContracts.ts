import type {
  AssetReference,
  NodeResult,
  NodeRunInput,
  NodeRunTrace,
} from './generationTypes'

export type AuthenticatedUser = {
  ssoId: string
  username: string
  email: string
}

export type AppUser = AuthenticatedUser & {
  id: string
  createdAt: number
  updatedAt: number
}

export interface UserRepository {
  upsertFromSso(user: AuthenticatedUser): Promise<AppUser>
  getById(id: string): Promise<AppUser | undefined>
}

export type ModelCredentialStatus = {
  configured: boolean
  maskedToken?: string
  updatedAt?: number
}

export interface CredentialStore {
  getStatus(userId: string): Promise<ModelCredentialStatus>
  getModelToken(userId: string): Promise<string | undefined>
  setModelToken(userId: string, token: string): Promise<ModelCredentialStatus>
  deleteModelToken(userId: string): Promise<void>
}

export type ProviderModality = 'text' | 'image' | 'video'

export type ProviderNetworkRequest = NonNullable<NodeRunTrace['networkRequests']>[number]

export type ProviderExecutionContext = {
  runId: string
  workflowId: string
  nodeId: string
  userId: string
  token: string
  providerTaskId?: string
  beforeSubmit?: () => Promise<void>
  signal: AbortSignal
  emit: (event: ProviderExecutionEvent) => Promise<void> | void
  trace: {
    recordProviderInput(input: unknown): Promise<void>
    recordNetworkRequest(request: ProviderNetworkRequest): Promise<void>
    recordResponse(response: unknown): Promise<void>
  }
  blobs?: BlobStorage
}

export type ProviderExecutionEvent =
  | { type: 'text-delta'; delta: string }
  | { type: 'provider-task'; taskId: string }
  | { type: 'progress'; progress?: number; text?: string }

export type ProviderExecutionResult = {
  results: NodeResult[]
  providerTaskId?: string
  providerResponseId?: string
  raw?: unknown
}

export interface Provider {
  id: string
  modality: ProviderModality
  execute(input: NodeRunInput, context: ProviderExecutionContext): Promise<ProviderExecutionResult>
  cancel?(taskId: string, context: ProviderExecutionContext): Promise<void>
}

export interface ProviderRegistry {
  register(provider: Provider): void
  get(providerId: string): Provider
  list(): Array<Pick<Provider, 'id' | 'modality'>>
}

export type QueueJobType =
  | 'execute-node'
  | 'cancel-node'
  | 'poll-provider-task'
  | 'schedule-workflow'

export type QueueJob = {
  id: string
  type: QueueJobType
  payload: Record<string, unknown>
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  priority: number
  attempts: number
  maxAttempts: number
  runAt: number
  lockedBy?: string
  lockedAt?: number
  leaseExpiresAt?: number
  lastError?: string
  createdAt: number
  updatedAt: number
}

export interface JobQueue {
  enqueue(
    job: Pick<QueueJob, 'type' | 'payload'> &
      Partial<Pick<QueueJob, 'id' | 'priority' | 'maxAttempts' | 'runAt'>>,
  ): Promise<QueueJob>
  claim(workerId: string, leaseMs: number): Promise<QueueJob | undefined>
  heartbeat(jobId: string, workerId: string, leaseMs: number): Promise<boolean>
  complete(jobId: string, workerId: string): Promise<void>
  fail(jobId: string, workerId: string, error: string, retryAt?: number): Promise<void>
  recoverExpired(now?: number): Promise<number>
  waitForWork(signal: AbortSignal): Promise<void>
}

export type StoredBlob = {
  id: string
  fileName: string
  contentType?: string
  size: number
  sha256?: string
  createdAt: number
}

export type BlobReadRange = {
  start: number
  end: number
}

export interface BlobStorage {
  put(input: {
    ownerId: string
    fileName: string
    contentType?: string
    body: AsyncIterable<Uint8Array>
    size?: number
  }): Promise<StoredBlob>
  stat(id: string): Promise<StoredBlob | undefined>
  statForOwner(id: string, ownerId: string): Promise<StoredBlob | undefined>
  read(id: string, range?: BlobReadRange): Promise<AsyncIterable<Uint8Array>>
  readForOwner(
    id: string,
    ownerId: string,
    range?: BlobReadRange,
  ): Promise<AsyncIterable<Uint8Array>>
  delete(id: string): Promise<void>
  toAssetReference(blob: StoredBlob, kind: AssetReference['kind']): AssetReference
}
