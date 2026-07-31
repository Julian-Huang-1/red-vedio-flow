import { isDeepStrictEqual } from 'node:util'
import {
  WorkflowPatchError,
  applyWorkflowPatch,
  type MaterialNode,
  type WorkflowDocument,
  type WorkflowEdge,
  type WorkflowPatchOperation,
} from '@red-video-flow/workflow-core'
import {
  PostgresWorkflowConflictError,
  PostgresWorkflowRepository,
} from './workflowRepository.js'

export type PostgresSaveWorkflowInput = {
  id: string
  title?: string
  baseRevision?: number
  graph: {
    nodes: MaterialNode[]
    edges: WorkflowEdge[]
  }
}

export type PostgresPatchWorkflowInput = {
  id: string
  baseRevision: number
  ops: WorkflowPatchOperation[]
}

export class PostgresWorkflowService {
  constructor(private readonly repository: PostgresWorkflowRepository) {}

  list() {
    return this.repository.list()
  }

  get(id: string) {
    return this.repository.get(id)
  }

  async create(input: Partial<PostgresSaveWorkflowInput> = {}) {
    const now = Date.now()
    return this.repository.save({
      schemaVersion: 1,
      id: input.id ?? createId('workflow'),
      title: input.title ?? '未命名工作流',
      revision: 1,
      createdAt: now,
      updatedAt: now,
      graph: input.graph ?? { nodes: [], edges: [] },
    })
  }

  async save(input: PostgresSaveWorkflowInput) {
    const existing = await this.repository.get(input.id)
    if (existing && input.baseRevision !== undefined) {
      assertRevision(input.baseRevision, existing.revision)
    }
    const title = input.title ?? existing?.title ?? '未命名工作流'
    if (existing && title === existing.title && isDeepStrictEqual(input.graph, existing.graph)) {
      return existing
    }
    const now = Date.now()
    const document: WorkflowDocument = {
      schemaVersion: 1,
      id: input.id,
      title,
      revision: existing ? nextRevision(existing.revision) : 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      graph: input.graph,
    }
    try {
      return await this.repository.save(document, existing?.revision)
    } catch (error) {
      throw await normalizeConflict(this.repository, input.id, error)
    }
  }

  async patch(input: PostgresPatchWorkflowInput) {
    const existing = await this.repository.get(input.id)
    if (!existing) throw new WorkflowPatchError(`workflow not found: ${input.id}`)
    assertRevision(input.baseRevision, existing.revision)
    const document: WorkflowDocument = {
      ...applyWorkflowPatch(existing, input.ops),
      revision: nextRevision(existing.revision),
      updatedAt: Date.now(),
    }
    try {
      return await this.repository.save(document, existing.revision)
    } catch (error) {
      throw await normalizeConflict(this.repository, input.id, error)
    }
  }

  delete(id: string) {
    return this.repository.delete(id)
  }
}

export class PostgresWorkflowServiceConflictError extends Error {
  constructor(
    message: string,
    readonly currentRevision: number,
  ) {
    super(message)
    this.name = 'PostgresWorkflowServiceConflictError'
  }
}

async function normalizeConflict(
  repository: PostgresWorkflowRepository,
  id: string,
  error: unknown,
) {
  if (!(error instanceof PostgresWorkflowConflictError)) return error
  const current = await repository.get(id)
  return new PostgresWorkflowServiceConflictError(
    `workflow revision conflict: current ${current?.revision ?? 0}, base ${error.expectedRevision}`,
    current?.revision ?? 0,
  )
}

function assertRevision(baseRevision: number, currentRevision: number) {
  if (baseRevision !== currentRevision) {
    throw new PostgresWorkflowServiceConflictError(
      `workflow revision conflict: current ${currentRevision}, base ${baseRevision}`,
      currentRevision,
    )
  }
}

function nextRevision(revision: number) {
  if (revision >= Number.MAX_SAFE_INTEGER) {
    throw new WorkflowPatchError('workflow revision reached max safe integer')
  }
  return revision + 1
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 10000)}`
}
