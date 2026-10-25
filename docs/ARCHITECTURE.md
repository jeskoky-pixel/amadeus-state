# 架构与信任边界

## 1. 组件

```text
DSH Model Turn
  ├─ state_* tools ───────────────┐
  ├─ dynamic runtime context ─────┤
  └─ Settings page (browser)      │
        │ configForms (DSH)        │
        │ owner HTTP API           │
        ▼                         ▼
  DSH Connection ─────────── State Host service
                                  ├─ trusted identity/scope
                                  ├─ deterministic engine
                                  ├─ interest engine
                                  ├─ SQLite store + backups
                                  ├─ optional Life adapter
                                  └─ optional Memory tool adapter
```

- **Host half**：`src/index.js` 注册 `ctx.provide('amadeusState', …)`、四个模型工具、动态上下文，以及可选的 `webServer` 管理路由。
- **Browser half**：`src/client/factory.template.js` 经 `scripts/build-client.mjs` 生成 `lib/client.js`（DSH lazy-CJS）。注册 `settings.section` 独立页和 `plugins.detail.section` 插件管理器基本配置卡；两者只通过同一个 `ctx.configForms.get('amadeus-state')` 读写权威配置，动态数据经 Host HTTP API。详情卡按 `subject.pkg.name === '@amadeus/state'`（bundle/row）过滤，不重复注册。
- **Engine**：`src/engine.js` 纯函数；`src/interests.js` 纯函数。
- **Persistence**：`src/store.js`，内置 `node:sqlite`，WAL、事务、幂等、租约、备份。
- **Scope**：`src/scope.js`，只接受可信 Session 执行上下文。
- **Adapters**：`src/adapters.js`，只使用 Life 公开 Host 服务和 Memory 原生工具。

## 2. 状态模型

每个作用域保存：

- 短期 `mood`（-100…100）、`energy`（0…100）、`curiosity`（0…100）；
- 长期 `baselineMood` / `baselineEnergy` / `baselineCuriosity`；
- 修订号、最后更新时间、时钟异常时间。

演化：

- 短期值按各自半衰期向基准指数恢复；
- 基准按 14 天半衰期向配置 setpoint 缓慢靠拢；
- 事件先应用类型基础效应，再乘敏感度/信任因子、主观评价、饱和因子，并按单事件上限与上下界裁剪；
- 长期基准只从实际短期变化中学习很小比例，普通聊天不会频繁改写；
- 无随机数；相同（状态、配置、事件、时间）产生相同结果；
- 时钟回拨不倒退状态，并标记异常；超长离线使用有上限的指数恢复。

事件/评价/接受变化分离存储：

```text
type + source + trust + summary + appraisal + deltas + before/after + evidence refs
```

来源真实性由 Host/Life 适配器判定；模型参数不能提供 `source`、`trust`、`scope`、`scene`、`persona`、证据或管理员标记。

## 3. 幂等

`events.idempotency_key` 唯一：

- Life：`life:<scope>:<activityId>:<revision or status>`；
- Memory：`memory:<scope>:<memoryId>`（同一记忆永远只生效一次）；
- 无引用模型评价：`model:<scope>:turn:<turn>`（一个回合最多一次，另有短窗口速率限制）；
- 管理员重置：主机生成的随机 ID。

重复事件返回已有记录并标记 `duplicate: true`，不改变状态/兴趣。DSH 重试、Life 重启、HTTP 重发、页面重复打开都不会累计。

## 4. 范围与授权

### 可信身份

1. DSH 工具执行上下文 `exec.agent.session.id`，或 prompt context 的 `context.agent.session.id`。
2. 若 Life 可用且启用：
   - `life.getSessionBinding(sessionId)` 必须返回 **active** 绑定；
   - 读取 `life.getScene(sceneId)` 获得 privacy；
   - 绑定撤销/缺失/未知错误 → fail closed（不退回其他场景、不读取缓存）。
3. 若 Life 未安装/未启用：使用本地私有作用域 `local:<sessionId>`，persona `local:default`，scene `local:session:<sessionId>`。它从不声称拥有 Life 的 Persona/Scene。

### 派生读取

- 模型工具和上下文只读取当前会话自己的作用域；不合并其他私有场景的数值或原因。
- 管理页可列出所有作用域（owner 管理权限），但对 Life 作用域重新验证 owner Session 的 active binding；撤销后显示授权无效且不派生状态。
- 无共享场景数值合并；显式的 Life scene share 不会被 State 当作跨场景状态数值授权。这是保守策略，避免私有事件数字通过聚合泄露。
- 授权撤销后没有缓存：每次读取重新验证，因此派生视图立即失效。

### 管理员授权

- 管理 HTTP 路由要求：
  1. 同源（Host/Origin fence，拒绝 cross-site fetch）；
  2. POST 需要 `x-amadeus-state: 1`（CSRF 防护）；
  3. `connection.admit(req)` 成功；
  4. peer principal 为 **owner**。
- 若 DSH 版本没有 `connection.admit`，返回 503，而不是把 loopback 当管理员。
- 模型工具从不使用该 HTTP 路由，也不能提升为 owner。

## 5. 原生设置与配置一致性

- `Config` 由 `src/config-schema.js` 生成，根对象 + 每个公开字段 `.volatile()`；`databasePath` 是普通字段（重启生效）。
- `src/schema.js` 是原生的、无依赖的 Standard Schema 实现。`toJSON()` 必须输出官方 Schemastery **`{uid, refs}`** 信封：所有嵌套 schema 位置（`dict` 值、`list` 项、`inner`、`sKey`）都是指向 `refs` 的数字 uid，不能内联 `{type:'const'}` 对象。DSH 客户端用官方 `new Schema(serialized)` 重建表单；内联对象会导致真实 GUI 永久停在“正在读取…”。
- 回归测试 `test/schema-serialization.test.js` 同时使用官方 `@deepseek-ai/schemastery`（可用时/`DSH_SCHEMASTER_PATH`）和忠实本地 rehydrator，对完整默认 Config 做校验；结构性检查永远运行，官方库缺失时会 skip 而不是伪通过。
- 插件管理器与独立页面都使用 DSH 权威 Config：页面与 `plugins.detail.section` 卡片都用 `ctx.configForms.get('amadeus-state')`，保存时带 revision；`whileServed` 保证插件停用/命名空间消失时两个入口同时撤销。
- 页面保存用 `form.mutate(ops, revision)`；失败保留草稿并提示冲突；恢复默认用一组 `unset`；不直接改 SQLite。插件管理器卡片只暴露 5 个基础字段，使用同一套保存/取消/冲突逻辑。
- 备份恢复只接受 `backups/` 内的生成文件名；Host 先做 `integrity_check`、Schema/表/列预检，再创建 `state-before-restore-*` 安全备份，关闭连接。关闭后把 live `state.sqlite` + 可能存在的 `-wal`/`-shm` 作为旧文件集移动到唯一临时名（不在保留前 unlink 活跃 sidecar），再原子安装并重开；失败恢复完整旧集合，回滚失败时保留旧集合与候选 artifacts 并 fail closed。浏览器只看到 basename/字节/时间，不接触路径或 SQL。
- `locale/zh.json`、`locale/en.json` 的顶层 `meta.title`/`meta.description` 供 Plugin Manager 显示本地化名称与描述；package `dsh.client.inject` 同时包含 settings 与 plugin-manager 模块。
- 动态数据（状态、兴趣、记录、重置、备份）通过 Host API；Host 重新校验范围、类型、确认词和修订号。

## 6. 可选集成：真实契约与限制

### Life

实际使用：

- `life.getSessionBinding(sessionId)` / `life.getScene(sceneId)`：身份/场景。
- `life.getActivityStatus(activityId, 'session:<id>')`：模型提交 `activityId` 时的可信状态与 evidence refs。
- 只接受 `activity.status === 'completed' | 'failed'`；`pending/running/paused/stopping/unknown/cancelled` 一律拒绝，不当作完成。
- 不调用 Life 私有数据库；不创建 Life 意图/唤醒/调度。

**限制**：当前 Life 没有向 State 推送“活动完成”事件的公开事件契约；因此 Life→State 需要模型在真实回合中调用 `state_appraise(activityId=…)`，由 State 再向 Life 验证状态。State 不会轮询或臆造完成。若 Life 未安装/无该服务，State 核心继续运行；显式 activityId 调用会报集成不可用。

### Memory

实际使用：

- 通过 `ctx.tools.get('memory_get', exec.agent)` 和 `ctx.tools.execute(...)` 调用 Mneme 原生只读工具，使用同一个可信执行上下文。
- `memoryId` 只在 `memoryIntegrationEnabled` 打开时验证；重复同一 ID 不重复影响。
- **自动写入硬禁用且无用户开关**：当前 Mneme 契约不能证明写入只对原 Life Scene 可见，因此在具备 Scene 级读写验证与跨 Scene 拒绝测试之前，Config/GUI/Plugin Manager 都不暴露 `memoryWriteEnabled`；adapter 没有 `saveSummary`/`memory_save` 写入方法，服务也没有自动写路径。健康页显示“不可用（缺少 Scene 级契约）”。Memory 读取引用仍独立可选。

**限制**：当前 Mneme 没有公开的“按 persona/scene 校验引用”的 Host 服务；其可见性/范围策略由 Mneme 自己（如 `strictScope`）执行。State 不复制其向量库、不读取其数据库，也不声称 Memory 作用域等同于 State 场景。Memory 引用读取默认关闭；自动摘要写入即使配置打开也不会执行，直到存在可验证的 Scene 级契约。

## 7. 动态上下文

`ctx.systemPrompt.context({name:'amadeus-state', order:95, interpolate:false, text})`：

- 每次 prompt 组装读取一次当前会话作用域，计算恢复（不写数据库）；
- 内容包含状态、基准、方向、简短倾向，可选 top interests；
- 受 `contextMaxChars` 硬上限；
- 注入模式/影响强度来自同一 Config；
- 失败/身份未知返回空字符串；
- 不覆盖 Persona；不包含事件原因/证据。

## 8. 性能与 Token

- 读取不调用 LLM、不写 SQLite；只有合法事件/人工操作写库。
- 无定时器；GUI 轮询只在总览页且页面可见时每 30 秒，关闭页面即清理。
- 事件去重、兴趣饱和、最大条目数、审计保留与分页。
- 上下文有字符上限；只有模式变化才改变前缀。
- SQLite WAL + 单写者租约；备份最多 5 份。

## 9. 已知限制

1. Life→State 无公开完成事件推送（见上）。
2. Memory 没有 persona/scene Host 校验服务；Memory 引用默认关闭。
3. 管理权限使用 DSH “owner” 主体，没有独立角色系统；任何非 owner 认证 peer 都被拒绝。
4. 共享场景目前只影响 State 管理页可见性，不合并数值/原因到其他场景。
5. `databasePath` 修改需要重启插件；其他公开字段是 live/volatile。
6. 当前 Schema 版本为 1；未来迁移框架已就位，但尚未需要多版本迁移。
7. 兴趣别名只是 State 本地文本归一化；没有导入 Mneme 的实体/别名图。Memory 缺席时这反而避免静态耦合，但两套别名不会自动同步。
8. `node:sqlite` 是 Node 22 的实验特性；启动时会显示 ExperimentalWarning，功能符合当前 Life 的同类用法。
9. Life 曾绑定但暂时不可用时，State 对既有 Life 作用域 fail-closed，不会降级到本地身份；仅从未绑定过的会话使用本地私有作用域。
