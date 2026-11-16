import { expect, mock, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'
import { paneEngine } from './pane-lifecycle-engine'

// Pane lifecycle (GLOSSARY.md), seen from Switchboard: its eye shows a mod's pane as closed or open.
// Reached here: a mod's pane opened by the mod (origin `plugin`) shows open; a pane closed by the mod shows closed;
// the eye reopens it; `/switchboard` reopens Switchboard's own pane. A test cannot raise the person's close (origin
// `person`) or an unload (origin `unload`), so the state the person's close leaves is read in hooks/register.tsx, not
// tested here. Switchboard opens no mod's pane itself. The harness registers the hooks once per test.

const PANE = {
  plugin: 'switchboard',
  component: 'Pane',
  requestId: 'switchboard',
  props: { title: 'Switchboard', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const LIST = [{ id: 'cost-meter@local-mods', version: '1.0.0', enabled: true, installPath: '/x/cost-meter' }]
const OPEN = 'Close its pane'
const SHUT = 'Open its pane'

// A plugin beside Switchboard that opens and closes the cost meter's pane and Switchboard's own pane, with origin `plugin`.
const driver: Plugin = {
  name: 'pane-driver',
  register: on => {
    on('command.run', { command: 'open-cost' }, async $ => {
      await $.ui.open({ id: 'cost-meter', title: 'Cost' })
      return { text: 'opened' }
    })
    on('command.run', { command: 'close-cost' }, async $ => {
      await $.ui.close({ id: 'cost-meter' })
      return { text: 'closed' }
    })
    on('command.run', { command: 'close-switchboard' }, async $ => {
      await $.ui.close({ id: 'switchboard' })
      return { text: 'closed' }
    })
  },
}

function setup(on: any) {
  const pane = paneEngine(on)
  const clock = mock.clock(on, { now: 0 })
  on('command.register', (_: any, e: any) => ({ value: { command: e.name } }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('process.run', (_: any, e: any) => {
    if (e.argv[2] === 'list') return { value: { exitCode: 0, stdout: JSON.stringify(LIST), stderr: '' } }
    const notes = ['./register.tsx hooks: command.run{command=cost}, ui.render{component=Pane, requestId=cost-meter}']

    return { value: { exitCode: 0, stdout: JSON.stringify({ success: true, contents: [{ type: 'hooks', notes }] }), stderr: '' } }
  })
  on('fs.read', (_: any, e: any) => ({ value: String(e.path).endsWith('plugin.json') ? '{"description":"Shows running cost"}' : undefined }))

  const run = ($: Engine, command: string) =>
    $.command.run({ command, args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })

  // The eye of each mod with a pane: its icon's alt text, read from the Pane as the surface draws it.
  const eyes = async ($: Engine) => {
    // The mod list is read in the background at session start: let that read land before the Pane is drawn.
    await clock.settle()
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const alts = (await ui.findAll({ type: 'Svg' })).map(s => s.props.alt).filter(alt => alt === OPEN || alt === SHUT)
    await ui.unmount()

    return alts
  }

  return { pane, clock, run, eyes }
}

test('open: a mod pane the mod opens shows its eye as open', { plugins: [driver] }, async ($, on) => {
  // Arrange
  const { pane, run, eyes } = setup(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  // Act
  await run($, 'open-cost')

  // Assert
  expect(pane.panes.map(p => p.id)).toEqual(['cost-meter'])
  expect(await eyes($)).toEqual([OPEN])
})

test('closed by the mod: the eye shows the pane as closed', { plugins: [driver] }, async ($, on) => {
  // Arrange
  const { pane, run, eyes } = setup(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await run($, 'open-cost')

  // Act
  await run($, 'close-cost')

  // Assert
  expect(pane.closed).toEqual([{ id: 'cost-meter', kind: 'plugin' }])
  expect(await eyes($)).toEqual([SHUT])
})

test('reopen by the eye: pressing it opens the pane and the eye shows it open', { plugins: [driver] }, async ($, on) => {
  // Arrange
  const { pane, run, eyes } = setup(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await run($, 'open-cost')
  await run($, 'close-cost')

  // Act
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'hide-cost-meter@local-mods' })
  await ui.unmount()

  // Assert
  expect(pane.opened).toEqual(['cost-meter', 'cost-meter'])
  expect(await eyes($)).toEqual([OPEN])
})

test('reopen by command: /switchboard opens Switchboard again after its pane was closed', { plugins: [driver] }, async ($, on) => {
  // Arrange
  const { pane, run } = setup(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await run($, 'close-switchboard')

  // Act
  const result = await run($, 'switchboard')

  // Assert
  expect(result).toMatchObject({ text: 'Switchboard opened.' })
  expect(pane.panes.map(p => p.id)).toEqual(['switchboard'])
})
