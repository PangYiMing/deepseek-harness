/**
 * Real Loader composition: a `cordis.yml` row supplies cyclic goal-round
 * configuration, and the admitted model turn retains the selected message.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import GoalService from '@deepseek-ai/dsh-goal'
import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import * as GoalRoundDriver from '../src/index.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** Adapter that ends every scripted goal round without external I/O. */
class StopAdapter extends LlmAdapter {
  override async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'continue' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

/** Boot the goal-round driver through the real Loader using a test-local YAML file. */
async function loadDriver(): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'dsh-goal-round-driver-loader-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    '- id: goal-round-driver',
    "  name: '@deepseek-ai/dsh-goal-round-driver'",
    '  config:',
    '    roundInjections:',
    "      - ''",
    '      - loader-supplied instruction',
    '',
  ].join('\n'))

  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(GoalService)
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.llm.registerAdapter(['mock'], new StopAdapter())

  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (specifier === '@deepseek-ai/dsh-goal-round-driver') return GoalRoundDriver
      throw new Error(`unexpected Loader import: ${specifier}`)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await ctx.loader.await()
  return ctx
}

describe('goal-round-driver real Loader composition', () => {
  it('retains a configured cyclic message on the selected round', async () => {
    const ctx = await loadDriver()
    const agent = await ctx.agentLoop.create(SessionId('goal-round-loader'), { provider: 'mock', model: 'mock' })
    ctx.goals.create(agent, { objective: 'complete two rounds', maxGoalRounds: 2 })

    await vi.waitFor(() => {
      expect(ctx.goals.get(agent)?.phase).toBe('blocked')
    })

    const messages = agent.session.snapshotEvents().flatMap(event =>
      event.type === 'user/message' ? [event.data] : [])
    const injection = messages.find(message =>
      message.source.kind === 'goal-round-driver')
    expect(injection?.content).toEqual([{ type: 'text', text: 'loader-supplied instruction' }])
  })
})
