# 安装、构建与验收准备

本文件描述隔离开发/验收环境的安装方式。State v1 已由 Codex 在隔离 DSH Desktop 0.2.1-rc.3 通过官方 Plugin Manager 安装与验收；操作记录见 [验收报告](verification/STATE_V1_ACCEPTANCE_2026-10-25.md)。

## 前置条件

- Windows DSH Desktop Official **>=0.2.1-rc.2**（以实际版本与设置 slot 行为为准）。
- Node.js **>=22.13.0**，且运行时支持 `node:sqlite`。
- 使用隔离 DSH Profile / 合成数据；不要指向生产 Life、Memory、QQ Bridge 或真实联系人。

## 构建与检查

在 State 仓库根目录：

```powershell
npm test
npm run build
npm run check
npm run package
```

产物：

- `lib/client.js`：DSH lazy-CJS 浏览器半端，package `dsh.client` 声明。
- `dist/amadeus-state-1.0.0.tgz`：npm pack 生成的独立安装包。
- `dist/PACKAGE_INFO.json`：包含版本、文件列表、大小和 SHA-256。

`npm run package` 会先构建客户端，再调用 `npm pack`。安装包包含 `src/`、`lib/`、`locale/`、`docs/`、`cordis.patch.yml`、`README.md` 与图标；不依赖源码工作树的临时文件。

## 通过官方 Plugin Manager 安装

1. 打开隔离 DSH Desktop，进入 **设置 → 插件**。
2. 选择 Amadeus State / `@amadeus/state` 的本地 tarball 或本地 `link:` 包进行安装。
3. 安装后启用插件，等待 Host 重新加载。
4. 打开 **设置**，确认左侧出现 **Amadeus 状态**；打开 **设置 → 插件 → Amadeus State**，bundle/row 详情页应出现 State 自己的基础配置卡（同一 `amadeus-state` 命名空间与 revision）。
5. 如果没有出现：
   - 检查插件是否启用、Host 日志是否报告加载失败；
   - 检查 `dsh.client` 的 `inject` 是否包含 `@deepseek-ai/dsh-client-ui-settings`；
   - 检查 `lib/client.js` 是否存在且能被官方模块加载器读取；
   - 卸载/停用后确认入口撤销，再重新安装。

不要通过修改 DSH Desktop 核心源码来添加入口。

## 安装后验证（Codex 实机清单）

- [ ] 插件管理器显示名称、版本、描述、启用状态与基础配置。
- [ ] 设置左侧出现 **Amadeus 状态**，点击进入正确页面。
- [ ] 三个状态值、基准、说明、最后更新时间正常显示。
- [ ] 修改敏感度并保存；Host 实际读取新值（可用 `state_get` 或诊断确认）。
- [ ] 刷新页面后配置保持；重启 DSH 后配置仍保持。
- [ ] 添加/调整/停用/删除兴趣；删除提示不涉及 Memory。
- [ ] 变化记录分页、来源、信任级别与变化前后正常。
- [ ] 预览不改变数据库；恢复默认只清配置；重置状态需要确认并保留历史。
- [ ] 模型工具 `state_get`、`state_appraise`、`state_interests`、`state_health` 在真实模型回合可用。
- [ ] 调整动态上下文注入模式后，下一回合实际上下文变化。
- [ ] 禁用插件后页面入口撤销、DSH 正常工作、数据不删除。
- [ ] Life/Memory 缺失或关闭时显示未连接并降级。
- [ ] 未授权/非 owner 请求无法写入管理 API。
- [ ] 卸载/回滚路径与数据保留行为符合 [备份与回滚](BACKUP_ROLLBACK.md)。

## 隔离与安全

- 使用独立 DSH Home/Profile 与合成数据。
- 不修改生产 Profile、生产 Mneme/Life 数据库、QQ Bridge 或真实联系人消息。
- 不发布 npm、不创建公开 Release、不合并现有 PR。
- 安装/升级不需要手动修改 DSH 内部源码。
- 安装后如需排查，先看设置页 **运行诊断**；不要上传数据库或包含私人内容的日志。

## 兼容性记录

- 当前开发基线：DSH Desktop `0.2.1-rc.3`（官方设置 slot / lazy-CJS / `Config.volatile` / `ctx.connection.admit` 代码形态）。
- 实际兼容版本以 Codex 的隔离 Desktop 验收结果为准；不同 DSH 版本若缺少 `connection.admit`，管理 API 会 fail-closed 503，而不是把回环地址当管理员。
