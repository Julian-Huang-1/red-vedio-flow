# 后端插件开发

Red Video Flow 的 Agent、视觉模型、通用命令、节点执行器和后台 Worker 都通过独立进程插件接入。核心服务只负责发现、生命周期、协议、注册、执行状态和事件转发，不包含具体供应商 SDK 或 CLI 逻辑。

## 插件目录

每个插件是插件根目录下的一个子目录：

```text
plugins/
└── example.visual-api/
    ├── plugin.json
    └── backend/
        └── main.mjs
```

本地服务按以下优先级扫描插件根目录，先发现的插件 ID 优先：

1. `<当前目录>/.red-video-flow/plugins`
2. `~/.red-video-flow/plugins`
3. 仓库内置的 `plugins`

可通过 `RED_VIDEO_FLOW_PLUGIN_DIRS` 覆盖扫描目录。多个目录使用操作系统的 PATH 分隔符连接。桌面应用发布后扫描用户数据目录中的 `plugins`，再扫描随应用发布的内置插件。

## plugin.json

```json
{
  "id": "example.visual-api",
  "name": "Example Visual API",
  "version": "1.0.0",
  "apiVersion": "1",
  "backend": {
    "runtime": "process",
    "command": "${NODE}",
    "args": ["backend/main.mjs"]
  },
  "contributes": {
    "commands": [
      {
        "id": "example.generate",
        "title": "Generate media",
        "inputSchema": {
          "type": "object",
          "required": ["prompt"],
          "properties": {
            "prompt": { "type": "string" }
          }
        }
      }
    ],
    "visualProviders": [
      {
        "id": "example",
        "title": "Example Visual Model",
        "vendor": "Example",
        "capabilities": ["text-to-image", "text-to-video"]
      }
    ]
  },
  "secrets": {
    "MODEL_API_BASE_URL": "https://api.example.com/v1",
    "MODEL_API_TOKEN": "replace-with-your-token"
  }
}
```

`secrets` 会作为环境变量注入插件进程。服务端公开的插件描述只返回变量名和“已配置”状态；日志、JSON-RPC 返回值、通知和错误消息中的相同密钥值也会被替换为 `[REDACTED]`。Token 仍以明文保存在本机 `plugin.json`，该文件不应提交到 Git 或分享给他人。

当前版本不要求插件声明暴露范围或权限。

## 进程协议

宿主通过 stdin/stdout 使用“一行一个 JSON 对象”的 JSON-RPC 2.0。stdout 只能输出协议消息，普通日志必须写入 stderr。

请求：

```json
{"jsonrpc":"2.0","id":"example:1","method":"plugin.initialize","params":{"pluginId":"example.visual-api","apiVersion":"1"}}
```

成功响应：

```json
{"jsonrpc":"2.0","id":"example:1","result":{"ready":true}}
```

失败响应：

```json
{"jsonrpc":"2.0","id":"example:1","error":{"code":"UPSTREAM_ERROR","message":"request failed","retryable":true}}
```

执行事件通知：

```json
{"jsonrpc":"2.0","method":"execution.event","params":{"executionId":"exec-123","type":"progress","data":{"progress":35}}}
```

插件应支持以下生命周期方法：

- `plugin.initialize`
- `plugin.activate`
- `plugin.health`
- `plugin.deactivate`
- `plugin.dispose`

宿主在优雅关闭失败时会先发送 `SIGTERM`，超过宽限时间后发送 `SIGKILL`。

## 能力契约

| Contribution | 调用方法 | 用途 |
| --- | --- | --- |
| `commands` | `command.execute` | 可被 HTTP API 和 `rvf command run` 直接调用的通用能力 |
| `agentProviders` | `agent.describe`、`agent.execute` | 本地 Agent CLI 或远程 Agent |
| `visualProviders` | `visual.describe`、`visual.submit`、`visual.query` | 图片和视频模型 |
| `nodeExecutors` | `node.execute` | 自定义节点类型或节点执行策略 |
| `backgroundWorkers` | `worker.start`、`worker.stop` | 索引、同步、监听等常驻任务 |

长任务方法接收统一包装：

```json
{
  "executionId": "exec-123",
  "contributionId": "example.generate",
  "input": {}
}
```

取消统一使用：

```text
execution.cancel({ executionId })
```

视觉提交输入包含 `capability`、`prompt`、`inputs`、`options` 和 `idempotencyKey`。异步供应商返回 `pending + externalTaskId`，同步完成则返回 `completed + assets`。查询返回 `pending`、`succeeded` 或 `failed`。详细 TypeScript 类型以 `@red-video-flow/plugin-contract` 为准。

## Execution 与 CLI

命令和节点执行器都进入统一 Execution Manager：

- 执行元数据与最终状态持久化到 SQLite。
- 运行事件通过 SSE 实时发送，并支持 `Last-Event-ID`/`after` 续读当前进程内的事件缓冲。
- 支持取消、超时、服务重启后的 `interrupted` 状态。
- 插件崩溃只影响该插件及其运行中的任务。

常用命令：

```bash
rvf plugin list
rvf plugin inspect example.visual-api
rvf plugin health example.visual-api
rvf plugin reload example.visual-api

rvf command list
rvf command run example.generate \
  --input '{"prompt":"电影感海边日落"}' \
  --follow

rvf execution get <executionId>
rvf execution follow <executionId>
rvf execution cancel <executionId>
```

## 当前内置插件

- `builtin.agent-cli`：Agent CLI 发现、协议适配、进程执行和流式输出。
- `builtin.visual-dreamina`：Dreamina 提交、查询、下载、取消与结果归一化。

Web UI 插件包不在本次后端契约内。后续 UI 扩展应消费后端贡献点和 JSON Schema，不允许前端直接加载后端插件代码或读取 `secrets`。
