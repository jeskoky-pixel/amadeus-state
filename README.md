# Amadeus State v1

Amadeus State 是独立的 DeepSeek Harness（DSH）Cordis 插件，为 Amadeus 提供持续、可解释、可持久化的 **Mood / Energy / Curiosity** 状态与兴趣演化，并在 DSH 设置窗口中提供原生 **Amadeus 状态** 页面。

State 只提供行为倾向。它不覆盖 Persona，不建立第二套主动消息调度，不绕过 Life 的预算/活动/权限，也不复制 Memory 的长期记忆或知识图谱。

## 功能

- 三维短期状态与长期基准：`Mood`（-100…100）、`Energy`（0…100）、`Curiosity`（0…100）。
- 无随机数、无高频 LLM 定时任务的确定性演化：真实时间指数恢复、半衰期、上下界、饱和、时钟回拨保护、长时间离线恢复。
- 事件与评价分离：可信来源由 Host/Life 适配器验证；模型只能提交受限低信任评价。事件 ID 幂等；重复 Life 回执、Memory 检索和 DSH 重试不会重复累计。
- 兴趣：长期偏好（`baseline`）与近期活跃（`activity`）分离，活跃度衰减、饱和、别名归一化、人工管理、作用域隔离。
- SQLite 持久化：WAL、事务、幂等键、schema 版本、完整性检查、迁移前备份、运行时租约、可恢复备份。
- 真实 DSH 集成：Host 服务 `amadeusState`、模型工具 `state_get` / `state_appraise` / `state_interests` / `state_health`、有界动态上下文。
- 原生设置页：`dsh.client` + `settings.section`，页面与插件管理器共用 DSH 权威 Config 与修订号。
- 插件管理器基本配置卡：通过 `plugins.detail.section` 为 `@amadeus/state` bundle/row 提供紧凑表单；与独立页共用同一 `amadeus-state` 命名空间、revision 和保存/冲突逻辑。
- 插件管理器本地化：`locale/zh.json`/`locale/en.json` 提供 `meta.title`/`meta.description`。
- 可选 Life/Memory 集成：使用公开 Host 服务与原生工具；缺席、关闭、超时或契约不支持时独立核心继续运行。

## 兼容性

- Node.js **>=22.13.0**（使用内置 `node:sqlite`）。
- DSH **>=0.2.1-rc.3 <0.3.0**（声明 `engines.dsh`；隔离验收基线为 `0.2.1-rc.3`）。
- 浏览器半端使用 DSH lazy-CJS `window.__ModuleLoader__.load`、`slots.inject('settings.section')` 与 `ctx.configForms`。
- 不修改 DSH Desktop/核心源码，不依赖 Life/Memory 私有模块或数据库。

## 安装（概要）

构建并生成可分发包：

```powershell
npm test
npm run check
npm run package
npm run verify:package
```

`dist/PACKAGE_INFO.json` 记录 tarball 实际文件列表、大小、SHA-256 与可复现标记；`dist/BUILD_INFO.json` 记录 client/source 哈希和构建来源。`npm run package` 会连续打包两次并比较哈希，再执行包内容一致性验证。然后在隔离 DSH Desktop 的 **设置 → 插件** 中通过 Plugin Manager 安装该 tarball 或本地 `link:` 包。完整步骤、升级、验证清单与回滚见 [docs/INSTALL.md](docs/INSTALL.md)、[docs/UPGRADE.md](docs/UPGRADE.md)；隔离实机结果与设置截图见 [State v1 验收报告](docs/verification/STATE_V1_ACCEPTANCE_2026-10-25.md)。

内部正式版本为 **1.0.0（2026-10-25）**；未进行 npm 发布、GitHub Release、PR 合并或生产部署。发行说明与兼容性见 [docs/RELEASE_NOTES.md](docs/RELEASE_NOTES.md)、[docs/COMPATIBILITY.md](docs/COMPATIBILITY.md)。

## 设置入口

1. **插件管理器基础配置**：设置 → 插件 → Amadeus State，bundle/row 详情页出现 State 所有的基础配置卡（启用演化、影响强度、敏感度、上下文、兴趣自动更新），带健康与重启提示；Config 字段为 live/volatile，保存后引擎立即读取新值。
2. **独立设置页**：设置窗口左侧 **Amadeus 状态**。包含状态总览、常用设置、兴趣管理、分页变化记录、高级参数、预览、恢复默认、独立确认的状态重置、健康与可选集成状态。

中文优先；页面右上角可切换英文。深色/浅色主题、窄窗口、键盘焦点、加载/禁用/错误/成功状态均有处理。

## 配置要点

默认值面向安全与低 Token：

| 字段 | 默认 | 说明 |
|---|---:|---|
| `stateEvolutionEnabled` | `true` | 关闭后拒绝新的自动事件，不删除数据 |
| `influenceStrength` | `standard` | 只改变上下文倾向措辞，不覆盖 Persona/权限 |
| `eventSensitivity` | `1` | 普通事件变化倍率，仍受上限与饱和限制 |
| `autoRecovery` | `true` | 按真实时间恢复，读取时计算 |
| `modelAppraisalEnabled` | `false` | 不额外调用模型；只允许模型主动调用 `state_appraise` |
| `contextInjectionMode` | `brief` | `off` / `brief` / `state_interests`，有字符上限 |
| `lifeIntegrationEnabled` | `true` | Life 不存在时自动降级 |
| `memoryIntegrationEnabled` | `false` | 只验证 Memory 引用，重复检索不重复生效 |

其余高级参数、范围、单位、默认值与生效时机见表 `src/config-fields.js`，设置页会展示中文名称、解释、范围、默认值和“立即生效/需要重启”。

## 安全边界

- 权威来源：Host 记录的 DSH Session、Life 公开 identity/activity 服务、Memory 原生工具在同一可信执行上下文中返回的结果。
- 模型不能通过工具参数伪造 `scope`、`scene`、`persona`、`source`、`trust`、证据或管理员身份；这些参数会被拒绝。
- 私有场景的数值和原因不会合并进其他场景或公共上下文。读取时重新验证授权；撤销后派生读取失败关闭。
- GUI API 要求 DSH Connection 已认证的 **owner** 主体、同源请求、JSON Content-Type 与 State 标记头；仅本机回环地址不构成管理员授权。
- 浏览器不接触 SQLite；所有动态数据经过 Host API。
- 默认关闭额外模型评价、Memory 写入和任何外发/主动动作。

## 开发命令

```powershell
npm test            # in-process node:test suite
npm run build       # build lib/client.js lazy-CJS bundle
npm run check       # build + release checks
npm run package     # deterministic two-pack + BUILD_INFO + PACKAGE_INFO
npm run verify:package  # verify tarball vs current worktree/content policy
npm run bench       # isolated read/write/context overhead sample
```

本轮产品化不包含 Git 提交、安装、公开发布或生产 Profile 修改；真实 Desktop 最终安装/UI/模型调用验收由 Codex 执行。详细风险和安装清单见 [发行说明](docs/RELEASE_NOTES.md) 与 [State v1 验收报告](docs/verification/STATE_V1_ACCEPTANCE_2026-10-25.md)。

## 文档

- [普通用户指南](docs/USER_GUIDE.zh.md)
- [安装与验收准备](docs/INSTALL.md)
- [升级与回滚](docs/UPGRADE.md)
- [备份、迁移与回滚](docs/BACKUP_ROLLBACK.md)
- [发行说明](docs/RELEASE_NOTES.md) / [变更记录](CHANGELOG.md)
- [兼容性](docs/COMPATIBILITY.md)
- [构建与可复现性](docs/BUILD.md)
- [运行与 Token 开销](docs/PERFORMANCE.md)
- [架构与信任边界](docs/ARCHITECTURE.md)
- [产品架构决策](docs/ADR-001-state-v1.md)
- [State v1 验收报告](docs/verification/STATE_V1_ACCEPTANCE_2026-10-25.md)

## 许可证

本仓库许可证仍由所有者决定；当前 `package.json` 标记为 `UNLICENSED`，不自动继承主项目或其他仓库的许可证。
