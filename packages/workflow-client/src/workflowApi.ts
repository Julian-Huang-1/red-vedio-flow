import type { WorkflowDocument } from '@red-video-flow/workflow-core'
import { getWorkflowClientTransport, readJsonResponse } from './transport'

export type WorkflowListResponse = {
  workflows: WorkflowDocument[]
}

export async function fetchWorkflows() {
  const response = await getWorkflowClientTransport().request('/api/workflows')
  return readJsonResponse<WorkflowListResponse>(response, '读取工作流列表失败')
}

export async function fetchWorkflow(id = 'default') {
  const response = await getWorkflowClientTransport().request(`/api/workflows/${encodeURIComponent(id)}`)
  return readJsonResponse<WorkflowDocument>(response, '读取工作流失败')
}

export async function createWorkflow(input: Partial<WorkflowDocument> = {}) {
  const response = await getWorkflowClientTransport().request('/api/workflows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return readJsonResponse<WorkflowDocument>(response, '创建工作流失败')
}

export async function saveWorkflow(document: Pick<WorkflowDocument, 'id' | 'title' | 'graph'>) {
  const response = await getWorkflowClientTransport().request(`/api/workflows/${encodeURIComponent(document.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(document),
  })
  return readJsonResponse<WorkflowDocument>(response, '保存工作流失败')
}

export async function deleteWorkflow(id: string) {
  const response = await getWorkflowClientTransport().request(`/api/workflows/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  return readJsonResponse<{ ok: true }>(response, '删除工作流失败')
}
