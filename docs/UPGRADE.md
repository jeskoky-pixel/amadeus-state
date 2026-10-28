# 升级与回滚

State 的数据目录独立于其他插件；升级/回滚只替换插件包，不自动清空或迁移数据。当前正式版本为 `1.1.0`、SQLite schema `2`。v1.0 的私有 Scope、事件和审计保留，不会自动合并到工作区主状态。

## v1.0 → v1.1 数据迁移

1. 首次用 1.1.0 打开 v1 数据库时，先做 `integrity_check`，然后 `VACUUM INTO` 创建 `backups/state-before-v2-migration-*.sqlite` 一致性快照并验证。
2. 在单个 `BEGIN IMMEDIATE` 事务中新增 `scopes.scope_kind`、`scopes.workspace_id`、`session_rules`、`migration_log` 与索引，并写入 `migration_log` 与 `schema_version=2`。
3. 事务内比较迁移前后 scopes/events/interests 行数并做 `integrity_check`。任何一步失败都 `ROLLBACK`，v1 文件保持不变；插件拒绝使用而不是部分升级。
4. 迁移只增加结构，不复制、不合并、不删除旧 Scope 或事件。工作区主状态在显式绑定后才创建。
5. 旧 v1 备份仍可由 1.1.0 preflight；恢复时会先替换 v1 文件，再在重新打开时执行同一迁移。若希望回到 v1.0，安装旧版并恢复迁移前快照。

## 绑定工作区（v1.1）

1. 打开 **Amadeus 状态 → 会话规则**。
2. 选择一个 DSH Workspace 并确认绑定；绑定保存稳定 Workspace ID。
3. 绑定后工作区成员默认共享主状态；打开总览确认主状态可读。
4. 如需从旧私有状态过渡，旧 Scope 仍保留；v1.1 **不会**自动汇总到主状态。
5. 解绑或换绑需要明确确认；旧工作区数据保留，但不再作为当前主状态生效。

## 升级前

1. 记录当前 `@amadeus/state` 版本、tarball SHA-256、DSH 版本和 State schema 版本（运行诊断可见）。
2. 创建数据库备份：设置 → Amadeus 状态 → 运行诊断 → 创建数据库备份；或按 [备份与回滚](BACKUP_ROLLBACK.md) 停止写入后复制 `state.sqlite`。
3. 保留旧 tarball 与 `dist/PACKAGE_INFO.json`/`dist/BUILD_INFO.json`，便于回滚。
4. 在隔离 Profile 先验证新包，不直接在生产 Profile 上尝试。

## 升级

1. 在 DSH 的 Plugin Manager 中安装新版本 tarball。旧版本会被替换；不要同时启用两个 State 实例。
2. 如 DSH 提示需要重启，完成硬重启。
3. 打开设置 → 插件 → Amadeus State，确认版本和基础配置卡出现。
4. 打开设置左侧 **Amadeus 状态**，确认状态、兴趣、审计和诊断正常。
5. 确认服务端可以打开 SQLite 且 schema 为兼容版本；如果拒绝使用，保留原文件并回滚，不要手工改 `meta.schema_version`。
6. 用 `state_get`/`state_health` 做一次只读模型验证；需要写入时用合成数据。

## 回滚

1. 停止 DSH/State 写入并再次备份当前数据库。
2. 通过 Plugin Manager 卸载新版本，安装之前的 tarball；或恢复匹配的旧 Profile 配置。
3. 如果旧版不支持当前 schema，在旧版页面 **运行诊断 → 数据库备份与恢复** 选择升级前备份并确认恢复；失败会自动保留原数据库，不要手工覆盖后继续写入。
4. 重启并确认设置入口、数据、Life/Memory 其他插件都正常。
5. 记录回滚原因和最终包 SHA-256。

## 不兼容版本

- 数据库 schema 高于当前插件支持版本时，State 会先备份再拒绝使用，不会静默重建空库。
- 无迁移可用的旧 schema 不允许手工编辑；只能安装支持该 schema 的版本或恢复匹配备份。
- 卸载插件不会删除数据目录；彻底清理需单独、显式删除。

## 相关文档

- [安装与 Plugin Manager](INSTALL.md)
- [备份、迁移与回滚](BACKUP_ROLLBACK.md)
- [兼容性](COMPATIBILITY.md)
- [构建与可复现性](BUILD.md)
