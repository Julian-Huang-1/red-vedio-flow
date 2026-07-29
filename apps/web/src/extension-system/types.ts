import type { ComponentType } from 'react'
import type { MaterialType, NodeSize } from '@red-video-flow/workflow-core'

export type Disposable = {
  dispose: () => void
}

export type UiContribution = {
  id: string
  slot: string
  component: ComponentType<any>
  order: number
}

export type NodeTypeContribution = {
  id: string
  order?: number
  materialType: MaterialType
  title: string
  menuLabel: string
  emptyText: string
  promptPlaceholder: string
  icon: ComponentType<any>
  component: ComponentType<any>
  defaultSize: NodeSize
  editable?: boolean
  uploadable?: boolean
  executeCommandId?: string
}

export type CanvasPanelContribution = {
  id: string
  order?: number
  title: string
  icon: ComponentType<any>
  component: ComponentType
}

export type MessageRendererContribution = {
  id: string
  messageType: string
  component: ComponentType<any>
}

export type FrontendCommandHandler = (input?: any) => unknown | Promise<unknown>

export type FrontendCommandContribution = {
  id: string
  handler: FrontendCommandHandler
}

export type UiContributionOptions = {
  order?: number
}

export type FrontendExtensionHost = {
  commands: {
    register: <Input = void, Output = void>(
      id: string,
      handler: (input: Input) => Output | Promise<Output>,
    ) => Disposable
    execute: <Output = unknown>(id: string, input?: unknown) => Promise<Output>
    has: (id: string) => boolean
  }
  ui: {
    contribute: (
      slot: string,
      id: string,
      component: ComponentType<any>,
      options?: UiContributionOptions,
    ) => Disposable
  }
  canvas: {
    registerNodeType: (definition: NodeTypeContribution) => Disposable
    registerPanel: (definition: CanvasPanelContribution) => Disposable
  }
  agent: {
    registerMessageRenderer: (
      messageType: string,
      id: string,
      component: ComponentType<any>,
    ) => Disposable
  }
}

export type FrontendFeatureActivator = (
  host: FrontendExtensionHost,
) => void | Disposable | (() => void)
