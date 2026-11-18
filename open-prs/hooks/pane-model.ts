import type { BranchPr, OpenPr, PrState, RepoPrs, Run } from '../types'
import { LIMIT, type SessionBranch, worst } from './provider'
import type { CliFailure } from './cli-log'

/** Cells in the status bar. */
export const STATUS_WIDTH = 40

/** The PR statuses a card's status bar counts, in card order. `none` is a branch with no PR. */
export const STATUS_ORDER = ['changes', 'required', 'approved', 'draft'] as const
export type Counted = (typeof STATUS_ORDER)[number] | 'none'

/** A PR's status as a card shows it: the four counted ones, or the state of a branch's PR that is not in the open list. */
export type Status = Counted | Exclude<PrState, 'draft'>

const KEYS: Counted[] = [...STATUS_ORDER, 'none']

export type Threads = { total: number; resolved: number } | null

/** A PR's status in its card: a draft is a draft whatever its review says. */
export const statusOf = (pr: Pick<OpenPr, 'isDraft' | 'review'>): Counted => {
  if (pr.isDraft) return 'draft'
  return pr.review === 'changes' ? 'changes' : pr.review === 'approved' ? 'approved' : 'required'
}

export const isCounted = (status: Status): status is Counted => (KEYS as string[]).includes(status)

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
  return threads.reduce<{ resolved: number; total: number }>(
    (sum, item) => (item ? { resolved: sum.resolved + item.resolved, total: sum.total + item.total } : sum),
    { resolved: 0, total: 0 },
  )
}

/** The PRs that have a run, and how many of those succeeded. */
export function ciTotals(runs: (Run | null)[]) {
  return runs.reduce((sum, run) => (run ? { ok: sum.ok + (run.state === 'succeeded' ? 1 : 0), total: sum.total + 1 } : sum), { ok: 0, total: 0 })
}

/** What the pane reads from the mod's atoms. */
export type PaneAtoms = {
  isLoaded: boolean
  repo: RepoPrs | null
  branchPr: BranchPr | null
  sessionBranches: SessionBranch[]
  branchRuns: Run[]
  failedCli: 'gh' | 'az' | null
  isRefreshing: boolean
  remoteNote: string
  cliErrors: CliFailure[]
  collapsed: string[]
}

/** What both cards share: the figures their header, status bar, legend and collapsed totals draw. */
export type CardBase = {
  id: 'session' | 'other'
  isFolded: boolean
  /** How many the header counts: branches in the session card, open PRs in the other card. */
  count: number
  /** Whether `count` is only a lower bound: the other card lists no more than `LIMIT`. */
  isCapped: boolean
  /** Each status with its count, in card order, leaving out the empty ones: the legend. */
  counts: { key: Counted; n: number }[]
  /** The status bar's segments. */
  segments: { key: Counted; width: number }[]
  threads: { resolved: number; total: number }
  ci: { ok: number; total: number }
}

export type SessionCard = CardBase & { id: 'session'; rows: SessionRow[] }
export type OtherCard = CardBase & { id: 'other'; groups: ReturnType<typeof groupByStatus> }

/** The CLI errors card: shown while any gh or az call has failed and not been closed. */
export type ErrorsCard = { errors: CliFailure[]; isFolded: boolean }

/** What the pane shows. One state at a time. */
export type PaneModel =
  | { state: 'loading' }
  | { state: 'failed'; cli: 'gh' | 'az'; isRefreshing: boolean; errors: ErrorsCard | null }
  | { state: 'no-remote'; note: string }
  | { state: 'ready'; slug: string; url: string; isRefreshing: boolean; session: SessionCard; other: OtherCard; errors: ErrorsCard | null }

const base = (id: CardBase['id'], isFolded: boolean, count: number, isCapped: boolean, counted: Counted[], threads: Threads[], runs: (Run | null)[]): CardBase => {
  const counts = statusCounts(counted)
  return { id, isFolded, count, isCapped, counts, segments: statusBar(counts), threads: threadTotals(threads), ci: ciTotals(runs) }
}

/**
 * The pane as a pure function of the mod's atoms. A last answer wins over a failed call, so a refresh that fails keeps
 * the cards on screen; a failed call with no answer shows the failure; no answer and no failure means no remote.
 */
export function paneModelOf(atoms: PaneAtoms): PaneModel {
  const errors: ErrorsCard | null = atoms.cliErrors.length === 0 ? null : { errors: atoms.cliErrors, isFolded: atoms.collapsed.includes('errors') }
  if (!atoms.isLoaded) return { state: 'loading' }
  const shown = atoms.repo
  if (!shown && atoms.failedCli) return { state: 'failed', cli: atoms.failedCli, isRefreshing: atoms.isRefreshing, errors }
  if (!shown) return { state: 'no-remote', note: atoms.remoteNote }

  const rows = sessionRows(atoms.sessionBranches, shown.prs, atoms.branchPr, atoms.branchRuns)
  // The PRs of this session's branches sit in the session card, so Other lists the rest.
  const sessionNumbers = rows.flatMap(row => (row.pr ? [row.pr.number] : []))
  const others = shown.prs.filter(pr => !sessionNumbers.includes(pr.number))
  const listed = others.slice(0, LIMIT)
  return {
    state: 'ready',
    slug: shown.slug,
    url: shown.url,
    isRefreshing: atoms.isRefreshing,
    session: {
      ...base('session', atoms.collapsed.includes('session'), rows.length, false, sessionCounted(rows), rows.map(row => row.threads), rows.map(row => worst(row.runs))),
      id: 'session',
      rows,
    },
    other: {
      ...base('other', atoms.collapsed.includes('other'), others.length, others.length > LIMIT, listed.map(statusOf), listed.map(pr => pr.threads), listed.map(pr => pr.run)),
      id: 'other',
      groups: groupByStatus(listed),
    },
    errors,
  }
}
