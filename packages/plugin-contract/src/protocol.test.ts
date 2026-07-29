import { describe, expect, it } from 'vitest'
import { isJsonRpcResponse, parseJsonRpcLine } from './protocol'

describe('plugin JSON-RPC protocol', () => {
  it('accepts valid success and error responses', () => {
    expect(isJsonRpcResponse({
      jsonrpc: '2.0',
      id: 'request-1',
      result: { ok: true },
    })).toBe(true)
    expect(isJsonRpcResponse({
      jsonrpc: '2.0',
      id: 'request-2',
      error: { code: 'FAILED', message: 'failed' },
    })).toBe(true)
  })

  it('rejects malformed errors and mutually exclusive result/error payloads', () => {
    expect(isJsonRpcResponse({
      jsonrpc: '2.0',
      id: 'request-1',
      error: { code: 500 },
    })).toBe(false)
    expect(() => parseJsonRpcLine(JSON.stringify({
      jsonrpc: '2.0',
      id: 'request-2',
      result: null,
      error: { code: 'FAILED', message: 'failed' },
    }))).toThrow('invalid JSON-RPC')
  })
})
