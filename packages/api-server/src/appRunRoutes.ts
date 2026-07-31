import {
  validateWorkflowForRun,
} from '@red-video-flow/workflow-core'
import {
  HttpError,
  isRecord,
  pathParts,
  readJson,
  sendJson,
  type RequestContext,
} from './http.js'
import type { DurableRuntime } from './runtime.js'
import {
  createAppRun,
  type CoworkAppRun,
} from './workflowExecutor.js'

export async function handleDurableAppRunRoutes(
  runtime: DurableRuntime,
  ctx: RequestContext,
  userId: string,
) {
  const workflowRunRoute = pathParts(ctx.pathname, '/api/workflow-runs/')
  if (workflowRunRoute?.length) {
    const run = await runtime.infrastructure.postgresWorkflowAppRuns
      .get<CoworkAppRun>(workflowRunRoute[0])
    if (!run || run.userId !== userId) {
      throw new HttpError(404, 'workflow run not found')
    }
    if (ctx.req.method === 'GET' && workflowRunRoute.length === 1) {
      sendJson(ctx.res, 200, { run: publicAppRun(run) })
      return true
    }
    if (
      (
        ctx.req.method === 'POST'
        && workflowRunRoute.length === 2
        && workflowRunRoute[1] === 'cancel'
      )
      || (ctx.req.method === 'DELETE' && workflowRunRoute.length === 1)
    ) {
      if (run.status === 'queued' || run.status === 'running') {
        run.cancelled = true
        run.status = 'cancelled'
        run.updatedAt = Date.now()
        await runtime.infrastructure.postgresWorkflowAppRuns.save(run)
      }
      sendJson(ctx.res, 200, { run: publicAppRun(run) })
      return true
    }
    return false
  }

  const route = pathParts(ctx.pathname, '/api/workflows/')
  if (!route || route.length !== 2 || route[1] !== 'runs') return false
  const workflowId = route[0]
  if (ctx.req.method === 'GET') {
    const runs = await runtime.infrastructure.postgresWorkflowAppRuns
      .listByWorkflow<CoworkAppRun>(workflowId)
    sendJson(ctx.res, 200, {
      runs: runs.filter((run) => run.userId === userId).map(publicAppRun),
    })
    return true
  }
  if (ctx.req.method === 'POST') {
    const workflow = await runtime.infrastructure.postgresWorkflows.get(workflowId)
    if (!workflow) throw new HttpError(404, `workflow not found: ${workflowId}`)
    const body = await readJson(ctx.req)
    if (
      typeof body.revision === 'number'
      && body.revision !== workflow.revision
    ) {
      sendJson(ctx.res, 409, {
        error: 'workflow_revision_conflict',
        message: '工作流已发生更新，请保存后重试',
        expectedRevision: body.revision,
        currentRevision: workflow.revision,
      })
      return true
    }
    const inputs = isRecord(body.inputs) ? body.inputs : {}
    const validation = validateWorkflowForRun(workflow, inputs)
    if (!validation.valid) {
      sendJson(ctx.res, 422, {
        error: 'workflow_validation_failed',
        message: '工作流运行前校验未通过',
        issues: validation.issues,
      })
      return true
    }
    const run = createAppRun(workflow, userId, inputs)
    await runtime.infrastructure.postgresWorkflowAppRuns.save(run)
    await runtime.infrastructure.jobs.enqueue({
      id: `schedule-workflow:${run.id}`,
      type: 'schedule-workflow',
      payload: { runId: run.id },
      maxAttempts: 1,
    })
    sendJson(ctx.res, 202, { run: publicAppRun(run) })
    return true
  }
  return false
}

export function publicAppRun(run: CoworkAppRun) {
  const { cancelled: _, userId: __, ...safe } = run
  return safe
}
