import { createInterface } from 'node:readline'
import {
  JSON_RPC_VERSION,
  type ExecutionEvent,
  type JsonRpcErrorData,
  type JsonRpcRequest,
  isJsonRpcRequest,
} from '@red-video-flow/plugin-contract'

export type PluginMethodContext = {
  emitExecutionEvent(event: Omit<ExecutionEvent, 'sequence' | 'timestamp'>): void
}

export type PluginImplementation = {
  methods: Record<string, (params: unknown, context: PluginMethodContext) => unknown | Promise<unknown>>
}

export function definePlugin(implementation: PluginImplementation) {
  return implementation
}

export function runPlugin(implementation: PluginImplementation) {
  let sequence = 0
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
  const write = (value: unknown) => process.stdout.write(`${JSON.stringify(value)}\n`)
  const context: PluginMethodContext = {
    emitExecutionEvent(event) {
      write({
        jsonrpc: JSON_RPC_VERSION,
        method: 'execution.event',
        params: {
          ...event,
          sequence: ++sequence,
          timestamp: Date.now(),
        },
      })
    },
  }

  lines.on('line', (line) => {
    void handleLine(line, implementation, context, write)
  })
}

async function handleLine(
  line: string,
  implementation: PluginImplementation,
  context: PluginMethodContext,
  write: (value: unknown) => void,
) {
  let request: JsonRpcRequest
  try {
    const value: unknown = JSON.parse(line)
    if (!isJsonRpcRequest(value)) throw new Error('invalid JSON-RPC request')
    request = value
  } catch (error) {
    process.stderr.write(`[plugin-sdk] ${error instanceof Error ? error.message : String(error)}\n`)
    return
  }

  const method = implementation.methods[request.method]
  if (!method) {
    write({
      jsonrpc: JSON_RPC_VERSION,
      id: request.id,
      error: {
        code: 'METHOD_NOT_FOUND',
        message: `Unknown plugin method: ${request.method}`,
        retryable: false,
      } satisfies JsonRpcErrorData,
    })
    return
  }

  try {
    const result = await method(request.params, context)
    write({ jsonrpc: JSON_RPC_VERSION, id: request.id, result: result ?? null })
  } catch (error) {
    const pluginError = normalizeError(error)
    write({ jsonrpc: JSON_RPC_VERSION, id: request.id, error: pluginError })
  }
}

function normalizeError(error: unknown): JsonRpcErrorData {
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    return {
      code: String(error.code),
      message: String(error.message),
      retryable: 'retryable' in error ? Boolean(error.retryable) : undefined,
    }
  }
  return {
    code: 'PLUGIN_ERROR',
    message: error instanceof Error ? error.message : String(error),
    retryable: false,
  }
}
