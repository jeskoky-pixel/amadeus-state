# 兼容性说明

## 版本矩阵

| 组件 | 声明/实测 | 说明 |
|---|---|---|
| Amadeus State | `1.0.0` | `package.json`、`STATE_VERSION`、tarball 版本必须一致 |
| DSH Desktop | 声明 `>=0.2.1-rc.3 <0.3.0`；隔离实测 `0.2.1-rc.3` | 依赖当前 Settings/Plugin Manager/Connection 接口 |
| Node.js | `>=22.13.0` | 使用内置 `node:sqlite`（实验特性） |
| SQLite schema | `1` | 打开较新/未知 schema 会备份后拒绝 |
| Browser bundle | DSH lazy-CJS | `window.__ModuleLoader__.load({id,factory})` |
| Life | 可选 | 使用公开 `life` Host 服务的 identity/activity 方法 |
| Mneme | 可选 | 使用原生 `memory_get` 读取引用；无写入路径 |

## DSH 接口依赖

State 使用以下当前 DSH Desktop 0.2.1-rc.3 接口：

- `Config` Standard Schema + `.volatile()` 字段 + 官方 `{uid,refs}` serialization。
- Browser `dsh.client` / `exports["./client"]` / lazy-CJS factory。
- `ctx.configForms.get(ns)`、`whileServed`、`form.mutate(ops, revision)`。
- `settings.section` 与 `plugins.detail.section` slots。
- `ctx.systemPrompt.context(...)` 有界运行时上下文。
- `ctx.tools.register(...)`、`ctx.tools.execute(...)`（Memory 引用）。
- `connection.admit(req)` 的 owner principal 与 HTTP Host/Origin fence。
- `node:sqlite`（Node 22）。

如果某个 DSH 版本缺少 `connection.admit`，管理 HTTP 会 fail-closed 503；缺少 `settings.section`/`plugins.detail.section` 时对应入口不注册，但 Host 工具和动态上下文仍可运行（前提是基础 Host 服务存在）。State 不修改 DSH Desktop 核心。

## 兼容策略

- DSH `0.3.x` 未验证；升级到 0.3 前必须重新做隔离安装、GUI、工具和重启验收。
- Node 22.13 以下不支持 `node:sqlite`，会加载失败；不要用更旧 Node 运行。
- 不承诺与旧 State Schema 之外的数据库兼容；未知 schema 会先备份再拒绝。
- Life/Memory 是可选集成；它们升级后若公开契约变化，State 应显示降级而不是读取私有数据库。
- 包内 `devDependencies` 仅用于测试 `Config.toJSON()` 的官方 Schemastery 回归，不是运行时依赖。

## 已知契约限制

- Life 无公开“活动完成事件推送”；需模型在真实回合给出 activity id，State 再通过 Life 服务验证 completed/failed。
- Mneme 无公开 persona/scene Host 授权契约；Memory 引用默认关闭，自动摘要写入硬禁用。
- 共享场景不会把其他场景的数值/原因合并进当前模型上下文（保守隐私策略）。
- 管理权限只有 DSH authenticated owner，没有独立角色系统。
