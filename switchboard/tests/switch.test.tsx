import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'switchboard',
  component: 'Pane',
  requestId: 'switchboard',
  props: { title: 'Switchboard', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const LIST = [{ id: 'cost-meter@local-mods', version: '1.0.0', enabled: true, installPath: '/x/cost-meter' }]

const opened: string[] = []

const setup = (on: any, calls: string[][]) => {
  const kept: Record<string, unknown> = {}
  on('store.get', (_: any, e: any) => ({ value: kept[e.key] }))
  on('store.set', (_: any, e: any) => {
    kept[e.key] = e.value

    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'switchboard' } }))
  on('ui.open', (_: any, e: any) => {
    opened.push(e.id)

    return { value: { isPlaced: true } }
  })
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('process.run', (_: any, e: any) => {
    calls.push(e.argv)

    return { value: { exitCode: 0, stdout: e.argv[2] === 'list' ? JSON.stringify(LIST) : '', stderr: '' } }
  })
  on('fs.read', (_: any, e: any) => ({
    value: String(e.path).endsWith('hooks.json')
      ? '{"modules":["./register.tsx"]}'
      : String(e.path).endsWith('plugin.json')
        ? '{"description":"Shows running cost"}'
        : "const PANE = 'cost-meter'; on('x'); command.register({ name: 'cost' }); $.ui.open({ id: PANE, title: 'Cost' })",
  }))
}

test('a mod gets a switch and pressing it runs plugin disable, on desktop', async ($, on) => {
  const calls: string[][] = []
  setup(on, calls)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Cost Meter/ })).toBeTruthy()
  await ui.press({ key: 'cost-meter@local-mods' })
  expect(calls.some(c => c.join(' ').includes('plugin disable cost-meter@local-mods'))).toBe(true)
  await ui.unmount()
})

test('the eye closes a mod pane without disabling it, and again opens it', async ($, on) => {
  const calls: string[][] = []
  setup(on, calls)
  const closedPanes: string[] = []
  on('ui.close', (_: any, e: any) => {
    closedPanes.push(e.id)

    return { value: undefined }
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'hide-cost-meter@local-mods' })
  expect(closedPanes).toContain('cost-meter')
  expect(calls.some(c => c.join(' ').includes('plugin disable'))).toBe(false)
  await ui.press({ key: 'hide-cost-meter@local-mods' })
  expect(opened).toContain('cost-meter')
  await ui.unmount()
})
