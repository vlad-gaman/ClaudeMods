import type { Finding, Pending, Point, Sections } from '../types'

/** A pending dump expires after 24 hours. */
export const EXPIRY_MS = 24 * 60 * 60 * 1000

export const GO_LINE = 'Type go to run it, edit to change it first, or cancel to get your dump back.'

export const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length

export const shouldOffer = (s: {
  words: number
  minWords: number
  isEnabled: boolean
  isFlowActive: boolean
  isIgnored: boolean
}) => s.isEnabled && !s.isFlowActive && !s.isIgnored && s.words >= s.minWords

/** The text after a leading `structure:`, or null when the prompt has no such prefix. */
export const structurePrefix = (text: string) => {
  const m = /^\s*structure:/i.exec(text)
  return m ? text.slice(m[0].length).trim() : null
}

export type Args =
  | { kind: 'on' | 'off' | 'bare' | 'resume' }
  | { kind: 'text'; text: string }

export const parseArgs = (args: string): Args => {
  const text = args.trim()
  const word = text.toLowerCase()
  if (word === 'on' || word === 'off' || word === 'resume') return { kind: word }
  return text === '' ? { kind: 'bare' } : { kind: 'text', text }
}

export const isExpired = (p: Pending, now: number) => now - p.at > EXPIRY_MS

export type Submit =
  | { kind: 'pass' }
  | { kind: 'expired' }
  | { kind: 'go' }
  | { kind: 'cancel' }
  | { kind: 'edit' }
  | { kind: 'sent-edited' }
  | { kind: 'drop'; reason: string }

/** What a submitted prompt means, given the pending dump. Pure; the hook acts on it. */
export const decideSubmit = (p: Pending | null, text: string, now: number): Submit => {
  if (!p) return { kind: 'pass' }
  if (isExpired(p, now)) return { kind: 'expired' }
  if (p.stage === 'reading' || p.stage === 'asking') {
    return { kind: 'drop', reason: 'Finish or cancel the brain dump first.' }
  }
  if (p.stage === 'editing') return { kind: 'sent-edited' }
  const word = text.trim().toLowerCase()
  if (word === 'go' || word === 'cancel' || word === 'edit') return { kind: word }
  return { kind: 'pass' }
}

const RANK = { conflict: 0, ambiguity: 1, gap: 2 } as const

/**
 * Conflicts and costly ambiguities and gaps are asked, in that order, up to
 * `max`. Cheap ones become assumptions. Items past the cap are `left`.
 */
export const triage = (findings: Finding[], max: number) => {
  const worth = findings
    .filter(f => f.kind === 'conflict' || f.costly)
    .map((f, i) => ({ f, i }))
    .sort((a, b) => RANK[a.f.kind] - RANK[b.f.kind] || a.i - b.i)
    .map(x => x.f)
  const isWorth = new Set(worth)
  return {
    ask: worth.slice(0, max),
    left: worth.slice(max),
    assumed: findings.filter(f => !isWorth.has(f)),
  }
}

export type Update = {
  points: Point[]
  removed: string[]
  findings: Finding[]
  resolved: string[]
}

/** Folds a model update into the points and the queue of findings. */
export const applyUpdate = (
  state: { points: Point[]; findings: Finding[] },
  update: Update,
) => {
  const gone = new Set(update.removed)
  const points = state.points.filter(p => !gone.has(p.id))
  for (const p of update.points) {
    const at = points.findIndex(x => x.id === p.id)
    if (at === -1) points.push(p)
    else points[at] = p
  }
  const resolved = new Set(update.resolved)
  const findings = state.findings.filter(f => !resolved.has(f.id))
  for (const f of update.findings) {
    if (!findings.some(x => x.id === f.id)) findings.push(f)
  }
  return { points, findings }
}

const section = (name: string, lines: string[]) =>
  lines.length === 0 ? [] : [`## ${name}`, ...lines.map(l => `- ${l}`), '']

/** The structured prompt as it is sent. Empty sections are left out. */
export const buildPrompt = (s: Sections) =>
  [
    s.title,
    '',
    ...(s.open.length > 0 ? ['Not settled:', ...s.open.map(l => `- ${l}`), ''] : []),
    ...section('Goal', s.goal),
    ...section('Context', s.context),
    ...section('Task', s.task),
    ...section('Constraints', s.constraints),
    ...section('Done when', s.doneWhen),
    ...section('Decisions', s.decisions),
    ...section('Assumptions', s.assumptions),
  ]
    .join('\n')
    .trimEnd()

/** For the screen only; never part of what is sent. */
export const withGoLine = (prompt: string) => `${prompt}\n\n${GO_LINE}`

/** Plain, fenced, or surrounded by chatter; null when no JSON object can be read. */
export const parseJson = (text: string): unknown => {
  const unfenced = text.replace(/```(?:json)?/gi, '')
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(unfenced.slice(start, end + 1))
  } catch {
    return null
  }
}
