# Red Video Flow Plugins

每个直接子目录都是一个进程插件，入口为 `plugin.json`。内置插件与用户插件使用同一套协议和生命周期，不在核心服务里保留供应商特例。

开发契约、目录位置、Token 配置和 CLI 调用方式见 [后端插件开发](../docs/backend-plugins.md)。
