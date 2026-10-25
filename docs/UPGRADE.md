# 升级与回滚

State 的数据目录独立于其他插件；升级/回滚只替换插件包，不自动清空或迁移数据。当前正式版本为 `1.0.0`、SQLite schema `1`。

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
3. 如果旧版不支持当前 schema，恢复升级前的数据库备份；不要覆盖后继续写入。
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
