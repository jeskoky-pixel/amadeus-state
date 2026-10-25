# State v1 独立验收（2026-10-25）

## 环境与制品

- 官方 DeepSeek Harness Desktop `0.2.1-rc.3`，Windows，独立 DSH Home、独立 Workspace、合成数据。
- 安装方式：官方 Plugin Manager 安装 `dist/amadeus-state-1.0.0.tgz`；重新启用及硬重启均通过。
- 最终包 SHA-256 见 `dist/PACKAGE_INFO.json`（本地生成，不随源码提交）。
- 仓库源码不含 SQLite、私人会话、令牌或原始 Host 日志。设置页截图仅包含合成配置表单：[常用设置](../assets/settings-common.png)、[高级设置](../assets/settings-advanced.png)。

## 测试结果

| 项目 | 实际结果 |
| --- | --- |
| 自动测试 | `npm test`：97 通过、1 跳过、0 失败；跳过项为测试运行环境缺少官方 Schemastery。曾以官方 Schemastery 3.18.5 单独重建完整 Config，并在真实 DSH Plugin Manager 渲染验证。`npm run check` 与 `npm run package` 通过。 |
| 安装与 GUI | 原生左侧“Amadeus 状态”入口和 Plugin Manager 基础配置卡均出现；两者共用配置。敏感度在 Plugin Manager 保存为 `1.55`，Host 和独立设置页均读到 `1.55`。浅/深色及窄布局在真实页面检查。 |
| 状态及兴趣 | 三项状态、基准、说明和审计分页显示；合成兴趣添加、调整及重启后保留。预览前后 State revision 均为 `2`，未落库。 |
| 配置与重置 | GUI 草稿未提前改变 Host。重置的“取消”使 revision 保持 `3`；二次确认后变为 `4`，审计历史保留。恢复默认后敏感度为 `1`，Memory 引用联动回到默认关闭。 |
| 真实模型工具 | 官方 DeepSeek Flash 在隔离 Creator 会话调用了 `state_health`、`state_get`、`state_appraise`、`state_interests`；State 工具输出与合成审计相符。 |
| 动态上下文 | 在隔离新会话中，先调用 `state_get` 建立本地私有 scope，再由管理员 API 写入仅用于测试的独特兴趣。GUI 把注入模式保存为 `state_interests` 后，下一真实模型回合明确禁止工具和文件读取，模型直接答出该兴趣 `合成荧蓝天体20261025（活跃 0）`；该名称只来自当前 scope 的动态上下文。测试后 GUI 已恢复 `brief`。 |
| Life | 合成完成活动首次接受，重复回执只返回 `duplicate:true`，未知活动拒绝；Life 的真实 Host 服务负责活动验证。 |
| Memory | 官方 Plugin Manager 安装 Mneme `0.9.4` 到同一隔离实例。模型用 `memory_save`/`memory_get` 创建并读取合成记忆。开启 State Memory 引用后，模型对同一 ID 首次与重复调用 `state_appraise`，State 仅产生一条 `memory_reference` 审计事件，revision 从 `2` 到 `3`；不存在的 ID 未新增事件。恢复默认后联动重新关闭。 |
| 权限 | 跨站写入 403、缺少 `x-amadeus-state` 的写入 403、无认证读取 401。单元测试覆盖非 owner、错误 scope、撤销、模型伪造来源及重复事件。 |
| 持久化与停用 | 硬重启前后 scope、revision、兴趣 ID 和事件 ID 一致；SQLite 冷备份 `integrity_check=ok`。禁用 State 后导航入口消失，重新启用后数据保留。 |
| 日常 DSH 本体验收与回滚 | 备份原有 Profile 后重启日常 Desktop；官方 Plugin Manager 从 State tgz 安装成功。Host 返回 `ready`、版本 `1.0.0`，原生设置页打开并读到默认敏感度 `1`，安装期间未产生用户 State scope。随后通过 Plugin Manager 卸载；State API 为 404、设置入口消失、日常 Desktop 继续运行。`package.json`、`pnpm-lock.yaml`、`cordis.yml`、`cordis.patch.yml` 与安装前备份逐项 SHA-256 一致。测试新建的 State 数据另存本机备份，原有 Life/Memory/QQ Bridge 数据未改动。 |

## 性能与隐私边界

状态演化是确定性本地计算，按读取或事件发生时间推进；没有周期性额外模型调用。上下文由当前 Session 的授权 scope 生成，默认上限 420 字符，可关闭。Memory 自动摘要写入关闭且无隐藏写入路径。Life 没有公开完成事件推送，当前需模型提供活动 ID，State 再通过 Life 服务核验。Mneme 尚无可证明与 Life Scene 等价的 Host 级写入权限契约，因此 Memory 引用默认关闭，自动写入不可用。

## 仍需单独确认

- 日常 DSH 本体验收使用的是首次交付包（SHA-256 `e1f06ddb8796c8c674b3b003f179f468b7cc42bdadb113c72668546397e8fdf6`）。本报告文本更新后重新打包会改变 tarball 哈希，但代码和客户端 bundle 未变；后续最终包应在隔离实例再次加载检查。
- 动态上下文的真实模型回合已验证“状态与兴趣”模式能传递当前 scope 的独特兴趣；完整系统 Prompt 原文未从 DSH 导出，因此此项证据是行为结果与 Host/GUI 配置的联合验证，而不是原文记录。
- 当前仓库 `UNLICENSED`，所有者尚未选定开源许可证；不得视作允许第三方再分发。
