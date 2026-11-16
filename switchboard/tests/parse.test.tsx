import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'switchboard',
  component: 'Pane',
  requestId: 'switchboard',
  props: { title: 'Switchboard', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

// `notes` are what `claude plugin validate --json` says a mod's hooks module declares. `kind` picks a plugin that is
// not a mod (skills), or one whose validate fails or gives junk.
type Fake = { id: string; notes?: string[]; kind?: 'skills' | 'broken' | 'garbage'; manifest?: string; icon?: string }

const report = (notes: string[]) => JSON.stringify({ success: true, contents: [{ file: 'hooks/hooks.json', type: 'hooks', notes }] })

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
  on('process.run', (_: any, e: any) => {
    if (e.argv[2] === 'list') {
      const stdout = JSON.stringify(fakes.map(f => ({ id: f.id, version: '1.0.0', enabled: true, installPath: `/x/${f.id}` })))

      return { value: { exitCode: 0, stdout, stderr: '' } }
    }
    const fake = fakes.find(f => String(e.argv[4]).endsWith(`/x/${f.id}`))
    if (!fake || fake.kind === 'broken') return { value: { exitCode: 1, stdout: '', stderr: 'invalid' } }
    if (fake.kind === 'garbage') return { value: { exitCode: 0, stdout: 'not json', stderr: '' } }
    if (fake.kind === 'skills') return { value: { exitCode: 0, stdout: JSON.stringify({ success: true, contents: [{ type: 'plugin', notes: [] }] }), stderr: '' } }

    return { value: { exitCode: 0, stdout: report(fake.notes ?? []), stderr: '' } }
  })
  on('fs.read', (_: any, e: any) => {
    const path = String(e.path).replaceAll('\\', '/')
    const fake = fakes.find(f => path.includes(`/x/${f.id}/`))
    if (!fake) return { deny: 'unreadable' }
    if (path.endsWith('plugin.json')) return fake.manifest === undefined ? { deny: 'no manifest' } : { value: fake.manifest }
    if (path.endsWith('icon.svg')) return fake.icon === undefined ? { deny: 'no icon' } : { value: fake.icon }

    return { deny: 'unexpected read' }
  })
}

const open = async ($: any, surface: 'desktop' | 'terminal') => {
  await $.session.start({ cwd: '/', surface, isInteractive: true })

  return $.ui.mount({ ...PANE, surface })
}

test('a mod shows its title, a hand-written blurb or the first nine words of its description, and its slash command', async ($, on) => {
  withMods(on, [
    { id: 'usage-band@m', manifest: '{"description":"Long text that the blurb replaces"}', notes: ['./register.tsx hooks: command.run{command=usage-band}'] },
    { id: 'cost-meter@m', manifest: '{"description":"one two three four five six seven eight nine ten eleven"}', notes: ['./register.tsx hooks: command.run{command=cost}'] },
  ])
  const ui = await open($, 'terminal')
  expect(await ui.find({ type: 'Text', text: /^Usage Band$/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^Shows chat, 5-hour and weekly usage$/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^\/usage-band$/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^one two three four five six seven eight nine$/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^\/cost$/ })).toBeTruthy()
  await ui.unmount()
})

test('a mod that declares no command shows no slash command', async ($, on) => {
  withMods(on, [{ id: 'quiet@m', notes: ['./register.tsx hooks: session.start'] }])
  const ui = await open($, 'terminal')
  expect(await ui.find({ type: 'Text', text: /^Quiet$/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^\/[a-z]/ })).toBeUndefined()
  await ui.unmount()
})

test('only plugins with a hooks module are mods; plugins that fail to validate are skipped', async ($, on) => {
  withMods(on, [
    { id: 'real@m' },
    { id: 'skills-only@m', kind: 'skills' },
    { id: 'broken@m', kind: 'broken' },
    { id: 'badjson@m', kind: 'garbage' },
  ])
  const ui = await open($, 'terminal')
  expect(await ui.find({ type: 'Text', text: /^Real$/ })).toBeTruthy()
  for (const name of ['Skills Only', 'Broken', 'Badjson']) {
    expect(await ui.find({ type: 'Text', text: new RegExp(`^${name}$`) })).toBeUndefined()
  }
  await ui.unmount()
})

test('the eye closes each pane a mod renders, once, and nothing for a mod that renders none', async ($, on) => {
  const closedPanes: string[] = []
  withMods(
    on,
    [
      {
        id: 'multi@m',
        notes: ['./register.tsx hooks: ui.render{component=Pane, requestId=single}, ui.render{component=Pane, requestId=double}, ui.render{component=AbovePrompt}, ui.render{component=Pane, requestId=single}'],
      },
      { id: 'none@m', notes: ['./register.tsx hooks: session.start'] },
    ],
    closedPanes,
  )
  const ui = await open($, 'terminal')
  expect(await ui.find({ key: 'hide-none@m' })).toBeUndefined()
  await ui.press({ key: 'hide-multi@m' })
  expect(closedPanes).toEqual(['single', 'double'])
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
