const MAX_HTML_BYTES = 300 * 1024

export type HtmlValidationResult =
  | { valid: true; html: string }
  | { valid: false; message: string }

export function validateHtmlArtifact(value: string): HtmlValidationResult {
  const html = value.trim()
  if (!html) return { valid: false, message: 'Agent 生成的 HTML 为空。' }
  if (new Blob([html]).size > MAX_HTML_BYTES) {
    return { valid: false, message: 'Agent 生成的 HTML 超过 300KB 限制。' }
  }

  if (/<html[\s>]/i.test(html)) {
    return { valid: true, html }
  }

  return {
    valid: true,
    html: `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body>
${html}
</body>
</html>`,
  }
}
