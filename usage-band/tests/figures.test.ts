import { expect, test } from 'claude-code/testing'

import { cacheLeft, compact, hitPercent, line, toFigures, until } from '../hooks/figures'

const NOW = Date.parse('2026-11-04T12:00:00Z')
const minutes = (n: number) => new Date(NOW + n * 60000).toISOString()

const USAGE = {
  context: { tokens: 84000, window: 200000, percent: 42 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 23.5, resetsAt: minutes(125) },
    { kind: 'seven_day', percentUsed: 91 },
  ],
  cost: { usd: 3.4 },
}

test('toFigures reads the context, cost, 5h and week from the usage', () => {
  expect(toFigures(USAGE)).toEqual({
    contextPercent: 42,
    contextTokens: 84000,
    contextWindow: 200000,
    costUsd: 3.4,
    fiveHour: { percentUsed: 23.5, resetsAt: minutes(125) },
    week: { percentUsed: 91, resetsAt: undefined },
  })
})

test('toFigures measures against the compact window when it is smaller', () => {
  expect(toFigures(USAGE, 100000).contextWindow).toBe(100000)
  expect(toFigures(USAGE, 500000).contextWindow).toBe(200000)
  expect(toFigures(USAGE, 0).contextWindow).toBe(200000)
  expect(toFigures(USAGE, null).contextWindow).toBe(200000)
})

test('toFigures leaves out a rate limit the account does not report', () => {
  const figures = toFigures({ context: { tokens: 1, window: 2, percent: 50 }, rateLimits: [] })

  expect(figures.fiveHour).toBeUndefined()
  expect(figures.week).toBeUndefined()
  expect(figures.costUsd).toBeUndefined()
})

test('compact writes thousands as k and millions as M, dropping a trailing .0', () => {
  expect([999, 1000, 1500, 84000, 1e6, 2_500_000].map(compact)).toEqual(['999', '1k', '1.5k', '84k', '1M', '2.5M'])
})

test('until counts down to a reset in days, hours or minutes', () => {
  expect(until(minutes(45), NOW)).toBe('45m')
  expect(until(minutes(90), NOW)).toBe('1h30m')
  expect(until(minutes(25 * 60), NOW)).toBe('1d1h')
})

test('until is empty without a usable reset time and 0m once it has passed', () => {
  expect(until(undefined, NOW)).toBe('')
  expect(until('not a date', NOW)).toBe('')
  expect(until(minutes(-5), NOW)).toBe('0m')
})

test('cacheLeft is the minutes left of the hour since the cache was last touched', () => {
  const chat = (minutesAgo: number) => ({ startedAt: 1, up: 1, down: 1, cacheRead: 0, cachedAt: NOW - minutesAgo * 60000 })

  expect(cacheLeft(chat(10), NOW)).toBe(50)
  expect(cacheLeft(chat(59.5), NOW)).toBe(1)
  expect(cacheLeft(chat(60), NOW)).toBeUndefined()
  expect(cacheLeft(chat(90), NOW)).toBeUndefined()
  expect(cacheLeft({ startedAt: 1, up: 1, down: 1, cacheRead: 0 }, NOW)).toBeUndefined()
  expect(cacheLeft(null, NOW)).toBeUndefined()
})

test('hitPercent is the share of input tokens read from the cache', () => {
  expect(hitPercent({ startedAt: 1, up: 1500, down: 0, cacheRead: 1200 })).toBe(80)
  expect(hitPercent({ startedAt: 1, up: 3, down: 0, cacheRead: 1 })).toBe(33)
  expect(hitPercent({ startedAt: 1, up: 0, down: 0, cacheRead: 0 })).toBeUndefined()
  expect(hitPercent(null)).toBeUndefined()
})

test('line shows every figure when the cache is warm', () => {
  const chat = { startedAt: 1, up: 1500, down: 200, cacheRead: 1200, cachedAt: NOW - 10 * 60000 }

  expect(line(toFigures(USAGE), chat, NOW)).toBe(
    'Context 42% 84k/200k  Session ↑1.5k ↓200  Cost $3.40  5h 23.5% resets 2h5m  Week 91%  Cache warm 50m left · 80% hit',
  )
})

test('line shows what a cold cache would cost to write back', () => {
  const figures = { contextPercent: 10, contextTokens: 100000, contextWindow: 200000 }

  const expired = { startedAt: 1, up: 0, down: 0, cacheRead: 0, cachedAt: NOW - 90 * 60000 }

  expect(line(figures, expired, NOW)).toBe(
    'Context 10% 100k/200k  Session ↑0 ↓0  5h n/a  Week n/a  Cache cold re-cache ~100k tokens · ~$1.00',
  )
})

test('line says the cache is empty, not cold, before any call has touched it', () => {
  const fresh = { startedAt: 1, up: 0, down: 0, cacheRead: 0 }

  expect(line({}, fresh, NOW)).toContain('Cache empty')
})

test('line says n/a for figures not measured yet', () => {
  expect(line({}, null, NOW)).toBe('Context n/a  5h n/a  Week n/a  Cache empty')
})
