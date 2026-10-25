# Amadeus State 1.0.0 — Release Notes

发布日期：2026-10-25。发行渠道：内部正式版本（未公开发布）。包名：`@amadeus/state`。包版本：`1.0.0`。SQLite schema：`1`。

## 发行制品

最终制品是 `dist/amadeus-state-1.0.0.tgz`，由 `npm run package` 生成。实际文件列表、字节数和 SHA-256 以同目录 `dist/PACKAGE_INFO.json` 为准；构建来源清单和 client 哈希见 `dist/BUILD_INFO.json`。本目录与压缩包内文件必须先通过 `npm run verify:package`，再由 Codex 在隔离 Desktop 通过官方 Plugin Manager 安装最终 tarball。

## 亮点

- Mood / Energy / Curiosity 与兴趣的持续、可解释、可恢复状态。
- 原生 **Amadeus 状态** 设置页与 Plugin Manager 基础配置卡共用同一 `amadeus-state` 权威 Config/revision。
- 真实 DSH 模型工具：`state_get`、`state_appraise`、`state_interests`、`state_health`。
- 有界动态上下文；默认 `brief`，可在 GUI 关闭。
- 安全事件边界、Scene 隔离、撤销 fail-closed、SQLite 备份与审计。
- Life/Memory 可选集成；缺失或契约不支持时核心继续运行。
- 三插件共存时，`settings.section` / `plugins.detail.section` 使用可释放、幂等的生命周期注册；停用、启用、HMR、namespace 撤销/恢复不会重复注册。

## 兼容性

- DSH Desktop：声明 `>=0.2.1-rc.3 <0.3.0`；当前隔离实机基线为 `0.2.1-rc.3`。
- Node.js：`>=22.13.0`（内置 `node:sqlite` 为实验特性）。
- 浏览器半端使用 DSH lazy-CJS、`settings.section`、`plugins.detail.section`、`ctx.configForms` 与 `Config.volatile`。
- 不修改 DSH Desktop 核心，不依赖 Life/Memory 私有代码。

详见 [兼容性说明](COMPATIBILITY.md)。

## 安装与升级

- 安装：官方 Plugin Manager 安装 `dist/amadeus-state-1.0.0.tgz`，启用并重启（如 DSH 提示）。
- 升级：先备份 State 数据，再安装新 tarball；确认版本、Config 字段、设置入口和数据。
- 回滚：恢复旧 tarball 与匹配数据库备份；不兼容 schema 会被拒绝而不是覆盖。

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
