import type { Finding, Point, Sections } from '../types'
import type { Update } from './logic'

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const strings = (v: unknown) => list(v).map(str).filter(Boolean)
const obj = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}

const RECOMMENDED = ' (recommended)'

/** 2 to 4 options with the recommended one first and marked. */
export const toOptions = (v: unknown) => {
  const options = strings(v).slice(0, 4)
  while (options.length < 2) options.push(options.length === 0 ? 'Yes' : 'No')
  const first = options[0] as string
  if (!/\(recommended\)\s*$/i.test(first)) options[0] = first + RECOMMENDED
  return options
}

export const toPoints = (v: unknown): Point[] =>
  list(v).flatMap((raw, i) => {
    const p = obj(raw)
    const requirement = str(p.requirement)
    if (!requirement) return []
    return [{ id: str(p.id) || `p${i + 1}`, subject: str(p.subject), requirement, value: str(p.value) }]
  })

export const toFindings = (v: unknown): Finding[] =>
  list(v).flatMap((raw, i) => {
    const f = obj(raw)
    const question = str(f.question)
    if (!question) return []
    const kind = f.kind === 'conflict' || f.kind === 'ambiguity' ? f.kind : 'gap'
    return [
      {
        id: str(f.id) || `f${i + 1}`,
        kind,
        subject: str(f.subject),
        costly: f.costly === true,
        question,
        header: str(f.header).slice(0, 12),
        options: toOptions(f.options),
        assumption: str(f.assumption) || question,
      },
    ]
  })

export const toUpdate = (v: unknown): Update => {
  const u = obj(v)
  return {
    points: toPoints(u.points),
    removed: strings(u.removed),
    findings: toFindings(u.findings),
    resolved: strings(u.resolved),
  }
}

export const toSections = (v: unknown) => {
  const s = obj(v)
  return {
    title: str(s.title) || 'Task',
    goal: strings(s.goal),
    context: strings(s.context),
    task: strings(s.task),
    constraints: strings(s.constraints),
    doneWhen: strings(s.doneWhen),
    decisions: strings(s.decisions),
  } satisfies Omit<Sections, 'assumptions' | 'open'>
}
