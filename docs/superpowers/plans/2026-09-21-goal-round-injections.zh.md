# Goal Round 注入实现计划

[English](2026-09-21-goal-round-injections.md) | 中文

> **供 agentic worker 使用：** 必须按任务逐项使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans；步骤以复选框（`- [ ]`）记录。

**目标：** 为同一会话内的 Goal Round 增加可配置的循环补充消息数组。

**架构：** `config.ts` 负责 Loader schema、不可变的已解析 slot 与 Round 到 slot 的选择规则。Round driver 会和标准 goal 提示词一同预留补充 plugin 消息，只有在两个预留栅栏都接纳该步骤后，才紧邻标准 goal 提示词插入该消息。标准 `<goal_round>` 消息及其不变式保持不变。

**技术栈：** TypeScript、Cordis 函数插件、Schemastery、Vitest、pnpm workspace。

## 全局约束

- `roundInjections` 默认值为 `[]`；空 slot 不注入，保持现有行为。
- slot 选择使用 `roundInjections[(round - 1) % roundInjections.length]`，因此 `['', '', '', 'text']` 会在第 4、8、12 及之后每四轮注入。
- 补充消息必须对模型可见，因此作为同一已接纳步骤中的普通 plugin 来源 `user/message` 持久化。
- 不得修改 `<goal_round>` 的内容或 goal 来源；`src/invariant.ts` 会精确重建它。
- 同时更新包 README 的两种语言及其配对记录。

---

### 任务 1：定义并测试循环配置

**文件：**
- 创建：`packages/goal/goal-round-driver/src/config.ts`
- 创建：`packages/goal/goal-round-driver/tests/config.spec.ts`
- 修改：`packages/goal/goal-round-driver/package.json`
- 修改：`pnpm-lock.yaml`

**接口：**
- 产出 `Config`、`Config` schema、`resolveConfig(config)` 与 `roundInjection(config, round)`。
- `roundInjection` 在没有 slot 或选中空 slot 时返回 `undefined`，否则原样返回选中的非空字符串。

- [ ] **步骤 1：编写失败的配置测试**

```ts
expect(roundInjection(resolveConfig(), 4)).toBeUndefined()

const config = resolveConfig({ roundInjections: ['', '', '', 'reassess'] })
expect([1, 2, 3, 4, 5, 8].map(round => roundInjection(config, round)))
  .toEqual([undefined, undefined, undefined, 'reassess', undefined, 'reassess'])
```

- [ ] **步骤 2：运行配置测试，确认失败**

运行：`pnpm exec vitest run packages/goal/goal-round-driver/tests/config.spec.ts`

预期：FAIL，因为 `src/config.ts` 不存在。

- [ ] **步骤 3：实现 schema 与解析器**

```ts
export interface Config {
  roundInjections?: string[]
}

export const Config: z<Config> = z.object({
  roundInjections: z.array(z.string()).default([]),
})

export function roundInjection(config: ResolvedConfig, round: number): string | undefined {
  if (config.roundInjections.length === 0) return undefined
  const slot = config.roundInjections[(round - 1) % config.roundInjections.length]
  return slot === '' ? undefined : slot
}
```

- [ ] **步骤 4：添加运行时 Schemastery 依赖**

```json
"dependencies": {
  "@deepseek-ai/schemastery": "workspace:^"
}
```

只重新生成本包所需的 lockfile 条目。

- [ ] **步骤 5：运行配置测试，确认通过**

运行：`pnpm exec vitest run packages/goal/goal-round-driver/tests/config.spec.ts`

预期：PASS。

### 任务 2：将选中的消息随 Goal Round 一起接纳

**文件：**
- 修改：`packages/goal/goal-round-driver/src/index.ts`
- 修改：`packages/goal/goal-round-driver/tests/goal-round-driver.spec.ts`

**接口：**
- 消费 `src/config.ts` 中的 `Config`、`resolveConfig` 与 `roundInjection`。
- 函数插件签名改为 `apply(ctx: Context, config?: Config): void`。
- 私有 `RoundAttempt` 增加为该准确 Goal Round 预留的可选补充 `UserMessage`。

- [ ] **步骤 1：编写失败的八轮集成测试**

```ts
const test = await harness(eightTextResponses, {
  roundInjections: ['', '', '', 'Reassess the stalled path before continuing.'],
})
test.ctx.goals.create(test.agent, { objective: 'run eight rounds', maxGoalRounds: 8 })

expect(persistedSupplementalTexts(test.agent)).toEqual([
  'Reassess the stalled path before continuing.',
  'Reassess the stalled path before continuing.',
])
expect(eachSupplementalImmediatelyFollowsRounds(test.agent)).toEqual([4, 8])
```

- [ ] **步骤 2：运行集成测试，确认失败**

运行：`pnpm exec vitest run packages/goal/goal-round-driver/tests/goal-round-driver.spec.ts -t "injects configured slots"`

预期：FAIL，因为当前 driver 忽略第二个 harness 参数，且不会生成补充消息。

- [ ] **步骤 3：预留并接纳补充消息**

```ts
const injectedText = roundInjection(resolved, round)
const injection = injectedText === undefined ? undefined : createUserMessage({
  content: [{ type: 'text', text: injectedText }],
  source: { kind: 'plugin', plugin: 'goal-round-driver' },
})
```

在预留中保存 `injection`。现有下游 `agent/pre-step` 调用与第二次 `validReservation()` 检查成功后，紧跟已提交的 goal 消息把它插入 `decision.messages`。拒绝、取消、陈旧 revision 或下游异常后都不得注入。

- [ ] **步骤 4：运行聚焦集成测试，确认通过**

运行：`pnpm exec vitest run packages/goal/goal-round-driver/tests/goal-round-driver.spec.ts`

预期：PASS，包括既有竞态栅栏与资源释放用例。

### 任务 3：记录配置并验证生成的引用文档

**文件：**
- 修改：`packages/goal/goal-round-driver/README.md`
- 修改：`packages/goal/goal-round-driver/README.zh.md`
- 修改：`packages/goal/goal-round-driver/README.i18n.yaml`
- 生成：仅当 catalog 生成器改动它们时修改 `docs/config-catalog.md`、`docs/config-catalog.zh.md` 与 `docs/config-catalog.i18n.yaml`。

**接口：**
- 将 `roundInjections` 说明为按 `(round - 1) % length` 索引的循环数组。
- 展示 `['', '', '', '...']` 作为四轮注入示例，`[]` 作为保持兼容的默认值。

- [ ] **步骤 1：更新两份 README，给出一致的配置示例**

```yaml
- id: goal-round-driver
  name: '@deepseek-ai/dsh-goal-round-driver'
  config:
    roundInjections: ['', '', '', 'Reassess the stalled path before continuing.']
```

- [ ] **步骤 2：重新记录包 README 的配对信息**

运行：`pnpm run verify-translation-pairing --write packages/goal/goal-round-driver/README.md`

预期：`README.i18n.yaml` 记录当前 blob hash。

- [ ] **步骤 3：运行窄范围验证**

运行：`pnpm run typecheck --filter @deepseek-ai/dsh-goal-round-driver`

运行：`pnpm run test --filter @deepseek-ai/dsh-goal-round-driver`

运行：`pnpm run doc-sync -- --filter goal-round-driver`

预期：类型检查、包测试、配置 catalog 新鲜度与 README 配对都通过，且不改动无关文件。
