import type { ModelCredentialStatus } from '@red-video-flow/workflow-core'
import { getWorkflowClientTransport, readJsonResponse } from './transport'

const path = '/api/settings/model-credential'

export async function fetchModelCredentialStatus() {
  const response = await getWorkflowClientTransport().request(path)
  return readJsonResponse<ModelCredentialStatus>(response, '读取模型凭证状态失败')
}

export async function saveModelCredential(token: string) {
  const response = await getWorkflowClientTransport().request(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  return readJsonResponse<ModelCredentialStatus>(response, '保存模型凭证失败')
}

export async function deleteModelCredential() {
  const response = await getWorkflowClientTransport().request(path, { method: 'DELETE' })
  return readJsonResponse<ModelCredentialStatus>(response, '删除模型凭证失败')
}
