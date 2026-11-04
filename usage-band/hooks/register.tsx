import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit, SessionUsage } from 'claude-code'

import type { ChatTokens, Figures, Window } from '../types'

const figures = atom({ plugin: 'usage-band', key: 'figures' } as const, null)
const chat = atom({ plugin: 'usage-band', key: 'chat' } as const, null)
const isHidden = atom({ plugin: 'usage-band', key: 'isHidden' } as const, false)

const toWindow = (limits: SessionRateLimit[], kind: string): Window | undefined => {
  const limit = limits.find(l => l.kind === kind)

  return limit && { percentUsed: limit.percentUsed, resetsAt: limit.resetsAt }
}

const compactWindow = atom({ plugin: 'usage-band', key: 'compactWindow' } as const, null)

// The window /context measures against: the auto-compact size when one is set,
// else the model's own. A summary breakdown is estimated locally, so it is free.
const readCompactWindow = async ($: EngineInterface) => {
  const usage = await $.session.usage({ breakdown: 'summary' })
  await update($, compactWindow, () => usage.context.breakdown?.rawMaxTokens ?? 0)
}

export const toFigures = (
  u: Pick<SessionUsage, 'context' | 'rateLimits' | 'cost'>,
  limit?: number | null,
): Figures => ({
  contextPercent: u.context.percent,
  contextTokens: u.context.tokens,
  contextWindow: limit ? Math.min(limit, u.context.window) : u.context.window,
  costUsd: u.cost?.usd,
  session: toWindow(u.rateLimits, 'five_hour'),
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

// Green below `warnAt`, yellow from `warnAt` to `errorAt`, red above `errorAt`.
export const severity = (percent: number | undefined, warnAt: number, errorAt: number) =>
  percent === undefined ? undefined : percent > errorAt ? 'error' : percent >= warnAt ? 'warning' : 'success'

const chatColor = (percent: number | undefined) => severity(percent, 25, 40)
const limitColor = (percent: number | undefined) => severity(percent, 75, 90)

// State saved by an older version of the band has no token counts: start over.
const isCurrent = (c: ChatTokens | null, startedAt?: number): c is ChatTokens =>
  c !== null && typeof c.up === 'number' && (startedAt === undefined || c.startedAt === startedAt)

// Starts the chat's token count over when the session's start moved (/clear).
const syncChat = async (
  $: EngineInterface,
  startedAt: number,
  add: { up: number; down: number; cacheRead: number },
  cachedAt?: number,
) =>
  update($, chat, c => {
    const base = isCurrent(c, startedAt) ? c : { up: 0, down: 0, cacheRead: 0, cachedAt: undefined }

    return {
      startedAt,
      up: base.up + add.up,
      down: base.down + add.down,
      cacheRead: base.cacheRead + add.cacheRead,
      cachedAt: cachedAt ?? base.cachedAt,
    }
  })

// The prompt cache lives an hour from the last call that wrote or read it.
export const CACHE_TTL_MS = 60 * 60_000

export const cacheLeft = (c: ChatTokens | null, now: number): number | undefined => {
  if (!c?.cachedAt) return undefined
  const left = c.cachedAt + CACHE_TTL_MS - now

  return left > 0 ? Math.ceil(left / 60000) : undefined
}

// Share of the chat's input tokens that came from the prompt cache.
export const hitPercent = (c: ChatTokens | null): number | undefined =>
  c && c.up > 0 ? Math.round((c.cacheRead / c.up) * 100) : undefined

const chatPercent = (f: Figures) => (f.contextPercent !== undefined ? `${f.contextPercent}%` : 'n/a')
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

const cacheDetail = (f: Figures, c: ChatTokens | null, now: number) => {
  const left = cacheLeft(c, now)
  const hit = hitPercent(c)

  return [
    left !== undefined ? `${left}m left` : recacheText(f),
    hit !== undefined ? `${hit}% hit` : undefined,
  ]
    .filter(Boolean)
    .join(' · ')
}

export const line = (f: Figures, c: ChatTokens | null, now: number) =>
  [
    `Context ${chatPercent(f)}${contextText(f)}`,
    c ? `Session ${sessionText(c)}` : undefined,
    costText(f) && `Cost ${costText(f)}`,
    `5h ${percentText(f.session)}${resetText(f.session, now)}`,
    `Week ${percentText(f.week)}${resetText(f.week, now)}`,
    `Cache ${cacheLeft(c, now) !== undefined ? 'warm' : 'cold'} ${cacheDetail(f, c, now)}`.trimEnd(),
  ]
    .filter(Boolean)
    .join('  ')

// VS Code and mobile draw no band above the prompt: there the figures go to the status line.
const pinStatus = async ($: EngineInterface) => {
  const surfaces = await $.session.surfaces()
  const f = await read($, figures)
  const needsStatus = surfaces.some(s => s === 'vscode' || s === 'mobile')
  if (!needsStatus || f === null || (await read($, isHidden))) {
    $.ui.status(undefined)
    return
  }
  $.ui.status(line(f, await read($, chat), await $.clock.now()))
}

const refresh = async ($: EngineInterface) => {
  const usage = await $.session.usage()
  await readCompactWindow($)
  const limit = await read($, compactWindow)
  await update($, figures, () => toFigures(usage, limit))
  await syncChat($, usage.startedAt, { up: 0, down: 0, cacheRead: 0 })
  await pinStatus($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({ name: 'usage-band', description: 'Show or hide the usage band above the prompt' })
    await refresh($)

    return result
  })

  on('session.attach', async ($, e, next) => {
    const result = await next(e)
    await pinStatus($)

    return result
  })

  on('session.measure', async ($, e, next) => {
    const limit = await read($, compactWindow)
    await update($, figures, () => toFigures(e, limit))
    await pinStatus($)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const usage = result.usage ?? e.usage
    if (usage) {
      const cacheRead = usage.cache_read_input_tokens
      const up = usage.input_tokens + usage.cache_creation_input_tokens + cacheRead
      const touchedCache = usage.cache_creation_input_tokens + cacheRead > 0
      await syncChat(
        $,
        (await $.session.usage()).startedAt,
        { up, down: usage.output_tokens, cacheRead },
        touchedCache ? await $.clock.now() : undefined,
      )
      await readCompactWindow($)
      await pinStatus($)
    }

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) {
      return next(e)
    }

    // Before the first measurement, read the figures the status line has now.
    if ((await read($, compactWindow)) === null) await readCompactWindow($)
    const f = (await read($, figures)) ?? toFigures(await $.session.usage(), await read($, compactWindow))
    const saved: ChatTokens | null = await read($, chat)
    const c = isCurrent(saved) ? saved : null
    const now = await $.clock.now()
    const { Box, Button, Text } = $.ui.resolve(e)
    const rest = await next(e)

    const warm = cacheLeft(c, now) !== undefined
    const detail = cacheDetail(f, c, now)

    const mine = (
      <Box flexDirection="column">
        <Box flexDirection="row" flexWrap="wrap" columnGap={3}>
          <Text key="context">
            <Text dimColor>Context </Text>
            <Text key="context-percent" color={chatColor(f.contextPercent)} bold>{chatPercent(f)}</Text>
            <Text dimColor>{contextText(f)}</Text>
          </Text>
          {c ? (
            <Text key="session">
              <Text dimColor>Session </Text>
              <Text bold>{sessionText(c)}</Text>
            </Text>
          ) : null}
          {costText(f) ? (
            <Text key="cost">
              <Text dimColor>Cost </Text>
              <Text bold>{costText(f)}</Text>
            </Text>
          ) : null}
          <Text key="five-hour">
            <Text dimColor>5h </Text>
            <Text key="session-percent" color={limitColor(f.session?.percentUsed)} bold>{percentText(f.session)}</Text>
            <Text dimColor>{resetText(f.session, now)}</Text>
          </Text>
          <Text key="week">
            <Text dimColor>Week </Text>
            <Text key="week-percent" color={limitColor(f.week?.percentUsed)} bold>{percentText(f.week)}</Text>
            <Text dimColor>{resetText(f.week, now)}</Text>
          </Text>
        </Box>
        <Box flexDirection="row" justifyContent="space-between">
          <Text key="cache">
            <Text dimColor>Cache </Text>
            <Text key="cache-state" color={warm ? 'success' : 'warning'}>
              {warm ? '● warm' : '○ cold'}
            </Text>
            <Text color={warm ? undefined : 'warning'} dimColor={warm}>{detail ? ` ${detail}` : ''}</Text>
          </Text>
          <Button key="hide" label="Hide" plain onPress={() => update($, isHidden, () => true)} />
        </Box>
      </Box>
    )

    // Pass control on, so other mods' bands draw too.
    return <Box flexDirection="column">{rest}{mine}</Box>
  })

  on('command.run', { command: 'usage-band' }, async ($, e, next) => {
    const hidden = await update($, isHidden, h => !h)
    await pinStatus($)

    return { text: hidden ? 'Usage band hidden.' : 'Usage band shown.' }
  })
}
