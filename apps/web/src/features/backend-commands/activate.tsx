import type { FrontendFeatureActivator } from '../../extension-system/types'
import { useExecutionStore } from '../../state/executionStore'

type ExecuteCommandInput = {
  commandId: string
  input?: unknown
  timeoutMs?: number
}

export const activate: FrontendFeatureActivator = (app) => {
  const registrations = [
    app.commands.register(
      'backend.command.execute',
      ({ commandId, input, timeoutMs }: ExecuteCommandInput) =>
        useExecutionStore.getState().run(commandId, input, { timeoutMs }),
    ),
    app.commands.register(
      'backend.command.cancel',
      (executionId: string) => useExecutionStore.getState().cancel(executionId),
    ),
  ]

  return () => {
    for (const registration of registrations.reverse()) registration.dispose()
  }
}
