import { expect, mock, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'
import { paneEngine } from './pane-lifecycle-engine'

// Pane lifecycle (GLOSSARY.md) for Session Panel.
// Reached here: open with the session; a close by a plugin (origin `plugin`) is not a dismissal, so the next session
// opens the pane again; `/session-panel` opens it again. A test cannot raise the person's close (origin `person`) or an
// unload (origin `unload`), so the dismissal the person's close records is read in hooks/register.tsx, not tested here.
// The harness registers the hooks once per test, so a reload is a second `session.start` on the same engine.

// A plugin beside Session Panel that closes its pane the way a plugin does: `$.ui.close`, origin `plugin`.
const driver: Plugin = {
  name: 'pane-driver',
  register: on => {
    on('command.run', { command: 'close-session' }, async $ => {
      await $.ui.close({ id: 'session-panel' })
      return { text: 'closed' }
    })
  },
}

function setup(on: any) {
  const pane = paneEngine(on)
  const clock = mock.clock(on, { now: 0 })
  on('command.register', (_: any, e: any) => ({ value: { command: e.name } }))
  on('command.list', () => ({ value: [] }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { context: {} } }))
  on('http.fetch', () => ({ value: { ok: false, status: 404, text: '' } }))
  on('command.run', () => ({ text: '' }))

  const start = async ($: Engine) => {
    await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
    await clock.settle()
  }
  const command = ($: Engine, name: string) =>
    $.command.run({ command: name, args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } } as never)

  return { pane, start, command }
}

test('open: the pane opens with the session', { plugins: [driver] }, async ($, on) => {
  // Arrange
  const { pane, start } = setup(on)

  // Act
  await start($)

  // Assert
  expect(pane.panes.map(p => p.id)).toEqual(['session-panel'])
})

test('closed by a plugin is not a dismissal: the next session opens it again', { plugins: [driver] }, async ($, on) => {
  // Arrange
  const { pane, start, command } = setup(on)
  await start($)

  // Act
  await command($, 'close-session')
  await start($)

  // Assert
  expect(pane.closed).toEqual([{ id: 'session-panel', kind: 'plugin' }])
  expect(pane.panes.map(p => p.id)).toEqual(['session-panel'])
  expect(pane.opened).toEqual(['session-panel', 'session-panel'])
})

test('reopen by command: /session-panel opens the pane again after a plugin closed it', { plugins: [driver] }, async ($, on) => {
  // Arrange
  const { pane, start, command } = setup(on)
  await start($)
  await command($, 'close-session')

  // Act
  const result = await command($, 'session-panel')

  // Assert
  expect(result).toMatchObject({ text: 'Session panel opened.' })
  expect(pane.panes.map(p => p.id)).toEqual(['session-panel'])
})
