import type { MaterialValue, NodeStatus, WorkflowDocument, WorkflowPatchInput } from '@red-video-flow/workflow-core'
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

export async function saveWorkflow(document: Pick<WorkflowDocument, 'id' | 'title' | 'graph'> & { baseRevision?: number }) {
  const response = await getWorkflowClientTransport().request(`/api/workflows/${encodeURIComponent(document.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(document),
  })
  return readJsonResponse<WorkflowDocument>(response, '保存工作流失败')
}

export type PatchWorkflowResponse = {
  workflow: WorkflowDocument
  appliedOps: number
}

export type WorkflowRunStatus = 'running' | 'done' | 'error' | 'timeout'

export type WorkflowRun = {
  id: string
  workflowId: string
  nodeId: string
  status: WorkflowRunStatus
  prompt: string
  result?: unknown
  error?: string
  startedAt: number
  heartbeatAt: number
  finishedAt?: number
}

export type WorkflowRunResponse = {
  run: WorkflowRun
  workflow: WorkflowDocument
}

export async function patchWorkflow(id: string, patch: WorkflowPatchInput) {
  const response = await getWorkflowClientTransport().request(`/api/workflows/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  return readJsonResponse<PatchWorkflowResponse>(response, '更新工作流失败')
}

export async function startWorkflowNodeRun(input: {
  workflowId: string
  nodeId: string
  prompt: string
  baseRevision?: number
}) {
  const response = await getWorkflowClientTransport().request(
    `/api/workflows/${encodeURIComponent(input.workflowId)}/nodes/${encodeURIComponent(input.nodeId)}/runs`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: input.prompt, baseRevision: input.baseRevision }),
    },
  )
  return readJsonResponse<WorkflowRunResponse>(response, '启动节点运行失败')
}

export async function heartbeatWorkflowNodeRun(input: {
  workflowId: string
  nodeId: string
  runId: string
}) {
  const response = await getWorkflowClientTransport().request(
    `/api/workflows/${encodeURIComponent(input.workflowId)}/nodes/${encodeURIComponent(input.nodeId)}/runs/${encodeURIComponent(input.runId)}/heartbeat`,
    { method: 'POST' },
  )
  return readJsonResponse<{ run: WorkflowRun }>(response, '更新运行心跳失败')
}

export async function completeWorkflowNodeRun(input: {
  workflowId: string
  nodeId: string
  runId: string
  baseRevision?: number
  value?: MaterialValue
  status?: Extract<NodeStatus, 'done' | 'running'>
  message: string
}) {
  const response = await getWorkflowClientTransport().request(
    `/api/workflows/${encodeURIComponent(input.workflowId)}/nodes/${encodeURIComponent(input.nodeId)}/runs/${encodeURIComponent(input.runId)}/complete`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseRevision: input.baseRevision, value: input.value, status: input.status, message: input.message }),
    },
  )
  return readJsonResponse<WorkflowRunResponse>(response, '完成节点运行失败')
}

export async function failWorkflowNodeRun(input: {
  workflowId: string
  nodeId: string
  runId: string
  baseRevision?: number
  message: string
}) {
  const response = await getWorkflowClientTransport().request(
    `/api/workflows/${encodeURIComponent(input.workflowId)}/nodes/${encodeURIComponent(input.nodeId)}/runs/${encodeURIComponent(input.runId)}/fail`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseRevision: input.baseRevision, message: input.message }),
    },
  )
  return readJsonResponse<WorkflowRunResponse>(response, '标记节点运行失败')
}

export async function deleteWorkflow(id: string) {
  const response = await getWorkflowClientTransport().request(`/api/workflows/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  return readJsonResponse<{ ok: true }>(response, '删除工作流失败')
}
