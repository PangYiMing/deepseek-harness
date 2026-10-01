/**
 * Load-time configuration for cyclic supplemental goal-round messages.
 * @module @deepseek-ai/dsh-goal-round-driver/config
 */

import z from '@deepseek-ai/schemastery'

/** User-selected text slots evaluated once for every admitted goal round. */
export interface Config {
  /** Cyclic supplemental messages; an empty slot omits the message for that round. */
  roundInjections?: string[]
}

/** Schemastery configuration for the goal-round driver. */
export const Config: z<Config> = z.object({
  roundInjections: z.array(z.string()).default([]),
})

/** Detached immutable configuration consumed by one driver lifecycle. */
export interface ResolvedConfig {
  /** Cyclic supplemental messages with empty slots retained as explicit skips. */
  readonly roundInjections: readonly string[]
}

/**
 * Detach the configured slots for one driver lifecycle.
 * @param config - Loader-normalized plugin configuration.
 * @returns a configuration whose slot array cannot be changed by the caller.
 */
export function resolveConfig(config: Config = {}): ResolvedConfig {
  return { roundInjections: Object.freeze([...(config.roundInjections ?? [])]) }
}

/**
 * Select the supplemental text for one positive goal round.
 * @param config - resolved cyclic configuration.
 * @param round - positive goal round number.
 * @returns the selected non-empty text, or `undefined` when that round has no supplemental message.
 */
export function roundInjection(config: ResolvedConfig, round: number): string | undefined {
  const { roundInjections } = config
  if (roundInjections.length === 0) return undefined
  const slot = roundInjections[(round - 1) % roundInjections.length]
  return slot === '' ? undefined : slot
}
