import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { azureProvider } from './azure'
import { githubProvider } from './github'
import type { Port, Provider, SessionBranch, Snapshot } from './provider'
import { publish } from './snapshot'
import { type Remote, remoteOf } from './remote'
import { listWorktrees, sessionBranchesOf } from './worktrees'
import { type CliFailure, failureOf, thrownFailureOf, withFailure } from './cli-log'
import { paneModelOf } from './pane-model'
import { pane } from './view'
import type { Run } from '../types'

const repo = atom({ plugin: 'open-prs', key: 'repo' } as const, null)
const branchPr = atom({ plugin: 'open-prs', key: 'branchPr' } as const, null)
const branchRuns = atom({ plugin: 'open-prs', key: 'branchRuns' } as const, [] as Run[])
const sessionBranches = atom({ plugin: 'open-prs', key: 'sessionBranches' } as const, [] as SessionBranch[])
/** The failed gh and az calls the CLI errors card lists, newest last, capped by `withFailure`. Cleared by its Close. */
const cliErrors = atom({ plugin: 'open-prs', key: 'cliErrors' } as const, [] as CliFailure[])
const collapsed = atom({ plugin: 'open-prs', key: 'collapsed' } as const, [] as string[])
const isDismissed = atom({ plugin: 'open-prs', key: 'isDismissed' } as const, false)
const isLoaded = atom({ plugin: 'open-prs', key: 'isLoaded' } as const, false)
const failedCli = atom({ plugin: 'open-prs', key: 'failedCli' } as const, null)
const isRefreshing = atom({ plugin: 'open-prs', key: 'isRefreshing' } as const, false)
const remoteNote = atom({ plugin: 'open-prs', key: 'remoteNote' } as const, '')
const generation = atom({ plugin: 'open-prs', key: 'generation' } as const, 0)

const REFRESH_MS = 3 * 60_000
const RETRY_MS = 30_000
const STALE_MS = 60_000
const PANE = 'open-prs'
const TITLE = 'Open PRs'

/** The mod's run state, made by each `register` call so a registration starts fresh. */
type State = {
  tick: { cancel: () => void } | undefined
  fetching: Promise<void> | undefined
  fetchedAt: number
  generation: number | undefined
  isDocked: boolean | undefined
  retry: { cancel: () => void } | undefined
  pressed: number
  /** One provider per host, made per register, so each provider's caches start empty too. */
  providers: Record<Remote['host'], Provider>
}

/** Whether this State belongs to the newest register: each register claims the next generation at `session.start`. */
async function isLive($: EngineInterface, s: State) {
  return s.generation !== undefined && (await read($, generation)) === s.generation
}

const isPaneUp = async ($: EngineInterface) => (await $.ui.panes()).some(pane => pane.id === PANE)

/**
 * What the providers reach: the engine's CLI and clock, handed over as functions so no provider is given `$`. A gh or az
 * call that fails or throws is written to the CLI log, while this register is the live one.
 */
function portOf($: EngineInterface, s: State): Port {
  const record = async (failure: CliFailure | null) => {
    try {
      if (failure && (await isLive($, s))) await update($, cliErrors, log => withFailure(log, failure))
    } catch {
      // A log write that fails must not change the call's answer.
    }
  }
  return {
    run: async (argv, timeoutMs = 60_000) => {
      try {
        const result = await $.process.run(argv, { timeoutMs })
        await record(failureOf(argv, result, await $.clock.now()))
        return result
      } catch (error) {
        await record(thrownFailureOf(argv, error, await $.clock.now()))
        throw error
      }
    },
    now: () => $.clock.now(),
  }
}

async function currentBranch(port: Port) {
  try {
    const { exitCode, stdout } = await port.run(['git', 'branch', '--show-current'], 10_000)
    return exitCode === 0 ? stdout.trim() || null : null
  } catch {
    return null
  }
}

async function load($: EngineInterface, s: State) {
  if (!(await isLive($, s))) return
  let countLater: (() => Promise<void>) | undefined
  try {
    countLater = await fetchPrs($, s)
  } finally {
    if (await isLive($, s)) await update($, isLoaded, () => true)
  }
  await countLater?.()
}

/** One quick retry per run of failures; after that the regular refresh takes over. */
async function scheduleRetry($: EngineInterface, s: State, failed: Provider['cli'] | null) {
  if (failed && !s.retry && (await isLive($, s))) s.retry = $.clock.after(RETRY_MS, () => void refresh($, s))
  else if (!failed) {
    s.retry?.cancel()
    s.retry = undefined
  }
}

/**
 * Opens the pane unasked only where it docks beside the transcript, never inline above the prompt, never over a pane
 * already up, and never once the person has closed it.
 */
async function maybeOpen($: EngineInterface, s: State, hasPrs: boolean) {
  if (hasPrs && s.isDocked !== false && (await isLive($, s)) && !(await read($, isDismissed)) && !(await isPaneUp($))) {
    await $.ui.open({ id: PANE, title: TITLE })
  }
}

/** Fetches the snapshot and publishes it. Opens the pane itself, after the answer, never inside the provider. */
async function fetchPrs($: EngineInterface, s: State): Promise<(() => Promise<void>) | undefined> {
  const port = portOf($, s)
  const session = await $.session.repo()
  const remote = remoteOf(session?.remote ?? null)
  const origin = session?.remote?.replace(/\/\/[^@/]+@/, '//')
  if (await isLive($, s)) await update($, remoteNote, () => (!session ? 'not in a git repo' : origin ? `origin is ${origin}` : 'no origin remote'))

  // The one host lookup: the provider for the remote's host fetches, names its tool and counts comments. This session's
  // branches are the own worktree's branch and the linked worktrees' branches (issues/04).
  const provider = remote ? s.providers[remote.host] : null
  let snapshot: Snapshot = { repo: null, branchPr: null, branchRuns: null }
  if (remote && provider) {
    const branch = await currentBranch(port)
    const worktrees = await listWorktrees(port)
    const own = worktrees && session ? sessionBranchesOf(worktrees, { path: session.root, branch }) : undefined
    snapshot = await provider.fetch(port, remote, { branch, previous: await read($, repo), sessionBranches: own })
  }

  const { failed, hasPrs } = await publish(snapshot, provider, {
    isLive: () => isLive($, s),
    apply: async (writes, failedTool) => {
      if (writes.repo !== undefined) await update($, repo, () => writes.repo ?? null)
      if (writes.branchPr !== undefined) await update($, branchPr, () => writes.branchPr ?? null)
      if (writes.branchRuns) await update($, branchRuns, () => writes.branchRuns ?? [])
      if (writes.sessionBranches) await update($, sessionBranches, () => writes.sessionBranches ?? [])
      await update($, failedCli, () => failedTool)
    },
  })
  await scheduleRetry($, s, failed)
  await maybeOpen($, s, hasPrs)

  const shown = snapshot.repo
  if (!remote || !provider || !shown || !provider.countComments) return undefined
  const countComments = provider.countComments
  return async () => {
    if (!(await isLive($, s))) return
    await countComments(port, remote, shown, async change => {
      if (await isLive($, s)) await update($, repo, current => current && { ...current, prs: current.prs.map(change) })
    })
  }
}

/** A superseded register's tick cancels itself rather than refreshing. */
async function onTick($: EngineInterface, s: State) {
  if (await isLive($, s)) return refresh($, s)
  s.tick?.cancel()
}

function refresh($: EngineInterface, s: State) {
  s.tick ??= $.clock.every(REFRESH_MS, () => void onTick($, s))
  s.fetching ??= load($, s)
    .catch(() => {})
    .then(async () => {
      s.fetchedAt = await $.clock.now()
    })
    .catch(() => {})
    .finally(() => {
      s.fetching = undefined
    })
  return s.fetching
}

const kick = ($: EngineInterface, s: State) => $.clock.after(0, () => void refresh($, s))

async function refreshNow($: EngineInterface, s: State) {
  s.pressed++
  await update($, isRefreshing, () => true)
  try {
    await refresh($, s)
  } finally {
    s.pressed--
    await update($, isRefreshing, () => s.pressed > 0)
  }
}

/** Flips a card between open and collapsed. Called from a press only, never from a render. */
function toggle($: EngineInterface, id: string) {
  return update($, collapsed, ids => (ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id]))
}

export const register: Register = on => {
  const s: State = {
    tick: undefined,
    fetching: undefined,
    fetchedAt: 0,
    generation: undefined,
    isDocked: undefined,
    retry: undefined,
    pressed: 0,
    providers: { github: githubProvider(), azure: azureProvider() },
  }

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    s.generation = await update($, generation, n => n + 1)
    await update($, isRefreshing, () => false)
    await $.command.register({ name: 'prs', description: "Show the repo's open GitHub or Azure DevOps PRs and their pipelines in a side pane" })
    kick($, s)
    return started
  })

  on('command.run', { command: 'prs' }, async ($, e) => {
    await update($, isDismissed, () => false)
    const opened = await $.ui.open({ id: PANE, title: TITLE })
    kick($, s)
    return { text: opened.isPlaced ? 'Open PRs pane opened.' : `Open PRs pane is waiting: ${opened.reason}` }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    if (e.origin.kind === 'person') await update($, isDismissed, () => true)
    return closed
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if ((await $.clock.now()) - s.fetchedAt > STALE_MS) kick($, s)
    return done
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.viewport?.isFullscreen !== undefined) s.isDocked = e.viewport.isFullscreen
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const resolved = $.ui.resolve(e)
    const Svg = e.surface === 'desktop' && 'Svg' in resolved ? resolved.Svg : null
    const [isLoaded_, repo_, branchPr_, branches, branchRuns_, failedCli_, isRefreshing_, remoteNote_, cliErrors_, collapsed_] = await Promise.all([
      read($, isLoaded),
      read($, repo),
      read($, branchPr),
      read($, sessionBranches),
      read($, branchRuns),
      read($, failedCli),
      read($, isRefreshing),
      read($, remoteNote),
      read($, cliErrors),
      read($, collapsed),
    ])
    const model = paneModelOf({
      isLoaded: isLoaded_,
      repo: repo_,
      branchPr: branchPr_,
      sessionBranches: branches,
      branchRuns: branchRuns_,
      failedCli: failedCli_,
      isRefreshing: isRefreshing_,
      remoteNote: remoteNote_,
      cliErrors: cliErrors_,
      collapsed: collapsed_,
    })
    return pane(resolved, Svg, model, {
      refresh: () => void refreshNow($, s),
      toggle: id => void toggle($, id),
      closeErrors: () => void update($, cliErrors, () => []),
    })
  })
}
