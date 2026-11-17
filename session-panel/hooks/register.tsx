import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { IconRow, Used, FileRow, SkillRow, Todo } from '../types'
import { findCommand, isSkillCommand, isTypedByPerson, mcpOf, pathsIn, shorten, titleIn, connTitle, nameFromTools } from './names'
import { applyTodoTool, TODO_TOOLS, type TodoInput, type TodoResult } from './todos'
import { pane } from './view'

const PANE = 'session-panel'
// The atom keys keep their old names (`used`, `files`): they are the saved shape of the state.
const connectors = atom({ plugin: 'session-panel', key: 'used' } as const, [] as Used[], { shape: 'used-1' })
const icons = atom({ plugin: 'session-panel', key: 'icons' } as const, [] as IconRow[], { shape: 'icons-2' })
const skills = atom({ plugin: 'session-panel', key: 'skills' } as const, [] as SkillRow[], { shape: 'skills-3' })
const contextFiles = atom({ plugin: 'session-panel', key: 'files' } as const, [] as FileRow[], { shape: 'files-1' })
const title = atom({ plugin: 'session-panel', key: 'title' } as const, '', { shape: 'title-1' })
const todos = atom({ plugin: 'session-panel', key: 'todos' } as const, [] as Todo[], { shape: 'todos-1' })
// Set when the person closes the pane by hand; a session start then leaves it closed until /session-panel.
const isDismissed = atom({ plugin: 'session-panel', key: 'dismissed' } as const, false, { shape: 'dismissed-1' })

// Brand icon for a connector, fetched once from Simple Icons by its display name (Gmail -> "gmail").
// Only the path data is kept and redrawn in black or white; no match leaves the Lucide icon.
async function loadIcon($: EngineInterface, server: string) {
  let name: string | undefined
  try {
    const { context } = await $.session.usage({ breakdown: 'summary' })
    name = nameFromTools((context.breakdown?.mcpTools ?? []) as { name: string; serverName: string }[], server)
  } catch {
    // usage unavailable: the title comes from the key
  }
  const slug = (name ?? connTitle(server)).toLowerCase().replace(/[^a-z0-9]/g, '')
  let paths: string[] = []
  try {
    if (slug) {
      const res = await $.http.fetch('https://cdn.simpleicons.org/' + slug)
      if (res.ok && res.text.trimStart().startsWith('<svg')) paths = pathsIn(res.text)
    }
  } catch {
    // offline or refused: keep the Lucide icon
  }
  await update($, icons, l => l.map(i => (i.server === server ? { ...i, paths, name } : i)))
}

async function loadTitle($: EngineInterface) {
  try {
    const home = await $.env.get('USERPROFILE')
    const cwd = await $.session.cwd()
    const id = await $.session.id()
    const text = await $.fs.read(home + '/.claude/projects/' + cwd.replace(/[^a-zA-Z0-9]/g, '-') + '/' + id + '.jsonl')
    const found = titleIn(text)
    if (found !== undefined) await update($, title, () => found)
  } catch {
    // transcript unreadable: no headline
  }
}

async function countSkill($: EngineInterface, skill: string, typed = false) {
  const name = skill.replace(/^\//, '')
  if (!name) return
  let cmd
  try {
    cmd = findCommand(await $.command.list(), name)
  } catch {
    // no command list: no description, and a typed command is not counted
  }
  if (typed && !isSkillCommand(cmd)) return
  const desc = shorten(cmd?.description ?? '')
  await update($, skills, l =>
    l.some(k => k.name === name)
      ? l.map(k => (k.name === name ? { ...k, count: k.count + 1 } : k))
      : [...l, { name, count: 1, desc }],
  )
}

async function refresh($: EngineInterface) {
  await loadTitle($)
  try {
    const { context } = await $.session.usage({ breakdown: 'summary' })
    const b = context.breakdown
    if (!b) return
    await update($, contextFiles, () =>
      (b.memoryFiles as FileRow[]).map(f => ({ path: f.path, type: f.type, tokens: f.tokens })),
    )
  } catch {
    // usage unavailable: keep the last values
  }
}

// Count a connector's call, and start fetching its brand icon the first time it is seen.
async function trackConnector($: EngineInterface, server: string, tool: string) {
  await update($, connectors, l =>
    l.some(u => u.server === server)
      ? l.map(u => (u.server === server ? { ...u, count: u.count + 1, tool } : u))
      : [...l, { server, count: 1, tool }],
  )
  const known = await read($, icons)
  if (!known.some(i => i.server === server)) {
    await update($, icons, l => [...l, { server, paths: [] }])
    void loadIcon($, server)
  }
}

// The to-do list follows the task-list tools; the rules live in applyTodoTool.
// TaskCreate's new id is in its result, so it is read after the call; the others change the list first.
async function trackTodos<R>($: EngineInterface, tool: string, input: TodoInput, call: () => Promise<R>) {
  if (tool !== 'TaskCreate') {
    await update($, todos, l => applyTodoTool(l, tool, input))
    return call()
  }
  const ran = await call()
  await update($, todos, l => applyTodoTool(l, tool, input, ran as TodoResult | undefined))
  return ran
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'session-panel',
      description: 'Show connectors, skills, context files and to-dos of this session',
    })
    if (!(await read($, isDismissed))) void $.ui.open({ id: PANE, title: 'Session' })
    void refresh($)
    return next(e)
  })

  on('command.run', { command: 'session-panel' }, async $ => {
    await update($, isDismissed, () => false)
    await $.ui.open({ id: PANE, title: 'Session' })
    await refresh($)
    return { text: 'Session panel opened.' }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    if (e.origin.kind === 'person') await update($, isDismissed, () => true)
    return closed
  })

  on('prompt.submit', async ($, e, next) => {
    void refresh($)
    return next(e)
  })

  // Not skill.prompt: the organization's policy plugin passes that event on past the person's plugins.
  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    const ran = await next(e)
    if (!ran?.deny && !ran?.isError) await countSkill($, String(e.skill ?? ''))
    return ran
  })

  on('command.run', async ($, e, next) => {
    if (isTypedByPerson(e.command, e.origin)) void countSkill($, e.command, true)
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    const mcp = mcpOf(tool)
    if (mcp.server) await trackConnector($, mcp.server, mcp.tool)

    // A subagent's own plan is not the session's: only the main conversation's calls edit the list.
    return TODO_TOOLS.has(tool) && e.agentId === undefined ? trackTodos($, tool, e as TodoInput, () => next(e)) : next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const parts = $.ui.resolve(e)
    const [todoList, connectorList, fileList, iconList, skillList, sessionTitle] = await Promise.all([
      read($, todos),
      read($, connectors),
      read($, contextFiles),
      read($, icons),
      read($, skills),
      read($, title),
    ])
    return pane(parts, 'Svg' in parts ? parts.Svg : undefined, { title: sessionTitle, todos: todoList, connectors: connectorList, contextFiles: fileList, icons: iconList, skills: skillList })
  })
}
