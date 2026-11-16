import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

// A test cannot read the manifest, so the default is checked through the engine: with no options
// the test gets the manifest defaults. 60 minutes is the GLOSSARY figure for the prompt cache
// lifetime and Session Handoff's cache_minutes default.
const TURN = {
  answer: 'ok',
  durationMs: 1,
  isAborted: false,
  turnId: 't1',
  reason: 'answer',
  usage: { model: 'test-model', input_tokens: 100, cache_creation_input_tokens: 1000, cache_read_input_tokens: 0, output_tokens: 50 },
} as const

const MEASURE = {
  context: { tokens: 10, window: 100, percent: 10 },
  cost: { usd: 1 },
  changed: ['context', 'rateLimits', 'cost'],
} as const

// One chat turn, then the status line read at each mark: [minutes after the turn, text it must show].
const timeline = (marks: [number, string][]): TestBody => async ($, on) => {
  const statuses: string[] = []
  const clock = mock.clock(on, { now: Date.parse('2026-11-04T12:00:00Z') })
  on('session.surfaces', () => ({ value: ['vscode'] }))
  on('session.usage', () => ({
    value: { context: MEASURE.context, rateLimits: [], cost: MEASURE.cost, startedAt: 1 },
  }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('ui.status', (_$, e) => {
    statuses.push(String((e as { text?: unknown }).text))
    return { value: undefined }
  })
  on('turn.complete', ($, e) => ({ text: 'ok', usage: e.usage }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'usage-band' } }))
  await $.session.start({ cwd: '.', surface: 'vscode', isInteractive: true })
  await $.turn.complete(TURN)

  let elapsed = 0
  for (const [minutes, text] of marks) {
    await clock.advance((minutes - elapsed) * 60000)
    elapsed = minutes
    await $.session.measure({ ...MEASURE, rateLimits: [], changed: [...MEASURE.changed] })
    expect(statuses.at(-1)).toContain(text)
  }
}

test(
  'with no option set, the cache is warm for 60 minutes after a call, then cold',
  timeline([
    [0, 'Cache warm 60m left'],
    [59, 'Cache warm 1m left'],
    [60, 'Cache cold'],
  ]),
)

test(
  'cache_minutes sets the lifetime the band and status line count down against',
  { options: { cache_minutes: 90 } },
  timeline([
    [0, 'Cache warm 90m left'],
    [60, 'Cache warm 30m left'],
    [90, 'Cache cold'],
  ]),
)
