import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { BranchPr, OpenPr, PrState, RepoPrs, ReviewState, Run, RunState } from '../types'

const repo = atom({ plugin: 'open-prs', key: 'repo' } as const, null)
const branchPr = atom({ plugin: 'open-prs', key: 'branchPr' } as const, null)
const branchRun = atom({ plugin: 'open-prs', key: 'branchRun' } as const, null)
const isDismissed = atom({ plugin: 'open-prs', key: 'isDismissed' } as const, false)
const isLoaded = atom({ plugin: 'open-prs', key: 'isLoaded' } as const, false)
const failedCli = atom({ plugin: 'open-prs', key: 'failedCli' } as const, null)
const isRefreshing = atom({ plugin: 'open-prs', key: 'isRefreshing' } as const, false)
const remoteNote = atom({ plugin: 'open-prs', key: 'remoteNote' } as const, '')

const REFRESH_MS = 3 * 60_000
const RETRY_MS = 30_000
const STALE_MS = 60_000
const PANE = 'open-prs'
const TITLE = 'Open PRs'
const LIMIT = 50
const AZ_RUNS = 200
const AZ_THREAD_CALLS = 6
const COUNT_MS = 10 * 60_000
const COUNTS_PER_PASS = 12

type GhCheck = {
  __typename: 'CheckRun' | 'StatusContext'
  name?: string
  status?: string
  conclusion?: string | null
  detailsUrl?: string | null
  workflowName?: string
  checkSuite?: { workflowRun: { workflow: { name: string } } | null } | null
  context?: string
  state?: string
  targetUrl?: string | null
}
type GhOpenPr = {
  number: number
  title: string
  author: { login: string } | null
  isDraft: boolean
  url: string
  reviewDecision: string | null
  latestReviews: { state: string }[] | null
  statusCheckRollup: GhCheck[] | null
}
type GhCommentCounts = { data: { repository: { pullRequests: { nodes: { number: number; totalCommentsCount: number | null }[] } } | null } }
type GhBranchPr = { number: number; title: string; state: 'OPEN' | 'MERGED' | 'CLOSED'; isDraft: boolean }
type GhRefChecks = {
  data: { repository: { ref: { target: { statusCheckRollup?: { contexts: { nodes: GhCheck[] } } | null } } | null } | null }
}
type AzPr = {
  number: number
  title: string
  author: string | null
  isDraft: boolean | null
  status: string
  votes: { vote: number; isRequired: boolean | null; isGroup: boolean | null }[] | null
}
type AzThreads = { isDeleted: boolean | null; comments: { type: string | null; isDeleted: boolean | null }[] | null }[] | null
type AzRun = { id: number; branch: string; status: string; result: string | null; name: string; definition: number; repo: string | null }
type CliResult<T> = { data: T } | { isMissing: boolean }
type Remote = { host: 'github'; slug: string } | { host: 'azure'; org: string; project: string; name: string }
type Snapshot = { repo?: RepoPrs | null; branchPr?: BranchPr | null; branchRun?: Run | null }

const GITHUB = /(?:^|[@/])github\.com(?::\d+)?[:/]([^/:]+\/[^/]+?)(?:\.git)?\/?$/i
const AZURE = [
  /dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+?)\/?$/i,
  /\/\/(?:[^@/]+@)?([^./@]+)\.visualstudio\.com\/(?:DefaultCollection\/)?([^/]+)\/_git\/([^/]+?)\/?$/i,
  /(?:ssh\.dev\.azure\.com|vs-ssh\.visualstudio\.com)[:/]v3\/([^/]+)\/([^/]+)\/([^/]+?)\/?$/i,
]
const ADO_BUILD = /\/_build\/results\?buildId=\d+$/
const SEVERITY: RunState[] = ['failed', 'cancelled', 'partial', 'running', 'queued', 'succeeded']
const IGNORED_CONCLUSIONS = ['NEUTRAL', 'SKIPPED', 'STALE']
const AZ_PR_FIELDS =
  '[].{number:pullRequestId,title:title,author:createdBy.displayName,isDraft:isDraft,status:status,votes:reviewers[].{vote:vote,isRequired:isRequired,isGroup:isContainer}}'
const AZ_THREADS = 'value[].{isDeleted:isDeleted,comments:comments[].{type:commentType,isDeleted:isDeleted}}'
const COMMENT_COUNTS = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    pullRequests(states: OPEN, first: 100, orderBy: { field: CREATED_AT, direction: DESC }) { nodes { number totalCommentsCount } }
  }
}`
const AZ_RUN_FIELDS = '[].{id:id,branch:sourceBranch,status:status,result:result,name:definition.name,definition:definition.id,repo:repository.id}'
const REF_CHECKS = `query($owner: String!, $name: String!, $ref: String!) {
  repository(owner: $owner, name: $name) { ref(qualifiedName: $ref) { target { ... on Commit {
    statusCheckRollup { contexts(first: 100) { nodes {
      __typename
      ... on CheckRun { name status conclusion detailsUrl checkSuite { workflowRun { workflow { name } } } }
      ... on StatusContext { context state targetUrl }
    } } }
  } } } }
}`

const decode = (part: string) => {
  try {
    return decodeURIComponent(part)
  } catch {
    return part
  }
}

function remoteOf(url: string | null): Remote | null {
  if (!url) return null
  const slug = url.match(GITHUB)?.[1]
  if (slug) return { host: 'github', slug }
  for (const pattern of AZURE) {
    const match = url.match(pattern)
    if (match?.[1] && match[2] && match[3]) return { host: 'azure', org: decode(match[1]), project: decode(match[2]), name: decode(match[3]) }
  }
  return null
}

const ghState = (pr: GhBranchPr): PrState =>
  pr.state === 'OPEN' ? (pr.isDraft ? 'draft' : 'open') : pr.state === 'MERGED' ? 'merged' : 'closed'

const azState = (pr: AzPr): PrState =>
  pr.status === 'active' ? (pr.isDraft ? 'draft' : 'open') : pr.status === 'completed' ? 'merged' : 'closed'

function checkState(check: GhCheck): RunState | null {
  if (check.__typename === 'StatusContext')
    return check.state === 'SUCCESS' ? 'succeeded' : check.state === 'PENDING' ? 'running' : check.state === 'EXPECTED' ? 'queued' : 'failed'
  if (check.status !== 'COMPLETED') return check.status === 'IN_PROGRESS' ? 'running' : 'queued'
  const conclusion = check.conclusion ?? ''
  if (IGNORED_CONCLUSIONS.includes(conclusion)) return null
  return conclusion === 'SUCCESS' ? 'succeeded' : conclusion === 'CANCELLED' ? 'cancelled' : 'failed'
}

function azRunState(run: AzRun): RunState {
  if (run.status === 'completed')
    return run.result === 'succeeded' ? 'succeeded' : run.result === 'partiallySucceeded' ? 'partial' : run.result === 'canceled' ? 'cancelled' : 'failed'
  return run.status === 'inProgress' ? 'running' : run.status === 'cancelling' ? 'cancelled' : 'queued'
}

function ghReview(pr: GhOpenPr): ReviewState {
  if (pr.reviewDecision === 'APPROVED') return 'approved'
  if (pr.reviewDecision === 'CHANGES_REQUESTED') return 'changes'
  if (pr.reviewDecision === 'REVIEW_REQUIRED') return 'required'
  const states = (pr.latestReviews ?? []).map(review => review.state)
  return states.includes('CHANGES_REQUESTED') ? 'changes' : states.includes('APPROVED') ? 'approved' : 'required'
}

function azReview(pr: AzPr): ReviewState {
  const votes = pr.votes ?? []
  if (votes.some(({ vote }) => vote < 0)) return 'changes'
  return votes.some(({ vote }) => vote >= 5) && !votes.some(({ vote, isRequired, isGroup }) => isRequired && !isGroup && vote <= 0) ? 'approved' : 'required'
}

const lastPr = (previous: RepoPrs | null, url: string, number: number) =>
  previous?.url === url ? previous.prs.find(old => old.number === number) : undefined

const commentsIn = (threads: AzThreads) =>
  (threads ?? []).filter(thread => !thread.isDeleted).flatMap(thread => thread.comments ?? []).filter(c => c.type === 'text' && !c.isDeleted).length

const worst = (runs: Run[]) => [...runs].sort((a, b) => SEVERITY.indexOf(a.state) - SEVERITY.indexOf(b.state))[0] ?? null

function pipelineOf(checks: GhCheck[] | null | undefined, slug: string): Run | null {
  const actions = `https://github.com/${slug}/actions/runs/`.toLowerCase()
  const builds: Run[] = []
  const workflows: Run[] = []
  for (const check of checks ?? []) {
    const state = checkState(check)
    const url = check.detailsUrl ?? check.targetUrl ?? ''
    if (!state) continue
    if (ADO_BUILD.test(url)) builds.push({ name: check.name ?? check.context ?? 'pipeline', state, url })
    else if (url.toLowerCase().startsWith(actions))
      workflows.push({ name: check.workflowName || check.checkSuite?.workflowRun?.workflow.name || check.name || 'workflow', state, url })
  }
  return worst(builds.length > 0 ? builds : workflows)
}

async function cli<T>($: EngineInterface, argv: string[]): Promise<CliResult<T>> {
  try {
    const { exitCode, stdout, stderr } = await $.process.run(argv, { timeoutMs: 60_000 })
    return exitCode === 0 ? { data: JSON.parse(stdout) as T } : { isMissing: /no pull requests found/i.test(stderr) }
  } catch {
    return { isMissing: false }
  }
}

async function currentBranch($: EngineInterface) {
  try {
    const { exitCode, stdout } = await $.process.run(['git', 'branch', '--show-current'], { timeoutMs: 10_000 })
    return exitCode === 0 ? stdout.trim() || null : null
  } catch {
    return null
  }
}

async function fromGitHub($: EngineInterface, slug: string): Promise<Snapshot> {
  const [owner = '', name = ''] = slug.split('/')
  const url = `https://github.com/${slug}/pulls`
  const branch = await currentBranch($)
  const [open, mine, checks, counts, previous] = await Promise.all([
    cli<GhOpenPr[]>($, [
      'gh', 'pr', 'list', '-R', slug, '--state', 'open', '--limit', String(LIMIT + 1),
      '--json', 'number,title,author,isDraft,url,reviewDecision,latestReviews,statusCheckRollup',
    ]),
    cli<GhBranchPr>($, ['gh', 'pr', 'view', '--json', 'number,title,state,isDraft']),
    branch
      ? cli<GhRefChecks>($, ['gh', 'api', 'graphql', '-f', `query=${REF_CHECKS}`, '-f', `owner=${owner}`, '-f', `name=${name}`, '-f', `ref=refs/heads/${branch}`])
      : null,
    cli<GhCommentCounts>($, ['gh', 'api', 'graphql', '-f', `query=${COMMENT_COUNTS}`, '-f', `owner=${owner}`, '-f', `name=${name}`]),
    read($, repo),
  ])
  const commentsOf = (number: number) =>
    'data' in counts
      ? (counts.data.data.repository?.pullRequests.nodes.find(node => node.number === number)?.totalCommentsCount ??
        lastPr(previous, url, number)?.comments ??
        null)
      : (lastPr(previous, url, number)?.comments ?? null)
  const toOpenPr = (pr: GhOpenPr): OpenPr => ({
    number: pr.number,
    title: pr.title,
    author: pr.author?.login ?? 'ghost',
    isDraft: pr.isDraft,
    url: pr.url,
    review: ghReview(pr),
    comments: commentsOf(pr.number),
    run: pipelineOf(pr.statusCheckRollup, slug),
  })
  return {
    repo: 'data' in open ? { slug, url, prs: open.data.map(toOpenPr) } : undefined,
    branchPr: 'data' in mine ? { number: mine.data.number, title: mine.data.title, state: ghState(mine.data) } : mine.isMissing ? null : undefined,
    branchRun: !checks
      ? null
      : 'data' in checks
        ? pipelineOf(checks.data.data.repository?.ref?.target.statusCheckRollup?.contexts.nodes, slug)
        : undefined,
  }
}

async function fromAzure($: EngineInterface, remote: Extract<Remote, { host: 'azure' }>, s: State): Promise<Snapshot> {
  const scope = ['--org', `https://dev.azure.com/${remote.org}`, '--project', remote.project, '-o', 'json']
  const web = `https://dev.azure.com/${encodeURIComponent(remote.org)}/${encodeURIComponent(remote.project)}`
  const git = `${web}/_git/${encodeURIComponent(remote.name)}`
  const url = `${git}/pullrequests`
  const branch = await currentBranch($)
  const prs = (...filter: string[]) =>
    cli<AzPr[]>($, ['az', 'repos', 'pr', 'list', ...scope, '--repository', remote.name, ...filter, '--query', AZ_PR_FIELDS])
  const [open, mine, runs, repoId, previous] = await Promise.all([
    prs('--status', 'active', '--top', String(LIMIT + 1)),
    branch ? prs('--source-branch', `refs/heads/${branch}`, '--status', 'all', '--top', '1') : null,
    cli<AzRun[]>($, ['az', 'pipelines', 'runs', 'list', ...scope, '--top', String(AZ_RUNS), '--query-order', 'QueueTimeDesc', '--query', AZ_RUN_FIELDS]),
    s.repoIds.has(git) ? { data: s.repoIds.get(git) ?? '' } : cli<string>($, ['az', 'repos', 'show', ...scope, '--repository', remote.name, '--query', 'id']),
    read($, repo),
  ])
  if ('data' in repoId) s.repoIds.set(git, repoId.data)

  // Only the project's latest runs are read, so a PR whose run has dropped out of them keeps the last one shown.
  const known = 'data' in runs && 'data' in repoId ? runs.data.filter(run => run.repo === repoId.data) : null
  const runOf = (ref: string, all: AzRun[]) => {
    const matching = all.filter(run => run.branch === ref)
    const latest = matching.filter((run, i) => matching.findIndex(other => other.definition === run.definition) === i)
    return worst(latest.map(run => ({ name: run.name, state: azRunState(run), url: `${web}/_build/results?buildId=${run.id}` })))
  }
  const toOpenPr = (pr: AzPr): OpenPr => ({
    number: pr.number,
    title: pr.title,
    author: pr.author ?? 'unknown',
    isDraft: pr.isDraft ?? false,
    url: `${git}/pullrequest/${pr.number}`,
    review: azReview(pr),
    comments: s.commentCounts.get(`${git}/pullrequest/${pr.number}`)?.count ?? lastPr(previous, url, pr.number)?.comments ?? null,
    run: (known && runOf(`refs/pull/${pr.number}/merge`, known)) || (lastPr(previous, url, pr.number)?.run ?? null),
  })
  const branchPr = mine && 'data' in mine ? mine.data[0] : undefined
  return {
    repo: 'data' in open ? { slug: `${remote.project}/${remote.name}`, url, prs: open.data.map(toOpenPr) } : undefined,
    branchPr: !mine ? null : 'data' in mine ? (branchPr ? { number: branchPr.number, title: branchPr.title, state: azState(branchPr) } : null) : undefined,
    branchRun: !branch ? null : known ? runOf(`refs/heads/${branch}`, known) : undefined,
  }
}

// ADO has no comment count on the PR list: each PR costs a threads call, so counts follow the list and refresh more slowly.
async function countComments($: EngineInterface, remote: Extract<Remote, { host: 'azure' }>, shown: RepoPrs, s: State) {
  const now = await $.clock.now()
  const countedAt = (pr: OpenPr) => s.commentCounts.get(pr.url)?.at ?? -Infinity
  const due = shown.prs
    .slice(0, LIMIT)
    .filter(pr => now - countedAt(pr) >= COUNT_MS)
    .sort((a, b) => countedAt(a) - countedAt(b))
    .slice(0, COUNTS_PER_PASS)
  for (let i = 0; i < due.length; i += AZ_THREAD_CALLS) {
    const batch = due.slice(i, i + AZ_THREAD_CALLS)
    const results = await Promise.all(
      batch.map(pr =>
        cli<AzThreads>($, [
          'az', 'devops', 'invoke', '--org', `https://dev.azure.com/${remote.org}`, '--area', 'git', '--resource', 'pullRequestThreads',
          '--route-parameters', `project=${remote.project}`, `repositoryId=${remote.name}`, `pullRequestId=${pr.number}`,
          '--api-version', '7.1', '-o', 'json', '--query', AZ_THREADS,
        ]),
      ),
    )
    const at = await $.clock.now()
    results.forEach((result, j) => {
      const pr = batch[j]
      if (pr && 'data' in result && result.data) s.commentCounts.set(pr.url, { count: commentsIn(result.data), at })
    })
    await update($, repo, current =>
      current && { ...current, prs: current.prs.map(pr => ({ ...pr, comments: s.commentCounts.get(pr.url)?.count ?? pr.comments })) },
    )
  }
}

/** The mod's run state, made by each `register` call so a registration starts fresh. */
type State = {
  tick: { cancel: () => void } | undefined
  fetching: Promise<void> | undefined
  fetchedAt: number
  isOpened: boolean
  isDocked: boolean | undefined
  retry: { cancel: () => void } | undefined
  pressed: number
  repoIds: Map<string, string>
  commentCounts: Map<string, { count: number; at: number }>
}

async function load($: EngineInterface, s: State) {
  let countLater: (() => Promise<void>) | undefined
  try {
    countLater = await fetchPrs($, s)
  } finally {
    await update($, isLoaded, () => true)
  }
  await countLater?.()
}

async function fetchPrs($: EngineInterface, s: State) {
  const session = await $.session.repo()
  const remote = remoteOf(session?.remote ?? null)
  const origin = session?.remote?.replace(/\/\/[^@/]+@/, '//')
  await update($, remoteNote, () => (!session ? 'not in a git repo' : origin ? `origin is ${origin}` : 'no origin remote'))
  const snapshot: Snapshot = !remote
    ? { repo: null, branchPr: null, branchRun: null }
    : remote.host === 'github'
      ? await fromGitHub($, remote.slug)
      : await fromAzure($, remote, s)

  // A failed call keeps the last answer; only a confirmed "none" clears it.
  if (snapshot.repo !== undefined) await update($, repo, () => snapshot.repo ?? null)
  if (snapshot.branchPr !== undefined) await update($, branchPr, () => snapshot.branchPr ?? null)
  if (snapshot.branchRun !== undefined) await update($, branchRun, () => snapshot.branchRun ?? null)
  const failed = snapshot.repo === undefined && remote ? (remote.host === 'github' ? 'gh' : 'az') : null
  await update($, failedCli, () => failed)

  // One quick retry per run of failures; after that the regular refresh takes over.
  if (failed && !s.retry) s.retry = $.clock.after(RETRY_MS, () => void refresh($, s))
  else if (!failed) {
    s.retry?.cancel()
    s.retry = undefined
  }

  // Opened unasked only where it docks beside the transcript, never inline above the prompt.
  if (snapshot.repo?.prs.length && !s.isOpened && s.isDocked !== false && !(await read($, isDismissed))) {
    await $.ui.open({ id: PANE, title: TITLE })
    s.isOpened = true
  }
  const shown = snapshot.repo
  return remote?.host === 'azure' && shown ? () => countComments($, remote, shown, s) : undefined
}

function refresh($: EngineInterface, s: State) {
  s.tick ??= $.clock.every(REFRESH_MS, () => void refresh($, s))
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

const STATE_TONE = { open: 'success', draft: 'inactive', merged: 'merged', closed: 'error' } as const
const REVIEW = {
  approved: { label: '✓ approved', tone: 'success' },
  changes: { label: '✗ changes requested', tone: 'error' },
  required: { label: '○ review required', tone: 'warning' },
} as const
const RUN_TONE = {
  queued: 'inactive',
  running: 'suggestion',
  succeeded: 'success',
  partial: 'warning',
  failed: 'error',
  cancelled: 'inactive',
} as const

export const register: Register = on => {
  const s: State = {
    tick: undefined,
    fetching: undefined,
    fetchedAt: 0,
    isOpened: false,
    isDocked: undefined,
    retry: undefined,
    pressed: 0,
    repoIds: new Map(),
    commentCounts: new Map(),
  }

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await update($, isRefreshing, () => false)
    await $.command.register({ name: 'prs', description: "Show the repo's open GitHub or Azure DevOps PRs and their pipelines in a side pane" })
    kick($, s)
    return started
  })

  on('command.run', { command: 'prs' }, async ($, e) => {
    await update($, isDismissed, () => false)
    s.isOpened = true
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
    const { Box, Button, Link, Text } = $.ui.resolve(e)
    const [loaded, shown, mine, mineRun, failed, refreshing, note] = await Promise.all([
      read($, isLoaded), read($, repo), read($, branchPr), read($, branchRun), read($, failedCli), read($, isRefreshing), read($, remoteNote),
    ])
    const refreshButton = (
      <Box flexDirection="row" columnGap={1}>
        <Button key="refresh" label="Refresh" onPress={() => void refreshNow($, s)} />
        {refreshing ? <Text dimColor>Refreshing…</Text> : null}
      </Box>
    )
    if (!loaded) return <Text dimColor>Loading…</Text>
    if (!shown && failed)
      return (
        <Box flexDirection="column" rowGap={1}>
          <Text dimColor>{`Couldn't load PRs: ${failed} failed or timed out. Will retry.`}</Text>
          {refreshButton}
        </Box>
      )
    if (!shown) return <Text dimColor>{`No GitHub or Azure DevOps remote here (${note}).`}</Text>

    const count = shown.prs.length > LIMIT ? `${LIMIT}+` : String(shown.prs.length)
    const listed = shown.prs.slice(0, LIMIT)
    const runs = [
      ...(mineRun ? [{ key: 'run-branch', label: 'This branch', run: mineRun }] : []),
      ...listed.flatMap(pr => (pr.run ? [{ key: `run-${pr.number}`, label: `#${pr.number}`, run: pr.run }] : [])),
    ]

    return (
      <Box flexDirection="column" rowGap={1}>
        <Box flexDirection="row" columnGap={1}>
          <Link href={shown.url} label={shown.slug} />
          {refreshButton}
        </Box>
        <Box flexDirection="column" rowGap={1}>
          <Box flexDirection="row" columnGap={1}>
            <Text bold>Pull requests</Text>
            <Text color={shown.prs.length > 0 ? 'warning' : undefined}>{`${count} open`}</Text>
          </Box>
          {mine ? <Text color={STATE_TONE[mine.state]}>{`This branch: #${mine.number} ${mine.state}`}</Text> : null}
          {listed.map(pr => (
            <Box key={`pr-${pr.number}`} flexDirection="column">
              <Box flexDirection="row" columnGap={1}>
                <Link href={pr.url} label={`#${pr.number}`} />
                <Text>{pr.title}</Text>
              </Box>
              <Box flexDirection="row" columnGap={1}>
                <Text dimColor>{pr.isDraft ? `${pr.author} · draft` : pr.author}</Text>
                {mine?.number === pr.number ? <Text color="success">← this branch</Text> : null}
              </Box>
              <Box flexDirection="row" columnGap={1}>
                <Text color={REVIEW[pr.review].tone}>{REVIEW[pr.review].label}</Text>
                {pr.comments === null ? null : <Text dimColor>{pr.comments === 1 ? '1 comment' : `${pr.comments} comments`}</Text>}
              </Box>
            </Box>
          ))}
        </Box>
        <Box flexDirection="column">
          <Text bold>Pipelines</Text>
          {runs.length === 0 ? <Text dimColor>No runs found.</Text> : null}
          {runs.map(({ key, label, run }) => (
            <Box key={key} flexDirection="row" columnGap={1}>
              <Box minWidth={11} flexShrink={0}>
                <Text dimColor>{label}</Text>
              </Box>
              <Text color={RUN_TONE[run.state]}>{`● ${run.state}`}</Text>
              <Link href={run.url} label={run.name} />
            </Box>
          ))}
        </Box>
      </Box>
    )
  })
}
