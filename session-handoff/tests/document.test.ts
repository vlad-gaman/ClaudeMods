import { expect, test } from 'claude-code/testing'

import {
  buildDocument,
  bullets,
  classifyFiles,
  clip,
  continuePrompt,
  fallbackNarrative,
  fileOf,
  handoffDir,
  handoffPaths,
  stamp,
  tally,
  userRequests,
} from '../hooks/document'

const use = (tool: string, input: Record<string, unknown>) => ({ tool_use_id: tool, tool, input })
const message = (role: 'user' | 'assistant', text: string, toolUses: ReturnType<typeof use>[] = []) =>
  ({ role, text, toolUses }) as never

test('clip cuts at the limit and marks the cut', () => {
  expect([clip('abc', 3), clip('abcd', 3)]).toEqual(['abc', 'abc…'])
})

test('fileOf reads file_path or notebook_path and nothing else', () => {
  expect(fileOf({ file_path: '/a' })).toBe('/a')
  expect(fileOf({ notebook_path: '/n' })).toBe('/n')
  expect(fileOf({ file_path: 3, path: '/x' })).toBeUndefined()
})

test('stamp is the time to the second, safe in a file name', () => {
  expect(stamp(Date.UTC(2026, 10, 4, 12, 5, 9, 123))).toBe('2026-11-04T12-05-09')
})

test('classifyFiles counts changed and read files; a changed file is not read', () => {
  const files = classifyFiles([
    message('assistant', '', [
      use('Read', { file_path: '/a' }),
      use('Read', { file_path: '/b' }),
      use('Read', { file_path: '/b' }),
      use('MultiEdit', { file_path: '/a' }),
      use('Bash', { command: 'ls' }),
      use('Grep', { file_path: '/g' }),
    ]),
  ])
  expect([...files.changed]).toEqual([['/a', 1]])
  expect([...files.read]).toEqual([['/b', 2]])
})

test('tally counts tools and skills and finds links in text and tool input', () => {
  const t = tally([
    message('user', 'see https://a.test/x, and (https://b.test/y).'),
    message('assistant', '', [
      use('Skill', { skill: 'tdd' }),
      use('Skill', { skill: 'tdd' }),
      use('Skill', { skill: 3 }),
      use('WebFetch', { url: 'https://c.test/z?q=1' }),
    ]),
  ])
  expect([...t.tools]).toEqual([['Skill', 3], ['WebFetch', 1]])
  expect([...t.skills]).toEqual([['tdd', 2]])
  expect([...t.links]).toEqual(['https://a.test/x', 'https://b.test/y', 'https://c.test/z?q=1'])
})

test('userRequests keeps non-empty user text on one line, clipped to 300', () => {
  expect(
    userRequests([
      message('user', '  one\n two  '),
      message('assistant', 'no'),
      message('user', '   '),
      message('user', 'x'.repeat(400)),
    ]),
  ).toEqual(['one two', `${'x'.repeat(300)}…`])
})

test('bullets lists counts, most used first when sorted, and says none when empty', () => {
  const counts = new Map([['a', 1], ['b', 3]])
  expect(bullets(counts, false)).toBe('- `a`\n- `b` (x3)')
  expect(bullets(counts, true)).toBe('- `b` (x3)\n- `a`')
  expect(bullets(new Map(), true)).toBe('- none')
})

test('fallbackNarrative lists the last six requests', () => {
  const text = fallbackNarrative(['1', '2', '3', '4', '5', '6', '7'])
  expect(text).toContain('## Goal\n(The model summary was unavailable')
  expect(text).toContain('## Recent requests\n1. 2\n')
  expect(text).toContain('6. 7\n')
  expect(text).toContain('## Next steps\n1. Re-read the files below')
})

test('handoffDir prefers the user profile, then home, then the current folder', () => {
  expect([handoffDir('U', 'H'), handoffDir(undefined, 'H'), handoffDir(undefined, undefined)]).toEqual([
    'U/.claude/handoffs',
    'H/.claude/handoffs',
    './.claude/handoffs',
  ])
})

test('handoffPaths name the files by time and the first 8 characters of the session id', () => {
  expect(handoffPaths('/d', Date.UTC(2026, 10, 4, 12), 'abcdef123456')).toEqual({
    path: '/d/2026-11-04T12-00-00-abcdef12.md',
    promptPath: '/d/2026-11-04T12-00-00-abcdef12.prompt.txt',
  })
})

test('continuePrompt names the handoff file and the working directory', () => {
  const prompt = continuePrompt('/d/h.md', '/p')
  expect(prompt).toContain('read the handoff file at /d/h.md (working directory: /p)')
  expect(prompt).toContain('"Next steps"')
})

test('buildDocument writes the header, the narrative and every section', () => {
  const doc = buildDocument({
    sessionId: 's1',
    cwd: '/p',
    model: 'm',
    now: Date.UTC(2026, 10, 4),
    tokens: undefined,
    window: 200000,
    trigger: 'cache',
    narrative: 'NARRATIVE',
    files: { changed: new Map(), read: new Map([['/r', 2]]) },
    tally: { tools: new Map([['Read', 1]]), skills: new Map(), links: new Set(['https://a.test']) },
    requests: ['ask'],
  })
  expect(doc).toBe(
    [
      '# Handoff: 2026-11-04T00:00:00.000Z',
      '',
      '- Session: `s1`',
      '- Working directory: `/p`',
      '- Model: m',
      '- Context at handoff: unknown of 200000',
      '- Trigger: cache',
      '',
      'NARRATIVE',
      '',
      '## Files changed',
      '- none',
      '',
      '## Files read',
      '- `/r` (x2)',
      '',
      '## Skills used',
      '- none',
      '',
      '## Tools used',
      '- `Read`',
      '',
      '## Links',
      '- https://a.test',
      '',
      '## Recent user requests',
      '1. ask',
      '',
    ].join('\n'),
  )
})
