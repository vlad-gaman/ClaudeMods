import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ChatTokens } from '../types'
import { cacheTtlMs, isCurrent, line, toFigures } from './figures'
import type { Measured } from './figures'
import { band } from './view'

const figures = atom({ plugin: 'usage-band', key: 'figures' } as const, null)
const chat = atom({ plugin: 'usage-band', key: 'chat' } as const, null)
const isHidden = atom({ plugin: 'usage-band', key: 'isHidden' } as const, false)
const compactWindow = atom({ plugin: 'usage-band', key: 'compactWindow' } as const, null)

// The window /context measures against: the auto-compact size when one is set,
// else the model's own. A summary breakdown is estimated locally, so it is free.
const loadCompactWindow = async ($: EngineInterface) => {
  const usage = await $.session.usage({ breakdown: 'summary' })
  await update($, compactWindow, () => usage.context.breakdown?.rawMaxTokens ?? 0)
}

const storeFigures = async ($: EngineInterface, usage: Measured) => {
  const limit = await read($, compactWindow)
  await update($, figures, () => toFigures(usage, limit))
}

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

// VS Code and mobile draw no band above the prompt: there the figures go to the status line.
const setStatusLine = async ($: EngineInterface, ttlMs: number) => {
  const surfaces = await $.session.surfaces()
  const f = await read($, figures)
  const needsStatus = surfaces.some(s => s === 'vscode' || s === 'mobile')
  if (!needsStatus || f === null || (await read($, isHidden))) {
    $.ui.status(undefined)
    return
  }
  $.ui.status(line(f, await read($, chat), await $.clock.now(), ttlMs))
}

const refresh = async ($: EngineInterface, ttlMs: number) => {
  const usage = await $.session.usage()
  await loadCompactWindow($)
  await storeFigures($, usage)
  await syncChat($, usage.startedAt, { up: 0, down: 0, cacheRead: 0 })
  await setStatusLine($, ttlMs)
}

export const register: Register = (on, options) => {
  // The prompt cache lifetime, shared in name and default with Session Handoff's cache_minutes.
  const ttlMs = cacheTtlMs(options.cache_minutes)

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({ name: 'usage-band', description: 'Show or hide the usage band above the prompt' })
    await refresh($, ttlMs)

    return result
  })

  on('session.attach', async ($, e, next) => {
    const result = await next(e)
    await setStatusLine($, ttlMs)

    return result
  })

  on('session.measure', async ($, e, next) => {
    await storeFigures($, e)
    await setStatusLine($, ttlMs)

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
      await loadCompactWindow($)
      await setStatusLine($, ttlMs)
    }

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) {
      return next(e)
    }

    // Before the first measurement, read the figures the status line has now.
    if ((await read($, compactWindow)) === null) await loadCompactWindow($)
    const f = (await read($, figures)) ?? toFigures(await $.session.usage(), await read($, compactWindow))
    const saved: ChatTokens | null = await read($, chat)
    const c = isCurrent(saved) ? saved : null
    const now = await $.clock.now()
    const parts = $.ui.resolve(e)
    const rest = await next(e)
    const mine = band(parts, f, c, now, ttlMs, async () => {
      await update($, isHidden, () => true)
      await setStatusLine($, ttlMs)
    })

    // Pass control on, so other mods' bands draw too.
    return <parts.Box flexDirection="column">{rest}{mine}</parts.Box>
  })

  on('command.run', { command: 'usage-band' }, async ($, e, next) => {
    const hidden = await update($, isHidden, h => !h)
    await setStatusLine($, ttlMs)

    return { text: hidden ? 'Usage band hidden.' : 'Usage band shown.' }
  })
}
