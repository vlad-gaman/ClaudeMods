import type { SessionMessage } from 'claude-code'

import type { HandoffView } from '../types'
import { MAX_LINKS, READ_TOOLS, RECENT_REQUESTS, WRITE_TOOLS } from './data'

export type Counts = Map<string, number>

export type Tally = { tools: Counts; skills: Counts; links: Set<string> }

export type Files = { changed: Counts; read: Counts }

const LINK = /https?:\/\/[^\s)>\]"'`\\]+/g

const add = (counts: Counts, key: string) => counts.set(key, (counts.get(key) ?? 0) + 1)

export const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max)}…` : text

// The path a file tool works on, if the call names one.
export const fileOf = (input: Record<string, unknown>) => {
  const path = input.file_path ?? input.notebook_path
  return typeof path === 'string' ? path : undefined
}

// 2026-11-04T12-00-00: a time that is safe in a file name.
export const stamp = (ms: number) =>
  new Date(ms).toISOString().replace(/[:.]/g, '-').slice(0, 19)

// Files the session changed and files it only read. A changed file is not
// also listed as read.
export const classifyFiles = (messages: SessionMessage[]): Files => {
  const changed: Counts = new Map()
  const read: Counts = new Map()
  for (const m of messages) {
    for (const use of m.toolUses) {
      const file = fileOf(use.input)
      if (file === undefined) continue
      if (WRITE_TOOLS.has(use.tool)) add(changed, file)
      else if (READ_TOOLS.has(use.tool)) add(read, file)
    }
  }
  for (const file of changed.keys()) read.delete(file)
  return { changed, read }
}

// Tools and skills used, and every link in the messages and tool inputs.
export const tally = (messages: SessionMessage[]): Tally => {
  const tools: Counts = new Map()
  const skills: Counts = new Map()
  const links = new Set<string>()
  const addLinks = (text: string) => {
    for (const raw of text.match(LINK) ?? []) links.add(raw.replace(/[.,;:!?]+$/, ''))
  }
  for (const m of messages) {
    addLinks(m.text)
    for (const use of m.toolUses) {
      add(tools, use.tool)
      if (use.tool === 'Skill' && typeof use.input.skill === 'string') {
        add(skills, use.input.skill)
      }
      addLinks(JSON.stringify(use.input))
    }
  }
  return { tools, skills, links }
}

// What the user asked, one line each, in order.
export const userRequests = (messages: SessionMessage[]) =>
  messages
    .filter(m => m.role === 'user' && m.text.trim() !== '')
    .map(m => clip(m.text.trim().replace(/\s+/g, ' '), 300))

const numbered = (requests: string[]) =>
  requests
    .slice(-RECENT_REQUESTS)
    .map((t, i) => `${i + 1}. ${t}`)
    .join('\n')

// A bullet per entry, with its count when it is more than one. `isSorted`
// puts the most used first.
export const bullets = (counts: Counts, isSorted: boolean) => {
  const entries = [...counts.entries()]
  if (isSorted) entries.sort((a, b) => b[1] - a[1])
  return (
    entries.map(([k, n]) => `- \`${k}\`${n > 1 ? ` (x${n})` : ''}`).join('\n') || '- none'
  )
}

// Stands in for the model's summary when it does not answer.
export const fallbackNarrative = (requests: string[]) =>
  '## Goal\n(The model summary was unavailable; these are the last requests.)\n\n' +
  '## Recent requests\n' +
  numbered(requests) +
  '\n\n## Next steps\n1. Re-read the files below, then continue from the last request.'

export const handoffDir = (userProfile: string | undefined, home: string | undefined) =>
  `${userProfile ?? home ?? '.'}/.claude/handoffs`

export const handoffPaths = (dir: string, now: number, sessionId: string) => {
  const base = `${dir}/${stamp(now)}-${sessionId.slice(0, 8)}`
  return { path: `${base}.md`, promptPath: `${base}.prompt.txt` }
}

// What a new chat is asked to do with the handoff file.
export const continuePrompt = (path: string, cwd: string) =>
  `Continue the work of a previous session. First read the handoff file at ${path} ` +
  `(working directory: ${cwd}), re-read the files it lists as changed, then carry on ` +
  `with its "Next steps" without restarting from scratch. Ask me only if something is ambiguous.`

export type DocumentInput = {
  sessionId: string
  cwd: string
  model: string
  now: number
  tokens: number | undefined
  window: number
  trigger: HandoffView['trigger']
  narrative: string
  files: Files
  tally: Tally
  requests: string[]
}

export const buildDocument = (d: DocumentInput) =>
  [
    `# Handoff: ${new Date(d.now).toISOString()}`,
    '',
    `- Session: \`${d.sessionId}\``,
    `- Working directory: \`${d.cwd}\``,
    `- Model: ${d.model}`,
    `- Context at handoff: ${d.tokens ? `${d.tokens} tokens` : 'unknown'} of ${d.window}`,
    `- Trigger: ${d.trigger}`,
    '',
    d.narrative,
    '',
    '## Files changed',
    bullets(d.files.changed, false),
    '',
    '## Files read',
    bullets(d.files.read, false),
    '',
    '## Skills used',
    bullets(d.tally.skills, true),
    '',
    '## Tools used',
    bullets(d.tally.tools, true),
    '',
    '## Links',
    [...d.tally.links].slice(0, MAX_LINKS).map(l => `- ${l}`).join('\n') || '- none',
    '',
    '## Recent user requests',
    numbered(d.requests) || '- none',
    '',
  ].join('\n')
