import type {
  MaterialNode,
  WorkflowInputFieldDefinition,
} from '@red-video-flow/workflow-core'

export type WorkflowRuntimeAssetInput = {
  url?: string
  localPath?: string
  fileName?: string
  mimeType?: string
}

export type GeneratedWorkflowRuntime = {
  resolveInput: (
    nodeId: string,
    value: unknown,
    schema: WorkflowInputFieldDefinition & { nodeId: string },
  ) => Promise<unknown>
  runNode: (input: {
    node: MaterialNode
    upstreamResults: unknown[]
  }) => Promise<unknown>
}

export type WorkflowDefinition<TInput = Record<string, unknown>> = {
  id: string
  revision: number
  inputSchema: Record<string, WorkflowInputFieldDefinition & { nodeId: string }>
  run: (input: TInput, runtime: GeneratedWorkflowRuntime) => Promise<Record<string, unknown>>
}

export function defineWorkflow<TInput = Record<string, unknown>>(
  definition: WorkflowDefinition<TInput>,
) {
  return definition
}
