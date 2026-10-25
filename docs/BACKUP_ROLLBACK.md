# 备份、迁移与回滚

## 数据位置

State 只拥有自己的 SQLite 数据库：

```text
<DSH_HOME>/amadeus-state/state.sqlite
```

默认 `<DSH_HOME>` 是隔离 Desktop 的 DSH Home；也支持 Config 的 `databasePath`（普通字段，修改后需要重启插件）。页面不会向普通用户显示完整路径。

数据库包含：

- 状态快照（当前值、长期基准、修订号、更新时间）；
- 事件审计（类型、来源、信任、评价、变化前后、幂等键、证据标识）；
- 兴趣与别名（长期偏好、近期活跃、作用域、来源、人工标记）；
- 场景/范围与授权元数据；
- schema 版本与运行时租约。

不包含 Memory 的长期记忆、Life 的意图/预算数据库、QQ 内容或凭据。

## 自动备份

- 打开已有数据库时，如果 Schema 版本不兼容，会先复制一份 `backups/state-before-migration-*.sqlite`，然后拒绝使用或执行受支持迁移。
- **重置当前状态到基准** 前会创建 `backups/state-before-reset-*.sqlite`。
- 设置页 **运行诊断 → 创建数据库备份** 创建 `backups/state-manual-*.sqlite`。
- 每个数据库目录最多保留 5 个备份（按修改时间修剪）。
- 备份是 SQLite 一致性文件副本；恢复时先停止 DSH/插件写入。

## 手动备份

1. 停止 DSH 或至少停用 State 插件。
2. 复制 `state.sqlite`（以及同目录可能存在的 `-wal`、`-shm`）到安全位置。
3. 或者使用设置页的诊断按钮创建 `backups/` 副本。

## 恢复

1. 停止 DSH/插件写入。
2. 保存当前数据库副本（不要直接覆盖丢失）。
3. 将选定的备份复制回 `state.sqlite`，并删除旧的 `state.sqlite-wal` / `state.sqlite-shm`（如果存在）。
4. 启动 DSH；插件会做完整性检查与 schema 验证。
5. 打开 **运行诊断** 确认数据库 ready、Schema 版本与数据量。
6. 检查状态、兴趣和变化记录是否符合预期。

如果数据库损坏、缺少 schema 元数据、为空文件或版本高于当前插件，插件会**拒绝使用**，不会静默创建空库覆盖。此时保留原文件并报告错误，不要删除。

## 迁移

- 当前 Schema 版本为 `1`。
- 打开已有文件时先执行 `PRAGMA integrity_check`，再读取 `meta.schema_version`。
- 不兼容/较新版本会先备份再拒绝；未来受支持迁移会在单个事务中执行并重新校验表。
- 迁移失败会回滚，原始数据库保留。

## 升级插件版本

当前正式版本为 `1.0.0`，Schema `1`。升级前：

1. 记录当前版本、Schema 和 tarball SHA-256。
2. 创建 `state.sqlite` 备份并保留旧 tarball/`PACKAGE_INFO.json`。
3. 通过 Plugin Manager 替换 tarball；不要同时启用两个 State 实例。
4. 重启后检查版本、设置入口、两个配置入口、状态/兴趣/审计和数据库诊断。
5. 若新版本拒绝当前 Schema，停止并恢复升级前数据库/旧版本；不要手工改 `meta.schema_version`。

完整步骤见 [升级与回滚](UPGRADE.md)。

## 回滚插件版本

1. 先创建备份并记录当前版本/Schema。
2. 通过 Plugin Manager 卸载或替换为旧版本包。
3. 旧版本若支持当前 Schema，会正常打开；若不支持，会拒绝使用而不是覆盖。
4. 如需回到旧 Schema，只能恢复与旧版本匹配的备份；不要手工改 `meta.schema_version`。
5. 确认设置入口恢复、数据仍存在、Life/Memory 不受影响。

## 卸载

- 卸载/停用插件不会自动删除 `amadeus-state` 数据目录。
- 需要彻底清理时，先备份，再在 DSH 停止后删除该目录。
- 不要删除 Memory 的 `memory` 数据目录；State 的兴趣删除不等于 Memory 记忆删除。
- 回滚或卸载后，检查 DSH 启动、其他插件和原有设置菜单不受影响。

## 故障排查

- 页面诊断显示数据库不可用：先停用插件，保留数据库和 `backups/`，检查文件权限/完整性。
- 运行时租约被占用：确认没有另一个 DSH/State 实例仍在写入；不要强行删除租约，先正常关闭旧实例。
- 备份按钮失败：检查数据目录写权限与磁盘空间；不要把数据库放到只读目录。
