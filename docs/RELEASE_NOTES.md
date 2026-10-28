# Amadeus State 1.1.0 — Release Notes

合并日期：2026-10-28。状态：main 开发基线（未公开发行、未部署生产）。包名：`@amadeus/state`。包版本：`1.1.0`。SQLite schema：`2`。

## 发行制品

最终制品是 `dist/amadeus-state-1.1.0.tgz`，由 `npm run package` 生成。实际文件列表、字节数和 SHA-256 以同目录 `dist/PACKAGE_INFO.json` 为准；构建来源清单和 client 哈希见 `dist/BUILD_INFO.json`。本目录与压缩包内文件必须先通过 `npm run verify:package`，再由 Codex 在隔离 Desktop 通过官方 Plugin Manager 安装最终 tarball。

## 亮点

- 显式绑定一个官方 DSH Workspace（稳定 Workspace ID + 实时成员）；工作区合法 Session 默认共享一份主状态。
- 四种会话模式：共享、只读、独立、完全停用；规则持久化且每次工具/注入/事件重新授权，撤权热生效。
- 工作区外的 Session、已移除/归档 Session、Workspace 删除或 Registry 不可用均失败关闭，不自动改绑。
- 可信 `turn/end` + 结构化工具工作证据驱动小幅、无情绪推断的精力/好奇变化；普通寒暄零变化，回合幂等、限流、无额外 LLM。
- 安全 schema 1→2 增量迁移：迁移前 `VACUUM INTO` 一致性快照、完整性/表/行数检查、事务失败回滚；旧数据和审计不丢失、不自动汇总。
- 七页独立控制台（总览、状态演化、兴趣管理、事件与审计、上下文与模型工具、会话规则、数据与诊断），全部可操作项连接真实 Host API。
- 共享工作区审计脱敏；模型工具不暴露跨 Session 原因、全局计数或 Workspace ID。
- Mood / Energy / Curiosity 与兴趣的持续、可解释、可恢复状态。
- 原生 **Amadeus 状态** 设置页与 Plugin Manager 基础配置卡共用同一 `amadeus-state` 权威 Config/revision。
- 真实 DSH 模型工具：`state_get`、`state_appraise`、`state_interests`、`state_health`。
- 有界动态上下文；默认 `brief`，支持 `off` / `brief` / `detailed`。
- 安全事件边界、Scene 隔离、撤销 fail-closed、SQLite 备份与审计。
- 运行诊断中的安全备份恢复：SQLite 一致性备份、完整性/schema 预检、恢复前安全备份、旧 DB/WAL/SHM 文件集保留、原子替换、失败回滚并重新打开。
- Life/Memory 可选集成；缺失或契约不支持时核心继续运行。
- 三插件共存时，`settings.section` / `plugins.detail.section` 使用可释放、幂等的生命周期注册；停用、启用、HMR、namespace 撤销/恢复不会重复注册。

## 兼容性

- DSH Desktop：声明 `>=0.2.1-rc.3 <0.3.0`；当前隔离实机基线为 `0.2.1-rc.3`。Workspace 功能要求公开 `workspaceRegistry`。
- Node.js：`>=22.13.0`（内置 `node:sqlite` 为实验特性）。
- 浏览器半端使用 DSH lazy-CJS、`settings.section`、`plugins.detail.section`、`ctx.configForms` 与 `Config.volatile`。
- 不修改 DSH Desktop 核心，不依赖 Life/Memory 私有代码。

详见 [兼容性说明](COMPATIBILITY.md)。

## 安装与升级

- 安装：官方 Plugin Manager 安装 `dist/amadeus-state-1.1.0.tgz`，启用并重启（如 DSH 提示）。
- 升级：先备份 State 数据，再安装新 tarball；首次打开 v1 库会创建迁移前快照并迁移到 schema 2。
- 回滚：恢复旧 tarball 与迁移前快照；迁移失败会自动回滚，不覆盖原库。
- 绑定：安装后在 **会话规则** 页选择 Workspace；未绑定时保持 v1 私有行为。

详见 [安装](INSTALL.md)、[升级与回滚](UPGRADE.md)、[备份](BACKUP_ROLLBACK.md)。

## 安全与隐私

- 浏览器不直接访问 SQLite；管理 API 要求 DSH 已认证 owner、同源请求与 State 标记头。
- 模型不能伪造可信来源、Scene、Persona、证据或管理员身份。
- 自动 Memory 摘要写入硬禁用；没有用户开关或隐藏 `memory_save` 路径。
- 包内不包含数据库、备份、日志、密钥、原始私人会话或生产路径。

## 验证

自动测试、配置 schema 官方库回归、客户端构建、包内容一致性、双次打包可复现性和 SHA-256 由 `npm test`、`npm run check`、`npm run package` 覆盖。真实 Desktop 的最终安装由 Codex 独立验收。

## 已知限制

- Life 没有公开活动完成推送；需要模型在真实回合提供 activity id，再由 State 向 Life 验证。
- Mneme 没有公开 persona/scene Host 授权契约；Memory 引用默认关闭，自动写入不可用。
- 兴趣别名只在 State 本地归一化。
- 当前 schema v1；尚无较旧已发布版本的可执行迁移。
- 许可证仍待所有者决定，不自动继承其他仓库。

## 许可

`package.json` 当前标记为 `UNLICENSED`。公开发布、npm 发布和许可证选择需要所有者授权；本版本仅作为内部可安装制品。
