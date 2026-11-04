import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'switchboard',
  component: 'Pane',
  requestId: 'switchboard',
  props: { title: 'Switchboard', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

type Fake = { id: string; hooks?: string; manifest?: string; source?: string; icon?: string; throws?: boolean }

const withMods = (on: any, fakes: Fake[], closedPanes: string[] = []) => {
  const kept: Record<string, unknown> = {}
  on('store.get', (_: any, e: any) => ({ value: kept[e.key] }))
  on('store.set', (_: any, e: any) => {
    kept[e.key] = e.value

    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'switchboard' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', (_: any, e: any) => {
    closedPanes.push(e.id)

    return { value: undefined }
  })
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('process.run', () => ({
    value: {
      exitCode: 0,
      stdout: JSON.stringify(fakes.map(f => ({ id: f.id, version: '1.0.0', enabled: true, installPath: `/x/${f.id}` }))),
      stderr: '',
    },
  }))
  on('fs.read', (_: any, e: any) => {
    const path = String(e.path).replaceAll('\\', '/')
    const fake = fakes.find(f => path.includes(`/x/${f.id}/`))
    if (!fake || fake.throws) return { deny: 'unreadable' }
    if (path.endsWith('hooks/hooks.json')) return { value: fake.hooks ?? '{"modules":["./register.tsx"]}' }
    if (path.endsWith('plugin.json')) return { value: fake.manifest ?? '{"description":"A mod"}' }
    if (path.endsWith('icon.svg')) {
      if (fake.icon === undefined) return { deny: 'no icon' }

      return { value: fake.icon }
    }

    return { value: fake.source ?? '' }
  })
}

const open = async ($: any, surface: 'desktop' | 'terminal') => {
  await $.session.start({ cwd: '/', surface, isInteractive: true })

  return $.ui.mount({ ...PANE, surface })
}

test('a mod shows its title, a hand-written blurb or the first nine words of its description, and its slash command', async ($, on) => {
  withMods(on, [
    { id: 'usage-band@m', manifest: '{"description":"Long text that the blurb replaces"}', source: "command.register({ name: 'usage-band' })" },
    { id: 'cost-meter@m', manifest: '{"description":"one two three four five six seven eight nine ten eleven"}', source: "command.register({\n  name: 'cost' })" },
  ])
  const ui = await open($, 'terminal')
  expect(await ui.find({ type: 'Text', text: /^Usage Band$/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^Shows chat, 5-hour and weekly usage$/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^\/usage-band$/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^one two three four five six seven eight nine$/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^\/cost$/ })).toBeTruthy()
  await ui.unmount()
})

test('a command registered with double quotes, or none, shows no slash command', async ($, on) => {
  withMods(on, [
    { id: 'quoted@m', source: 'command.register({ name: "q" })' },
    { id: 'plain@m', source: 'nothing here' },
  ])
  const ui = await open($, 'terminal')
  expect(await ui.find({ type: 'Text', text: /^Quoted$/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^\/[a-z]/ })).toBeUndefined()
  await ui.unmount()
})

test('only plugins with a hooks module are mods; unreadable ones are skipped', async ($, on) => {
  withMods(on, [
    { id: 'real@m' },
    { id: 'skills-only@m', hooks: '{}' },
    { id: 'empty@m', hooks: '{"modules":[]}' },
    { id: 'broken@m', throws: true },
    { id: 'badjson@m', hooks: 'not json' },
  ])
  const ui = await open($, 'terminal')
  expect(await ui.find({ type: 'Text', text: /^Real$/ })).toBeTruthy()
  for (const name of ['Skills Only', 'Empty', 'Broken', 'Badjson']) {
    expect(await ui.find({ type: 'Text', text: new RegExp(`^${name}$`) })).toBeUndefined()
  }
  await ui.unmount()
})

test('pane ids come from ui.open with a single-quoted, double-quoted or const id; an unresolved const is dropped', async ($, on) => {
  const closedPanes: string[] = []
  withMods(
    on,
    [
    {
      id: 'multi@m',
      source: `const PANE = 'from-const'
        $.ui.open({ id: 'single' }); $.ui.open({ id: "double" }); $.ui.open({ id: PANE }); $.ui.open({ id: PANE }); $.ui.open({ id: MISSING })`,
    },
    { id: 'none@m', source: 'nothing' },
    ],
    closedPanes,
  )
  const ui = await open($, 'terminal')
  expect(await ui.find({ key: 'hide-none@m' })).toBeUndefined()
  await ui.press({ key: 'hide-multi@m' })
  expect(closedPanes).toEqual(['single', 'double', 'from-const'])
  await ui.unmount()
})

test('on the terminal a mod gets an emoji picked from its name, or a puzzle piece', async ($, on) => {
  withMods(on, [{ id: 'cost-meter@m' }, { id: 'mystery@m' }, { id: 'sound-git@m' }])
  const ui = await open($, 'terminal')
  expect(await ui.find({ type: 'Text', text: '💰' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: '🧩' })).toBeTruthy()
  // The first table entry that matches wins: "git" comes before "sound".
  expect(await ui.find({ type: 'Text', text: '🛡️' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: '🔊' })).toBeUndefined()
  await ui.unmount()
})

test('on desktop the icon is the manifest lucide, else one picked from the name, else a puzzle; a mod icon.svg wins', async ($, on) => {
  withMods(on, [
    { id: 'cost-meter@m' },
    { id: 'mystery@m' },
    { id: 'named@m', manifest: '{"description":"x","lucide":"heart"}' },
    { id: 'fallback-icon@m', manifest: '{"description":"x","icon":"star"}' },
    { id: 'badname@m', manifest: '{"description":"x","lucide":"not-a-real-icon"}' },
    { id: 'own@m', icon: '<svg viewBox="0 0 1 1"><path d="OWN"/></svg>' },
  ])
  const ui = await open($, 'desktop')
  const source = async (title: string) => ((await ui.findAll({ type: 'Svg' })).find((el: { props: Record<string, unknown> }) => el.props.alt === title)?.props.source as string)
  expect(await source('Cost Meter')).toContain('<circle cx="16" cy="8" r="6"') // coins
  expect(await source('Mystery')).toContain('M15.39 4.39') // puzzle
  expect(await source('Named')).toContain('M2 9.5a5.5') // heart
  expect(await source('Fallback Icon')).toContain('M11.525 2.295') // star
  expect(await source('Badname')).toContain('M15.39 4.39') // an unknown name falls back to the pick from the id: puzzle
  expect(await source('Own')).toContain('<g opacity="1"><path d="OWN"/></g></svg>')
  await ui.unmount()
})
