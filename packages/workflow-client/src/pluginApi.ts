import type {
  ExecutionEvent,
  PluginCommandContribution,
  PluginDescriptor,
  PluginExecutionRecord,
} from '@red-video-flow/plugin-contract'
import { getWorkflowClientTransport, readJsonResponse } from './transport'

export type RegisteredPluginCommand = {
  pluginId: string
  contribution: PluginCommandContribution
}

export async function fetchPlugins() {
  const response = await getWorkflowClientTransport().request('/api/plugins')
  return readJsonResponse<{
    plugins: PluginDescriptor[]
    discoveryErrors: Array<{ path: string; message: string }>
  }>(response, '读取插件列表失败')
}

export async function fetchPlugin(pluginId: string) {
  const response = await getWorkflowClientTransport().request(`/api/plugins/${encodeURIComponent(pluginId)}`)
  return readJsonResponse<{ plugin: PluginDescriptor }>(response, '读取插件失败')
}

export async function reloadPlugin(pluginId: string) {
  const response = await getWorkflowClientTransport().request(
    `/api/plugins/${encodeURIComponent(pluginId)}/reload`,
    { method: 'POST' },
  )
  return readJsonResponse<{ plugin: PluginDescriptor }>(response, '重新加载插件失败')
}

export async function fetchPluginHealth(pluginId: string) {
  const response = await getWorkflowClientTransport().request(
    `/api/plugins/${encodeURIComponent(pluginId)}/health`,
  )
  return readJsonResponse<{ pluginId: string; health: unknown }>(response, '读取插件健康状态失败')
}

export async function fetchPluginCommands() {
  const response = await getWorkflowClientTransport().request('/api/commands')
  return readJsonResponse<{ commands: RegisteredPluginCommand[] }>(response, '读取插件命令失败')
}

export async function fetchPluginCommand(commandId: string) {
  const response = await getWorkflowClientTransport().request(`/api/commands/${encodeURIComponent(commandId)}`)
  return readJsonResponse<{ command: RegisteredPluginCommand }>(response, '读取插件命令失败')
}

export async function startPluginCommandExecution(
  commandId: string,
  input?: unknown,
  timeoutMs?: number,
) {
  const response = await getWorkflowClientTransport().request(
    `/api/commands/${encodeURIComponent(commandId)}/executions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input, timeoutMs }),
    },
  )
  return readJsonResponse<{ execution: PluginExecutionRecord }>(response, '启动插件命令失败')
}

export async function fetchPluginExecution(executionId: string) {
  const response = await getWorkflowClientTransport().request(
    `/api/executions/${encodeURIComponent(executionId)}`,
  )
  return readJsonResponse<{ execution: PluginExecutionRecord }>(response, '读取插件执行失败')
}

export async function cancelPluginExecution(executionId: string) {
  const response = await getWorkflowClientTransport().request(
    `/api/executions/${encodeURIComponent(executionId)}/cancel`,
    { method: 'POST' },
  )
  return readJsonResponse<{ execution: PluginExecutionRecord }>(response, '取消插件执行失败')
}

export async function followPluginExecution(
  executionId: string,
  onEvent: (event: ExecutionEvent) => void,
  options: { afterSequence?: number; signal?: AbortSignal } = {},
) {
  const suffix = options.afterSequence ? `?after=${options.afterSequence}` : ''
  const response = await getWorkflowClientTransport().request(
    `/api/executions/${encodeURIComponent(executionId)}/events${suffix}`,
    { signal: options.signal },
  )
  if (!response.ok) {
    const error = await response.json().catch(() => undefined)
    throw new Error(error?.error ?? '订阅插件执行失败')
  }
  if (!response.body) throw new Error('当前环境不支持流式读取插件事件')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''
    for (const rawEvent of events) {
      const dataLine = rawEvent.split('\n').find((line) => line.startsWith('data: '))
      if (!dataLine) continue
      onEvent(JSON.parse(dataLine.slice(6)) as ExecutionEvent)
    }
  }
}
