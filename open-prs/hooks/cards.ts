import type { BranchPr, OpenPr, PrState, Run, RunState } from '../types'
import type { SessionBranch } from './provider'
import type { CliFailure } from './cli-log'

/** Cells in a thread or CI bar, and in the status bar. */
export const BAR_WIDTH = 10
export const STATUS_WIDTH = 40

/** The PR statuses a card's status bar counts, in card order. `none` is a branch with no PR. */
export const STATUS_ORDER = ['changes', 'required', 'approved', 'draft'] as const
export type Counted = (typeof STATUS_ORDER)[number] | 'none'

/** A PR's status as a card shows it: the four counted ones, or the state of a branch's PR that is not in the open list. */
export type Status = Counted | Exclude<PrState, 'draft'>

const KEYS: Counted[] = [...STATUS_ORDER, 'none']

/** The glyph of each status; a PR state that is not counted has none. */
export const GLYPH: Record<Status, string> = {
  changes: '✗',
  required: '○',
  approved: '✓',
  draft: '◌',
  none: '╱',
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

export type Threads = { total: number; resolved: number } | null

/** A PR's thread bar and count, or null while the count is unknown. */
export const threadText = (threads: Threads) => (threads ? `${bar(threads.resolved, threads.total)} ${threads.resolved}/${threads.total} resolved` : null)

/** The collapsed card's totals line for threads and for CI. */
export const threadSummary = (totals: { resolved: number; total: number }) => `threads ${bar(totals.resolved, totals.total)} ${totals.resolved}/${totals.total}`
export const ciSummary = (totals: { ok: number; total: number }) => `ci ${bar(totals.ok, totals.total)} ${totals.ok}/${totals.total}`

/** A PR's status in its card: a draft is a draft whatever its review says. */
export const statusOf = (pr: Pick<OpenPr, 'isDraft' | 'review'>): Counted => {
  if (pr.isDraft) return 'draft'
  return pr.review === 'changes' ? 'changes' : pr.review === 'approved' ? 'approved' : 'required'
}

export const isCounted = (status: Status): status is Counted => (KEYS as string[]).includes(status)

/** The status line as text: its glyph and label, or just "no PR" for a branch without one. */
export const statusLine = (status: Status) => (status === 'none' ? LABEL.none : GLYPH[status] ? `${GLYPH[status]} ${LABEL[status]}` : LABEL[status])

/** The unresolved count of a PR's threads, or null while the count is unknown. */
export const unresolvedText = (threads: Threads) => (threads ? `◔ ${threads.total - threads.resolved} unresolved` : null)

/** The legend item for a status: its glyph, count and short name. */
export const legendText = ({ key, n }: { key: Counted; n: number }) => `${GLYPH[key]} ${n} ${LEGEND[key]}`

/** How many items each counted status has, in card order, leaving out the empty ones. */
export function statusCounts(items: Counted[]) {
  return KEYS.map(key => ({ key, n: items.filter(item => item === key).length })).filter(count => count.n > 0)
}

/** Splits `width` cells over the counts by share: every counted segment at least one cell, the total exactly `width`. */
export function segmentWidths(counts: number[], width: number) {
  const total = counts.reduce((sum, n) => sum + n, 0)
  if (total === 0) return counts.map(() => 0)
  const widths = counts.map(n => (n > 0 ? Math.max(1, Math.round((n / total) * width)) : 0))
  let diff = width - widths.reduce((sum, w) => sum + w, 0)
  while (diff !== 0) {
    const largest = widths.indexOf(Math.max(...widths))
    widths[largest] = (widths[largest] ?? 0) + Math.sign(diff)
    diff -= Math.sign(diff)
  }
  return widths
}

/** The status bar's segments: each status with its width, empty ones left out. */
export function statusBar(counts: { key: Counted; n: number }[], width = STATUS_WIDTH) {
  const widths = segmentWidths(
    counts.map(count => count.n),
    width,
  )
  return counts.map((count, i) => ({ key: count.key, width: widths[i] ?? 0 })).filter(segment => segment.width > 0)
}

/** A session card row: a branch, its worktree folder, the PR on it, and that PR's threads and runs. */
export type SessionRow = {
  branch: string
  path: string | null
  pr: { number: number; title: string; url: string | null; status: Status } | null
  threads: Threads
  runs: Run[]
}

/**
 * Joins this session's branches to what is known of them. A branch's PR is the open PR the list has for it, else, for the
 * session's own branch (the first one), the branch's own PR answer (merged, closed or not in the list). Only the own
 * branch carries the branch runs; a branch without a PR and without the own role has none.
 */
export function sessionRows(branches: SessionBranch[], prs: OpenPr[], branchPr: BranchPr | null, branchRuns: Run[]): SessionRow[] {
  return branches.map((entry, index) => {
    const own = index === 0 ? branchPr : null
    const number = entry.prNumber ?? own?.number ?? null
    const open = number === null ? undefined : prs.find(item => item.number === number)
    if (open)
      return {
        branch: entry.branch,
        path: entry.path,
        pr: { number: open.number, title: open.title, url: open.url, status: statusOf(open) },
        threads: open.threads,
        runs: open.runs,
      }
    if (own)
      return {
        branch: entry.branch,
        path: entry.path,
        pr: { number: own.number, title: own.title, url: null, status: own.state },
        threads: null,
        runs: branchRuns,
      }
    return { branch: entry.branch, path: entry.path, pr: null, threads: null, runs: index === 0 ? branchRuns : [] }
  })
}

/** The statuses a session's rows count in its status bar: a PR's counted status, or none for a branch without a PR. */
export const sessionCounted = (rows: SessionRow[]): Counted[] =>
  rows.flatMap((row): Counted[] => (row.pr === null ? ['none'] : isCounted(row.pr.status) ? [row.pr.status] : []))

/** The PRs grouped by status, in card order, leaving out the empty groups. */
export function groupByStatus(prs: OpenPr[]) {
  return STATUS_ORDER.map(status => ({ status, prs: prs.filter(pr => statusOf(pr) === status) })).filter(group => group.prs.length > 0)
}

/** The resolved and total threads summed over the PRs that have a count. */
export function threadTotals(threads: Threads[]) {
  return threads.reduce(
    (sum, item) => (item ? { resolved: sum.resolved + item.resolved, total: sum.total + item.total } : sum),
    { resolved: 0, total: 0 },
  )
}

/** The PRs that have a run, and how many of those succeeded. */
export function ciTotals(runs: (Run | null)[]) {
  return runs.reduce((sum, run) => (run ? { ok: sum.ok + (run.state === 'succeeded' ? 1 : 0), total: sum.total + 1 } : sum), { ok: 0, total: 0 })
}

export const failureKind = (failure: Pick<CliFailure, 'exitCode' | 'isTimeout'>) =>
  failure.isTimeout ? 'timed out' : failure.exitCode === null ? 'could not run' : `exit ${failure.exitCode}`

/** A count with its noun, singular for one. */
export const noun = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The local time of a failed call, as hh:mm:ss. */
export const clockOf = (at: number) => new Date(at).toTimeString().slice(0, 8)
