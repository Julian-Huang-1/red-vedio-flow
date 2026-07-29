import { create } from 'zustand'
import {
  cancelBackendCommand,
  executeBackendCommand,
  type BackendExecution,
  type BackendExecutionEvent,
  type ExecuteBackendCommandOptions,
} from '../services/backendCommandService'

export type FrontendExecution = {
  commandId: string
  execution: BackendExecution
  events: BackendExecutionEvent[]
}

type RunCommandOptions = Pick<ExecuteBackendCommandOptions, 'timeoutMs'>

type ExecutionState = {
  executions: Record<string, FrontendExecution>
  run: (
    commandId: string,
    input?: unknown,
    options?: RunCommandOptions,
  ) => Promise<BackendExecution>
  cancel: (executionId: string) => Promise<void>
  clear: (executionId: string) => void
}

const abortControllers = new Map<string, AbortController>()

export const useExecutionStore = create<ExecutionState>((set, get) => ({
  executions: {},

  run: async (commandId, input, options = {}) => {
    let executionId: string | undefined
    const controller = new AbortController()

    try {
      const execution = await executeBackendCommand(commandId, input, {
        timeoutMs: options.timeoutMs,
        signal: controller.signal,
        onStarted: (startedExecution) => {
          executionId = startedExecution.id
          abortControllers.set(startedExecution.id, controller)
          set((state) => ({
            executions: {
              ...state.executions,
              [startedExecution.id]: {
                commandId,
                execution: startedExecution,
                events: [],
              },
            },
          }))
        },
        onEvent: (event) => {
          set((state) => {
            const current = state.executions[event.executionId]
            if (!current) return state
            return {
              executions: {
                ...state.executions,
                [event.executionId]: {
                  ...current,
                  events: [...current.events, event],
                },
              },
            }
          })
        },
      })

      set((state) => {
        const current = state.executions[execution.id]
        if (!current) return state
        return {
          executions: {
            ...state.executions,
            [execution.id]: { ...current, execution },
          },
        }
      })
      return execution
    } catch (error) {
      if (executionId) {
        const current = get().executions[executionId]
        if (current && error instanceof Error) {
          set((state) => ({
            executions: {
              ...state.executions,
              [executionId as string]: {
                ...current,
                execution: {
                  ...current.execution,
                  status: current.execution.status === 'cancelled'
                    ? 'cancelled'
                    : 'failed',
                  errorMessage: error.message,
                  updatedAt: Date.now(),
                },
              },
            },
          }))
        }
      }
      throw error
    } finally {
      if (executionId) abortControllers.delete(executionId)
    }
  },

  cancel: async (executionId) => {
    abortControllers.get(executionId)?.abort()
    const execution = await cancelBackendCommand(executionId)
    set((state) => {
      const current = state.executions[executionId]
      if (!current) return state
      return {
        executions: {
          ...state.executions,
          [executionId]: { ...current, execution },
        },
      }
    })
  },

  clear: (executionId) =>
    set((state) => {
      const executions = { ...state.executions }
      delete executions[executionId]
      return { executions }
    }),
}))
