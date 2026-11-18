import type { BranchPr, RepoPrs, Run } from '../types'
import type { Provider, SessionBranch, Snapshot } from './provider'

/** The value each pane atom takes from a snapshot. A key is absent when the atom keeps its last answer. */
export type Writes = {
  repo?: RepoPrs | null
  branchPr?: BranchPr | null
  branchRuns?: Run[]
  sessionBranches?: SessionBranch[]
}

/**
 * The tri-state rule, in one place. A field the snapshot leaves `undefined` (the call failed or never ran) is left
 * out, so the atom keeps its last answer. `null` (the host confirmed there is none) clears the atom, and a value
 * replaces it.
 */
export function writesOf(snapshot: Snapshot): Writes {
  const writes: Writes = {}
  if (snapshot.repo !== undefined) writes.repo = snapshot.repo
  if (snapshot.branchPr !== undefined) writes.branchPr = snapshot.branchPr
  if (snapshot.branchRuns !== undefined) writes.branchRuns = snapshot.branchRuns ?? []
  if (snapshot.sessionBranches !== undefined) writes.sessionBranches = snapshot.sessionBranches
  return writes
}

/** What a published snapshot tells the caller: the CLI that failed (null when none), and whether any PR is open. */
export type Outcome = { failed: Provider['cli'] | null; hasPrs: boolean }

/** `failed` is the provider's tool when the repo lookup failed; a missing provider (no remote) never fails. */
export const outcomeOf = (snapshot: Snapshot, provider: Pick<Provider, 'cli'> | null): Outcome => ({
  failed: snapshot.repo === undefined && provider ? provider.cli : null,
  hasPrs: !!snapshot.repo?.prs.length,
})

/** What a superseded register gets back, so retry and auto-open do nothing. */
export const INERT: Outcome = { failed: null, hasPrs: false }

/** What `publish` is handed: whether this register is still the live one, and how to write the atoms. */
export type Sink = {
  isLive: () => Promise<boolean>
  /** Writes each present key, then `failedCli`. Called at most once, and only after `isLive` answered true. */
  apply: (writes: Writes, failed: Outcome['failed']) => Promise<void>
}

/**
 * Applies one fetched snapshot as a whole: liveness is checked once, before any write, so a superseded register
 * changes no atom. The writes that follow are still one `update` per atom (the engine has no batch write), so a
 * register superseded between two of them can leave the pane half updated; that window is a few awaits wide.
 * Returns what retry and auto-open need, or `INERT` when superseded.
 */
export async function publish(snapshot: Snapshot, provider: Pick<Provider, 'cli'> | null, sink: Sink): Promise<Outcome> {
  if (!(await sink.isLive())) return INERT
  const outcome = outcomeOf(snapshot, provider)
  await sink.apply(writesOf(snapshot), outcome.failed)
  return outcome
}
