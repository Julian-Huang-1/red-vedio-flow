export type PreviewMode = 'desktop' | 'tablet' | 'mobile'

export type HtmlArtifact = {
  id: string
  sessionId: string
  version: number
  html: string
  title?: string
  createdAt: number
  updatedAt: number
}

export type PendingHtmlArtifact = {
  sessionId: string
  html: string
  title?: string
}
