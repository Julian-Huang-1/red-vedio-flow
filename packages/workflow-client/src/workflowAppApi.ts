import type {
  GeneratedWorkflowModule,
  MaterialValue,
  WorkflowContract,
} from '@red-video-flow/workflow-core'
import { getWorkflowClientTransport, readJsonResponse } from './transport'

export type WorkflowAppRun = {
  id: string
  workflowId: string
  revision: number
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  inputs: Record<string, unknown>
  nodeStates: Record<string, {
    status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'skipped'
    resultIds: string[]
    startedAt?: number
    finishedAt?: number
    error?: string
  }>
  outputs?: Record<string, MaterialValue>
  error?: string
  events: Array<{
    id: number
    type: string
    nodeId?: string
    message?: string
    createdAt: number
  }>
  createdAt: number
  updatedAt: number
}

export async function fetchWorkflowContract(workflowId: string) {
  const response = await getWorkflowClientTransport().request(
    `/api/workflows/${encodeURIComponent(workflowId)}/contract`,
  )
  return readJsonResponse<{ contract: WorkflowContract }>(response, '无法读取 Workflow 契约')
}

export async function createWorkflowAppRun(
  workflowId: string,
  inputs: Record<string, unknown>,
  revision?: number,
) {
  const response = await getWorkflowClientTransport().request(
    `/api/workflows/${encodeURIComponent(workflowId)}/runs`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs, revision }),
    },
  )
  return readJsonResponse<{ run: WorkflowAppRun }>(response, '无法启动 Workflow')
}

export async function fetchWorkflowAppRun(runId: string) {
  const response = await getWorkflowClientTransport().request(
    `/api/workflow-runs/${encodeURIComponent(runId)}`,
  )
  return readJsonResponse<{ run: WorkflowAppRun }>(response, '无法查询 Workflow 运行状态')
}

export async function fetchWorkflowAppRuns(workflowId: string) {
  const response = await getWorkflowClientTransport().request(
    `/api/workflows/${encodeURIComponent(workflowId)}/runs`,
  )
  return readJsonResponse<{ runs: WorkflowAppRun[] }>(response, '无法查询 Workflow 运行记录')
}

export async function cancelWorkflowAppRun(runId: string) {
  const response = await getWorkflowClientTransport().request(
    `/api/workflow-runs/${encodeURIComponent(runId)}/cancel`,
    { method: 'POST' },
  )
  return readJsonResponse<{ run: WorkflowAppRun }>(response, '无法取消 Workflow')
}

export async function fetchGeneratedWorkflowModule(
  workflowId: string,
  language: 'js' | 'ts' = 'ts',
) {
  const response = await getWorkflowClientTransport().request(
    `/api/workflows/${encodeURIComponent(workflowId)}/code?language=${language}`,
  )
  return readJsonResponse<GeneratedWorkflowModule>(response, '无法生成 Workflow 代码')
}
