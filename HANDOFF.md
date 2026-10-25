# amadeus-state 交接

记录日期：2026-10-25（Asia/Shanghai）。分支：`codex/state-v1`。

## 仓库

- 远端：https://github.com/jeskoky-pixel/amadeus-state
- 默认分支：main
- 开发分支：codex/state-v1
- 可见性：公开（2026-10-25 用户明确要求）
- 本地位置：主项目目录下 plugins/amadeus-state/，属于独立 Git 仓库。

## 本轮已实现

- 独立 Cordis 包 `@amadeus/state@1.0.0`：`package.json`、`cordis.patch.yml`、`exports`、`dsh.bundle.patch`、`dsh.client`、`Config`、`lib/client.js`。
- 确定性 Mood / Energy / Curiosity 引擎：短期状态 + 长期基准、真实时间指数恢复、半衰期、上下界、饱和、时钟回拨保护、长离线恢复。
- 事件可信边界：Host/Life 验证来源；模型只能提交受限评价；事件 ID 幂等；模型不能伪造 scope/source/trust/证据/管理员身份。
- SQLite：schema、WAL、事务、幂等键、运行时租约、完整性检查、迁移前/重置前备份、审计保留、分页。
- 兴趣：长期 preference 与近期 activity 分离、衰减、饱和、别名归一化、人工管理、最大条目、场景范围。
- DSH Host 集成：`ctx.provide('amadeusState', …)`、`state_get` / `state_appraise` / `state_interests` / `state_health`、`ctx.systemPrompt.context` 有界注入。
- 原生设置页：`settings.section` + `ctx.configForms`；状态总览、常用设置、兴趣管理、分页记录、高级参数、预览、恢复默认、独立确认的状态重置、诊断；中英双语、深/浅色、窄布局、键盘焦点、冲突处理。
- Plugin Manager 基本配置卡：`plugins.detail.section`，仅 State bundle/row；与独立页共用 `amadeus-state` configForms namespace/revision，5 个基础字段、健康与重启提示；`dsh.client.inject` 含 plugin-manager。
- 本地化：`locale/*.json` 顶层 `meta.title`/`meta.description`。
- 管理 HTTP API：同源、State 标记头、DSH `connection.admit`、owner principal、JSON 校验、无路径/秘密。
- 可选 Life / Memory 适配：Life 公开 identity/activity 服务；Mneme 原生 `memory_get` 读取引用；5 秒超时与干净降级。没有 Memory 写入方法/设置；自动写入硬禁用。
- 文档：README、CHANGELOG、普通用户指南、安装、升级、备份/回滚、架构、ADR、发行说明、兼容性、构建/可复现性、locale。
- 测试：`npm test` 101 项（官方 Schemastery 可用时 101/101；默认环境 100 pass + 1 skip）；`npm run check` 通过；`npm run package` 生成并验证 tarball；`npm run verify:package` 通过。
- 设置页 schema：`Config.toJSON()` 使用官方 `{uid,refs}` 信封，所有嵌套 schema 位置为数字 uid；已用官方 Schemastery 3.18.5 + 完整默认 Config 回归。
- 产品化发行收尾：`engines.dsh` 收紧为 `>=0.2.1-rc.3 <0.3.0`；新增发行说明/兼容/升级/构建文档；`package` 固定 `SOURCE_DATE_EPOCH`/`TZ` 连续两次打包比对 SHA-256，写 `PACKAGE_INFO.json`/`BUILD_INFO.json`，并由 `verify-package.mjs` 逐文件核对当前源码、client bundle、发行文档和禁止内容。
- Review 3：深色主题 selected/primary 使用显式高对比 accent；兴趣页删除提示只在真实删除后显示；移除 inert `memoryWriteEnabled` 字段/写入路径。
- Review 4：新增 Plugin Manager `plugins.detail.section` 基本配置卡（同 configForms/revision、bundle/row 过滤、生命周期撤销）与 `locale` meta 本地化。

## 验证命令与结果

```text
npm test        # 101 tests: 100 pass + 1 official-schema skip by default
DSH_SCHEMASTER_PATH=<official 3.18.5> npm test  # 101/101 pass
npm run check   # build + release checks pass (25 fields)
npm run package # deterministic two-pack + BUILD_INFO/PACKAGE_INFO + verification
npm run verify:package
```

最终 package 的大小与 SHA-256 以本地生成的 `dist/PACKAGE_INFO.json` 为准；`dist/BUILD_INFO.json` 记录 source/client 哈希；代码或文档变更后需重新运行。当前产品化产物：`dist/amadeus-state-1.0.0.tgz`，57 files，251431 bytes，SHA-256 `df88e747ae72832e72db847022bcffb143f696c475ff6c36fe5cd516dfe4efc9`（联合实机返工后；若后续文件再变动以最新回执为准）。

## 已知限制

- Life→State 没有公开的“活动完成事件推送”契约；当前由模型在真实回合调用 `state_appraise(activityId=…)`，再由 State 向 Life 验证 completed/failed。未完成/unknown/pending 一律拒绝。
- Mneme 没有公开 persona/scene Host 校验服务；Memory 引用默认关闭，且 State 不复制其 scope 语义。自动摘要写入在缺少可证明的 Scene 级契约时硬禁用：没有用户设置、没有 adapter 写入方法、没有 `memory_save` 路径。
- 兴趣别名只在 State 本地归一化，没有导入 Mneme 实体/别名图。
- 管理权限使用 DSH authenticated owner principal；没有独立角色系统。
- 共享场景不合并其他场景数值到模型上下文；这是保守的隐私策略。
- 当前 Schema v1；迁移框架已就位，暂无多版本迁移。
- `databasePath` 修改需要重启插件；其他公开字段 live/volatile。

## Codex 隔离实机验收

官方 DSH Desktop `0.2.1-rc.3` 已通过 Plugin Manager 安装 State tarball；原生设置入口、Plugin Manager 基础配置、真实模型四个工具、Life 完成/重复/未知活动、Mneme 合成记忆首次/重复/未知引用、配置保存、兴趣、预览、二次确认重置、恢复默认、停用及硬重启持久化均有实际结果。权限实测拒绝跨站写入、缺标记写入及未认证读取。公开证据及限制见 [验收报告](docs/verification/STATE_V1_ACCEPTANCE_2026-10-25.md)。

最终包和哈希需以最新 `dist/PACKAGE_INFO.json` 为准；文档或截图变化后应重新打包。隔离实机测试数据与原始会话记录仅保存在主项目 `private/state-development/`，不得推送到公开 GitHub。产品化复核后 Codex 仍需重新安装当前 tarball 做最终隔离验收；已有实机结果不对应新哈希包。

## 后续交付

1. 重新运行 `npm test`、`npm run check`、`npm run package` 并确认公开内容扫描。
2. 提交和推送 `codex/state-v1`，创建保持 OPEN 的 State PR，禁止合并、npm 发布或公开 Release。
3. 若在日常 DSH 本体测试，先备份 Profile 与 State 数据，完成后恢复原配置和服务状态，记录结果；不得改动生产 Life、Mneme、QQ Bridge 数据。
4. 许可证仍为 `UNLICENSED`，由所有者决定是否变更。
