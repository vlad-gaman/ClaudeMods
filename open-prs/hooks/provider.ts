import type { BranchPr, OpenPr, RepoPrs, Run, RunState } from '../types'
import type { Remote } from './remote'

export const LIMIT = 50
export const SEVERITY: RunState[] = ['failed', 'cancelled', 'partial', 'running', 'queued', 'succeeded']

/**
 * What one fetch found. Each field is tri-state: `undefined` means the call failed or never ran, so the last answer
 * stays; `null` means the host confirmed there is none; a value is the answer.
 */
export type Snapshot = { repo?: RepoPrs | null; branchPr?: BranchPr | null; branchRun?: Run | null }

/** What a fetch is given besides the remote: the current branch (null when detached) and the last repo answer. */
export type FetchContext = { branch: string | null; previous: RepoPrs | null }

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

/** The PR this one showed last time, when the last answer was for the same repo. */
export const previousPr = (previous: RepoPrs | null, url: string, number: number) =>
  previous?.url === url ? previous.prs.find(old => old.number === number) : undefined
