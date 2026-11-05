import { expect, mock, test } from 'claude-code/testing'

const NOW = Date.UTC(2026, 10, 4, 12, 0, 0)
const DOC = '-abcdef12.md'
const TURN = { answer: 'done', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as never
const START = { cwd: '/p', surface: 'desktop', isInteractive: true } as const
const RUN = { command: 'handoff-session', args: '' } as never

const BAND = {
  plugin: 'session-handoff',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

const MESSAGES = [
  { role: 'user', text: 'Fix the parser, see https://example.com/spec.', toolUses: [] },
  {
    role: 'assistant',
    text: '',
    toolUses: [
      { tool_use_id: '1', tool: 'Read', input: { file_path: '/p/a.ts' } },
      { tool_use_id: '2', tool: 'Edit', input: { file_path: '/p/b.ts' } },
      { tool_use_id: '3', tool: 'Edit', input: { file_path: '/p/b.ts' } },
      { tool_use_id: '4', tool: 'Skill', input: { skill: 'tdd' } },
    ],
  },
]

const asks = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ role: 'user', text: `request ${i + 1}`, toolUses: [] }))

type Options = {
  messages?: readonly unknown[]
  fork?: () => unknown
  tokens?: () => number
  env?: Record<string, string>
  kept?: Record<string, unknown>
}

// Stubs the world a handoff reads from and writes to. Unless a test gives a
// `fork`, the model summary is unavailable and the fallback narrative is written.
const engine = (on: any, { messages = MESSAGES, fork, tokens, env = { HOME: '/home/me' }, kept = {} }: Options = {}) => {
  const clock = mock.clock(on, { now: NOW })
  mock.env(on, env)
  on('store.get', (_: unknown, e: any) => ({ value: kept[e.key] }))
  on('store.set', (_: unknown, e: any) => {
    kept[e.key] = e.value
    return { value: undefined }
  })
  const files = new Map<string, string>()
  on('command.register', () => ({ value: { command: 'handoff-session' } }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('session.messages', () => ({ value: messages }))
  on('session.id', () => ({ value: 'abcdef12-0000' }))
  on('session.cwd', () => ({ value: '/p' }))
  on('session.model', () => ({ value: 'test-model' }))
  on('session.usage', () => ({ value: { context: { tokens: tokens?.() ?? 84000, window: 200000 } } }))
  on('model.fork', fork ?? (() => ({ value: { isAnswered: false, text: '' } })))
  on('turn.complete', () => ({ text: '' }))
  on('fs.write', (_: unknown, e: any) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.read', (_: unknown, e: any) => ({ value: files.get(e.path) }))
  on('ui.render', () => ({ type: 'Text', children: ['engine'] }))
  on('ui.invalidate', () => ({ value: undefined }))
  return { clock, files, kept }
}

// The engine resolves paths against the OS, so match on the end of the path.
const written = (files: Map<string, string>, suffix: string) =>
  [...files].find(([path]) => path.replaceAll('\\', '/').endsWith(suffix))?.[1] ?? ''

test('/handoff-session registers and writes the handoff document', async ($, on) => {
  const { clock, files } = engine(on)
  await $.session.start(START)

  const run = await $.command.run(RUN)
  expect(run).toMatchObject({ text: 'Writing the handoff. Progress is shown above the prompt.' })
  await clock.advance(0)

  const doc = written(files, DOC)
  expect(doc).toContain('- Trigger: command')
  expect(doc).toContain('## Files changed\n- `/p/b.ts` (x2)')
  expect(doc).toContain('## Files read\n- `/p/a.ts`')
  expect(doc).toContain('- `Edit` (x2)')
  expect(doc).toContain('- `tdd`')
  expect(doc).toContain('- https://example.com/spec')
  expect(doc).toContain('(The model summary was unavailable')
})

test('the model summary replaces the fallback when it answers', async ($, on) => {
  const { clock, files } = engine(on, {
    fork: () => ({ value: { isAnswered: true, text: '## Goal\nShip it.' } }),
  })
  await $.session.start(START)
  await $.command.run(RUN)
  await clock.advance(0)

  const doc = written(files, DOC)
  expect(doc).toContain('## Goal\nShip it.')
  expect(doc).not.toContain('unavailable')
})

test('a model that has not answered in 120 s is given up on', async ($, on) => {
  const { clock, files } = engine(on, { fork: () => new Promise(() => {}) })
  await $.session.start(START)
  await $.command.run(RUN)
  await clock.advance(119000)
  expect(files.size).toBe(0)
  await clock.advance(1000)

  expect(written(files, DOC)).toContain('(The model summary was unavailable')
})

test('the fallback and the recent requests keep the last six requests, numbered', async ($, on) => {
  const { clock, files } = engine(on, { messages: asks(8) })
  await $.session.start(START)
  await $.command.run(RUN)
  await clock.advance(0)

  const doc = written(files, DOC)
  expect(doc).toContain('## Recent requests\n1. request 3\n2. request 4')
  expect(doc).toContain('## Recent user requests\n1. request 3')
  expect(doc).toContain('6. request 8')
  expect(doc).not.toContain('request 2')
})

test('links lose trailing punctuation, are counted once and stop at 40', async ($, on) => {
  const text = Array.from({ length: 45 }, (_, i) => `see https://x.test/${i}.`).join(' ')
  const { clock, files } = engine(on, {
    messages: [{ role: 'user', text: `${text} https://x.test/0!`, toolUses: [] }],
  })
  await $.session.start(START)
  await $.command.run(RUN)
  await clock.advance(0)

  const links = written(files, DOC).split('## Links\n')[1]!.split('\n\n')[0]!.split('\n')
  expect(links).toHaveLength(40)
  expect(links[0]).toBe('- https://x.test/0')
})

test('a changed file is not also listed as read, and only file tools count', async ($, on) => {
  const { clock, files } = engine(on, {
    messages: [
      {
        role: 'assistant',
        text: '',
        toolUses: [
          { tool_use_id: '1', tool: 'Read', input: { file_path: '/p/a.ts' } },
          { tool_use_id: '2', tool: 'Write', input: { file_path: '/p/a.ts' } },
          { tool_use_id: '3', tool: 'NotebookEdit', input: { notebook_path: '/p/n.ipynb' } },
          { tool_use_id: '4', tool: 'Grep', input: { file_path: '/p/g.ts' } },
        ],
      },
    ],
  })
  await $.session.start(START)
  await $.command.run(RUN)
  await clock.advance(0)

  const doc = written(files, DOC)
  expect(doc).toContain('## Files changed\n- `/p/a.ts`\n- `/p/n.ipynb`\n')
  expect(doc).toContain('## Files read\n- none\n')
})

test('an empty conversation fails the first step', async ($, on) => {
  const { clock } = engine(on, { messages: [] })
  await $.session.start(START)
  await $.command.run(RUN)
  await clock.advance(0)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
  expect((await ui.find({ type: 'Text', text: /Session handoff/ }))?.text).toContain('(failed)')
  expect((await ui.find({ type: 'Text', text: /Read the conversation/ }))?.text).toContain('the conversation is empty')
  await ui.unmount()
})

test('the cache trigger runs 55 minutes after a turn and a new turn cancels it', async ($, on) => {
  const { clock, files } = engine(on)
  on('turn.start', (_: unknown, e: any) => ({ turnId: e.turnId }))
  await $.session.start(START)
  await $.turn.complete(TURN)
  await clock.advance(54 * 60000)
  expect(files.size).toBe(0)
  await clock.advance(60000)
  expect(written(files, DOC)).toContain('- Trigger: cache')

  files.clear()
  await $.turn.complete(TURN)
  await $.turn.start({ text: '', turnId: 't2' } as never)
  await clock.advance(60 * 60000)
  expect(files.size).toBe(0)
})

test(
  'the cache options set the lifetime and the lead time',
  { options: { cache_minutes: 30, lead_minutes: 10 } },
  async ($, on) => {
    const { clock, files } = engine(on)
    await $.session.start(START)
    await $.turn.complete(TURN)
    await clock.advance(20 * 60000 - 1000)
    expect(files.size).toBe(0)
    await clock.advance(1000)
    expect(written(files, DOC)).toContain('- Trigger: cache')
  },
)

test('the context trigger fires past 250k tokens and re-arms below 200k', async ($, on) => {
  let tokens = 260000
  const { clock, files } = engine(on, { tokens: () => tokens })
  await $.session.start(START)
  const fired = async (next: number) => {
    files.clear()
    tokens = next
    await $.turn.complete(TURN)
    await clock.advance(0)
    return written(files, DOC).includes('- Trigger: context')
  }

  expect(await fired(260000)).toBe(true)
  expect(await fired(260000)).toBe(false)
  expect(await fired(210000)).toBe(false)
  expect(await fired(260000)).toBe(false)
  expect(await fired(199000)).toBe(false)
  expect(await fired(260000)).toBe(true)
})

test(
  'the context option sets the threshold, and re-arming follows it',
  { options: { context_tokens: 100000 } },
  async ($, on) => {
    let tokens = 120000
    const { clock, files } = engine(on, { tokens: () => tokens })
    await $.session.start(START)
    const fired = async (next: number) => {
      files.clear()
      tokens = next
      await $.turn.complete(TURN)
      await clock.advance(0)
      return written(files, DOC).includes('- Trigger: context')
    }

    expect(await fired(90000)).toBe(false)
    expect(await fired(120000)).toBe(true)
    expect(await fired(85000)).toBe(false)
    expect(await fired(120000)).toBe(false)
    expect(await fired(79000)).toBe(false)
    expect(await fired(120000)).toBe(true)
  },
)

// A finished handoff with its band mounted. `run` collects the commands the
// buttons start, `toasts` the messages they show.
const ready = async ($: any, on: any, options: Options = {}) => {
  const { clock, files } = engine(on, options)
  const run: string[][] = []
  const toasts: string[] = []
  on('process.run', (_: unknown, e: any) => {
    run.push([...e.argv])
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('ui.toast', (_: unknown, e: any) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  await $.session.start(START)
  await $.command.run(RUN)
  await clock.advance(0)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
  return { ui, files, run, toasts }
}

test('Start a new chat opens a claude:// link', async ($, on) => {
  const { ui, run, toasts } = await ready($, on)
  await ui.press({ key: 'new' })
  expect(run).toHaveLength(1)
  expect(run[0]![0]).toBe('open')
  expect(run[0]![1]).toMatch(/^claude:\/\/code\/new\?q=.*&folder=%2Fp$/)
  expect(decodeURIComponent(run[0]![1]!)).toContain('# Handoff:')
  expect(toasts).toContain('Opening a new chat in Claude.')
  await ui.unmount()
})

test('on Windows the link is opened through PowerShell and a long handoff is passed by path', async ($, on) => {
  const links = Array.from({ length: 40 }, (_, i) => `https://x.test/${i}/${'a'.repeat(200)}`)
  const long = [{ role: 'user', text: links.join(' '), toolUses: [] }]
  const { ui, run } = await ready($, on, { env: { HOME: 'C:/h', OS: 'Windows_NT' }, messages: long })
  await ui.press({ key: 'new' })
  expect(run[0]!.slice(0, 3)).toEqual(['powershell', '-NoProfile', '-Command'])
  expect(run[0]![3]).toMatch(/^Start-Process -FilePath 'claude:\/\/code\/new\?q=/)
  expect(decodeURIComponent(run[0]![3]!)).toContain('First read the handoff file at')
  await ui.unmount()
})

const opened = async ($: any, on: any, env: Record<string, string>) => {
  const { ui, run } = await ready($, on, { env })
  await ui.press({ key: 'open' })
  await ui.unmount()
  return run[0]!
}

test('Open file uses cmd on Windows', async ($, on) => {
  const argv = await opened($, on, { HOME: 'C:/h', OS: 'Windows_NT' })
  expect(argv.slice(0, 4)).toEqual(['cmd', '/c', 'start', ''])
  expect(argv[4]).toMatch(/.md$/)
})

test('Open file uses open on macOS', async ($, on) => {
  const argv = await opened($, on, { HOME: '/Users/me' })
  expect(argv[0]).toBe('open')
  expect(argv[1]).toMatch(/.md$/)
})

test('Open file uses xdg-open elsewhere', async ($, on) => {
  expect((await opened($, on, { HOME: '/home/me' }))[0]).toBe('xdg-open')
})

test('Close deletes both files', async ($, on) => {
  const { ui, run, toasts } = await ready($, on, { env: { HOME: '/home/me' } })
  await ui.press({ key: 'close' })
  expect(run[0]!.slice(0, 2)).toEqual(['rm', '-f'])
  expect(run[0]).toHaveLength(4)
  expect(toasts).toContain('Handoff file deleted.')
  await ui.unmount()
})

test('on Windows Close deletes with backslash paths', async ($, on) => {
  const { ui, run } = await ready($, on, { env: { HOME: 'C:/h', OS: 'Windows_NT' } })
  await ui.press({ key: 'close' })
  expect(run[0]!.slice(0, 5)).toEqual(['cmd', '/c', 'del', '/f', '/q'])
  expect(run[0]!.slice(5).every(f => !f.includes('/'))).toBe(true)
  await ui.unmount()
})

test('a finished handoff is kept in the store, so its panel can come back after a restart', async ($, on) => {
  const { clock, kept } = engine(on)
  await $.session.start(START)
  await $.command.run(RUN)
  await clock.advance(0)

  expect(kept.view).toMatchObject({ phase: 'ready', isDismissed: false })
})

const saved = (extra: object) => ({
  id: 1, trigger: 'command', title: 'Handoff', steps: [], phase: 'ready',
  path: '/h/a.md', promptPath: '/h/a.prompt.md', prompt: 'continue', cwd: '/p', isDismissed: false, ...extra,
})

test('the panel of the last finished handoff returns on session start', async ($, on) => {
  const run: string[][] = []
  engine(on, { kept: { view: saved({}) } })
  ;(on as any)('process.run', (_: unknown, e: any) => {
    run.push([...e.argv])
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  await $.session.start(START)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
  await ui.press({ key: 'open' })
  expect(run[0]![1]).toBe('/h/a.md')
})

for (const [name, extra] of [['was still working when the app closed', { phase: 'working' }], ['was dismissed', { isDismissed: true }]] as const) {
  test(`a handoff that ${name} does not return`, async ($, on) => {
    engine(on, { kept: { view: saved(extra) } })
    await $.session.start(START)

    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
    await expect(ui.press({ key: 'open' })).rejects.toThrow()
  })
}
