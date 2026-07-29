import readline from 'node:readline'

const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })

function send(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

lines.on('line', async (line) => {
  const request = JSON.parse(line)
  try {
    let result = null
    if (request.method === 'plugin.initialize') {
      result = {
        ready: true,
        tokenConfigured: Boolean(process.env.TEST_PLUGIN_TOKEN),
      }
    } else if (request.method === 'plugin.activate') {
      result = { active: true }
    } else if (request.method === 'plugin.health') {
      result = { ok: true }
    } else if (request.method === 'plugin.deactivate') {
      result = { active: false }
    } else if (request.method === 'plugin.dispose') {
      result = { disposed: true }
      setTimeout(() => process.exit(0), 0)
    } else if (request.method === 'execution.cancel') {
      result = { cancelled: true }
    } else if (request.method === 'worker.start') {
      result = { started: request.params.contributionId }
    } else if (request.method === 'worker.stop') {
      result = { stopped: request.params.contributionId }
    } else if (request.method === 'command.execute' || request.method === 'node.execute') {
      if (request.params.input?.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, request.params.input.delayMs))
      }
      send({
        jsonrpc: '2.0',
        method: 'execution.event',
        params: {
          executionId: request.params.executionId,
          sequence: 1,
          timestamp: Date.now(),
          type: 'delta',
          data: {
            text: request.params.input?.returnToken
              ? process.env.TEST_PLUGIN_TOKEN
              : 'hello',
          },
        },
      })
      result = {
        input: request.params.input,
        tokenConfigured: Boolean(process.env.TEST_PLUGIN_TOKEN),
        token: request.params.input?.returnToken
          ? process.env.TEST_PLUGIN_TOKEN
          : undefined,
      }
    } else {
      throw Object.assign(new Error(`unknown method: ${request.method}`), { code: 'METHOD_NOT_FOUND' })
    }
    send({ jsonrpc: '2.0', id: request.id, result })
  } catch (error) {
    send({
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: error.code ?? 'PLUGIN_ERROR',
        message: error.message,
        retryable: false,
      },
    })
  }
})
