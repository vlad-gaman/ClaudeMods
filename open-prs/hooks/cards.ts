import type { RunState } from '../types'
import type { CliFailure } from './cli-log'
import type { Counted, Status, Threads } from './pane-model'

/** Cells in a thread or CI bar. */
export const BAR_WIDTH = 10

/** The glyph of each status; a PR state that is not counted has none. */
export const GLYPH: Record<Status, string> = {
  changes: '✗',
  required: '○',
  approved: '✓',
  draft: '◌',
  none: '⎇',
  open: '',
  merged: '',
  closed: '',
}

export const TONE: Record<Status, string> = {
  changes: 'error',
  required: 'warning',
  approved: 'success',
  draft: 'inactive',
  none: 'inactive',
  open: 'success',
  merged: 'merged',
  closed: 'error',
}

const LEGEND: Record<Counted, string> = { changes: 'changes', required: 'review', approved: 'approved', draft: 'draft', none: 'no PR' }

const LABEL: Record<Status, string> = {
  changes: 'changes requested',
  required: 'review required',
  approved: 'approved',
  draft: 'draft',
  none: 'no PR',
  open: 'open',
  merged: 'merged',
  closed: 'closed',
}

export const RUN_GLYPH: Record<RunState, string> = {
  succeeded: '✓',
  failed: '✗',
  running: '◐',
  queued: '○',
  partial: '!',
  cancelled: '–',
}

/** A bar of `width` cells, filled by the share of `done` in `total`. */
export const bar = (done: number, total: number, width = BAR_WIDTH) => {
  const filled = total > 0 ? Math.round((done / total) * width) : 0
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

/** A PR's thread bar and count, or null while the count is unknown. */
export const threadText = (threads: Threads) => (threads ? `${bar(threads.resolved, threads.total)} ${threads.resolved}/${threads.total} resolved` : null)

/** The collapsed card's totals line for threads and for CI. */
export const threadSummary = (totals: { resolved: number; total: number }) => `threads ${bar(totals.resolved, totals.total)} ${totals.resolved}/${totals.total}`
export const ciSummary = (totals: { ok: number; total: number }) => `ci ${bar(totals.ok, totals.total)} ${totals.ok}/${totals.total}`

/** The status line as text: its glyph and label, or just "no PR" for a branch without one. */
export const statusLine = (status: Status) => (status === 'none' ? LABEL.none : GLYPH[status] ? `${GLYPH[status]} ${LABEL[status]}` : LABEL[status])

/** The unresolved count of a PR's threads, or null while the count is unknown. */
export const unresolvedText = (threads: Threads) => (threads ? `◔ ${threads.total - threads.resolved} unresolved` : null)

/** The legend item for a status: its glyph, count and short name. */
export const legendLabel = ({ key, n }: { key: Counted; n: number }) => `${n} ${LEGEND[key]}`
/** A status's name without its glyph, for the surface that draws an icon instead. */
export const statusLabel = (status: Status) => LABEL[status]
export const unresolvedLabel = (threads: Threads) => (threads ? `${threads.total - threads.resolved} unresolved` : null)
export const legendText = ({ key, n }: { key: Counted; n: number }) => `${GLYPH[key]} ${n} ${LEGEND[key]}`

export const failureKind = (failure: Pick<CliFailure, 'exitCode' | 'isTimeout'>) =>
  failure.isTimeout ? 'timed out' : failure.exitCode === null ? 'could not run' : `exit ${failure.exitCode}`

/** A count with its noun, singular for one. */
export const noun = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The local time of a failed call, as hh:mm:ss. */
export const clockOf = (at: number) => new Date(at).toTimeString().slice(0, 8)
