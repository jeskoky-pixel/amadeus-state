# ADR-001: State v1 产品架构

日期：2026-10-25。状态：实施基线，真实 DSH 验收后再锁定兼容版本。

## 决策

- State 是独立 Cordis 插件，唯一拥有自己的状态和兴趣 SQLite 数据。核心演化为无随机数的纯函数；短期状态按实际经过时间向缓慢变化的基准回归。只在合法事件、人工操作或有界读请求时推进，不启用高频 LLM 轮询。
- 三维状态为 Mood、Energy、Curiosity。事件 ID、来源、Scene、Session、Persona、发生时间、评价和最终采用的增量分开保存。相同事件 ID 幂等，来源真实性由可信 Host 适配器判定，模型只能提交受限主观评价。
- 状态读取按可信会话绑定及授权范围生成视图。私密事件的数值贡献及原因都不得流入未授权公共视图；授权撤销必须使派生视图失效。无法确认权限时拒绝该读取或更新。
- Life 只提供经验证的活动结果与身份服务，State 不调度唤醒。Memory 可提供经授权的实体/别名和经历引用，重复召回不构成新事件；两者缺席或超时时独立核心继续运行。
- DSH Host 服务统一控制读写。模型工具从执行上下文派生身份，不接受模型传入的可信来源或管理员身份。上下文注入短小、有界，由设置实时控制，只改变倾向建议，不覆盖 Persona 或 Life 的调度。
- 插件管理器使用官方 Config Schema。独立设置页使用 `dsh.client` 浏览器半端和 `settings.section` 插槽；两个入口共用 Host 的权威配置及修订号。浏览器不直连 SQLite；写入要校验、鉴权并处理并发冲突。
- 使用原生插件安装机制，不修改 DSH Desktop 核心。默认关闭额外模型评价调用、真实平台动作和外发。

## 参考与取舍

- [dsh-serene](https://github.com/chisato-lycoreco/dsh-serene)：借鉴纯函数、短长时间尺度、事件驱动；不引入完整六维三层与关系扣分。
- [OpenFeelz](https://github.com/trianglegrrl/openfeelz)：借鉴时间指数回归；不引入 PAD/OCEAN 等完整模型。
- [Emotion Engine](https://github.com/pioneerjeff-labs/emotion-engine)：借鉴来源与评价分离、事件幂等、审计；不引入自动现实人物信任评分。
- [dsh-feiyu-mood](https://github.com/Yuuyuko-uu/dsh-feiyu-mood)：参考 `client.js` 的 `settings.section` 注入和浏览器模块声明；重新设计 State 页面，不复制代码。
- [Persisto Mate](https://github.com/m-rui001/dsh-mate-companion)：参考受控评价与上下文集成；不复建记忆、睡眠或自主发送。
- 五个参考仓库的 GitHub license API 在本日显示 MIT。当前决策仅借鉴机制，不复制实现。State 仓库的独立许可证仍待所有者决定。
- [官方 DSH 设置表单说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-settings-card.md) 指出插件 `Config` 与 `Volatile`、`dsh.client`、浏览器模块懒 CJS 格式及设置页插槽。安装版本的 API 和行为仍须实测。

## 验收门槛

纯函数、存储迁移与权限测试通过后，必须在隔离 DSH Desktop 中通过 Plugin Manager 安装包，真实打开设置页、保存配置、调用模型工具、重启、停用、重启恢复，并记录安装包哈希及兼容版本。静态页面和 Mock 测试不能替代实机验收。
