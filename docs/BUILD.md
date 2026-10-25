# 构建、验证与可复现性

## 命令

```powershell
npm test
npm run check
npm run package
npm run verify:package
```

- `npm test`：进程内 `node:test` 套件；官方 Schemastery 不可用时跳过其专项用例，但忠实 rehydrator 和结构回归始终运行。
- `npm run check`：重建 `lib/client.js`，检查语法、manifest、client markers、字段元数据、无私有模块导入和版本一致性。
- `npm run package`：构建后连续打包两次，比较 SHA-256；写入 `dist/PACKAGE_INFO.json` 与 `dist/BUILD_INFO.json`，再执行包内容一致性验证。
- `npm run verify:package`：只验证已有 tarball 与当前工作树、文件列表、哈希、必需发行文档和禁止内容；不安装。

## 制品

| 文件 | 内容 |
|---|---|
| `lib/client.js` | 构建后的 DSH lazy-CJS 浏览器半端 |
| `dist/amadeus-state-1.0.0.tgz` | 可安装 npm tarball |
| `dist/PACKAGE_INFO.json` | 版本、实际文件列表、大小、SHA-256、可复现标记 |
| `dist/BUILD_INFO.json` | Node/DSH 引擎、client 哈希、source manifest/聚合哈希、构建记录 |

`dist/` 是本地构建产物并被 `.gitignore` 忽略；最终源码、包版本和 tarball 哈希必须由同一次 `npm run package` 生成并一起交付。

## 可复现性

`scripts/package.mjs` 固定 `SOURCE_DATE_EPOCH=2026-10-25T00:00:00Z`、`TZ=UTC`，在隔离目录中打包两次并要求 byte-for-byte SHA-256 相同。如果不一致，命令失败并打印两次哈希，不写成功回执。

`scripts/verify-package.mjs` 解包实际 tarball，逐文件比较当前工作树字节，检查必需发行文档和 client markers，并拒绝以下内容：

- SQLite/WAL/SHM、备份、日志、`.env`；
- `node_modules`、`dist`、coverage、`.git`；
- 绝对 Windows 用户路径、私钥或常见凭据格式；
- 缺失/重复的包文件列表或与 `PACKAGE_INFO`/`BUILD_INFO` 不一致的哈希。

## 包内不含

不包含 SQLite 数据库、备份、日志、私人会话、模型 API Key、设备凭据、生产路径、Life/Memory 私有源码或测试生成的数据库。设置页截图只使用合成配置；验收原始会话记录留在隔离开发区，不进入公开包。

## CI/离线说明

测试和打包不依赖网络；官方 Schemastery 回归可通过 `DSH_SCHEMASTER_PATH` 指向本机官方 3.18.5 安装目录运行。`npm pack` 使用工作树内的临时 `.npm-cache`，避免写入用户级 npm 缓存。
