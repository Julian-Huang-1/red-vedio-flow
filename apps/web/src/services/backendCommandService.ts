import {
  cancelPluginExecution,
  fetchPluginExecution,
  followPluginExecution,
  startPluginCommandExecution,
} from '@red-video-flow/workflow-client'

export type BackendExecution = Awaited<
  ReturnType<typeof startPluginCommandExecution>
>['execution']

export type BackendExecutionEvent = Parameters<
  Parameters<typeof followPluginExecution>[1]
>[0]

export type ExecuteBackendCommandOptions = {
  timeoutMs?: number
  signal?: AbortSignal
  onStarted?: (execution: BackendExecution) => void
  onEvent?: (event: BackendExecutionEvent) => void
}

const failedStatuses = new Set([
  'failed',
  'cancelled',
  'timed_out',
  'interrupted',
])

export class BackendCommandExecutionError extends Error {
  readonly execution: BackendExecution

  constructor(execution: BackendExecution) {
    super(execution.errorMessage ?? `插件命令执行失败：${execution.status}`)
    this.name = 'BackendCommandExecutionError'
    this.execution = execution
  }
}

export async function executeBackendCommand(
  commandId: string,
  input?: unknown,
  options: ExecuteBackendCommandOptions = {},
) {
  const { execution } = await startPluginCommandExecution(commandId, input, options.timeoutMs)
  options.onStarted?.(execution)

  await followPluginExecution(execution.id, (event) => options.onEvent?.(event), {
    signal: options.signal,
  })

  const { execution: completedExecution } = await fetchPluginExecution(execution.id)
  if (failedStatuses.has(completedExecution.status)) {
    throw new BackendCommandExecutionError(completedExecution)
  }
  return completedExecution
}

export async function cancelBackendCommand(executionId: string) {
  return (await cancelPluginExecution(executionId)).execution
}
