import type { SessionRateLimit, SessionUsage } from 'claude-code'

import type { ChatTokens, Figures, Window } from '../types'

const toWindow = (limits: SessionRateLimit[], kind: string): Window | undefined => {
  const limit = limits.find(l => l.kind === kind)

  return limit && { percentUsed: limit.percentUsed, resetsAt: limit.resetsAt }
}

export type Measured = Pick<SessionUsage, 'context' | 'rateLimits' | 'cost'>

export const toFigures = (u: Measured, limit?: number | null): Figures => ({
  contextPercent: u.context.percent,
  contextTokens: u.context.tokens,
  contextWindow: limit ? Math.min(limit, u.context.window) : u.context.window,
  costUsd: u.cost?.usd,
  fiveHour: toWindow(u.rateLimits, 'five_hour'),
  week: toWindow(u.rateLimits, 'seven_day'),
})

const trim = (n: number) => n.toFixed(1).replace(/\.0$/, '')

export const compact = (n: number): string =>
  n >= 1e6 ? `${trim(n / 1e6)}M` : n >= 1e3 ? `${trim(n / 1e3)}k` : `${n}`

export const until = (resetsAt: string | undefined, now: number): string => {
  if (!resetsAt) return ''
  const minutes = Math.max(0, Math.round((Date.parse(resetsAt) - now) / 60000))
  if (Number.isNaN(minutes)) return ''
  const d = Math.floor(minutes / 1440)
  const h = Math.floor((minutes % 1440) / 60)
  const m = minutes % 60

  return d > 0 ? `${d}d${h}h` : h > 0 ? `${h}h${m}m` : `${m}m`
}

export type Severity = 'success' | 'warning' | 'error'

// Green below `warnAt`, yellow from `warnAt` to `errorAt`, red above `errorAt`.
export const severity = (percent: number | undefined, warnAt: number, errorAt: number): Severity | undefined =>
  percent === undefined ? undefined : percent > errorAt ? 'error' : percent >= warnAt ? 'warning' : 'success'

const contextColor = (percent: number | undefined) => severity(percent, 25, 40)
const limitColor = (percent: number | undefined) => severity(percent, 75, 90)

// State saved by an older version of the band has no token counts: start over.
export const isCurrent = (c: ChatTokens | null, startedAt?: number): c is ChatTokens =>
  c !== null && typeof c.up === 'number' && (startedAt === undefined || c.startedAt === startedAt)

// The prompt cache lifetime's default (`cache_minutes` in plugin.json): 60 minutes from the last
// call that wrote or read it. The option overrides it; see cacheTtlMs.
export const CACHE_TTL_MS = 60 * 60_000

// The lifetime in ms from the `cache_minutes` option. Like Session Handoff, a missing or invalid
// value falls back to the default.
export const cacheTtlMs = (minutes: unknown): number => (typeof minutes === 'number' ? minutes * 60_000 : CACHE_TTL_MS)

export const cacheLeft = (c: ChatTokens | null, now: number, ttlMs = CACHE_TTL_MS): number | undefined => {
  if (!c?.cachedAt) return undefined
  const left = c.cachedAt + ttlMs - now

  return left > 0 ? Math.ceil(left / 60000) : undefined
}

// Share of the chat's input tokens that came from the prompt cache.
export const hitPercent = (c: ChatTokens | null): number | undefined =>
  c && c.up > 0 ? Math.round((c.cacheRead / c.up) * 100) : undefined

const contextPercent = (f: Figures) => (f.contextPercent !== undefined ? `${f.contextPercent}%` : 'n/a')
const contextText = (f: Figures) =>
  f.contextTokens !== undefined && f.contextWindow ? ` ${compact(f.contextTokens)}/${compact(f.contextWindow)}` : ''
const sessionText = (c: ChatTokens) => `↑${compact(c.up)} ↓${compact(c.down)}`
const costText = (f: Figures) => (f.costUsd !== undefined ? `$${f.costUsd.toFixed(2)}` : undefined)

const percentText = (w: Window | undefined) => (w ? `${trim(w.percentUsed)}%` : 'n/a')
const resetText = (w: Window | undefined, now: number) => (w?.resetsAt ? ` resets ${until(w.resetsAt, now)}` : '')

// Writing the context back into a cold cache costs the 1-hour cache-write rate
// (2x input). The model isn't known here, so this assumes Opus-class input at $5/M.
export const WRITE_USD_PER_MTOK = 10

const recacheText = (f: Figures) =>
  f.contextTokens ? `re-cache ~${compact(f.contextTokens)} tokens · ~$${((f.contextTokens / 1e6) * WRITE_USD_PER_MTOK).toFixed(2)}` : undefined

// `empty`: no call has written or read the cache yet (a new session), so it is neither warm nor cold.
export type CacheState = { status: 'warm' | 'cold' | 'empty'; detail: string }

export const cacheState = (f: Figures, c: ChatTokens | null, now: number, ttlMs = CACHE_TTL_MS): CacheState => {
  const left = cacheLeft(c, now, ttlMs)
  const hit = hitPercent(c)

  if (!c?.cachedAt) return { status: 'empty', detail: '' }

  return {
    status: left !== undefined ? 'warm' : 'cold',
    detail: [
      left !== undefined ? `${left}m left` : recacheText(f),
      hit !== undefined ? `${hit}% hit` : undefined,
    ]
      .filter(Boolean)
      .join(' · '),
  }
}

// One figure of the band or status line: a label, its value, and a dim detail after it.
export type Segment = { key: string; label: string; value: string; detail: string; color?: Severity }

export const segments = (f: Figures, c: ChatTokens | null, now: number): Segment[] => {
  const cost = costText(f)

  return [
    { key: 'context', label: 'Context', value: contextPercent(f), detail: contextText(f), color: contextColor(f.contextPercent) },
    ...(c ? [{ key: 'session', label: 'Session', value: sessionText(c), detail: '' }] : []),
    ...(cost ? [{ key: 'cost', label: 'Cost', value: cost, detail: '' }] : []),
    {
      key: 'five-hour',
      label: '5h',
      value: percentText(f.fiveHour),
      detail: resetText(f.fiveHour, now),
      color: limitColor(f.fiveHour?.percentUsed),
    },
    {
      key: 'week',
      label: 'Week',
      value: percentText(f.week),
      detail: resetText(f.week, now),
      color: limitColor(f.week?.percentUsed),
    },
  ]
}

export const line = (f: Figures, c: ChatTokens | null, now: number, ttlMs = CACHE_TTL_MS) => {
  const { status, detail } = cacheState(f, c, now, ttlMs)

  return [
    ...segments(f, c, now).map(s => `${s.label} ${s.value}${s.detail}`),
    `Cache ${status === 'empty' ? 'empty' : status} ${detail}`.trimEnd(),
  ].join('  ')
}
