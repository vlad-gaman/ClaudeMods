import { expect, test } from 'claude-code/testing'

import { listMods } from '../hooks/manifest'

// In-memory ports: no engine, no files. `reports` answers `claude plugin validate --json <installPath>`.
type Report = { exitCode: number; stdout: string; stderr?: string }

const world = (plugins: object[], reports: Record<string, Report>, files: Record<string, string> = {}) => {
  const reads: string[] = []
  const run = async (argv: string[]) => {
    if (argv[2] === 'list') return { exitCode: 0, stdout: JSON.stringify(plugins), stderr: '' }
    const report = reports[argv[4] ?? ''] ?? { exitCode: 1, stdout: '', stderr: 'no such plugin' }

    return { stderr: '', ...report }
  }
  const read = async (path: string) => {
    reads.push(path)

    return files[path]
  }

  return { run, read, reads }
}

const plugin = (id: string) => ({ id, version: '1.0.0', enabled: true, installPath: `/x/${id}` })

// The report `claude plugin validate --json` gives a mod: one hooks entry with its notes.
const hooks = (...notes: string[]): Report => ({
  exitCode: 0,
  stdout: JSON.stringify({ success: true, contents: [{ file: 'hooks/hooks.json', type: 'hooks', notes }] }),
})

const NOT_A_MOD: Report = { exitCode: 0, stdout: JSON.stringify({ success: true, contents: [{ file: 'plugin.json', type: 'plugin', notes: [] }] }) }

const COST_NOTES = [
  './register.tsx hooks: session.start, ui.open, command.run{command=cost}, ui.render{component=Pane, requestId=cost-meter}',
  './register.tsx answers its own command: command.run{command=cost}',
]

test('a failed list gives the error and no mods', async () => {
  const { run, read } = world([], {})
  const failing = async () => ({ exitCode: 1, stdout: '', stderr: 'boom' })
  const result = await listMods(failing, read)
  expect('error' in result && result.error).toContain('boom')
  expect(await listMods(run, read)).toEqual({ mods: [] })
})

test('a list that is not JSON gives an error, not a throw', async () => {
  const { read } = world([], {})
  const result = await listMods(async () => ({ exitCode: 0, stdout: 'not json', stderr: '' }), read)
  expect('error' in result).toBe(true)
})

test('a plugin whose hooks name a command and a pane is a mod with both', async () => {
  const { run, read } = world([plugin('cost-meter@m')], { '/x/cost-meter@m': hooks(...COST_NOTES) }, {
    '/x/cost-meter@m/.claude-plugin/plugin.json': '{"description":"Shows running cost","lucide":"coins"}',
  })
  const result = await listMods(run, read)
  expect('mods' in result && result.mods).toEqual([
    {
      id: 'cost-meter@m',
      version: '1.0.0',
      isEnabled: true,
      description: 'Shows running cost',
      lucide: 'coins',
      command: 'cost',
      iconSvg: undefined,
      panes: ['cost-meter'],
    },
  ])
})

test('a plugin with no hooks in its report is not a mod, and nor is one that fails to validate', async () => {
  const { run, read } = world(
    [plugin('skills@m'), plugin('broken@m'), plugin('garbage@m'), plugin('real@m')],
    {
      '/x/skills@m': NOT_A_MOD,
      '/x/broken@m': { exitCode: 1, stdout: '', stderr: 'bad manifest' },
      '/x/garbage@m': { exitCode: 0, stdout: 'not json' },
      '/x/real@m': hooks('./register.tsx hooks: session.start'),
    },
  )
  const result = await listMods(run, read)
  expect('mods' in result && result.mods.map(m => m.id)).toEqual(['real@m'])
})

test('a mod whose plugin.json cannot be read is still listed, with no description', async () => {
  const { run, read } = world([plugin('quiet@m')], { '/x/quiet@m': hooks(...COST_NOTES) })
  const result = await listMods(run, read)
  expect('mods' in result && result.mods[0]).toMatchObject({ id: 'quiet@m', description: '', lucide: undefined, command: 'cost' })
})

test('the icon is the mod icon.svg when it holds an svg, else none', async () => {
  const { run, read } = world(
    [plugin('own@m'), plugin('plain@m')],
    { '/x/own@m': hooks(), '/x/plain@m': hooks() },
    { '/x/own@m/icon.svg': '<svg viewBox="0 0 1 1"></svg>', '/x/plain@m/icon.svg': 'not an icon' },
  )
  const result = await listMods(run, read)
  expect('mods' in result && result.mods.map(m => m.iconSvg)).toEqual(['<svg viewBox="0 0 1 1"></svg>', undefined])
})

test('each Pane the mod renders is one pane id, once; other renders give none', async () => {
  const { run, read } = world([plugin('two@m')], {
    '/x/two@m': hooks(
      './register.tsx hooks: ui.render{component=Pane, requestId=a}, ui.render{component=AbovePrompt}, ui.render{component=Pane, requestId=b}, ui.render{component=Pane, requestId=a}',
    ),
  })
  const result = await listMods(run, read)
  expect('mods' in result && result.mods[0]?.panes).toEqual(['a', 'b'])
})

test('a mod with no command registered has no slash command', async () => {
  const { run, read } = world([plugin('quiet@m')], { '/x/quiet@m': hooks('./register.tsx hooks: ui.render{component=Pane, requestId=q}') })
  const result = await listMods(run, read)
  expect('mods' in result && result.mods[0]).toMatchObject({ command: undefined, panes: ['q'] })
})

test('the seam never reads a hooks module: only plugin.json and icon.svg are read', async () => {
  const { run, read, reads } = world([plugin('cost-meter@m')], { '/x/cost-meter@m': hooks(...COST_NOTES) })
  await listMods(run, read)
  expect(reads.length).toBeGreaterThan(0)
  expect(reads.every(p => !p.includes('/hooks/'))).toBe(true)
})

test('mods come back sorted by id', async () => {
  const { run, read } = world([plugin('b@m'), plugin('a@m')], { '/x/a@m': hooks(), '/x/b@m': hooks() })
  const result = await listMods(run, read)
  expect('mods' in result && result.mods.map(m => m.id)).toEqual(['a@m', 'b@m'])
})
