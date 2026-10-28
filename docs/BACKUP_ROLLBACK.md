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

- 打开已有数据库时，如果 Schema 版本不兼容，会先用 `VACUUM INTO` 创建 `backups/state-before-migration-*.sqlite` 一致性快照，然后拒绝使用或执行受支持迁移。
- **重置当前状态到基准** 前会创建 `backups/state-before-reset-*.sqlite`。
- **从备份恢复** 前会创建 `backups/state-before-restore-*.sqlite` 安全备份。
- 设置页 **数据与诊断 → 创建数据库备份** 创建 `backups/state-manual-*.sqlite`。
- 每个数据库目录最多保留 5 个备份（按修改时间修剪）。
- v1.1 起备份由 SQLite `VACUUM INTO` 生成，包含已提交但尚未 checkpoint 的 WAL 行；生成后立即验证 `integrity_check`、Schema、必需表和列，验证失败会删除候选文件并报错，不会把未验证文件列为可恢复备份。
- 每次备份的文件名包含随机唯一后缀，即使系统时钟相同且 reason 相同也不会覆盖已有备份；失败清理只删除本次候选文件，不触碰更早的已验证备份。

## 手动备份

1. 停止 DSH 或至少停用 State 插件。
2. 复制 `state.sqlite`（以及同目录可能存在的 `-wal`、`-shm`）到安全位置。
3. 或者使用设置页的诊断按钮创建 `backups/` 副本。

## 恢复

### 通过 GUI 恢复（推荐）

1. 打开 **设置 → Amadeus 状态 → 数据与诊断**。
2. 在 **数据库备份与恢复** 中确认备份列表；需要时可先点 **创建数据库备份**。
3. 选择一个备份，点击 **从备份恢复**，阅读并确认高风险操作。
4. Host 会先验证备份的 `integrity_check`、Schema 版本、必需表和列，然后创建 `state-before-restore-*.sqlite` 安全备份，关闭当前数据库。
5. 关闭后 Host 把当前 `state.sqlite` 及其可能存在的 `-wal`/`-shm` **作为一个旧文件集一起移动到唯一临时名**，不会在保留旧集之前 unlink 活跃 WAL/SHM；不依赖 Windows 关闭时一定 checkpoint。然后原子安装备份并重新打开。
6. 成功后页面自动刷新状态、兴趣和诊断；如果页面暂时断连，刷新设置页即可。
7. 如果验证、替换或重新打开失败，Host 恢复旧 DB/WAL/SHM 集合并重开原数据库；如果回滚本身无法立即重命名（例如文件句柄未释放），会 fail closed 并保留旧集、候选文件等取证 artifacts，不会为了显示干净错误而删除它们。查看错误并保留原数据库/备份。

恢复只替换 State 的 SQLite 数据，不修改插件 Config、Life/Memory 数据库、QQ 数据或凭据。

### 手工恢复

1. 停止 DSH/插件写入。
2. 保存当前数据库副本（不要直接覆盖丢失）。
3. 将选定的备份复制回 `state.sqlite`，并删除旧的 `state.sqlite-wal` / `state.sqlite-shm`（如果存在）。
4. 启动 DSH；插件会做完整性检查与 schema 验证。
5. 打开 **运行诊断** 确认数据库 ready、Schema 版本与数据量。
6. 检查状态、兴趣和变化记录是否符合预期。

如果数据库损坏、缺少 schema 元数据、为空文件或版本高于当前插件，插件会**拒绝使用**，不会静默创建空库覆盖。此时保留原文件并报告错误，不要删除。

## 迁移

- 当前 Schema 版本为 `2`。
- 打开已有文件时先执行 `PRAGMA integrity_check`，再读取 `meta.schema_version`。
- v1 → v2 只增加列/表；迁移前用 `VACUUM INTO` 做一致性快照，迁移在单个事务中执行并比较行数/完整性。
- 迁移失败会回滚，原始 v1 数据库与迁移前快照保留；插件拒绝使用而不是部分升级。
- v1 备份仍可 preflight；恢复后重新打开时执行迁移。回滚到 v1.0 时使用迁移前快照或旧版本匹配备份，不要手工改 `meta.schema_version`。

## 升级插件版本

当前候选版本为 `1.1.0`，Schema `2`。升级前：

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
