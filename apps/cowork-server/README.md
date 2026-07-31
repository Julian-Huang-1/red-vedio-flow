# Cowork Server

纯 PostgreSQL 的 Cowork 生产入口。这个应用不依赖本地 SQLite、Electron、插件运行时或本地文件持久化。

运行时读取：

- 根目录 `db.properties`：Cowork 注入的六个 `db.*` 字段。
- `APP_PORT`：监听端口，默认 `3000`。
- `APP_WORKER_CONCURRENCY`：PG Queue Worker 并发数，默认 `3`。

用户模型 Token 使用 AES-256-GCM 加密。服务优先读取可选的 `APP_CREDENTIAL_ENCRYPTION_KEY`；Cowork 不提供自定义环境变量时，从平台注入的数据库密码通过带域标识的 SHA-256 派生稳定密钥，密钥不会写入代码包。

文本、图片和视频 Provider 地址沿用项目内置地址，无需在 Cowork 部署时提供。`APP_TEXT_PROVIDER_URL`、`APP_IMAGE_PROVIDER_URL`、`APP_VIDEO_PROVIDER_URL` 仅作为诊断或迁移时的可选覆盖项。

所有业务 API 都要求 Cowork 注入 `Decrypted-Userinfo`。上传和生成文件写入 PostgreSQL Large Object；工作流、运行、Trace、资源、聊天、用户凭据和队列均写入 PostgreSQL。

Provider 请求统一使用用户在前端保存的 Token：

```http
Authorization: Bearer <user-token>
Content-Type: application/json
```

请求体包含 `model`、最终拼接后的 `prompt`、完整 `input`、`generationConfig` 和 `runId`。Provider 可返回：

- 文本：`text`、`output_text`，或 OpenAI Responses 风格的 `output[].content[].text`。
- 图片：`images` / `assets`，元素支持 URL、data URL、base64、`b64_json`。
- 视频：`video` / `assets`，元素支持 URL、data URL 或 base64。

模型网络请求会在最终 HTTP 边界记录到 Run Trace，鉴权 Header 会脱敏。
