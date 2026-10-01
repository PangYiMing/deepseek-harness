# Goal Round Injections Implementation Plan

English | [中文](2026-09-21-goal-round-injections.zh.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a configurable cyclic array of supplemental messages to same-session Goal Rounds.

**Architecture:** `config.ts` owns the Loader schema, immutable resolved slots, and the round-to-slot selection rule. The round driver reserves a supplemental plugin message together with its canonical goal prompt, then inserts it immediately after that goal prompt only after both reservation fences admit the step. The canonical `<goal_round>` message and its invariant remain unchanged.

**Tech Stack:** TypeScript, Cordis function plugins, Schemastery, Vitest, pnpm workspaces.

## Global Constraints

- `roundInjections` defaults to `[]`; empty slots skip injection and preserve existing behavior.
- Slot selection is `roundInjections[(round - 1) % roundInjections.length]`, so `['', '', '', 'text']` injects in rounds 4, 8, 12, and later multiples of four.
- A supplemental message must be model-visible and therefore persisted as a normal plugin-sourced `user/message` in the same admitted step.
- Do not alter the content or goal source of `<goal_round>`; `src/invariant.ts` reconstructs it exactly.
- Update both package README languages and their pairing record.

---

### Task 1: Define and test cyclic configuration

**Files:**
- Create: `packages/goal/goal-round-driver/src/config.ts`
- Create: `packages/goal/goal-round-driver/tests/config.spec.ts`
- Modify: `packages/goal/goal-round-driver/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces `Config`, `Config` schema, `resolveConfig(config)`, and `roundInjection(config, round)`.
- `roundInjection` returns `undefined` for no slots or an empty selected slot, and returns the selected non-empty string unchanged.

- [ ] **Step 1: Write failing configuration tests**

```ts
expect(roundInjection(resolveConfig(), 4)).toBeUndefined()

const config = resolveConfig({ roundInjections: ['', '', '', 'reassess'] })
expect([1, 2, 3, 4, 5, 8].map(round => roundInjection(config, round)))
  .toEqual([undefined, undefined, undefined, 'reassess', undefined, 'reassess'])
```

- [ ] **Step 2: Run the configuration test to verify it fails**

Run: `pnpm exec vitest run packages/goal/goal-round-driver/tests/config.spec.ts`

Expected: FAIL because `src/config.ts` does not exist.

- [ ] **Step 3: Implement the schema and resolver**

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

- [ ] **Step 4: Add the runtime Schemastery dependency**

```json
"dependencies": {
  "@deepseek-ai/schemastery": "workspace:^"
}
```

Regenerate only the lockfile entry required by this package.

- [ ] **Step 5: Run the configuration test to verify it passes**

Run: `pnpm exec vitest run packages/goal/goal-round-driver/tests/config.spec.ts`

Expected: PASS.

### Task 2: Admit selected messages with their Goal Round

**Files:**
- Modify: `packages/goal/goal-round-driver/src/index.ts`
- Modify: `packages/goal/goal-round-driver/tests/goal-round-driver.spec.ts`

**Interfaces:**
- Consumes `Config`, `resolveConfig`, and `roundInjection` from `src/config.ts`.
- Changes the function-plugin signature to `apply(ctx: Context, config?: Config): void`.
- Extends a private `RoundAttempt` with the optional supplemental `UserMessage` reserved for that exact goal round.

- [ ] **Step 1: Write a failing eight-round integration test**

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

- [ ] **Step 2: Run the integration test to verify it fails**

Run: `pnpm exec vitest run packages/goal/goal-round-driver/tests/goal-round-driver.spec.ts -t "injects configured slots"`

Expected: FAIL because the current driver ignores the second harness argument and emits no supplemental messages.

- [ ] **Step 3: Reserve and admit the supplemental message**

```ts
const injectedText = roundInjection(resolved, round)
const injection = injectedText === undefined ? undefined : createUserMessage({
  content: [{ type: 'text', text: injectedText }],
  source: { kind: 'plugin', plugin: 'goal-round-driver' },
})
```

Store `injection` in the reservation. After the existing downstream `agent/pre-step` call and second `validReservation()` check succeed, insert it immediately after the submitted goal message in `decision.messages`. Do not inject it after rejection, cancellation, a stale revision, or a downstream exception.

- [ ] **Step 4: Run focused integration tests to verify they pass**

Run: `pnpm exec vitest run packages/goal/goal-round-driver/tests/goal-round-driver.spec.ts`

Expected: PASS, including existing race-fence and teardown cases.

### Task 3: Document configuration and validate generated references

**Files:**
- Modify: `packages/goal/goal-round-driver/README.md`
- Modify: `packages/goal/goal-round-driver/README.zh.md`
- Modify: `packages/goal/goal-round-driver/README.i18n.yaml`
- Generated: `docs/config-catalog.md`, `docs/config-catalog.zh.md`, `docs/config-catalog.i18n.yaml` only if the catalog generator changes them.

**Interfaces:**
- Documents `roundInjections` as a cyclic zero-based array indexed with `(round - 1) % length`.
- Shows `['', '', '', '...']` as the four-round injection example and `[]` as the compatibility-preserving default.

- [ ] **Step 1: Update both README files with matching configuration examples**

```yaml
- id: goal-round-driver
  name: '@deepseek-ai/dsh-goal-round-driver'
  config:
    roundInjections: ['', '', '', 'Reassess the stalled path before continuing.']
```

- [ ] **Step 2: Re-record the package README pairing**

Run: `pnpm run verify-translation-pairing --write packages/goal/goal-round-driver/README.md`

Expected: `README.i18n.yaml` records the current blob hashes.

- [ ] **Step 3: Run narrow verification**

Run: `pnpm run typecheck --filter @deepseek-ai/dsh-goal-round-driver`

Run: `pnpm run test --filter @deepseek-ai/dsh-goal-round-driver`

Run: `pnpm run doc-sync -- --filter goal-round-driver`

Expected: type checks, package tests, configuration catalog freshness, and README pairing pass without modifying unrelated files.
