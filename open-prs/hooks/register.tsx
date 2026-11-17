import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { azureProvider } from './azure'
import { githubProvider } from './github'
import { LIMIT, type Port, type Provider, type SessionBranch, type Snapshot, worst } from './provider'
import { type Remote, remoteOf } from './remote'
import { DEMO_BRANCHES, DEMO_BRANCH_PR, DEMO_REPO, DEMO_RUNS, demoErrors } from './demo'
import { type IconName, iconSvg, progressSvg, statusBarSvg } from './icons'
import { listWorktrees, sessionBranchesOf } from './worktrees'
import { type CliFailure, failureOf, thrownFailureOf, withFailure } from './cli-log'
import {
  type Counted,
  RUN_GLYPH,
  bar,
  legendLabel,
  statusLabel,
  unresolvedLabel,
  STATUS_WIDTH,
  TONE,
  ciSummary,
  ciTotals,
  clockOf,
  failureKind,
  groupByStatus,
  legendText,
  noun,
  sessionCounted,
  sessionRows,
  type SessionRow,
  statusBar,
  statusCounts,
  statusLine,
  statusOf,
  threadSummary,
  threadTotals,
  type Threads,
  unresolvedText,
} from './cards'
import type { OpenPr, Run } from '../types'

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
  /** Set by /prs-demo: stub data is shown and refreshes leave it be, until /prs. */
  isDemo: boolean
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

  // A failed call keeps the last answer; only a confirmed "none" clears it.
  if (snapshot.repo !== undefined && (await isLive($, s))) await update($, repo, () => snapshot.repo ?? null)
  if (snapshot.branchPr !== undefined && (await isLive($, s))) await update($, branchPr, () => snapshot.branchPr ?? null)
  if (snapshot.branchRuns !== undefined && (await isLive($, s))) {
    const runs = snapshot.branchRuns ?? []
    await update($, branchRuns, () => runs)
  }
  if (snapshot.sessionBranches !== undefined && (await isLive($, s))) await update($, sessionBranches, () => snapshot.sessionBranches ?? [])
  const failed = snapshot.repo === undefined && provider ? provider.cli : null
  if (await isLive($, s)) await update($, failedCli, () => failed)

  // One quick retry per run of failures; after that the regular refresh takes over.
  if (failed && !s.retry && (await isLive($, s))) s.retry = $.clock.after(RETRY_MS, () => void refresh($, s))
  else if (!failed) {
    s.retry?.cancel()
    s.retry = undefined
  }

  // Opened unasked only where it docks beside the transcript, never inline above the prompt, never over a pane
  // already up, and never once the person has closed it.
  if (
    snapshot.repo?.prs.length &&
    s.isDocked !== false &&
    (await isLive($, s)) &&
    !(await read($, isDismissed)) &&
    !(await isPaneUp($))
  ) {
    await $.ui.open({ id: PANE, title: TITLE })
  }

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
  if (s.isDemo) return Promise.resolve()
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

const RUN_TONE = {
  queued: 'inactive',
  running: 'suggestion',
  succeeded: 'success',
  partial: 'warning',
  failed: 'error',
  cancelled: 'inactive',
} as const

/** Flips a card between open and collapsed. Called from a press only, never from a render. */
function toggle($: EngineInterface, id: string) {
  return update($, collapsed, ids => (ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id]))
}

const STATUS_ICON: Partial<Record<string, IconName>> = { changes: 'changes', required: 'required', approved: 'approved', draft: 'draft', none: 'branch', merged: 'merged', closed: 'changes' }

const RULE = '─'.repeat(30)

export const register: Register = on => {
  const s: State = {
    tick: undefined,
    fetching: undefined,
    fetchedAt: 0,
    generation: undefined,
    isDocked: undefined,
    retry: undefined,
    pressed: 0,
    isDemo: false,
    providers: { github: githubProvider(), azure: azureProvider() },
  }

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    s.generation = await update($, generation, n => n + 1)
    await update($, isRefreshing, () => false)
    await $.command.register({ name: 'prs-demo', description: 'Show the Open PRs pane with stub data, to see its look; /prs goes back to the real PRs' })
    await $.command.register({ name: 'prs', description: "Show the repo's open GitHub or Azure DevOps PRs and their pipelines in a side pane" })
    kick($, s)
    return started
  })

  on('command.run', { command: 'prs-demo' }, async ($, e) => {
    s.isDemo = true
    await update($, repo, () => DEMO_REPO)
    await update($, branchPr, () => DEMO_BRANCH_PR)
    await update($, branchRuns, () => DEMO_RUNS)
    await update($, sessionBranches, () => DEMO_BRANCHES)
    await update($, cliErrors, () => demoErrors(0))
    await update($, failedCli, () => null)
    await update($, isLoaded, () => true)
    await update($, isDismissed, () => false)
    const opened = await $.ui.open({ id: PANE, title: TITLE })
    return { text: opened.isPlaced ? 'Open PRs pane showing stub data; /prs goes back to the real PRs.' : `Open PRs pane is waiting: ${opened.reason}` }
  })

  on('command.run', { command: 'prs' }, async ($, e) => {
    if (s.isDemo) {
      s.isDemo = false
      await update($, cliErrors, () => [])
    }
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
    const { Box, Button, Link, Text } = resolved
    const Svg = e.surface === 'desktop' && 'Svg' in resolved ? resolved.Svg : null
    // The desktop draws a Lucide icon in the tone's colour; every other surface keeps the glyph text.
    const lead = (key: string, icon: IconName | null, tone: string | undefined, glyphText: string, label: string) =>
      Svg && icon ? (
        <Box key={key} flexDirection="row" columnGap={1}>
          <Svg source={iconSvg(icon, tone ?? 'inactive')} alt={label} width={14} height={14} />
          <Text color={tone}>{label}</Text>
        </Box>
      ) : (
        <Text key={key} color={tone}>
          {glyphText}
        </Text>
      )
    const [loaded, shown, mine, branches, ownRuns, failed, refreshing, note, errors, folded] = await Promise.all([
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
    const isFolded = (id: string) => folded.includes(id)
    const refreshButton = (
      <Box flexDirection="row" columnGap={1}>
        <Button key="refresh" label="Refresh" onPress={() => void refreshNow($, s)} />
        {refreshing ? <Text dimColor>Refreshing…</Text> : null}
      </Box>
    )
    const cardHead = (id: string, title: string, meta: string) => (
      <Box flexDirection="row" columnGap={1} justifyContent={Svg ? 'space-between' : undefined}>
        <Button key={`card-${id}`} plain label={`${isFolded(id) ? '▸' : '▾'} ${title}`} onPress={() => void toggle($, id)} />
        <Text dimColor>{meta}</Text>
      </Box>
    )
    const statusRow = (items: Counted[]) =>
      Svg ? (
        <Svg
          key="status-bar"
          source={statusBarSvg(statusBar(statusCounts(items), STATUS_WIDTH).map(segment => ({ tone: TONE[segment.key], width: segment.width, isStriped: segment.key === 'none' })))}
          alt="status bar"
          width={320}
          height={8}
        />
      ) : (
        <Box flexDirection="row">
          {statusBar(statusCounts(items), STATUS_WIDTH).map(segment => (
            <Text key={`segment-${segment.key}`} color={TONE[segment.key]}>
              {(segment.key === 'none' ? '▒' : '█').repeat(segment.width)}
            </Text>
          ))}
        </Box>
      )
    const progressRow = (name: string, done: number, total: number, tone: string, text: string) =>
      Svg ? (
        <Box key={`progress-${name}`} flexDirection="row" columnGap={1}>
          <Text dimColor>{name}</Text>
          <Svg source={progressSvg(done, total, tone)} alt={`${name} progress`} width={120} height={6} />
          <Text dimColor>{text}</Text>
        </Box>
      ) : (
        <Text key={`progress-${name}`}>{text}</Text>
      )
    const summary = (name: 'threads' | 'ci', totals: { resolved: number; total: number } | { ok: number; total: number }) => {
      const done = 'ok' in totals ? totals.ok : totals.resolved
      return Svg ? progressRow(name, done, totals.total, done === totals.total && totals.total > 0 ? 'success' : 'warning', `${done}/${totals.total}`) : <Text>{name === 'ci' ? ciSummary({ ok: done, total: totals.total }) : threadSummary({ resolved: done, total: totals.total })}</Text>
    }
    const legendRow = (items: Counted[]) => (
      <Box flexDirection="row" columnGap={1}>
        {statusCounts(items).map(count =>
          lead(`legend-${count.key}`, STATUS_ICON[count.key] ?? null, TONE[count.key], legendText(count), legendLabel(count)),
        )}
      </Box>
    )
    const threadBlock = (threads: Threads) =>
      threads ? (
        <Box flexDirection="column">
          <Box flexDirection="row" columnGap={1}>
            {Svg ? (
              <Svg source={progressSvg(threads.resolved, threads.total, threads.resolved === threads.total ? 'success' : 'warning')} alt="threads progress" width={120} height={6} />
            ) : (
              <Text color={threads.resolved === threads.total ? 'success' : 'warning'}>{bar(threads.resolved, threads.total)}</Text>
            )}
            <Text dimColor>{`${threads.resolved}/${threads.total} resolved`}</Text>
          </Box>
          {lead('unresolved', 'message', 'warning', unresolvedText(threads) ?? '', unresolvedLabel(threads) ?? '')}
        </Box>
      ) : null
    const chips = (runs: Run[]) =>
      runs.length === 0 ? null : (
        <Box flexDirection="row" columnGap={1}>
          {runs.map((run, i) => (
            Svg ? (
              lead(`run-${i}`, run.state, RUN_TONE[run.state], `${RUN_GLYPH[run.state]} ${run.name}`, run.name)
            ) : (
              <Text key={`run-${i}`} backgroundColor={RUN_TONE[run.state]}>
                {`${RUN_GLYPH[run.state]} ${run.name}`}
              </Text>
            )
          ))}
        </Box>
      )
    const branchRow = (row: SessionRow) =>
      Svg ? (
        <Box key={`branch-${row.branch}`} flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between" columnGap={1}>
            <Box flexDirection="column">
              <Box flexDirection="row" columnGap={1}>
                {row.pr ? row.pr.url ? <Link href={row.pr.url} label={`#${row.pr.number}`} /> : <Text color="suggestion">{`#${row.pr.number}`}</Text> : null}
                <Text bold>{row.pr ? row.pr.title : row.branch}</Text>
              </Box>
              <Box flexDirection="row" columnGap={1}>
                <Text dimColor>{row.pr ? row.branch : ''}</Text>
                {row.path ? <Text dimColor>{row.path}</Text> : <Text color="warning">no worktree</Text>}
              </Box>
            </Box>
            <Box flexDirection="column" alignItems="flex-end" flexShrink={0}>
              {lead('status', STATUS_ICON[row.pr?.status ?? 'none'] ?? null, TONE[row.pr?.status ?? 'none'], statusLine(row.pr?.status ?? 'none'), statusLabel(row.pr?.status ?? 'none'))}
              {row.threads ? lead('unresolved', 'message', 'warning', unresolvedText(row.threads) ?? '', unresolvedLabel(row.threads) ?? '') : null}
            </Box>
          </Box>
          {chips(row.runs)}
          {row.threads ? (
            <Box flexDirection="row" columnGap={1}>
              <Svg source={progressSvg(row.threads.resolved, row.threads.total, row.threads.resolved === row.threads.total ? 'success' : 'warning')} alt="threads progress" width={120} height={6} />
              <Text dimColor>{`${row.threads.resolved}/${row.threads.total} resolved`}</Text>
            </Box>
          ) : null}
        </Box>
      ) : (
      <Box key={`branch-${row.branch}`} flexDirection="column">
        {row.pr ? (
          <Box flexDirection="row" columnGap={1}>
            {row.pr.url ? <Link href={row.pr.url} label={`#${row.pr.number}`} /> : <Text>{`#${row.pr.number}`}</Text>}
            <Text>{row.pr.title}</Text>
          </Box>
        ) : null}
        {lead('branch', 'branch', 'inactive', `⎇ ${row.branch}`, row.branch)}
        {row.path ? <Text dimColor>{row.path}</Text> : <Text color="warning">no worktree</Text>}
        {lead('status', STATUS_ICON[row.pr?.status ?? 'none'] ?? null, TONE[row.pr?.status ?? 'none'], statusLine(row.pr?.status ?? 'none'), statusLabel(row.pr?.status ?? 'none'))}
        {threadBlock(row.threads)}
        {chips(row.runs)}
      </Box>
      )
    const prRow = (pr: OpenPr) => (
      <Box key={`pr-${pr.number}`} flexDirection="column">
        <Box flexDirection="row" columnGap={1}>
          <Link href={pr.url} label={`#${pr.number}`} />
          <Text bold={Boolean(Svg)}>{pr.title}</Text>
        </Box>
        <Text dimColor>{pr.comments === null ? pr.author : `${pr.author} · ${noun(pr.comments, 'comment', 'comments')}`}</Text>
        {threadBlock(pr.threads)}
        {chips(pr.runs)}
      </Box>
    )
    const errorsCard =
      errors.length === 0 ? null : (
        <Box borderStyle="round" flexDirection="column">
          <Box flexDirection="row" columnGap={1}>
            <Button key="card-errors" plain label={`${isFolded('errors') ? '▸' : '▾'} CLI errors`} onPress={() => void toggle($, 'errors')} />
            <Text dimColor>{String(errors.length)}</Text>
            <Button key="close-errors" plain label="Close" onPress={() => void update($, cliErrors, () => [])} />
          </Box>
          {isFolded('errors') ? null : (
            <Box flexDirection="column">
              {errors.map((failure, i) => (
                <Box key={`failure-${i}`} flexDirection="column">
                  {i > 0 ? <Text dimColor>{RULE}</Text> : null}
                  <Text color="error">{`• ${failure.command}`}</Text>
                  <Text color="error">{`${failureKind(failure)} · ${clockOf(failure.at)}`}</Text>
                  <Text dimColor>{failure.message}</Text>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )

    if (!loaded) return <Text dimColor>Loading…</Text>
    if (!shown && failed)
      return (
        <Box flexDirection="column" rowGap={1}>
          <Text dimColor>{`Couldn't load PRs: ${failed} failed or timed out. Will retry.`}</Text>
          {refreshButton}
          {errorsCard}
        </Box>
      )
    if (!shown) return <Text dimColor>{`No GitHub or Azure DevOps remote here (${note}).`}</Text>

    const rows = sessionRows(branches, shown.prs, mine, ownRuns)
    const sessionStatuses = sessionCounted(rows)
    // The PRs of this session's branches sit in the session card, so Other lists the rest.
    const sessionNumbers = rows.flatMap(row => (row.pr ? [row.pr.number] : []))
    const others = shown.prs.filter(pr => !sessionNumbers.includes(pr.number))
    const listed = others.slice(0, LIMIT)
    const listedStatuses = listed.map(pr => statusOf(pr))
    const count = others.length > LIMIT ? `${LIMIT}+` : String(others.length)

    return (
      <Box flexDirection="column" rowGap={1}>
        <Box flexDirection="row" columnGap={1}>
          <Link href={shown.url} label={shown.slug} />
          {refreshButton}
        </Box>
        <Box borderStyle="round" flexDirection="column">
          {cardHead('session', 'This session', noun(rows.length, 'branch', 'branches'))}
          {isFolded('session') ? (
            <Box flexDirection="column">
              {statusRow(sessionStatuses)}
              {summary('threads', threadTotals(rows.map(row => row.threads)))}
              {summary('ci', ciTotals(rows.map(row => worst(row.runs))))}
            </Box>
          ) : (
            <Box flexDirection="column" rowGap={1}>
              {statusRow(sessionStatuses)}
              {legendRow(sessionStatuses)}
              {rows.length === 0 ? <Text dimColor>No branch in this session.</Text> : null}
              {rows.map(branchRow)}
            </Box>
          )}
        </Box>
        <Box borderStyle="round" flexDirection="column">
          {cardHead('other', 'Other open PRs', `${count} open`)}
          {isFolded('other') ? (
            <Box flexDirection="column">
              {statusRow(listedStatuses)}
              {summary('threads', threadTotals(listed.map(pr => pr.threads)))}
              {summary('ci', ciTotals(listed.map(pr => pr.run)))}
            </Box>
          ) : (
            <Box flexDirection="column" rowGap={1}>
              {statusRow(listedStatuses)}
              {legendRow(listedStatuses)}
              {listed.length === 0 ? <Text dimColor>No open PRs.</Text> : null}
              {groupByStatus(listed).map(group => (
                <Box key={`group-${group.status}`} flexDirection="column">
                  {lead('group', STATUS_ICON[group.status] ?? null, TONE[group.status], statusLine(group.status), statusLabel(group.status))}
                  {group.prs.map(prRow)}
                </Box>
              ))}
            </Box>
          )}
        </Box>
        {errorsCard}
      </Box>
    )
  })
}
