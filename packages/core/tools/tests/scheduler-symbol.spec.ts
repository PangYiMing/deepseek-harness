import { describe, expect, it } from 'vitest'
import { TOOL_RUNTIME_SCHEDULER } from '../src/index.ts'

describe('TOOL_RUNTIME_SCHEDULER identity', () => {
  it('registers through the global symbol registry so src and lib instances share one key', () => {
    // Source launches load this module twice: tsconfig paths rewrite the bare
    // import to src/ while profile resolution loads the plugin entry from lib/.
    // The key must therefore come from Symbol.for, not a per-instance Symbol().
    expect(TOOL_RUNTIME_SCHEDULER).toBe(Symbol.for('@deepseek-ai/dsh-tools.scheduler'))
  })
})
