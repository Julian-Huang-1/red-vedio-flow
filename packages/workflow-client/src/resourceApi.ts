import type {
  Resource,
  ResourceBinding,
  ResourceKind,
  ResourceRelation,
  ResourceSource,
} from '@red-video-flow/workflow-core'
import { getWorkflowClientTransport, readJsonResponse } from './transport'

export async function fetchResources(input: {
  workspaceId?: string
  kind?: ResourceKind
  source?: ResourceSource
  query?: string
}) {
  const params = new URLSearchParams()
  if (input.workspaceId) params.set('workspaceId', input.workspaceId)
  if (input.kind) params.set('kind', input.kind)
  if (input.source) params.set('source', input.source)
  if (input.query) params.set('q', input.query)
  const response = await getWorkflowClientTransport().request(`/api/resources?${params}`)
  return readJsonResponse<{ resources: Resource[] }>(response, '读取资源列表失败')
}

export async function createTextResource(input: {
  workspaceId: string
  name: string
  text: string
}) {
  const response = await getWorkflowClientTransport().request('/api/resources/text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return readJsonResponse<{ resource: Resource }>(response, '创建文本资源失败')
}

export async function createWorkflowResource(input: {
  workspaceId: string
  name: string
  manifest: Record<string, unknown>
}) {
  const response = await getWorkflowClientTransport().request('/api/resources/workflow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return readJsonResponse<{ resource: Resource }>(response, '发布子图能力失败')
}

export async function renameResource(input: { resourceId: string; name: string }) {
  const response = await getWorkflowClientTransport().request(
    `/api/resources/${encodeURIComponent(input.resourceId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: input.name }),
    },
  )
  return readJsonResponse<{ resource: Resource }>(response, '重命名资源失败')
}

export async function deleteResource(resourceId: string) {
  const response = await getWorkflowClientTransport().request(
    `/api/resources/${encodeURIComponent(resourceId)}`,
    { method: 'DELETE' },
  )
  return readJsonResponse<{ ok: true }>(response, '删除资源失败')
}

export async function fetchResourceUsages(resourceId: string) {
  const response = await getWorkflowClientTransport().request(
    `/api/resources/${encodeURIComponent(resourceId)}/usages`,
  )
  return readJsonResponse<{ bindings: ResourceBinding[] }>(response, '读取资源引用失败')
}

export async function createResourceBinding(input: {
  resourceId: string
  workflowId: string
  nodeId?: string
  runId?: string
  resultId?: string
  relation: ResourceRelation
}) {
  const response = await getWorkflowClientTransport().request(
    `/api/resources/${encodeURIComponent(input.resourceId)}/bindings`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  )
  return readJsonResponse<{ binding: ResourceBinding }>(response, '绑定资源失败')
}
