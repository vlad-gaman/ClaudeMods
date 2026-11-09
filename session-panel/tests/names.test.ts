import { expect, test } from 'claude-code/testing'

import { CONN_ICON, FILE_ICON } from '../hooks/data'
import { connIcon, connTitle, fileKind, findCommand, isSkillCommand, isTypedByPerson, mcpOf, nameFromTools, pathsIn, shorten, titleIn } from '../hooks/names'

test('connTitle: a known id gets its name, another id a short stand-in, a key its words capitalised', () => {
  expect(connTitle('c97b9d07-a0a9-440c-ace0-81c9338b3740')).toBe('Gmail')
  expect(connTitle('0123abcd-4567-89ab-cdef-000000000000')).toBe('Connector 0123abcd')
  expect(connTitle('claude_ai_Google_Drive')).toBe('Google Drive')
  expect(connTitle('claude.ai Slack')).toBe('Slack')
  expect(connTitle('atlassian')).toBe('Atlassian')
  expect(connTitle('mcp-registry')).toBe('MCP Registry')
  expect(connTitle('plugin_github_github')).toBe('Github')
  expect(connTitle('GoogleDrive')).toBe('Google Drive')
})

test('connIcon: a word in the server name picks the icon, the plug otherwise', () => {
  expect(connIcon('Claude_Browser')).toBe(CONN_ICON.globe)
  expect(connIcon('scheduled-tasks')).toBe(CONN_ICON.clock)
  expect(connIcon('mcp-registry')).toBe(CONN_ICON.search)
  expect(connIcon('atlassian')).toBe(CONN_ICON.plug)
})

test('fileKind: by extension, any case, plain when unknown or none', () => {
  expect(fileKind('docs/GUIDE.MD')).toBe('text')
  expect(fileKind('a/b/data.csv')).toBe('sheet')
  expect(fileKind('settings.json')).toBe('json')
  expect(fileKind('x.tsx')).toBe('code')
  expect(fileKind('logo.png')).toBe('image')
  expect(fileKind('Makefile')).toBe('plain')
  expect(FILE_ICON[fileKind('x.unknown')]).toBe(FILE_ICON.plain)
})

test('shorten: first sentence, at most nine words', () => {
  expect(shorten('Run the tests.  Then more.')).toBe('Run the tests')
  expect(shorten('one two three four five six seven eight nine ten eleven')).toBe('one two three four five six seven eight nine…')
  expect(shorten('  spaced \n out  ')).toBe('spaced out')
  expect(shorten('')).toBe('')
})

test('mcpOf: server and tool of an MCP tool, none for the desktop app\'s tools or other tools', () => {
  expect(mcpOf('mcp__atlassian__getJiraIssue')).toEqual({ server: 'atlassian', tool: 'getJiraIssue' })
  expect(mcpOf('mcp__atlassian__jira__getIssue')).toEqual({ server: 'atlassian', tool: 'jira__getIssue' })
  expect(mcpOf('mcp__ccd_turn__wrap_up').server).toBe('')
  expect(mcpOf('Read').server).toBe('')
  expect(mcpOf('mcp').server).toBe('')
})

test('titleIn: the last customTitle, unescaped; undefined when there is none', () => {
  expect(titleIn('{"customTitle":"One"}\n{"x":1}\n{"customTitle":"Two \\"q\\" \u00e9"}\n')).toBe('Two "q" é')
  expect(titleIn('{"x":1}')).toBeUndefined()
})

test('pathsIn: the d of each path, at most eight', () => {
  expect(pathsIn('<svg><path d="M0 0"/><path fill="x" d="M1 1"/></svg>')).toEqual(['M0 0', 'M1 1'])
  expect(pathsIn('<svg>' + '<path d="M0 0"/>'.repeat(12) + '</svg>')).toHaveLength(8)
  expect(pathsIn('<svg><circle/></svg>')).toEqual([])
})

const cmds = [
  { name: 'tdd', description: '', source: 'plugin' },
  { name: 'clear', description: '', source: 'builtin' },
  { name: 'jira', description: '', source: 'mcp' },
]

test('findCommand: the exact name, else its last colon part', () => {
  expect(findCommand(cmds, 'tdd')?.name).toBe('tdd')
  expect(findCommand(cmds, 'pack:tdd')?.name).toBe('tdd')
  expect(findCommand(cmds, 'nope')).toBeUndefined()
})

test('isSkillCommand: only skill and prompt files count, not built-ins, MCP prompts or unknowns', () => {
  expect(isSkillCommand(cmds[0])).toBe(true)
  expect(isSkillCommand(cmds[1])).toBe(false)
  expect(isSkillCommand(cmds[2])).toBe(false)
  expect(isSkillCommand(undefined)).toBe(false)
})

test('isTypedByPerson: not its own command, not one a plugin ran', () => {
  expect(isTypedByPerson('tdd', { kind: 'person' })).toBe(true)
  expect(isTypedByPerson('tdd')).toBe(true)
  expect(isTypedByPerson('session-panel', { kind: 'person' })).toBe(false)
  expect(isTypedByPerson('tdd', { kind: 'plugin' })).toBe(false)
})

test('nameFromTools: the listed name for a connector, nothing when it only repeats the key or an id', () => {
  const id = '0123abcd-4567-89ab-cdef-000000000000'
  const tools = [
    { name: `mcp__${id}__send`, serverName: 'claude.ai Fathom' },
    { name: 'mcp__atlassian__x', serverName: 'atlassian' },
    { name: 'mcp__other__x', serverName: id },
  ]
  expect(nameFromTools(tools, id)).toBe('Fathom')
  expect(nameFromTools(tools, 'atlassian')).toBeUndefined()
  expect(nameFromTools(tools, 'other')).toBeUndefined()
  expect(nameFromTools(tools, 'missing')).toBeUndefined()
})
