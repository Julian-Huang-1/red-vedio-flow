import {
  WorkflowPatchError,
  applyWorkflowPatch,
  type MaterialNode,
  type WorkflowDocument,
  type WorkflowEdge,
  type WorkflowPatchOperation,
} from '@red-video-flow/workflow-core'
import type { WorkflowRepository } from './workflowRepository.js'

export type SaveWorkflowInput = {
  id: string
  title?: string
  baseRevision?: number
  graph: {
    nodes: MaterialNode[]
    edges: WorkflowEdge[]
  }
}

export type PatchWorkflowInput = {
  id: string
  baseRevision: number
  ops: WorkflowPatchOperation[]
}

export class WorkflowConflictError extends Error {
  constructor(
    message: string,
    readonly currentRevision: number,
  ) {
    super(message)
    this.name = 'WorkflowConflictError'
  }
}

export class WorkflowService {
  constructor(private readonly repository: WorkflowRepository) {}

  list() {
    return this.repository.list()
  }

  get(id: string) {
    return this.repository.get(id)
  }

  create(input: Partial<SaveWorkflowInput> = {}) {
    const now = Date.now()
    const document: WorkflowDocument = {
      schemaVersion: 1,
      id: input.id ?? createId('workflow'),
      title: input.title ?? '未命名工作流',
      revision: 1,
      createdAt: now,
      updatedAt: now,
      graph: input.graph ?? { nodes: [], edges: [] },
    }
    return this.repository.save(document)
  }

  save(input: SaveWorkflowInput) {
    const existing = this.repository.get(input.id)
    if (existing && input.baseRevision !== undefined) {
      assertRevision(input.baseRevision, existing.revision)
    }
    const now = Date.now()
    const document: WorkflowDocument = {
      schemaVersion: 1,
      id: input.id,
      title: input.title ?? existing?.title ?? '未命名工作流',
      revision: existing ? nextRevision(existing.revision) : 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      graph: input.graph,
    }
    return this.repository.save(document)
  }

  patch(input: PatchWorkflowInput) {
    const existing = this.repository.get(input.id)
    if (!existing) throw new WorkflowPatchError(`workflow not found: ${input.id}`)
    assertRevision(input.baseRevision, existing.revision)

    const now = Date.now()
    const patched = applyWorkflowPatch(existing, input.ops)
    const document: WorkflowDocument = {
      ...patched,
      revision: nextRevision(existing.revision),
      updatedAt: now,
    }
    return this.repository.save(document)
  }

  delete(id: string) {
    this.repository.delete(id)
  }

}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 10000)}`
}

function assertRevision(baseRevision: number, currentRevision: number) {
  if (baseRevision !== currentRevision) {
    throw new WorkflowConflictError(`workflow revision conflict: current ${currentRevision}, base ${baseRevision}`, currentRevision)
  }
}

function nextRevision(revision: number) {
  if (revision >= Number.MAX_SAFE_INTEGER) throw new WorkflowPatchError('workflow revision reached max safe integer')
  return revision + 1
}
