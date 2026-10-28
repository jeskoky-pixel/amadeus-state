# Amadeus State v1.1

Amadeus State 是独立的 DeepSeek Harness（DSH）Cordis 插件，为 Amadeus 提供持续、可解释、可持久化的 **Mood / Energy / Curiosity** 状态与兴趣演化。v1.1 起可以把 State 显式绑定到一个官方 DSH Workspace，让该工作区的合法 Session 共享一份主状态，同时允许每个会话独立、只读或停用。

> **1.1.0 已合并 main（2026-10-28）**，作为个人电脑实机测试的开发基线；尚未公开发行或部署生产。隔离 DSH Desktop 联合验收及真实 NapCat 限制见 [四插件报告](https://github.com/jeskoky-pixel/amadeus-qq/blob/main/docs/verification/FOUR_PLUGIN_V11_JOINT_2026-10-28.md)。v1.0 的旧 Scope、事件和审计不会被自动合并。

## 日常使用

安装后，在 DSH 设置中打开 **Amadeus 状态**。控制台有七页：

1. **总览**：工作区绑定状态、主状态、长期基准、倾向与近期兴趣。
2. **状态演化**：影响强度、敏感度、恢复速度、回合后自动演化与限流。
3. **兴趣管理**：长期偏好、近期活跃、别名、启停与删除。
4. **事件与审计**：分页事件、来源/信任、变化前后；共享工作区审计不显示其他会话的原始原因。
5. **上下文与模型工具**：注入等级、字符预算、四个模型工具状态与“未实现额外模型评价”的明确标注。
6. **会话规则**：选择 Workspace、绑定/解绑、按稳定 Session ID 设置共享/只读/独立/停用。
7. **数据与诊断**：Schema 迁移记录、备份/恢复、数据库健康与可选集成状态。

State 可以单独运行。Life 和 Memory 存在时会按授权使用它们的公开接口；缺席时核心状态仍工作。普通设置不需要编辑 JSON 或 SQLite。先看 [用户指南](docs/USER_GUIDE.zh.md) 和 [安装步骤](docs/INSTALL.md)。

State 只提供行为倾向。它不覆盖 Persona，不建立第二套主动消息调度，不绕过 Life 的预算/活动/权限，也不复制 Memory 的长期记忆或知识图谱。

## v1.1 核心能力

- **Workspace 唯一成员权威**：使用官方 `workspaceRegistry` 的稳定 Workspace ID 和实时 `get(id).sessionIds`。显示名称与文件夹路径不参与身份判断。新 Session 自动加入；其他 Workspace、已移除或已归档 Session、Registry 不可用、Workspace 已删除均失败关闭。
- **共享主状态**：绑定后为 Workspace 建立独立的新 Scope；成员 Session 默认共享一份主状态。旧 v1 私有 Scope 原样保留，绝不自动汇总。
- **四种会话模式**：`shared`（默认，可写主状态）、`read_only`（只读）、`isolated`（独立状态，不读写主状态）、`disabled`（不注入、不处理事件、不开放有效模型读写）。权限在每次工具调用、注入、事件时重新判断，撤权热生效。
- **回合后自动演化**：监听可信 `session/event`，只用已完成 `turn/end` 与结构化工具工作证据产生很小的精力/好奇变化；普通寒暄和纯文本回合零变化。按 Session turn 幂等、最小间隔与每小时上限限流。不把字数/Token 推断为情绪正负，不额外调用模型。
- **安全迁移**：SQLite schema 1 → 2 增量迁移；迁移前用 `VACUUM INTO` 创建一致性快照并检查完整性/表/行数；迁移事务失败自动回滚，旧库保持不变。备份文件名包含唯一后缀，失败清理不会删除更早的已验证备份。
- **确定性引擎**：真实时间指数恢复、半衰期、上下界、饱和、时钟回拨保护；事件幂等、单事件上限、兴趣衰减。
- **安全审计**：工作区共享事件在审计/模型可读面上隐藏原始会话原因；证据引用只在私有管理视图可见。
- **原生设置页**：`dsh.client` + `settings.section`，页面与插件管理器共用 DSH 权威 Config 与修订号。

## 兼容性

- Node.js **>=22.13.0**（使用内置 `node:sqlite`）。
- DSH **>=0.2.1-rc.3 <0.3.0**（声明 `engines.dsh`；隔离验收基线为 `0.2.1-rc.3`）。
- Workspace 功能要求 DSH 提供公开 `ctx.workspaceRegistry`（`list()`、`get(id)`、`sessionIds`、`archivedSessionIds`）。缺失时 State 核心仍启动，但工作区模式失败关闭并显示诊断。
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

`dist/PACKAGE_INFO.json` 记录 tarball 实际文件列表、大小、SHA-256 与可复现标记；`dist/BUILD_INFO.json` 记录 client/source 哈希和构建来源。`npm run package` 会连续打包两次并比较哈希，再执行包内容一致性验证。然后在隔离 DSH Desktop 的 **设置 → 插件** 中通过 Plugin Manager 安装该 tarball 或本地 `link:` 包。完整步骤、升级、验证清单与回滚见 [docs/INSTALL.md](docs/INSTALL.md)、[docs/UPGRADE.md](docs/UPGRADE.md)。

## 设置入口

1. **独立设置页**：设置窗口左侧 **Amadeus 状态**。七页控制台共享同一 DSH Config；工作区绑定与会话规则通过受认证的 Host API 持久化。
2. **插件管理器基础配置**：设置 → 插件 → Amadeus State，bundle/row 详情页出现 State 基础配置卡（启用演化、影响强度、敏感度、上下文、兴趣自动更新），带健康与重启提示。

中文优先；页面右上角可切换英文。深色/浅色主题、窄窗口、键盘焦点、加载/禁用/错误/成功状态均有处理。

## 配置要点

| 字段 | 默认 | 说明 |
|---|---:|---|
| `stateEvolutionEnabled` | `true` | 关闭后拒绝新的自动事件，不删除数据 |
| `influenceStrength` | `standard` | 只改变上下文倾向措辞，不覆盖 Persona/权限 |
| `eventSensitivity` | `1` | 普通事件变化倍率，仍受上限与饱和限制 |
| `autoRecovery` | `true` | 按真实时间恢复，读取时计算 |
| `modelAppraisalEnabled` | `false` | 不允许额外模型调用；只允许模型主动调用 `state_appraise` |
| `contextInjectionMode` | `brief` | `off` / `brief` / `detailed`（兼容旧 `state_interests`） |
| `autoEventProcessingEnabled` | `true` | 处理已完成且带工具工作证据的真实模型回合 |
| `sharedEventWeight` | `0.35` | 单会话对共享主状态的最大影响 |
| `autoEventMinIntervalSeconds` | `180` | 同一会话自动演化最小间隔 |
| `autoEventMaxPerHour` | `12` | 每个状态作用域每小时自动事件上限 |
| `lifeIntegrationEnabled` | `true` | Life 不存在时自动降级 |
| `memoryIntegrationEnabled` | `false` | 只验证 Memory 引用，重复检索不重复生效 |

其余高级参数、范围、单位、默认值与生效时机见表 `src/config-fields.js`，设置页会展示中文名称、解释、范围、默认值和“立即生效/需要重启”。

## 安全边界

- 权威来源：DSH 记录的 Session、官方 `workspaceRegistry` 成员与归档集合、Life 公开 identity/activity 服务、Memory 原生工具在同一可信执行上下文中的结果。
- 模型不能通过工具参数伪造 `scope`、`workspace`、`session`、`scene`、`persona`、`source`、`trust`、证据或管理员身份；这些参数会被拒绝。
- 绑定、解绑、会话规则和备份恢复只能由 DSH 已认证 **owner** 通过同源、标记头、JSON 请求调用 Host API。
- Workspace 共享状态不向其他会话暴露原始事件原因；审计只显示汇总后的 delta、来源与时间。
- 默认关闭额外模型评价、Memory 写入和任何外发/主动动作；State 不创建第二套 Agent 调度循环。

## 开发命令

```powershell
npm test            # in-process node:test suite
npm run build       # build lib/client.js lazy-CJS bundle
npm run check       # build + release checks
npm run package     # deterministic two-pack + BUILD_INFO + PACKAGE_INFO
npm run verify:package  # verify tarball vs current worktree/content policy
npm run bench       # isolated read/write/context overhead sample
```

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

## 许可证

本仓库许可证仍由所有者决定；当前 `package.json` 标记为 `UNLICENSED`，不自动继承主项目或其他仓库的许可证。
