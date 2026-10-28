# State v1.1.0 Creator 实施报告

> 本文记录 Creator 完成初版时的状态与测试数字。最终 141 项门禁、隔离 Desktop 实机验收和交付边界见 [Codex 独立验收](STATE_V1_1_CODEX_ACCEPTANCE.md)。

日期：2026-10-28（Asia/Shanghai）
分支：`codex/state-v1-1-workspace`
状态：候选实现完成，未提交、未推送、未安装、未部署，未触碰生产 Profile/数据库或 Life/Memory/QQ 数据。
自动化结果：`npm test` 136 项，135 pass + 1 skip，0 fail；`npm run check` 通过（29 fields）；`npm run package` 与 `npm run verify:package` 通过（64 files，可复现）。

## 修改文件

- Host/引擎：`src/model.js`、`src/store.js`、`src/service.js`、`src/scope.js`、`src/workspace.js`（新增）、`src/engine.js`、`src/context.js`、`src/tools.js`、`src/index.js`、`src/http.js`
- 配置：`src/config-fields.js`、`src/config-schema.js`（由字段表自动生成）
- 控制台：`src/client/factory.template.js`、`src/client/logic.js`（表单逻辑未改）、`lib/client.js`（构建产物）
- 测试：`test/helpers.js`、`test/run.js`、`test/store.test.js`、`test/http.test.js`、`test/gui-product.test.js`、`test/schema-serialization.test.js`、`test/package.test.js`、`test/client.test.js`、`test/tools.test.js`；新增 `test/workspace.test.js`、`test/evolution.test.js`、`test/migration-v2.test.js`
- 文档/版本：`package.json`、`README.md`、`CHANGELOG.md`、`HANDOFF.md`、`docs/ARCHITECTURE.md`、`docs/UPGRADE.md`、`docs/BACKUP_ROLLBACK.md`、`docs/COMPATIBILITY.md`、`docs/RELEASE_NOTES.md`、`docs/USER_GUIDE.zh.md`、`docs/PERFORMANCE.md`
- 本报告

## 已实现功能与安全边界

### Workspace 唯一权威

- 只使用官方 `workspaceRegistry` 的稳定 Workspace ID；显示名称与路径不参与身份。
- 每次工具、注入、事件、规则操作实时读取 `get(id).sessionIds` 与 `archivedSessionIds`；无成员缓存。
- 晚加入 Session 自动生效；其他 Workspace、已移除/归档 Session、Workspace 删除、Registry 不可用均失败关闭，不自动改绑。
- 绑定、解绑、换绑与规则经 owner HTTP API；绑定与规则持久化，重启后恢复。

### 主状态与四种模式

- 新 Workspace 主 Scope（`workspace:<真实 ID>`）与旧 v1 私有 Scope、Life Scope 分离；旧数据不自动汇总。
- `shared`：读主状态，合法事件可小幅写；`read_only`：只读；`isolated`：独立私有状态，不读写主状态；`disabled`：不注入、不处理事件、工具无有效读写。
- 每次调用重新判断模式；撤权在下一工具/注入/事件立即生效。
- 共享审计隐藏原始 summary、Session ID、证据与兴趣名称，只保留聚合 delta、来源与时间。

### 回合后自动演化

- 可信 `session/event` 订阅使用 `{ global: true }`；`turn/end` 必须 `reason.kind === 'completed'`，缺失/未知一律不处理。
- 仅 `assistant/message` 的结构化 `tool-call` 块作为工作量证据；普通寒暄/纯文本回合零变化。
- 不把字数/Token 推断为情绪；工具工作只产生小幅、价态中性的精力/好奇变化。
- 按 `host:<scope>:session:<id>:turn:<n>` 幂等；最小间隔、每小时上限、共享状态单会话权重。
- 无额外 LLM、无第二套 Agent loop。

### 迁移与备份

- Schema 1→2 只新增 `scopes.scope_kind`、`scopes.workspace_id`、`session_rules`、`migration_log` 与索引。
- 迁移前 `VACUUM INTO` 一致性快照并校验；迁移在单事务内执行并比较行数/完整性；失败回滚，v1 库保持可用。
- 备份改为 `VACUUM INTO`，包含已提交 WAL 行；成功前校验 integrity/schema/table/列，失败不保留候选文件。
- 旧 v1 备份可 preflight；恢复后打开时迁移。恢复保留原预检、安全备份、原子替换与失败回滚。

### 控制台

- 七页：总览、状态演化、兴趣管理、事件与审计、上下文与模型工具、会话规则、数据与诊断。
- 工作区选择/绑定/解绑、主状态、会话模式、上下文等级、事件参数、兴趣、诊断、备份恢复均连接真实 Host API/持久配置。
- 明确标注“额外模型评价未实现；不会每轮另开 LLM”和“QQ Scene 映射未实现”。
- 无 Life 管理页或 Life 导航。

## 测试结果

| 命令 | 结果 |
|---|---|
| `npm test` | 136 tests；135 pass + 1 skip（官方 Schemastery 缺失时跳过）；0 fail |
| `npm run check` | 通过；client 构建 + release checks（16 source files，29 fields） |
| `npm run package` | 通过；`dist/amadeus-state-1.1.0.tgz`，64 files，可复现；实际大小与 SHA-256 见 `dist/PACKAGE_INFO.json` |
| `npm run verify:package` | 通过；SHA-256 与包内容一致 |

覆盖的新增回归：

- 跨 Workspace 隔离、晚加入、移除、归档、Workspace 删除、Registry 不可用。
- 绑定/规则重启持久；四模式读写/注入；撤权热生效。
- 跨 Session 共享主状态；共享审计原因脱敏。
- 回合完成去重、普通寒暄零变化、纯文本零变化、abort 不处理、限流、共享权重、独立会话隔离。
- `session/event` 全局订阅与 disposer 释放。
- v1→v2 迁移、迁移前快照、失败 DDL 回滚、v1 备份恢复后迁移。
- WAL 已提交行 + 阻塞 checkpoint 下备份完整；备份失败不留下未验证文件。
- 原有工具、Life/Memory 可选、HTTP owner、备份恢复、GUI 配置/表单、包一致性回归。

## 实机尚未验证

- 真实 DSH Desktop 中工作区选择器、绑定/换绑、七页布局与交互、窄窗口/主题。
- 真实 DSH 会话的 `turn/end` 事件顺序、`assistant/message` 工具块形状、跨 Session 观察在 Desktop 生命周期的表现。
- 实际安装候选 tarball、硬重启后绑定/规则/迁移持久化、卸载重装数据保留。
- 与 Life/Memory 同时安装时的隔离运行与可选联动；QQ 场景（当前明确未实现）。
- 真实 UI 截图未提供：本会话禁止安装/修改 Profile，未在 Desktop 打开新包；不以模拟页面冒充实机截图。

## 与参考原型的差异

- 原型工作区示例为 QQ 群/私聊映射；实现只接受官方 DSH Workspace ID 与稳定 Session ID，QQ Scene 映射在无公开可信解析器时明确关闭。
- 原型“工作区绑定”与规则为演示数据；实现为 SQLite/Config 持久化 + owner API。
- 原型包含“额外模型评价”开关；实现明确标注未实现并默认关闭，避免每轮额外 LLM。
- 原型历史/事件为静态卡片；实现为真实分页审计，共享 Workspace 原因脱敏。
- 视觉采用原型浅色卡片、细边框、左侧导航与状态徽标，但保留 DSH 主题变量与设置页容器，不引入 Life 切换器或 Life 管理页。

## 遗留事项

- 独立 Codex 审查与隔离 Desktop 验收。
- 如需 QQ 场景规则，需先有官方/公开可信的 Scene 映射契约；在此之前不得按显示名称授权。
- 最终包 SHA-256 以报告生成后重新执行 `npm run package`/`verify:package` 的 `dist/PACKAGE_INFO.json` 为准。
