import { detectAgents } from './registry.js'
import { buildNodePrompt, invokeAgent, type InvokeAgentInput } from './invoke.js'

export class AgentService {
  list() {
    const agents = detectAgents()
    return {
      agents,
      installedCount: agents.filter((agent) => agent.available).length,
      invokableCount: agents.filter((agent) => agent.invokable).length,
      platform: process.platform,
    }
  }

  buildNodePrompt(body: any) {
    return buildNodePrompt(body)
  }

  invoke(input: InvokeAgentInput) {
    return invokeAgent(input)
  }
}
