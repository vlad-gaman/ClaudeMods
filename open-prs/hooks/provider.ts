import type { BranchPr, OpenPr, RepoPrs, Run, RunState } from '../types'
import type { Remote } from './remote'

export const LIMIT = 50
export const SEVERITY: RunState[] = ['failed', 'cancelled', 'partial', 'running', 'queued', 'succeeded']

/**
 * What one fetch found. Each field is tri-state: `undefined` means the call failed or never ran, so the last answer
 * stays; `null` means the host confirmed there is none; a value is the answer.
 */
export type Snapshot = {
  repo?: RepoPrs | null
  branchPr?: BranchPr | null
  branchRuns?: Run[] | null
  sessionBranches?: SessionBranch[]
}

/** A branch this session works on: its worktree folder (null when unknown) and the open PR on it (null when none). */
export type SessionBranch = { branch: string; path: string | null; prNumber: number | null }

/** Joins the session's branches to the open PRs by head branch. Unknown when either the branches or the PR list is. */
export const joinSessionBranches = (branches: { branch: string; path: string | null }[] | undefined, prs: OpenPr[] | undefined) =>
  branches && prs ? branches.map(entry => ({ ...entry, prNumber: prs.find(pr => pr.branch === entry.branch)?.number ?? null })) : undefined

/**
 * What a fetch is given besides the remote: the current branch (null when detached), the last repo answer, and this
 * session's branches (undefined when the worktree list is unknown).
 */
export type FetchContext = { branch: string | null; previous: RepoPrs | null; sessionBranches?: { branch: string; path: string | null }[] }

/** `isMissing`: the call ran and failed; `isUnknown`: it threw or never ran, so whether the thing exists is not known. */
export type CliResult<T> = { data: T } | { isMissing: boolean } | { isUnknown: true }

/** How a provider reaches the outside: its CLI and the clock. The engine is handed over as these two functions, so a provider never holds `$`. */
export type Port = {
  run: (argv: string[], timeoutMs?: number) => Promise<{ exitCode: number; stdout: string; stderr: string }>
  now: () => Promise<number>
}

/**
 * One host's PR source. `cli` names the tool in the failure note. `fetch` only reads: it must not open the pane or
 * write an atom. `countComments` runs after the list is shown, for counts that cost one call each; it reports each
 * change through `publish`, which the orchestrator applies only while its register is still the live one.
 */
export type Provider = {
  cli: 'gh' | 'az'
  fetch: (port: Port, remote: Remote, context: FetchContext) => Promise<Snapshot>
  countComments?: (port: Port, remote: Remote, shown: RepoPrs, publish: (change: (pr: OpenPr) => OpenPr) => Promise<void>) => Promise<void>
}

export async function cli<T>(port: Port, argv: string[]): Promise<CliResult<T>> {
  try {
    const { exitCode, stdout, stderr } = await port.run(argv)
    return exitCode === 0 ? { data: JSON.parse(stdout) as T } : { isMissing: /no pull requests found/i.test(stderr) }
  } catch {
    return { isUnknown: true }
  }
}

/** The run that counts for a PR list: the worst state among its runs (failed first, succeeded last). */
export const worst = (runs: Run[]) => [...runs].sort((a, b) => SEVERITY.indexOf(a.state) - SEVERITY.indexOf(b.state))[0] ?? null

/** How many runs a PR or the branch keeps: the newest, in the order the host lists them. */
export const RUNS = 5
export const latestRuns = (runs: Run[]) => runs.slice(0, RUNS)

/** The PR this one showed last time, when the last answer was for the same repo. */
export const previousPr = (previous: RepoPrs | null, url: string, number: number) =>
  previous?.url === url ? previous.prs.find(old => old.number === number) : undefined
