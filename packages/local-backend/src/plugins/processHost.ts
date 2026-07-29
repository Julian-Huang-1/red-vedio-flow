import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { createInterface, type Interface as ReadlineInterface } from 'node:readline'
import { isAbsolute, resolve } from 'node:path'
import {
  JSON_RPC_VERSION,
  isJsonRpcNotification,
  isJsonRpcResponse,
  parseJsonRpcLine,
  redactPluginSecrets,
  redactPluginValue,
  type JsonRpcErrorData,
  type JsonRpcId,
  type PluginManifest,
} from '@red-video-flow/plugin-contract'

export type PluginProcessHostOptions = {
  requestTimeoutMs?: number
  shutdownGraceMs?: number
  onStderr?: (message: string) => void
}

export class PluginRpcError extends Error {
  constructor(
    readonly pluginId: string,
    readonly rpcError: JsonRpcErrorData,
  ) {
    super(rpcError.message)
    this.name = 'PluginRpcError'
  }
}

export class PluginRequestTimeoutError extends Error {
  constructor(
    readonly pluginId: string,
    readonly method: string,
    readonly timeoutMs: number,
  ) {
    super(`plugin ${pluginId} request timed out after ${timeoutMs}ms: ${method}`)
    this.name = 'PluginRequestTimeoutError'
  }
}

type PendingCall = {
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
  timer?: NodeJS.Timeout
}

export class PluginProcessHost {
  private readonly events = new EventEmitter()
  private readonly pending = new Map<JsonRpcId, PendingCall>()
  private child?: ChildProcessWithoutNullStreams
  private lines?: ReadlineInterface
  private nextRequestId = 0
  private stopping?: Promise<void>
  private exited?: Promise<{ code: number | null; signal: NodeJS.Signals | null }>
  private resolveExited?: (value: { code: number | null; signal: NodeJS.Signals | null }) => void

  constructor(
    readonly manifest: PluginManifest,
    readonly pluginDir: string,
    private readonly options: PluginProcessHostOptions = {},
  ) {}

  get running() {
    return Boolean(this.child && this.child.exitCode === null && this.child.signalCode === null)
  }

  start() {
    if (this.running) return
    if (this.child) throw new Error(`plugin process cannot be restarted without creating a new host: ${this.manifest.id}`)

    const command = resolveCommand(this.pluginDir, this.manifest.backend.command)
    const cwd = this.manifest.backend.cwd
      ? resolve(this.pluginDir, this.manifest.backend.cwd)
      : this.pluginDir
    const child = spawn(command, this.manifest.backend.args ?? [], {
      cwd,
      env: {
        ...process.env,
        ...this.manifest.secrets,
        ...(this.manifest.backend.command === '${NODE}' ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
        RED_VIDEO_FLOW_PLUGIN_ID: this.manifest.id,
        RED_VIDEO_FLOW_PLUGIN_API_VERSION: this.manifest.apiVersion,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    })
    this.child = child
    this.exited = new Promise((resolveExited) => {
      this.resolveExited = resolveExited
    })

    child.stdout.setEncoding('utf8')
    this.lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
    this.lines.on('line', (line) => this.handleLine(line))

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      this.options.onStderr?.(redactPluginSecrets(chunk, this.manifest))
    })
    child.stdin.on('error', (error) => this.failPending(error))

    child.on('error', (error) => this.failPending(error))
    child.on('close', (code, signal) => {
      this.lines?.close()
      this.lines = undefined
      this.failPending(new Error(`plugin ${this.manifest.id} exited before completing requests`))
      this.resolveExited?.({ code, signal })
      this.resolveExited = undefined
      this.events.emit('exit', { code, signal })
    })
  }

  async call<T = unknown>(method: string, params?: unknown, timeoutMs = this.options.requestTimeoutMs ?? 30_000) {
    if (!this.running || !this.child) throw new Error(`plugin is not running: ${this.manifest.id}`)
    if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
      throw new Error(`invalid plugin request timeout: ${String(timeoutMs)}`)
    }
    const id = `${this.manifest.id}:${++this.nextRequestId}`

    return new Promise<T>((resolveCall, rejectCall) => {
      const timer = timeoutMs === 0
        ? undefined
        : setTimeout(() => {
            this.pending.delete(id)
            rejectCall(new PluginRequestTimeoutError(this.manifest.id, method, timeoutMs))
          }, timeoutMs)
      timer?.unref()
      this.pending.set(id, {
        resolve: (value) => resolveCall(value as T),
        reject: rejectCall,
        timer,
      })
      const payload = `${JSON.stringify({
        jsonrpc: JSON_RPC_VERSION,
        id,
        method,
        params,
      })}\n`
      if (!this.child!.stdin.writable) {
        if (timer) clearTimeout(timer)
        this.pending.delete(id)
        rejectCall(new Error(`plugin input is closed: ${this.manifest.id}`))
        return
      }
      this.child!.stdin.write(payload, (error) => {
        if (!error) return
        const pending = this.pending.get(id)
        if (!pending) return
        this.pending.delete(id)
        if (pending.timer) clearTimeout(pending.timer)
        pending.reject(error)
      })
    })
  }

  onNotification(listener: (method: string, params: unknown) => void) {
    this.events.on('notification', listener)
    return () => this.events.off('notification', listener)
  }

  onExit(listener: (event: { code: number | null; signal: NodeJS.Signals | null }) => void) {
    this.events.on('exit', listener)
    return () => this.events.off('exit', listener)
  }

  async stop() {
    if (this.stopping) return this.stopping
    this.stopping = this.stopOnce()
    return this.stopping
  }

  private async stopOnce() {
    const child = this.child
    if (!child || !this.running) return
    try {
      const disposeTimeoutMs = this.options.requestTimeoutMs && this.options.requestTimeoutMs > 0
        ? Math.min(this.options.requestTimeoutMs, 5_000)
        : 5_000
      await this.call('plugin.dispose', undefined, disposeTimeoutMs)
    } catch {}
    if (!this.running) return
    child.kill('SIGTERM')

    const graceMs = this.options.shutdownGraceMs ?? 3_000
    const graceful = await Promise.race([
      this.exited?.then(() => true) ?? Promise.resolve(true),
      delay(graceMs).then(() => false),
    ])
    if (!graceful && this.running) {
      child.kill('SIGKILL')
      await this.exited
    }
  }

  private handleLine(line: string) {
    if (!line.trim()) return
    try {
      const message = parseJsonRpcLine(line)
      if (isJsonRpcNotification(message)) {
        this.events.emit('notification', message.method, message.params)
        return
      }
      if (!isJsonRpcResponse(message)) {
        throw new Error('plugin-to-host requests are not enabled yet')
      }

      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (pending.timer) clearTimeout(pending.timer)
      if ('error' in message) {
        pending.reject(new PluginRpcError(this.manifest.id, {
          ...message.error,
          message: redactPluginSecrets(message.error.message, this.manifest),
          details: redactPluginValue(message.error.details, this.manifest),
        }))
      } else {
        pending.resolve(redactPluginValue(message.result, this.manifest))
      }
    } catch (error) {
      const safe = redactPluginSecrets(
        error instanceof Error ? error.message : String(error),
        this.manifest,
      )
      this.options.onStderr?.(`[plugin-protocol] ${safe}`)
    }
  }

  private failPending(error: unknown) {
    for (const pending of this.pending.values()) {
      if (pending.timer) clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }
}

function resolveCommand(pluginDir: string, command: string) {
  if (command === '${NODE}') return process.execPath
  if (isAbsolute(command)) return command
  if (command.startsWith('./') || command.startsWith('../')) return resolve(pluginDir, command)
  return command
}

function delay(ms: number) {
  return new Promise<void>((resolveDelay) => {
    const timer = setTimeout(resolveDelay, ms)
    timer.unref()
  })
}
