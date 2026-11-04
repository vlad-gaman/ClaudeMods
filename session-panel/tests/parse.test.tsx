import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'session-panel',
  component: 'Pane',
  requestId: 'session-panel',
  props: { title: 'Session', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 80 }, view: {} },
  surface: 'desktop',
} as const

const TRANSCRIPT = '{"customTitle":"First"}\n{"customTitle":"Second \\"one\\""}\n'
const LONG = 'Run the thing very carefully, one two three four five six seven eight. Second sentence.'

const engine = (on: any, extra: (on: any) => void = () => {}) => {
  on('command.register', () => ({ value: { command: 'session-panel' } }))
  on('command.list', () => ({ value: [{ name: 'long', description: LONG, source: 'plugin' }] }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { context: {} } }))
  on('http.fetch', () => ({ value: { ok: false, status: 404, text: '' } }))
  on('tool.call', () => ({ result: {} }))
  extra(on)
}

const start = ($: any) => $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
const texts = async (ui: any, pattern: RegExp) => (await ui.find({ type: 'Text', text: pattern }))?.text

test('a claude.ai connector is listed under its name, and a known id under its account name', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: 'mcp__claude_ai_Google_Drive__search' } as any)
  await $.tool.call({ tool: 'mcp__c97b9d07-a0a9-440c-ace0-81c9338b3740__list_labels' } as any)
  await $.tool.call({ tool: 'mcp__0123abcd-4567-89ab-cdef-000000000000__x' } as any)

  const ui = await $.ui.mount(PANE)
  expect(await texts(ui, /^Google Drive$/)).toBe('Google Drive')
  expect(await texts(ui, /^Gmail$/)).toBe('Gmail')
  expect(await texts(ui, /^Connector 0123abcd$/)).toBe('Connector 0123abcd')
  await ui.unmount()
})

test('the tool name under a connector keeps its own double underscores, and the desktop app\'s tools are not connectors', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: 'mcp__atlassian__jira__getIssue' } as any)
  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up' } as any)

  const ui = await $.ui.mount(PANE)
  expect(await texts(ui, /^jira__getIssue$/)).toBe('jira__getIssue')
  expect(await texts(ui, /^1 used$|^No connector/)).toBe('1 used')
  await ui.unmount()
})

test('a skill\'s description is cut to its first sentence and nine words', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: 'Skill', skill: 'long' } as any)

  const ui = await $.ui.mount(PANE)
  expect(await texts(ui, /^Run the thing/)).toBe('Run the thing very carefully, one two three four…')
  await ui.unmount()
})

test('the session title is the last customTitle in the transcript', async ($, on) => {
  engine(on, on => {
    on('env.get', () => ({ value: 'C:/Users/me' }))
    on('session.cwd', () => ({ value: 'D:/work/app' }))
    on('session.id', () => ({ value: 'abc' }))
    on('fs.read', (_: unknown, e: any) => ({
      value: /D--work-app.abc\.jsonl$/.test(e.path) ? TRANSCRIPT : '',
    }))
  })
  await start($)
  await $.tool.call({ tool: 'TodoWrite', todos: [{ content: 'a', status: 'pending' }] } as any)
  await $.command.run({ command: 'session-panel', args: '', origin: { kind: 'person' }, presentation: 'default' } as never)

  const ui = await $.ui.mount(PANE)
  expect(await texts(ui, /^Second/)).toBe('Second "one"')
  await ui.unmount()
})
