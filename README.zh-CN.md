# Amadeus State

<img src="assets/market-icon.png" width="80" alt="Amadeus state logo">

[English](README.md) · [详细配置参考](REFERENCE.md)

工作区共享状态与持久化演化历史。

目标发行包：**`@fg-lab/amadeus-state@1.2.0`**。已验证的官方 DSH Desktop 基线：**0.2.1-rc.3**。许可证：MIT。

## 当前发行状态

目前是产品化候选。正式 npm 与 GitHub Release 发布仍需通过发布门禁并完成 npm 账户授权；这里的版本号不代表已经公开发行。

## 能帮你做什么

- 保存情绪、精力、好奇心及兴趣权重，记录状态事件和演化历史。
- 绑定工作区，设置已支持的会话覆盖、排除项与演化规则。
- 在 DSH 原生设置可视化页面中检查当前值、规则及持久历史。

示例：查看某项兴趣的当前权重与事件历史，调整演化规则，再观察后续状态变化，无需改写长期记忆。

State 管理当前状态及变化，Memory 管理事实、经历和长期知识；State 不替代 Persona 的核心身份。不要将 QQ 专属场景规则或不可用的可选 Memory 写入契约当成已支持功能，具体边界见完整参考。

## 安装与首次配置

使用官方 DSH 插件管理器将预构建 `.tgz` 安装到所需 Profile，无需手工构建源码。按[安装说明](docs/INSTALL_V1_2.md)操作，不要手工改写正在运行的 Profile。

在 DSH 原生设置中选择工作区，查看状态并配置演化规则。

其他 Amadeus 插件均为可选联动，按需要分别安装。

## 界面

![Amadeus State 界面](docs/verification/screenshots/state-v1.1-overview-desktop.png)

截图展示已有界面，不表示本轮所有真实平台能力均已通过。具体限制请阅读配置参考和验收报告。

## 升级与回滚

升级前备份用户数据。程序、持久数据和恢复备份分开保存。禁用停止功能；卸载默认保留外部数据。回退旧程序不能自动撤销数据库迁移。

- [升级政策](docs/UPGRADE_POLICY.md)
- [数据迁移与恢复](docs/DATA_MIGRATION.md)
- [发行检查清单](docs/RELEASE_CHECKLIST.md)
- [完整配置与限制](REFERENCE.md)

[项目主页](https://github.com/jeskoky-pixel/Amadeus-dsh) · [MIT 许可证](LICENSE)
