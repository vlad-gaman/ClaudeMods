import { INLINE_PROMPT_MAX } from './data'

export type Os = 'windows' | 'mac' | 'linux'

// Windows sets OS=Windows_NT; a home folder under /Users means macOS.
export const osOf = (osVar: string | undefined, home: string | undefined): Os =>
  osVar === 'Windows_NT' ? 'windows' : (home ?? '').startsWith('/Users/') ? 'mac' : 'linux'

const quote = (text: string) => encodeURIComponent(text).replace(/'/g, '%27')

// The claude:// link that starts a new chat. A long handoff is passed by
// its prompt (which names the file) instead of by its text.
export const newChatUrl = (handoff: string, prompt: string, cwd: string) =>
  'claude://code/new?q=' +
  quote(handoff.length <= INLINE_PROMPT_MAX ? handoff : prompt) +
  '&folder=' +
  quote(cwd)

export const newChatArgv = (os: Os, url: string) =>
  os === 'windows'
    ? ['powershell', '-NoProfile', '-Command', `Start-Process -FilePath '${url}'`]
    : ['open', url]

export const openArgv = (os: Os, path: string) =>
  os === 'windows'
    ? ['cmd', '/c', 'start', '', path]
    : [os === 'mac' ? 'open' : 'xdg-open', path]

export const deleteArgv = (os: Os, files: string[]) =>
  os === 'windows'
    ? ['cmd', '/c', 'del', '/f', '/q', ...files.map(f => f.replaceAll('/', '\\'))]
    : ['rm', '-f', ...files]
