import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Mod } from '../types'
import { BLURBS } from './data'
import { listMods } from './manifest'
import { nameOf, titleOf, words } from './names'
import { pane } from './view'

const PANE = 'switchboard'
const mods = atom({ plugin: 'switchboard', key: 'mods' } as const, [], { shape: 'mods-3' })

// Mods whose pane is shut right now. Only what the engine reports: a pane opening or closing, by anyone,
// moves its mod in or out of this list, so the eye never claims more than is true.
const closed = atom({ plugin: 'switchboard', key: 'closed' } as const, [], { shape: 'closed-2' })
const note = atom({ plugin: 'switchboard', key: 'note' } as const, '', { shape: 'note-1' })

const refresh = async ($: EngineInterface) => {
  const listed = await listMods(
    argv => $.process.run(argv, { timeoutMs: 60_000 }).catch(err => ({ exitCode: 1, stdout: '', stderr: String(err) })),
    path => $.fs.read(path).then(text => (typeof text === 'string' ? text : undefined), () => undefined),
  )
  if ('error' in listed) {
    await update($, note, () => listed.error)

    return
  }
  await update($, mods, () =>
    listed.mods.map(m => ({
      id: m.id,
      version: m.version,
      isEnabled: m.isEnabled,
      desc: BLURBS[nameOf(m.id)] ?? words(m.description),
      command: m.command,
      lucide: m.lucide,
      iconSvg: m.iconSvg,
      panes: m.panes,
    })),
  )
}

const modOfPane = async ($: EngineInterface, id: string) => (await read($, mods)).find(m => m.panes?.includes(id))

// The eye asks the pane to close or open. A call a hook makes does not run that hook again, so the
// result is recorded here; every other open or close (the mod's, the person's X) comes through the hooks below.
const toggleClosed = async ($: EngineInterface, mod: Mod) => {
  const wasClosed = (await read($, closed)).includes(mod.id)
  let failed = ''
  for (const id of mod.panes ?? []) {
    try {
      if (wasClosed) await $.ui.open({ id, title: titleOf(mod.id) })
      else await $.ui.close({ id })
    } catch (err) {
      failed = String(err).slice(0, 100)
    }
  }
  if (failed === '') await update($, closed, list => (wasClosed ? list.filter(x => x !== mod.id) : [...list, mod.id]))
  await update($, note, () => (failed === '' ? `${titleOf(mod.id)} ${wasClosed ? 'opened' : 'closed'}. It stays enabled.` : `${titleOf(mod.id)}: ${failed}`))
}

const toggleEnabled = async ($: EngineInterface, mod: Mod) => {
  const verb = mod.isEnabled ? 'disable' : 'enable'
  const ran = await $.process.run(['claude', 'plugin', verb, mod.id], { timeoutMs: 60_000 })
  await update($, note, () =>
    ran.exitCode === 0 ? `${mod.id} ${verb}d. Takes effect on reload or restart.` : `Failed: ${(ran.stderr || ran.stdout).slice(0, 120)}`,
  )
  await refresh($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'switchboard', description: 'Open the switchboard: turn mods on or off' })
    void refresh($)

    return next(e)
  })

  // Watch every pane open and close, whoever causes it (the mod, the person's X, a command).
  on('ui.open', async ($, e, next) => {
    const result = await next(e)
    const mod = await modOfPane($, e.id)
    if (mod && result.value?.isPlaced) await update($, closed, list => list.filter(x => x !== mod.id))

    return result
  })

  on('ui.close', async ($, e, next) => {
    const result = await next(e)
    const mod = e.origin.kind === 'unload' ? undefined : await modOfPane($, e.id)
    if (mod) await update($, closed, list => (list.includes(mod.id) ? list : [...list, mod.id]))

    return result
  })

  on('command.run', { command: 'switchboard' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Switchboard' })
    await refresh($)
    await update($, closed, list => list.filter(x => !x.startsWith('switchboard@')))

    return { text: 'Switchboard opened.' }
  })


  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)

    return pane(ui, e.surface === 'desktop' && 'Svg' in ui ? ui.Svg : undefined, {
      mods: await read($, mods),
      closedIds: await read($, closed),
      message: await read($, note),
      onToggleEnabled: m => toggleEnabled($, m),
      onToggleClosed: m => toggleClosed($, m),
      onRefresh: () => refresh($),
    })
  })
}
