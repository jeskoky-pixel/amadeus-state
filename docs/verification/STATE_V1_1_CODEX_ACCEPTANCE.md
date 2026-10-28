# State v1.1.0 — Codex 独立验收

日期：2026-10-28；分支：`codex/state-v1-1-workspace`。本报告仅涉及隔离 DSH Desktop 与隔离 State 数据库；未修改生产 Profile、生产数据库或其他插件仓库。

## 结论

State v1.1.0 候选版可独立绑定一个真实 DSH Workspace，工作区内的 Session 默认共享主状态，并可按稳定 Session ID 切换共享、只读、独立和停用。隔离 Desktop 的真实模型工具、状态注入、完成回合自动演化、GUI 保存、数据库迁移、备份恢复及硬重启持久性均已验证。此分支只作为独立 PR 供审查，不合并、不发布。

## 自动化与包

| 检查 | 结果 |
| --- | --- |
| `npm test` | 141 项，140 通过、1 跳过、0 失败；跳过项为本地缺少官方 Schemastery 包的附加兼容测试，结构序列化回归已运行 |
| `npm run check` | 通过，16 个源码文件、29 个配置字段 |
| `npm run package` / `npm run verify:package` | 通过；包内容可复现，最终 SHA-256 以 `dist/PACKAGE_INFO.json` 为准 |

新增回归覆盖 Workspace 实时成员资格、四种会话规则、撤权、事件去重/限流、共享 Scope 的私人 topic 不提升、跨 Session 回合幂等、v1→v2 迁移与回滚、WAL 备份、备份唯一文件名，以及容器宽度响应式布局。

## 隔离 Desktop 实机证据

- Plugin Manager 安装 1.1.0 候选包后，Host 返回 `ready`、Schema `2`。迁移前冷备份完整性为 `ok`；迁移后旧库 8 个 Scope、5 条事件、3 个兴趣的 ID 全部保留，迁移日志 1 条，完整性仍为 `ok`。
- GUI 选择并绑定真实 Workspace ID。七页导航均实际打开；共享、只读、独立、停用四种规则逐一通过页面保存，并从 Host API 读回一致。配置页改成详细注入后保存生效，再通过 GUI 恢复简短注入。
- 使用官方 `session/create` 的 `workspaceId` 参数在已绑定工作区创建新 Session。OpenCode Go `deepseek-v4.1-flash` 的真实回合调用 `state_get` 与 `state_health`，均成功；实际上下文含 `【Amadeus 状态】工作区共享主状态`，完成的工具回合产生一条 `host_turn_work` 事件。仅指定 `cwd` 而未加入 Workspace 的 Session 被拒绝读取，符合成员资格边界。
- 把已授权 Session 切到停用后，另一真实模型回合的 `state_get` 被拒绝，`state_health` 仅返回安全状态；主状态事件数未增加。随后清除测试规则，恢复共享默认。
- 两次硬重启后，绑定 ID、只读规则、事件、Schema 和配置保持。最终重装候选包并硬重启后，Host 仍为 `ready`，七页仍可打开。
- 通过 GUI 创建数据库备份；添加临时兴趣后，在 GUI 从该备份恢复，临时兴趣消失，State 重新打开且保持 `ready`。测试数据只在隔离库中。
- 真实弹窗内，修复前内容宽度约 300px；容器宽度适配后为 564px，七页导航呈顶部网格，未横向溢出。截图：[总览](screenshots/state-v1.1-overview-desktop.png)、[会话规则](screenshots/state-v1.1-rules-desktop.png)、[数据与诊断](screenshots/state-v1.1-data-desktop.png)。

## 与原型及未验证边界

- 原型展示独立全屏控制台；实现使用 DSH 原生 Settings 中的 State 独立七页控制台。窄弹窗已按容器宽度适配；没有 Life 功能导航。截图来自真实隔离 Desktop，而非静态原型。
- 当前 DSH 没有可公开验证的 QQ Scene→Session 映射接口。因此 GUI 只接受工作区内的稳定 Session ID；按群号/QQ 号配置例外明确显示未实现，避免按显示名称错误授权。
- 自动演化只处理可信、已完成且含结构化工具调用的回合；纯文本闲聊可以不改变状态。每轮额外 LLM 评价未实现且默认不调用。Life/Memory/QQ 缺席的安全降级由自动化测试覆盖，真实 Desktop 只验收了现有隔离 Profile 组合，没有逐一卸载三个插件做实机矩阵。
- 尚未在生产负载测量 P95 延迟、额外 Token 消耗或长期高频演化表现；本次真实回合确认状态读取无需额外模型调用，且事件数受规则控制。

## 部署与回滚

生产部署前先停用 State 并冷备份 `state.sqlite` 与可能存在的 WAL/SHM，同时保存 v1.0 包。升级后检查版本、Schema、Workspace 绑定、工具和控制台。若需回到 v1.0，必须同时恢复迁移前的 v1 数据库快照；不要让旧插件直接使用 Schema 2，也不要手改 Schema 版本。详细步骤见 [备份与回滚](../BACKUP_ROLLBACK.md)。
