import type { HandoffView } from '../types'
import { cacheWaitMs, CONTEXT_REARM } from './data'

type TriggerName = HandoffView['trigger']

/** What the triggers need from the outside; `register.tsx` builds it from the engine. */
export type TriggerDeps = {
  after: (ms: number, fn: () => void) => { cancel: () => void }
  /** A handoff view is showing and has not been dismissed. */
  hasOpenView: () => Promise<boolean>
  contextTokens: () => Promise<number>
  run: (trigger: TriggerName) => Promise<void>
}

export type TriggerOptions = {
  cacheMinutes: number
  leadMinutes: number
  contextTokens: number
}

// Owns when a handoff may start: the run state, the cache timer and the
// context arm state. Feed it main-thread turns only.
export const createTriggers = (deps: TriggerDeps, options: TriggerOptions) => {
  let isRunning = false
  let cacheTimer: { cancel: () => void } | null = null
  let isContextArmed = true

  // The only way a handoff starts. Resolves when it has finished.
  const start = async (trigger: TriggerName): Promise<{ started: boolean }> => {
    if (isRunning) return { started: false }
    isRunning = true
    try {
      await deps.run(trigger)
    } finally {
      isRunning = false
    }
    return { started: true }
  }

  const onTurnStart = () => {
    cacheTimer?.cancel()
    cacheTimer = null
  }

  const onTurnComplete = async () => {
    // Cache trigger: the cache goes cold `leadMinutes` from the end of the wait.
    cacheTimer?.cancel()
    cacheTimer = deps.after(cacheWaitMs(options.cacheMinutes, options.leadMinutes), () => {
      cacheTimer = null
      void (async () => {
        if (await deps.hasOpenView()) return
        await start('cache')
      })()
    })

    // Context trigger: fires once past the threshold, re-armed once the context
    // falls below `CONTEXT_REARM` of it. It disarms only if the handoff started.
    const tokens = await deps.contextTokens()
    const armed = isContextArmed || tokens < options.contextTokens * CONTEXT_REARM
    isContextArmed = armed
    if (armed && tokens > options.contextTokens && !isRunning) {
      isContextArmed = false
      void start('context')
    }
  }

  return { onTurnStart, onTurnComplete, start, isRunning: () => isRunning }
}
