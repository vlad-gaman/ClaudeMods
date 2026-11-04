import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { IconRow, Used, FileRow, SkillRow, Todo } from '../types'

const PANE = 'session-panel'
const used = atom({ plugin: 'session-panel', key: 'used' } as const, [] as Used[], { shape: 'used-1' })
const icons = atom({ plugin: 'session-panel', key: 'icons' } as const, [] as IconRow[], { shape: 'icons-2' })
const skills = atom({ plugin: 'session-panel', key: 'skills' } as const, [] as SkillRow[], { shape: 'skills-3' })
const files = atom({ plugin: 'session-panel', key: 'files' } as const, [] as FileRow[], { shape: 'files-1' })
const title = atom({ plugin: 'session-panel', key: 'title' } as const, '', { shape: 'title-1' })
const todos = atom({ plugin: 'session-panel', key: 'todos' } as const, [] as Todo[], { shape: 'todos-1' })

// Lucide icons (https://lucide.dev, ISC licence), 24px outline, black in light themes and white in dark.
const ICONS = {
  todo: '<path d="M13 5h8"/><path d="M13 12h8"/><path d="M13 19h8"/><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/>',
  files:
    '<path d="M15 2h-4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8"/><path d="M16.706 2.706A2.4 2.4 0 0 0 15 2v5a1 1 0 0 0 1 1h5a2.4 2.4 0 0 0-.706-1.706z"/><path d="M5 7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 1.732-1"/>',
  plug: '<path d="M12 22v-5"/><path d="M15 8V2"/><path d="M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z"/><path d="M9 8V2"/>',
  skills:
    '<path d="M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z"/>',
} as const
const GLYPH = { todo: '☑', files: '▤', plug: '⇄', skills: '⚡︎' } as const
// Radio-style status marks: empty ring, green ring and dot, dark gray ring and dot.
// Connector icons (Lucide), picked by a word in the server's name; the plug otherwise.
const CONN_ICON = {
  plug: ICONS.plug,
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  terminal: '<path d="m7 11 2-2-2-2"/><path d="M11 13h4"/><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  search: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
  layers: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  settings: '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>',
  pr: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" x2="6" y1="9" y2="21"/>',
  chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
} as const
const CONN_WORDS: [string, keyof typeof CONN_ICON][] = [
  ['browser', 'globe'], ['chrome', 'globe'], ['terminal', 'terminal'], ['schedul', 'clock'],
  ['registry', 'search'], ['search', 'search'], ['session', 'layers'], ['directory', 'folder'],
  ['settings', 'settings'], ['_pr', 'pr'], ['visualize', 'chart'], ['docs', 'plug'],
]
const connIcon = (server: string) => {
  const key = server.toLowerCase()
  return CONN_ICON[CONN_WORDS.find(([w]) => key.includes(w))?.[1] ?? 'plug']
}
// A claude.ai connector's tools are named by its id, not its name, and the engine gives a mod no way to
// look the name up: the ones this person has are listed here (add more as `id: 'Name'`).
const KNOWN_CONNECTORS: Record<string, string> = {
  'c97b9d07-a0a9-440c-ace0-81c9338b3740': 'Gmail',
  '1a59c906-04da-521d-bda7-7f71b9f9e01c': 'Claude Docs',
}
// The name a person would call a connector by: the key without its prefix, words capitalised.
const connTitle = (server: string) =>
  KNOWN_CONNECTORS[server] ??
  (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(server)
    ? 'Connector ' + server.slice(0, 8)
    : server.replace(/^claude[ _.]?ai[ _.]/i, '').replace(/[_-]+/g, ' ').replace(/\b[a-z]/g, c => c.toUpperCase()))

const BOX = {
  pending: '<circle cx="12" cy="12" r="9"/>',
  in_progress: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="currentColor"/>',
  completed: '<circle cx="12" cy="12" r="9" fill="currentColor"/>',
} as const
const FILE_BASE =
  '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/>'
const FILE_ICON = {
  text: FILE_BASE + '<path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  code: FILE_BASE + '<path d="M10 12.5 8 15l2 2.5"/><path d="m14 12.5 2 2.5-2 2.5"/>',
  json: FILE_BASE + '<path d="M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1"/><path d="M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1"/>',
  sheet: FILE_BASE + '<path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/>',
  image: FILE_BASE + '<circle cx="10" cy="12" r="2"/><path d="m20 17-1.296-1.296a2.41 2.41 0 0 0-3.408 0L9 22"/>',
  plain: FILE_BASE,
} as const
const KIND_OF: Record<string, keyof typeof FILE_ICON> = {
  md: 'text', mdx: 'text', txt: 'text', rst: 'text', rtf: 'text', doc: 'text', docx: 'text', pdf: 'text',
  xls: 'sheet', xlsx: 'sheet', csv: 'sheet', tsv: 'sheet',
  json: 'json', jsonc: 'json',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image',
  yaml: 'code', yml: 'code', toml: 'code', js: 'code', jsx: 'code', ts: 'code', tsx: 'code', py: 'code', sh: 'code',
}
const fileKind = (path: string) => KIND_OF[(path.split('.').pop() ?? '').toLowerCase()] ?? 'plain'
const BOX_COLOR = { pending: '', in_progress: '#f97316', completed: '#22c55e' } as const
const svgOf = (body: string, size = 20, color = '') =>
  '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (color ? '<style>g{stroke:' + color + ';color:' + color + '}</style>' : '<style>g{stroke:#000;color:#000}@media (prefers-color-scheme:dark){g{stroke:#fff;color:#fff}}</style>') + '<g transform="translate(0 1.2)">' +
  body +
  '</g></svg>'

const MARK = { pending: '[ ]', in_progress: '[~]', completed: '[x]' } as const

// The tools that edit the to-do list. TaskCreate is the one whose result is needed (it carries the new id).
export const TODO_TOOLS = new Set(['mcp__ccd_turn__update_plan', 'mcp__ccd_turn__wrap_up', 'TodoWrite', 'TaskCreate', 'TaskUpdate'])

// The to-do list after one task-list tool call. `input` is the call's arguments, `result` what the tool answered.
// The desktop app's update_plan: items replaces the list, advance/done/start move the marks, wrap_up checks all off.
export const applyTodoTool = (todos: Todo[], tool: string, input: any, result?: any): Todo[] => {
  if (tool === 'mcp__ccd_turn__wrap_up') return todos.map(t => ({ ...t, status: 'completed' as const }))

  if (tool === 'TodoWrite')
    return (input.todos as { content: string; status: Todo['status'] }[]).map((t, i) => ({ id: String(i), text: t.content, status: t.status }))

  if (tool === 'TaskCreate') {
    const id = result?.result?.task?.id
    return id === undefined ? todos : [...todos, { id: String(id), text: input.subject, status: 'pending' as const }]
  }

  if (tool === 'TaskUpdate')
    return todos
      .filter(t => !(t.id === String(input.taskId) && input.status === 'deleted'))
      .map(t =>
        t.id === String(input.taskId)
          ? { ...t, text: input.subject ?? t.text, status: input.status && input.status !== 'deleted' ? input.status : t.status }
          : t,
      )

  if (tool === 'mcp__ccd_turn__update_plan') {
    let list: Todo[] = Array.isArray(input.items)
      ? input.items.map((t: { content: string; status: Todo['status'] }, i: number) => ({ id: String(i), text: t.content, status: t.status }))
      : todos
    if (input.advance) {
      const i = list.findIndex(t => t.status === 'in_progress')
      list = list.map((t, k) => (k === i ? { ...t, status: 'completed' as const } : t))
      const n = list.findIndex(t => t.status === 'pending')
      if (n >= 0) list = list.map((t, k) => (k === n ? { ...t, status: 'in_progress' as const } : t))
    }
    if (Array.isArray(input.done)) list = list.map((t, k) => (input.done.includes(k + 1) ? { ...t, status: 'completed' as const } : t))
    if (typeof input.start === 'number') list = list.map((t, k) => (k === input.start - 1 ? { ...t, status: 'in_progress' as const } : t))
    return list
  }

  return todos
}

// Brand icon for a connector, fetched once from Simple Icons by its display name (Gmail -> "gmail").
// Only the path data is kept and redrawn in black or white; no match leaves the Lucide icon.
async function loadIcon($: any, server: string) {
  const slug = connTitle(server).toLowerCase().replace(/[^a-z0-9]/g, '')
  let paths: string[] = []
  try {
    if (slug) {
      const res = await $.http.fetch('https://cdn.simpleicons.org/' + slug)
      if (res.ok && res.text.trimStart().startsWith('<svg'))
        paths = [...res.text.matchAll(/<path[^>]*?\sd="([^"]+)"/g)].map(m => m[1]).slice(0, 8)
    }
  } catch {
    // offline or refused: keep the Lucide icon
  }
  await update($, icons, l => l.map(i => (i.server === server ? { ...i, paths } : i)))
}
const svgFilled = (paths: readonly string[], size: number) =>
  '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24"><style>g{fill:#000}@media (prefers-color-scheme:dark){g{fill:#fff}}</style><g>' +
  paths.map(d => '<path d="' + d + '"/>').join('') +
  '</g></svg>'

// First sentence of a description, at most 9 words.
const shorten = (text: string) => {
  const words = text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s/)[0].replace(/\.$/, '').split(' ').filter(Boolean)
  return words.length > 9 ? words.slice(0, 9).join(' ') + '…' : words.join(' ')
}

// The session's title is filed in its transcript as the last `custom-title` entry.
async function loadTitle($: any) {
  try {
    const home = await $.env.get('USERPROFILE')
    const cwd = await $.session.cwd()
    const id = await $.session.id()
    const text: string = await $.fs.read(home + '/.claude/projects/' + cwd.replace(/[^a-zA-Z0-9]/g, '-') + '/' + id + '.jsonl')
    const m = [...text.matchAll(/"customTitle":"((?:[^"\\]|\\.)*)"/g)].pop()
    if (m) await update($, title, () => JSON.parse('"' + m[1] + '"'))
  } catch {
    // transcript unreadable: no headline
  }
}

// A typed command counts only when it is a skill or prompt file: built-ins and MCP prompts are left out.
async function countSkill($: any, skill: string, typed = false) {
  const name = skill.replace(/^\//, '')
  if (!name) return
  let cmd: { name: string; description: string; source: string } | undefined
  try {
    const cmds: { name: string; description: string; source: string }[] = await $.command.list()
    cmd = cmds.find(c => c.name === name) ?? cmds.find(c => c.name === name.split(':').pop())
  } catch {
    // no command list: no description, and a typed command is not counted
  }
  if (typed && (!cmd || cmd.source === 'builtin' || cmd.source === 'mcp')) return
  const desc = shorten(cmd?.description ?? '')
  await update($, skills, l =>
    l.some(k => k.name === name)
      ? l.map(k => (k.name === name ? { ...k, count: k.count + 1 } : k))
      : [...l, { name, count: 1, desc }],
  )
}

async function refresh($: any) {
  await loadTitle($)
  try {
    const { context } = await $.session.usage({ breakdown: 'summary' })
    const b = context.breakdown
    if (!b) return
    await update($, files, () =>
      (b.memoryFiles as FileRow[]).map(f => ({ path: f.path, type: f.type, tokens: f.tokens })),
    )
  } catch {
    // usage unavailable: keep the last values
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'session-panel',
      description: 'Show connectors, skills, context files and to-dos of this session',
    })
    void $.ui.open({ id: PANE, title: 'Session' })
    void refresh($)
    return next(e)
  })

  on('command.run', { command: 'session-panel' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Session' })
    await refresh($)
    return { text: 'Session panel opened.' }
  })

  on('prompt.submit', async ($, e, next) => {
    void refresh($)
    return next(e)
  })

  // Not skill.prompt: the organization's policy plugin passes that event on past the person's plugins.
  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    const ran: any = await next(e)
    if (!ran?.deny && !ran?.isError) await countSkill($, String((e as any).skill ?? ''))
    return ran
  })

  on('command.run', async ($, e, next) => {
    if (e.command !== 'session-panel' && e.origin?.kind !== 'plugin') void countSkill($, e.command, true)
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const [prefix, name, ...rest] = String((e as any).tool).split('__')
    const server = prefix === 'mcp' && !name.startsWith('ccd_') ? name : ''
    const tool = rest.join('__')
    if (server)
      await update($, used, l =>
        l.some(u => u.server === server)
          ? l.map(u => (u.server === server ? { ...u, count: u.count + 1, tool } : u))
          : [...l, { server, count: 1, tool }],
      )
    if (server) {
      const known = await read($, icons)
      if (!known.some(i => i.server === server)) {
        await update($, icons, l => [...l, { server, paths: [] }])
        void loadIcon($, server)
      }
    }
    // The to-do list follows the task-list tools; the rules live in applyTodoTool.
    // TaskCreate's new id is in its result, so it is read after the call; the others change the list first.
    const full = String((e as any).tool)
    if (!TODO_TOOLS.has(full)) return next(e)
    const ran: any = full === 'TaskCreate' ? await next(e) : undefined
    await update($, todos, l => applyTodoTool(l, full, e, ran))
    return full === 'TaskCreate' ? ran : next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text } = ui
    const Svg = 'Svg' in ui ? (ui as any).Svg : null
    const [us, ss, fs, ts, ic, ti] = await Promise.all([
      read($, used),
      read($, skills),
      read($, files),
      read($, todos),
      read($, icons),
      read($, title),
    ])
    const done = ts.filter(t => t.status === 'completed').length
    const total = fs.reduce((n, f) => n + f.tokens, 0)
    const Panel = (p: { icon: keyof typeof ICONS; title: string; detail: string; children?: unknown }) => (
      <Box flexDirection="column" borderStyle="round" paddingX={1} marginBottom={1}>
        <Box justifyContent="space-between" width="100%">
          <Box alignItems="center">
            {Svg ? (
              <Box marginRight={1} alignItems="center">
                <Svg source={svgOf(ICONS[p.icon])} alt={p.title} width={20} height={20} />
              </Box>
            ) : (
              <Text bold size="heading">
                {GLYPH[p.icon]}{" "}
              </Text>
            )}
            <Text bold size="heading">
              {p.title}
            </Text>
          </Box>
          <Text color="gray">{p.detail}</Text>
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {p.children}
        </Box>
      </Box>
    )
    const Sep = () => (
      <Box width="100%" height={1} overflow="hidden" marginY={0}>
        <Text color="gray" dimColor wrap="wrap">
          {'─'.repeat(200)}
        </Text>
      </Box>
    )
    // The column before every item's text, one width in all sections so the texts line up: an Svg where
    // the surface has one, else the text fallback, and nothing when no source is given (Skills).
    const Slot = (p: { source?: string; size?: number; alt?: string; fallback?: unknown }) => (
      <Box width={3} flexShrink={0}>
        {p.source === undefined ? null : Svg ? <Svg source={p.source} alt={p.alt ?? ''} width={p.size} height={p.size} /> : p.fallback}
      </Box>
    )
    // One list entry of Context files, Connectors and Skills: slot, bold title, gray right and sub line, a rule above all but the first.
    const Item = (p: { n: number; slot: unknown; title: string; right: string; sub?: string }) => (
      <Box flexDirection="column" width="100%">
        {p.n > 0 && <Sep />}
        <Box alignItems="center" width="100%">
          {p.slot}
          <Box flexDirection="column" flexGrow={1} flexShrink={1}>
            <Box justifyContent="space-between" width="100%">
              <Text bold>{p.title}</Text>
              <Text color="gray">{p.right}</Text>
            </Box>
            {p.sub !== undefined && p.sub !== '' && <Text color="gray">{p.sub}</Text>}
          </Box>
        </Box>
      </Box>
    )
    // The rows of a section, or its gray empty-state line.
    function rows<T>(items: T[], empty: string, row: (t: T, n: number) => unknown) {
      return items.length === 0 ? <Text color="gray">{empty}</Text> : items.map(row)
    }
    const times = (n: number) => `${n}×`
    const iconPaths = (server: string) => ic.find(i => i.server === server)?.paths ?? []
    const tone = (s: Todo['status']) => (s === 'in_progress' ? 'yellow' : s === 'completed' ? 'green' : undefined)

    return (
      <Box flexDirection="column">
        <Panel icon="todo" title="To-do" detail={`${done}/${ts.length} done`}>
          {ts.length > 0 && ti !== '' && (
            <Box marginBottom={1}>
              <Text bold>{ti}</Text>
            </Box>
          )}
          {rows(ts, 'No to-dos yet.', t => (
            <Box alignItems="flex-start" width="100%">
              <Slot
                source={svgOf(BOX[t.status], 16, BOX_COLOR[t.status])}
                size={16}
                alt={t.status}
                fallback={<Text color={tone(t.status)}>{MARK[t.status]}</Text>}
              />
              <Box flexGrow={1} flexShrink={1}>
                <Text
                  color={t.status === 'completed' ? 'gray' : undefined}
                  strikethrough={t.status === 'completed'}
                  bold={t.status === 'in_progress'}
                >
                  {t.text}
                </Text>
              </Box>
            </Box>
          ))}
        </Panel>
        <Panel icon="files" title="Context files" detail={`${fs.length} · ~${total} tokens`}>
          {rows(fs, 'None loaded.', (f, n) => {
            const name = f.path.split(/[\\/]/).pop() ?? f.path
            return (
              <Item
                n={n}
                slot={<Slot source={svgOf(FILE_ICON[fileKind(f.path)], 18)} size={18} alt="file" fallback={<Text>▤</Text>} />}
                title={name}
                right={`${f.type} · ${f.tokens}t`}
                sub={f.path.slice(0, f.path.length - name.length).replace(/[\\/]+$/, '')}
              />
            )
          })}
        </Panel>
        <Panel icon="plug" title="Connectors" detail={`${us.length} used`}>
          {rows(us, 'No connector used yet.', (c, n) => (
            <Item
              n={n}
              slot={
                <Slot
                  source={iconPaths(c.server).length > 0 ? svgFilled(iconPaths(c.server), 18) : svgOf(connIcon(c.server), 18)}
                  size={18}
                  alt={c.server}
                  fallback={<Text>⇄</Text>}
                />
              }
              title={connTitle(c.server)}
              right={times(c.count)}
              sub={c.tool ?? `mcp__${c.server}__*`}
            />
          ))}
        </Panel>
        <Panel icon="skills" title="Skills" detail={`${ss.length} used`}>
          {rows(ss, 'No skill used yet.', (s, n) => (
            <Item
              n={n}
              slot={<Slot />}
              title={'/' + s.name}
              right={times(s.count)}
              sub={s.desc}
            />
          ))}
        </Panel>
      </Box>
    )
  })
}
