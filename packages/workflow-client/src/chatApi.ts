import { getWorkflowClientTransport, readJsonResponse } from './transport'

export type ChatSession = {
  id: string
  title: string
  workflowId?: string
  createdAt: number
  updatedAt: number
}

export type PersistedChatMessage = {
  id: string
  sessionId?: string
  kind?: string
  role: 'user' | 'assistant'
  text: string
  status: 'pending' | 'streaming' | 'completed' | 'error'
  agentId?: string
  agentLabel?: string
  modelId?: string
  error?: string
  run?: unknown
  createdAt: number
  updatedAt: number
}

export async function fetchChatSessions(workflowId: string, query?: string) {
  const params = new URLSearchParams({ workflowId })
  if (query?.trim()) params.set('q', query.trim())
  const response = await getWorkflowClientTransport().request(`/api/chat-sessions?${params}`)
  return readJsonResponse<{ sessions: ChatSession[] }>(response, '读取历史对话失败')
}

export async function fetchChatSession(id: string) {
  const response = await getWorkflowClientTransport().request(`/api/chat-sessions/${encodeURIComponent(id)}`)
  return readJsonResponse<{ session: ChatSession; messages: PersistedChatMessage[] }>(
    response,
    '读取对话失败',
  )
}

export async function createChatSession(input: { title?: string; workflowId?: string } = {}) {
  const response = await getWorkflowClientTransport().request('/api/chat-sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return readJsonResponse<{ session: ChatSession }>(response, '创建对话失败')
}

export async function renameChatSession(id: string, title: string) {
  const response = await getWorkflowClientTransport().request(`/api/chat-sessions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  return readJsonResponse<{ session: ChatSession }>(response, '重命名对话失败')
}

export async function deleteChatSession(id: string) {
  const response = await getWorkflowClientTransport().request(`/api/chat-sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  return readJsonResponse<{ ok: boolean }>(response, '删除对话失败')
}

export async function saveChatMessage(sessionId: string, message: PersistedChatMessage) {
  const response = await getWorkflowClientTransport().request(
    `/api/chat-sessions/${encodeURIComponent(sessionId)}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    },
  )
  return readJsonResponse<{ message: PersistedChatMessage }>(response, '保存对话消息失败')
}
