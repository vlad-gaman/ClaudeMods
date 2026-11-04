import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Mod } from '../types'
import { BLURBS } from './data'
import { nameOf, titleOf, words } from './names'
import { commandNameOf, panesOf } from './source'
import { pane } from './view'

const PANE = 'switchboard'
const mods = atom({ plugin: 'switchboard', key: 'mods' } as const, [], { shape: 'mods-3' })

// Mods whose pane is shut right now. Only what the engine reports: a pane opening or closing, by anyone,
// moves its mod in or out of this list, so the eye never claims more than is true.
const closed = atom({ plugin: 'switchboard', key: 'closed' } as const, [], { shape: 'closed-2' })
const note = atom({ plugin: 'switchboard', key: 'note' } as const, '', { shape: 'note-1' })

const refresh = async ($: EngineInterface) => {
  const ran = await $.process.run(['claude', 'plugin', 'list', '--json'])
  if (ran.exitCode !== 0) {
    await update($, note, () => `List failed: ${ran.stderr.slice(0, 120)}`)

    return
  }
  const plugins = JSON.parse(ran.stdout) as { id: string; version: string; enabled: boolean; installPath: string }[]
  // A mod is a plugin with a hooks module; skip subagent/skill-only plugins.
  const found = await Promise.all(
    plugins.map(async p => {
      try {
        const hooks = JSON.parse((await $.fs.read(`${p.installPath}/hooks/hooks.json`)) as string) as { modules?: string[] }
        if (!hooks.modules?.length) return undefined
        const manifest = JSON.parse((await $.fs.read(`${p.installPath}/.claude-plugin/plugin.json`)) as string) as { description?: string; lucide?: string; icon?: string }
        const source = (await $.fs.read(`${p.installPath}/hooks/${hooks.modules[0]}`)) as string
        const command = commandNameOf(source)
        const lucide = manifest.lucide ?? manifest.icon
        const panes = panesOf(source)
        const iconSvg = await $.fs.read(`${p.installPath}/icon.svg`).then(t => (typeof t === 'string' && t.includes('<svg') ? t : undefined), () => undefined)
        const desc = BLURBS[nameOf(p.id)] ?? words(manifest.description ?? '')

        return { ...p, desc, command, lucide, iconSvg, panes }
      } catch {
        return undefined
      }
    }),
  )
  await update($, mods, () =>
    found
      .filter((p): p is NonNullable<typeof p> => p !== undefined)
      .map(p => ({ id: p.id, version: p.version, isEnabled: p.enabled, desc: p.desc, command: p.command, lucide: p.lucide, iconSvg: p.iconSvg, panes: p.panes }))
      .sort((a, b) => a.id.localeCompare(b.id)),
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
    void $.ui.open({ id: PANE, title: 'Switchboard' })
    void refresh($)

    return next(e)
  })

  // Watch every pane open and close, whoever causes it (the mod, the person's X, a command).
  on('ui.open', async ($, e, next) => {
    const result = await next(e)
    const mod = await modOfPane($, e.id)
    if (mod && (result as { isPlaced?: boolean }).isPlaced) await update($, closed, list => list.filter(x => x !== mod.id))

    return result
  })

  on('ui.close', async ($, e, next) => {
    const result = await next(e)
    const mod = (e.origin as unknown) === 'unload' ? undefined : await modOfPane($, e.id)
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
