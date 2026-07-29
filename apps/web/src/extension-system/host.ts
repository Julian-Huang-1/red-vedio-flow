import { ContributionRegistry } from './registry'
import type {
  CanvasPanelContribution,
  FrontendCommandContribution,
  FrontendExtensionHost,
  MessageRendererContribution,
  NodeTypeContribution,
  UiContribution,
} from './types'

export type FrontendExtensionRegistries = {
  commands: ContributionRegistry<FrontendCommandContribution>
  ui: ContributionRegistry<UiContribution>
  nodeTypes: ContributionRegistry<NodeTypeContribution>
  canvasPanels: ContributionRegistry<CanvasPanelContribution>
  messageRenderers: ContributionRegistry<MessageRendererContribution>
}

export function createFrontendExtensionHost() {
  const registries: FrontendExtensionRegistries = {
    commands: new ContributionRegistry(),
    ui: new ContributionRegistry(),
    nodeTypes: new ContributionRegistry(),
    canvasPanels: new ContributionRegistry(),
    messageRenderers: new ContributionRegistry(),
  }

  const host: FrontendExtensionHost = {
    commands: {
      register: (id, handler) => registries.commands.register({ id, handler }),
      execute: async <Output>(id: string, input?: unknown) => {
        const command = registries.commands.get(id)
        if (!command) throw new Error(`Frontend command not found: ${id}`)
        return await command.handler(input) as Output
      },
      has: (id) => Boolean(registries.commands.get(id)),
    },
    ui: {
      contribute: (slot, id, component, options = {}) =>
        registries.ui.register({
          id,
          slot,
          component,
          order: options.order ?? 0,
        }),
    },
    canvas: {
      registerNodeType: (definition) => registries.nodeTypes.register(definition),
      registerPanel: (definition) => registries.canvasPanels.register(definition),
    },
    agent: {
      registerMessageRenderer: (messageType, id, component) =>
        registries.messageRenderers.register({ id, messageType, component }),
    },
  }

  return { host, registries }
}

export const frontendExtensions = createFrontendExtensionHost()
