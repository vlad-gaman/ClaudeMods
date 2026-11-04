import { CONN_ICON, CONN_WORDS, FILE_ICON, KIND_OF, KNOWN_CONNECTORS } from './data'

export type CommandRow = { name: string; description: string; source: string }

// The Lucide icon body for a connector, picked by a word in the server's name; the plug otherwise.
export const connIcon = (server: string) => {
  const key = server.toLowerCase()
  return CONN_ICON[CONN_WORDS.find(([w]) => key.includes(w))?.[1] ?? 'plug']
}

// The name a person would call a connector by: the key without its prefix, words capitalised.
export const connTitle = (server: string) =>
  KNOWN_CONNECTORS[server] ??
  (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(server)
    ? 'Connector ' + server.slice(0, 8)
    : server.replace(/^claude[ _.]?ai[ _.]/i, '').replace(/[_-]+/g, ' ').replace(/\b[a-z]/g, c => c.toUpperCase()))

export const fileKind = (path: string): keyof typeof FILE_ICON => KIND_OF[(path.split('.').pop() ?? '').toLowerCase()] ?? 'plain'

// First sentence of a description, at most 9 words.
export const shorten = (text: string) => {
  const words = (text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s/)[0] ?? '').replace(/\.$/, '').split(' ').filter(Boolean)
  return words.length > 9 ? words.slice(0, 9).join(' ') + '…' : words.join(' ')
}

// The connector and tool an MCP tool name (`mcp__<server>__<tool>`) belongs to. The desktop app's own
// `ccd_*` servers and anything that is not an MCP tool have no connector: `server` is ''.
export const mcpOf = (name: string) => {
  const [prefix, server = '', ...rest] = name.split('__')
  return { server: prefix === 'mcp' && !server.startsWith('ccd_') ? server : '', tool: rest.join('__') }
}

// The session's title is filed in its transcript as the last `custom-title` entry: undefined when there is none.
export const titleIn = (transcript: string) => {
  const m = [...transcript.matchAll(/"customTitle":"((?:[^"\\]|\\.)*)"/g)].pop()
  return m?.[1] === undefined ? undefined : (JSON.parse('"' + m[1] + '"') as string)
}

// The path data of an SVG's `<path>` elements, at most 8: the brand icon, redrawn in black or white.
export const pathsIn = (svg: string) => [...svg.matchAll(/<path[^>]*?\sd="([^"]+)"/g)].map(m => m[1] as string).slice(0, 8)

// The command a name stands for: the exact name, else its last `plugin:name` part.
export const findCommand = (cmds: CommandRow[], name: string) =>
  cmds.find(c => c.name === name) ?? cmds.find(c => c.name === name.split(':').pop())

// A typed command counts only when it is a skill or prompt file: built-ins and MCP prompts are left out.
export const isSkillCommand = (cmd: CommandRow | undefined) => cmd !== undefined && cmd.source !== 'builtin' && cmd.source !== 'mcp'

// A command this mod did not issue itself: the person's own typing, not one of its commands run by a plugin.
export const isTypedByPerson = (command: string, origin?: { kind?: string }) => command !== 'session-panel' && origin?.kind !== 'plugin'
