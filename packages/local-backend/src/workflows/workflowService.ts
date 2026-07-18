import type { MaterialNode, WorkflowDocument, WorkflowEdge } from '@red-video-flow/workflow-core'
import type { WorkflowRepository } from './workflowRepository.js'

export type SaveWorkflowInput = {
  id: string
  title?: string
  graph: {
    nodes: MaterialNode[]
    edges: WorkflowEdge[]
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
      createdAt: now,
      updatedAt: now,
      graph: input.graph ?? { nodes: [], edges: [] },
    }
    return this.repository.save(document)
  }

  save(input: SaveWorkflowInput) {
    const existing = this.repository.get(input.id)
    const now = Date.now()
    const document: WorkflowDocument = {
      schemaVersion: 1,
      id: input.id,
      title: input.title ?? existing?.title ?? '未命名工作流',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      graph: input.graph,
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
