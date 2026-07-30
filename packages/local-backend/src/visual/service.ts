export type VisualEvent =
  | { type: 'start'; modelId: string; bin: string; argv: string[] }
  | { type: 'stdout'; text: string }
  | { type: 'stderr'; text: string }
  | { type: 'meta'; submitId: string }
  | { type: 'progress'; progress?: number; text?: string }
  | { type: 'partial-image'; index: number; base64: string; mimeType?: string }

export type VisualRunAsset = {
  url?: string
  localPath?: string
  fileName?: string
  mimeType?: string
  role?: 'output' | 'last_frame' | 'preview'
}

export type VisualRunResult = {
  submitId?: string
  taskStatus?: VisualTaskStatus
  genStatus?: string
  failReason?: string
  url?: string
  localPath?: string
  fileName?: string
  mimeType?: string
  text?: string
  assets?: VisualRunAsset[]
  metadata?: Record<string, unknown>
}

export type VisualTaskStatus = 'querying' | 'success' | 'failed' | 'unknown'

export type InvokeVisualModelInput = {
  executionId?: string
  idempotencyKey?: string
  modelId: string
  nodeKind: string
  prompt: string
  upstream?: unknown[]
  providerOptions?: Record<string, unknown>
  downloadDir: string
  assetUrlForPath: (filePath: string) => string
  onEvent?: (event: VisualEvent) => void
}

export type QueryVisualTaskInput = {
  executionId?: string
  providerId?: string
  submitId: string
  nodeKind?: string
  downloadDir: string
  assetUrlForPath: (filePath: string) => string
  onEvent?: (event: VisualEvent) => void
}

export interface VisualServiceContract {
  listModels(): {
    models: unknown[]
    installedCount: number
    invokableCount: number
  }
  invoke(input: InvokeVisualModelInput): Promise<VisualRunResult>
  query(input: QueryVisualTaskInput): Promise<VisualRunResult>
}

export class UnavailableVisualService implements VisualServiceContract {
  listModels() {
    return { models: [], installedCount: 0, invokableCount: 0 }
  }

  async invoke(_input: InvokeVisualModelInput): Promise<VisualRunResult> {
    throw new Error('No visual provider is configured.')
  }

  async query(_input: QueryVisualTaskInput): Promise<VisualRunResult> {
    throw new Error('No visual provider is configured.')
  }
}
