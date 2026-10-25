# 运行与 Token 开销

2026-10-25 在本机 Windows / Node `v22.23.2` / 官方 DSH 兼容代码路径上，用 `npm run bench` 对全新 OS 临时数据库测量（不触碰任何 DSH Profile、生产数据库或 Memory/Life 数据）：

| 路径 | 结果 |
|---|---:|
| 1000 次当前 Session 读取（含状态趋势/基准/兴趣视图） | 89.7 ms 总计，约 **89.7 µs/次** |
| 200 次可信事件写入（含事务、审计、兴趣更新） | 83.5 ms 总计，约 **0.42 ms/事件** |
| `brief` 动态上下文 | **192 字符** |
| `state_interests` 动态上下文 | **251 字符** |
| 默认上下文上限 | **420 字符**（`contextMaxChars`，可配置 80–1200） |
| 额外模型调用 | **0**；没有定时器、周期任务或后台模型调用 |

测量脚本使用全新临时数据库、固定合成 Session、单独关闭并删除临时目录；结果只代表本机单进程缓存后的量级，不是跨机器 SLA。SQLite 首次打开、系统负载和磁盘会改变数字。

## Token 影响

动态上下文是固定字符上限的短文本，不是完整历史。上表的 192/251 字符按常见 tokenizer 粗略约 **100–250 tokens/回合**（实际 token 数取决于 DSH 使用的 tokenizer）；`contextInjectionMode=off` 时为 **0**，`brief` 只注入状态/倾向，`state_interests` 额外注入最多 4 个兴趣。

## 运行时开销

- 无周期性任务、无 autonomous wake、无外发消息、无额外 LLM 调用。
- 普通读取是一次 SQLite snapshot 读取；普通事件写入是一个 `BEGIN IMMEDIATE` 事务。
- 管理 HTTP API 只在打开/刷新设置页时请求；GUI 不会在后台轮询。
- 上下文由当前 Session 的授权 scope 生成；失败或未授权时返回空字符串，不阻塞模型回合。

## 复测

```powershell
npm run bench
```

脚本总是创建新的 `<tmp>/state-bench-*/state.sqlite` 并在结束时删除；不允许传入生产路径。测量结果供本机容量评估，不写入发布包或 DSH 数据。
