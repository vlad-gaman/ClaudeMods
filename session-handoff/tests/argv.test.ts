import { expect, test } from 'claude-code/testing'

import { deleteArgv, newChatArgv, newChatUrl, openArgv, osOf } from '../hooks/argv'

test('osOf tells Windows by OS, macOS by a home under /Users, and calls the rest Linux', () => {
  expect(osOf('Windows_NT', '/Users/me')).toBe('windows')
  expect(osOf(undefined, '/Users/me')).toBe('mac')
  expect(osOf(undefined, '/home/me')).toBe('linux')
  expect(osOf(undefined, undefined)).toBe('linux')
})

test('newChatUrl carries the handoff and the folder, URL-encoded with quotes escaped', () => {
  expect(newChatUrl("it's # 1", 'PROMPT', '/my dir')).toBe(
    'claude://code/new?q=it%27s%20%23%201&folder=%2Fmy%20dir',
  )
})

test('newChatUrl passes the prompt instead of a handoff over 8000 characters', () => {
  expect(newChatUrl('x'.repeat(8000), 'P', '/p')).toContain('q=xxx')
  expect(newChatUrl('x'.repeat(8001), 'P', '/p')).toBe('claude://code/new?q=P&folder=%2Fp')
})

test('newChatArgv starts the link with PowerShell on Windows and open elsewhere', () => {
  expect(newChatArgv('windows', 'claude://x')).toEqual([
    'powershell',
    '-NoProfile',
    '-Command',
    "Start-Process -FilePath 'claude://x'",
  ])
  expect(newChatArgv('mac', 'claude://x')).toEqual(['open', 'claude://x'])
  expect(newChatArgv('linux', 'claude://x')).toEqual(['open', 'claude://x'])
})

test('openArgv uses cmd, open or xdg-open by system', () => {
  expect(openArgv('windows', 'C:/h.md')).toEqual(['cmd', '/c', 'start', '', 'C:/h.md'])
  expect(openArgv('mac', '/h.md')).toEqual(['open', '/h.md'])
  expect(openArgv('linux', '/h.md')).toEqual(['xdg-open', '/h.md'])
})

test('deleteArgv uses del with backslashes on Windows and rm elsewhere', () => {
  expect(deleteArgv('windows', ['C:/a/b.md', 'C:/a/c.txt'])).toEqual([
    'cmd', '/c', 'del', '/f', '/q', 'C:\\a\\b.md', 'C:\\a\\c.txt',
  ])
  expect(deleteArgv('linux', ['/a', '/b'])).toEqual(['rm', '-f', '/a', '/b'])
})
