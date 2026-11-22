import { expect, test } from 'claude-code/testing'

import { createTriggers } from '../hooks/triggers'

const MIN = 60000

// A mock clock: `after` records timers, `tick` runs the ones that are due.
const setup = (
  over: { hasOpenView?: boolean; tokens?: number; run?: () => Promise<void> } = {},
) => {
  const state = { now: 0, hasOpenView: over.hasOpenView ?? false, tokens: over.tokens ?? 0 }
  const timers: { at: number; fn: () => void; isCancelled: boolean }[] = []
  const runs: string[] = []
  const triggers = createTriggers(
    {
      after: (ms, fn) => {
        const timer = { at: state.now + ms, fn, isCancelled: false }
        timers.push(timer)
        return { cancel: () => void (timer.isCancelled = true) }
      },
      hasOpenView: async () => state.hasOpenView,
      contextTokens: async () => state.tokens,
      run: async trigger => {
        runs.push(trigger)
        await over.run?.()
      },
    },
    { cacheMinutes: 60, leadMinutes: 5, contextTokens: 250000 },
  )
  const tick = async (ms: number) => {
    state.now += ms
    for (const t of timers) if (!t.isCancelled && t.at <= state.now) { t.isCancelled = true; t.fn() }
    for (let i = 0; i < 10; i++) await Promise.resolve()
  }
  return { triggers, state, runs, tick, timers }
}

test('the cache handoff fires once, lifetime minus lead after a turn', async () => {
  const { triggers, runs, tick } = setup()
  await triggers.onTurnComplete()
  await tick(55 * MIN - 1)
  expect(runs).toEqual([])
  await tick(1)
  expect(runs).toEqual(['cache'])
  await tick(120 * MIN)
  expect(runs).toEqual(['cache'])
})

test('a new turn cancels the cache timer; completing re-arms it', async () => {
  const { triggers, runs, tick } = setup()
  await triggers.onTurnComplete()
  await tick(30 * MIN)
  triggers.onTurnStart()
  await tick(60 * MIN)
  expect(runs).toEqual([])
  await triggers.onTurnComplete()
  await tick(55 * MIN)
  expect(runs).toEqual(['cache'])
})

test('the cache handoff is blocked by an undismissed view and not re-armed', async () => {
  const { triggers, runs, tick, state } = setup({ hasOpenView: true })
  await triggers.onTurnComplete()
  await tick(55 * MIN)
  expect(runs).toEqual([])
  state.hasOpenView = false
  await tick(120 * MIN)
  expect(runs).toEqual([])
})

test('the context handoff fires once past the threshold, and re-arms below 80%', async () => {
  const { triggers, runs, state } = setup()
  state.tokens = 250001
  await triggers.onTurnComplete()
  await triggers.onTurnComplete()
  expect(runs).toEqual(['context'])
  state.tokens = 200000
  await triggers.onTurnComplete()
  expect(runs).toEqual(['context'])
  state.tokens = 199999
  await triggers.onTurnComplete()
  state.tokens = 260000
  await triggers.onTurnComplete()
  expect(runs).toEqual(['context', 'context'])
})

test('the context handoff is not blocked by an undismissed view', async () => {
  const { triggers, runs, state } = setup({ hasOpenView: true })
  state.tokens = 260000
  await triggers.onTurnComplete()
  expect(runs).toEqual(['context'])
})

test('the context trigger stays armed when a handoff is already running', async () => {
  let release = () => {}
  const { triggers, runs, state } = setup({
    run: () => new Promise<void>(r => { release = r }),
  })
  const first = triggers.start('command')
  state.tokens = 260000
  await triggers.onTurnComplete()
  expect(runs).toEqual(['command'])
  release()
  await first
  await triggers.onTurnComplete()
  expect(runs).toEqual(['command', 'context'])
  release()
})

test('start refuses while running and frees the flag after, even on failure', async () => {
  let release = () => {}
  let isFailing = false
  const { triggers } = setup({
    run: () =>
      isFailing
        ? Promise.reject(new Error('boom'))
        : new Promise<void>(r => { release = r }),
  })
  const first = triggers.start('command')
  expect(await triggers.start('command')).toEqual({ started: false })
  release()
  expect(await first).toEqual({ started: true })
  isFailing = true
  await triggers.start('command').catch(() => {})
  isFailing = false
  const again = triggers.start('command')
  expect(await Promise.race([again, Promise.resolve('pending')])).toBe('pending')
  release()
})
