# Agent Note：pi-ai 路由上的按会话 session 标头

Status: implemented

[English](2026-09-18-pi-ai-session-header.md) | 中文

## 问题

按会话亲和路由的网关会拒绝不携带按会话身份标头的请求——OpenCode Go 的 `x-opencode-session`（2026-09-05 起强制要求）就是让 Harness 用户中断的那一例（[讨论 5495](https://github.com/deepseek-ai/deepseek-harness/discussions/5495)）。pi-ai 适配器此前完全不发送会话身份，而社区变通方案——在 profile `headers` 里放固定值——把所有会话压进同一个亲和桶，切换会话后网关侧提示词缓存失效、费用上升。

## 决策

profile 解析为每条 OpenCode 路由默认打上网关要求的标头：路由名以 `opencode` 开头（已安装目录的 `opencode` 与 `opencode-go`），或其服务端点位于 `opencode.ai`，即无需任何配置得到 `sessionHeader: x-opencode-session`。默认值属于服务该路由的一部分，因为网关对每个缺标头的请求都回 `400 MissingSessionID`——OpenCode 用户升级并重启即恢复，而不是先发现一个设置项。适配器随后在每个带会话 id 的请求上以该名字发送 `GenerateOptions.sessionId`——会话 id 跨轮次、恢复、压缩与重试稳定，且每个会话、fork、子代理各不相同。显式 `sessionHeader` 在 OpenCode 路由上改指别的标头，或服务其他会话亲和网关；其动态值按大小写不敏感方式替换 `headers` 中的同名静态条目，因为固定值承担不了按会话 id 的职责，Harness attribution 仍然赢得保留名。解析拒绝空名字与 Fetch 无法表示的名字。不带会话 id 的请求不发送该标头，模型发现请求不变。

## 考虑过的替代方案

**仅靠配置显式启用（第一版实现）。** 无默认值的 `sessionHeader` 字段让修复不可见：维护者自己在 `opencode-go` 路由上重建并重启后依然报 `MissingSessionID`，因为没有东西告诉路由发送该标头。已知路由上的破坏性网关要求属于该路由，而不是每个受影响用户都要先听说一遍的设置项。

**复用 pi-ai 的 `sendSessionAffinityHeaders` / `sessionAffinityFormat`。** 归目录所有，且被本包的 compat 漂移门禁挡在 profile 之外；其线上格式（`session_id`、`x-client-request-id`、`x-session-affinity`、`x-session-id`）不含 `x-opencode-session`，要先做上游工作才能服务该网关。

**向所有提供方发送 harness 会话 id。** 会把按会话标识发给从未要求接收它的提供方。自动默认只作用于 OpenCode 路由；其他路由在用字段显式启用前不发送任何内容。

## 后果

OpenCode Go 用户升级即恢复——路由无需新配置；标头在唯一的 `streamSimple` 调用点随请求标头发出，覆盖所有线上协议，携带会话 id 的辅助调用（标题、压缩）呈现同一个按会话 id。以 `opencode` 开头却指向无关端点的路由名仍会发送该标头，对那个端点是一个无人读取的多余标头。非 OpenCode 部署在路由启用前线上行为不变。静态标头变通方案需删除固定条目完成迁移，因为动态值会替换它。
