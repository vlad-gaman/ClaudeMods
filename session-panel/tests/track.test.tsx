import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'session-panel',
  component: 'Pane',
  requestId: 'session-panel',
  props: {
    title: 'Session',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 80 },
    view: {},
  },
} as const

const engine = (on: any, toolAnswer: object = { result: {} }) => {
  on('command.register', () => ({ value: { command: 'session-panel' } }))
  on('command.list', () => ({
    value: [
      { name: 'tdd', description: 'Test-driven development.', source: 'plugin' },
      { name: 'clear', description: 'Clear the conversation.', source: 'builtin' },
      { name: 'jira', description: 'An MCP prompt.', source: 'mcp' },
    ],
  }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { context: {} } }))
  on('http.fetch', () => ({ value: { ok: false, status: 404, text: '' } }))
  on('tool.call', () => toolAnswer)
  on('command.run', () => ({ text: '' }))
}

test('a connector called through its MCP tool is listed', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'mcp__atlassian__getJiraIssue', issueIdOrKey: 'CO-1' } as any)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^Atlassian$/ }))?.text).toBe('Atlassian')
  await ui.unmount()
})

test('a skill run by the Skill tool is listed', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Skill', skill: 'tdd' } as any)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^\/tdd$/ }))?.text).toBe('/tdd')
  await ui.unmount()
})

test('a skill typed as a slash command is listed', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'tdd' } as never)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^\/tdd$/ }))?.text).toBe('/tdd')
  await ui.unmount()
})

test('built-in, MCP, unknown and its own commands are not listed as skills', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const command of ['clear', 'jira', 'nope', 'session-panel']) await $.command.run({ command } as never)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /No skill used yet/ }))?.text).toBe('No skill used yet.')
  await ui.unmount()
})

test('a denied Skill call is not listed', async ($, on) => {
  engine(on, { deny: 'no' })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Skill', skill: 'tdd' } as any)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /No skill used yet/ }))?.text).toBe('No skill used yet.')
  await ui.unmount()
})
