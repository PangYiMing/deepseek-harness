import { describe, expect, it } from 'vitest'
import { resolveConfig, roundInjection } from '../src/config.ts'

describe('goal-round-driver configuration', () => {
  it('cycles configured slots and skips empty slots', () => {
    expect(roundInjection(resolveConfig(), 4)).toBeUndefined()

    const config = resolveConfig({ roundInjections: ['', '', '', 'reassess the current path'] })

    expect([1, 2, 3, 4, 5, 8].map(round => roundInjection(config, round)))
      .toEqual([undefined, undefined, undefined, 'reassess the current path', undefined, 'reassess the current path'])

    const shorterCycle = resolveConfig({ roundInjections: ['', 'inspect again'] })

    expect([1, 2, 3, 4].map(round => roundInjection(shorterCycle, round)))
      .toEqual([undefined, 'inspect again', undefined, 'inspect again'])
  })
})
