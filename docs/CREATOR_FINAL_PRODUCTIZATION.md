# State 1.0.0 — 最终产品化交付

日期：2026-10-25（Asia/Shanghai）。工作树：`amadeus-state`，分支 `codex/state-v1`。本轮未提交 Git、未安装、未发布、未改动生产 DSH/Profile/Life/Memory/QQ 数据。

## 1. 用户能力

- **状态/兴趣/事件/状态诊断**：概览显示 Mood/Energy/Curiosity、基准、方向、范围、最后更新；兴趣可添加、编辑基线/别名、停用/启用、确认删除；变化记录分页显示来源/信任/变化；诊断显示版本、schema、计数、Life/Memory 连接、最近错误。
- **常用/高级配置**：同一 `amadeus-state` Config 和 revision；字段显示标签、帮助、范围、单位、默认值、立即生效/重启；保存/取消、恢复默认、冲突提示、校验错误、禁用/加载/错误状态。
- **备份与恢复**：诊断页可创建备份、列出安全 basename、选择并二次确认恢复。Host 先做 integrity/schema/表/列预检，创建 `state-before-restore-*` 安全备份，关闭并原子替换 SQLite，失败恢复原文件并重新打开。只影响 State 数据，不删除 Memory/Life/Config。
- **账户/权限**：管理 API 仍要求 DSH authenticated owner、同源、`x-amadeus-state: 1`；浏览器不直接访问 SQLite，不显示路径/凭据/私人证据。
- **生命周期**：`settings.section` / `plugins.detail.section` 保留 REWORK_1 的可释放、幂等注册；支持重复 watch、停用/启用、HMR、重装和 Life/Memory 共存。

## 2. 本轮改动

| 文件 | 内容 |
|---|---|
| `src/store.js` | `listBackups`、basename/路径约束、`preflightBackup`（integrity/schema/表/列/计数）、`restoreBackup`（安全备份；关闭后保留 live DB+WAL+SHM 旧文件集；原子安装；失败恢复完整旧集或保留取证 artifacts；重新打开；清理 stale lease） |
| `src/service.js` | `listBackups`、`restoreBackup`（显式 `RESTORE`、重新扫描 last event、返回 health/backups）；完整 health 暴露安全备份元数据 |
| `src/http.js` | `GET /backups`；`POST /restore`；沿用 owner/同源/marker 防护 |
| `src/index.js` | 降级服务提供 `listBackups: []`、`restoreBackup` fail-closed；健康状态包含空备份列表 |
| `src/client/factory.template.js` | 诊断页备份列表/选择/恢复按钮、二次确认、成功/失败反馈；所有字段显示范围/单位/默认/生效时机；中英文恢复文案；保持响应式/焦点/无水平页面溢出 |
| `scripts/bench.mjs` | 全新临时数据库的只读/写入/上下文开销测量 |
| `package.json` | `npm run bench`；最终包版本/引擎/文件清单保持 |
| `test/store.test.js` | 备份列表/preflight/恢复；WAL 写入后对 `before-copy`、`before-close`、`after-close`、`after-preserve`、`after-install`、`after-open` 每个阶段注入失败；回滚失败保留旧 DB/WAL/SHM/候选 artifacts；无效名称/损坏文件/无确认/数据不变 |
| `test/http.test.js` | `/backups`、`/restore` 确认、无效文件、owner/marker 路由、无路径泄漏 |
| `test/apply.test.js` | dispose 后同一数据库重新 apply（停用/重装）保留状态 |
| `test/client.test.js` | 重复 watch、停用/启用、namespace 再 served、释放/二次释放回归 |
| `test/gui-product.test.js` | 恢复控件/二次确认、范围/默认/单位、响应式、焦点、错误/禁用标记 |
| `docs/BACKUP_ROLLBACK.md`、`docs/UPGRADE.md`、`docs/USER_GUIDE.zh.md`、`docs/ARCHITECTURE.md`、`docs/INSTALL.md` | 用户恢复/升级/回滚说明、安全语义和验收步骤 |
| `docs/PERFORMANCE.md` | 运行与 Token 开销、测量方法和复测命令 |
| `docs/RELEASE_NOTES.md`、`CHANGELOG.md`、`README.md` | 恢复能力、性能文档和发行说明 |
| `scripts/check.mjs`、`scripts/verify-package.mjs`、`test/package.test.js` | 新增文档/恢复标记/bench 检查 |

没有修改状态引擎公式、事件信任边界、Life/Memory 可选集成语义或 Memory 自动写入硬禁用。

## 3. 精确验证结果

```text
npm test
# 109 tests, 108 pass, 0 fail, 1 skipped
# 跳过：测试环境无官方 Schemastery；结构与忠实 rehydrator 仍运行

DSH_SCHEMASTER_PATH=<official 3.18.5> npm test
# 109 tests, 109 pass, 0 fail

npm run check
# built lib/client.js (98537 bytes, 25 fields)
# State release checks passed (16 source files, 25 fields)

npm run package
# package verified: @amadeus/state@1.0.0, 59 files, 262012 bytes
# sha256: 341ec37a611cd59afead38a3cf0467024abe59f9a1057e140970aa92df461947
# reproducible: true

npm run verify:package
# package verified: 59 files, sha256 同上
```

`dist/BUILD_INFO.json` 对应值：client SHA-256 `6b60011ff228fbd7942c3650bffd39dc2cf7f390febaeb9144e1233b20011d73`，source manifest 聚合 SHA-256 `d83d72db6a3c5bb3c589d0f92a0a4eabe53d20eab5d90def3491cb176524c1d7`，source 文件数 58（tarball 59 含 `package.json`）。

性能（`npm run bench`，全新临时 SQLite，本机 Node v22.23.2）：

- 1000 次当前 Session 读取：89.7 ms（约 89.7 µs/次）。
- 200 次可信事件写入：83.5 ms（约 0.42 ms/事件）。
- `brief` 上下文 192 字符；`state_interests` 251 字符；默认上限 420 字符。
- 额外模型调用/周期任务/外发动作：0。

详细见 [PERFORMANCE.md](PERFORMANCE.md)。

## 4. 产品门与诚实状态

- **本轮未做真实 Desktop 安装**：上述结果只证明工作树、客户端 bundle、tarball、测试和文档一致；不替代隔离 Desktop 实机。
- **Codex 必须复验**：在全新隔离 Profile 安装最终 tarball，验证备份→修改→恢复、无效备份拒绝/数据不变、WAL 写入后恢复及失败时旧 DB/WAL/SHM 保留、两个设置入口生命周期、停用/启用/重装、Life+Memory 共存、浅/深色/窄窗口/键盘焦点和重启持久化。
- **隔离 GUI/API smoke 状态**：本轮 API 路由恢复由 in-process HTTP harness 实测（`GET /backups`、`POST /restore`、失败回滚/无效输入）；没有可用的一次性隔离 Desktop 安装，因此没有声称完成真实 GUI 恢复 smoke。
- **权限**：单测覆盖 owner/remote/cross-site/marker；真实 DSH 的 owner admission 仍以 Codex 实机为准。
- **升级/回滚**：当前只有 schema v1；未知/较新 schema 会先备份再拒绝。没有历史 schema 迁移可实机演练，文档给出替换包 + 恢复匹配备份的路径。
- **许可证**：仍为 `UNLICENSED`；未做 npm/GitHub 发布或 PR 合并。
- **测试环境限制**：默认环境无官方 Schemastery，专项用例 skip；使用官方 3.18.5 时 109/109 通过。

## 5. Codex 隔离 Desktop 最终步骤

1. 核对 `dist/PACKAGE_INFO.json` 的 SHA-256 与本报告一致；仅在全新隔离 Profile 安装 `dist/amadeus-state-1.0.0.tgz`。
2. 打开设置左侧 State 与 Plugin Manager 基础卡；确认各只出现一次。连续刷新/重开设置，控制台无 `settings.section`/`plugins.detail.section` duplicate id。
3. 修改常用字段并保存，确认独立页/Host 同步；制造外部 revision 冲突，确认保存禁用/冲突提示；取消/恢复默认不改变状态、兴趣、审计。
4. 在诊断页创建备份，修改状态/兴趣，选择备份并确认恢复；确认恢复前安全备份存在、数据回退、页面重新读取成功、schema/counts 正确。
5. 用损坏备份、路径名、错误确认词测试拒绝；确认原数据不变、无破坏性覆盖。
6. 停用/启用/卸载/重装 State，确认两个入口撤销/恢复、数据保留、Life/Memory 仍 200；硬重启后配置与数据保留。
7. 检查浅/深色、窄窗口、键盘焦点、加载/错误/禁用态、无水平溢出；确认无路径/凭据/私人内容出现在 UI 或 API。
8. 记录最终 tarball SHA、DSH 版本、测试输出和失败项；许可证/公开发布保持待所有者决定。

## 6. 包内容一致性

`npm run package` 固定 `SOURCE_DATE_EPOCH`/`TZ`，连续打包两次比较 SHA-256；`verify:package` 逐文件比较 tarball 与当前工作树，并拒绝数据库/备份/日志/密钥/私密路径。最终包不包含本文件（开发交付报告）和运行时数据库；包内文档为 `RELEASE_NOTES`、`COMPATIBILITY`、`UPGRADE`、`BUILD`、`PERFORMANCE`、`USER_GUIDE`、`INSTALL`、`BACKUP_ROLLBACK`、`ARCHITECTURE`、`ADR`、验收报告。
