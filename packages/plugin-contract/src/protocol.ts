export const JSON_RPC_VERSION = '2.0' as const

export type JsonRpcId = string | number

export type JsonRpcRequest = {
  jsonrpc: typeof JSON_RPC_VERSION
  id: JsonRpcId
  method: string
  params?: unknown
}

export type JsonRpcNotification = {
  jsonrpc: typeof JSON_RPC_VERSION
  method: string
  params?: unknown
}

export type JsonRpcErrorData = {
  code: string
  message: string
  retryable?: boolean
  details?: unknown
}

export type JsonRpcSuccessResponse = {
  jsonrpc: typeof JSON_RPC_VERSION
  id: JsonRpcId
  result: unknown
}

export type JsonRpcErrorResponse = {
  jsonrpc: typeof JSON_RPC_VERSION
  id: JsonRpcId
  error: JsonRpcErrorData
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse
export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse

export function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (!isRecord(value) || value.jsonrpc !== JSON_RPC_VERSION || typeof value.method !== 'string') return false
  return typeof value.id === 'string' || typeof value.id === 'number'
}

export function isJsonRpcNotification(value: unknown): value is JsonRpcNotification {
  return isRecord(value)
    && value.jsonrpc === JSON_RPC_VERSION
    && typeof value.method === 'string'
    && value.id === undefined
}

export function isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
  if (!isRecord(value) || value.jsonrpc !== JSON_RPC_VERSION) return false
  if (typeof value.id !== 'string' && typeof value.id !== 'number') return false
  if ('result' in value) return !('error' in value)
  return 'error' in value
    && isRecord(value.error)
    && typeof value.error.code === 'string'
    && typeof value.error.message === 'string'
}

export function parseJsonRpcLine(line: string): JsonRpcMessage {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    throw new Error('plugin protocol emitted invalid JSON')
  }
  if (isJsonRpcRequest(value) || isJsonRpcNotification(value) || isJsonRpcResponse(value)) return value
  throw new Error('plugin protocol emitted an invalid JSON-RPC message')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
