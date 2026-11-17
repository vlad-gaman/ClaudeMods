import type { BranchPr, OpenPr, PrState, RepoPrs, ReviewState, Run, RunState } from '../types'
import { type FetchContext, LIMIT, type Port, type Provider, type Snapshot, cli, joinSessionBranches, latestRuns, previousPr, worst } from './provider'
import type { Remote } from './remote'

// The shapes of the `gh` JSON this provider reads. The argv of each call is pinned in tests/providers.test.ts.
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
  headRefName: string
  reviewDecision: string | null
  latestReviews: { state: string }[] | null
  statusCheckRollup: GhCheck[] | null
}
type GhCommentCounts = {
  data: {
    repository: {
      pullRequests: {
        nodes: { number: number; totalCommentsCount: number | null; reviewThreads?: { totalCount: number; nodes: { isResolved: boolean }[] } | null }[]
      }
    } | null
  }
}
type GhBranchPr = { number: number; title: string; state: 'OPEN' | 'MERGED' | 'CLOSED'; isDraft: boolean }
type GhRefChecks = {
  data: { repository: { ref: { target: { statusCheckRollup?: { contexts: { nodes: GhCheck[] } } | null } } | null } | null }
}

const ADO_BUILD = /\/_build\/results\?buildId=\d+$/
const IGNORED_CONCLUSIONS = ['NEUTRAL', 'SKIPPED', 'STALE']
const COMMENT_COUNTS = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    pullRequests(states: OPEN, first: 100, orderBy: { field: CREATED_AT, direction: DESC }) {
      nodes { number totalCommentsCount reviewThreads(first: 100) { totalCount nodes { isResolved } } }
    }
  }
}`
const REF_CHECKS = `query($owner: String!, $name: String!, $ref: String!) {
  repository(owner: $owner, name: $name) { ref(qualifiedName: $ref) { target { ... on Commit {
    statusCheckRollup { contexts(first: 100) { nodes {
      __typename
      ... on CheckRun { name status conclusion detailsUrl checkSuite { workflowRun { workflow { name } } } }
      ... on StatusContext { context state targetUrl }
    } } }
  } } } }
}`

const ghState = (pr: GhBranchPr): PrState =>
  pr.state === 'OPEN' ? (pr.isDraft ? 'draft' : 'open') : pr.state === 'MERGED' ? 'merged' : 'closed'

function checkState(check: GhCheck): RunState | null {
  if (check.__typename === 'StatusContext')
    return check.state === 'SUCCESS' ? 'succeeded' : check.state === 'PENDING' ? 'running' : check.state === 'EXPECTED' ? 'queued' : 'failed'
  if (check.status !== 'COMPLETED') return check.status === 'IN_PROGRESS' ? 'running' : 'queued'
  const conclusion = check.conclusion ?? ''
  if (IGNORED_CONCLUSIONS.includes(conclusion)) return null
  return conclusion === 'SUCCESS' ? 'succeeded' : conclusion === 'CANCELLED' ? 'cancelled' : 'failed'
}

function ghReview(pr: GhOpenPr): ReviewState {
  if (pr.reviewDecision === 'APPROVED') return 'approved'
  if (pr.reviewDecision === 'CHANGES_REQUESTED') return 'changes'
  if (pr.reviewDecision === 'REVIEW_REQUIRED') return 'required'
  const states = (pr.latestReviews ?? []).map(review => review.state)
  return states.includes('CHANGES_REQUESTED') ? 'changes' : states.includes('APPROVED') ? 'approved' : 'required'
}

/** The runs a PR shows, in rollup order: its Azure pipelines when it has any, else its GitHub Actions workflows. */
function pipelinesOf(checks: GhCheck[] | null | undefined, slug: string): Run[] {
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
  return builds.length > 0 ? builds : workflows
}

async function fetchGitHub(port: Port, slug: string, { branch, previous, sessionBranches }: FetchContext): Promise<Snapshot> {
  const [owner = '', name = ''] = slug.split('/')
  const url = `https://github.com/${slug}/pulls`
  const [open, mine, checks, counts] = await Promise.all([
    cli<GhOpenPr[]>(port, [
      'gh', 'pr', 'list', '-R', slug, '--state', 'open', '--limit', String(LIMIT + 1),
      '--json', 'number,title,author,isDraft,url,headRefName,reviewDecision,latestReviews,statusCheckRollup',
    ]),
    cli<GhBranchPr>(port, ['gh', 'pr', 'view', '--json', 'number,title,state,isDraft']),
    branch
      ? cli<GhRefChecks>(port, ['gh', 'api', 'graphql', '-f', `query=${REF_CHECKS}`, '-f', `owner=${owner}`, '-f', `name=${name}`, '-f', `ref=refs/heads/${branch}`])
      : null,
    cli<GhCommentCounts>(port, ['gh', 'api', 'graphql', '-f', `query=${COMMENT_COUNTS}`, '-f', `owner=${owner}`, '-f', `name=${name}`]),
  ])
  const countNode = (number: number) => ('data' in counts ? counts.data.data.repository?.pullRequests.nodes.find(node => node.number === number) : undefined)
  const commentsOf = (number: number) => countNode(number)?.totalCommentsCount ?? previousPr(previous, url, number)?.comments ?? null
  // The resolved count reads the first 100 threads of the PR, the most one query returns.
  const threadsOf = (number: number) => {
    const threads = countNode(number)?.reviewThreads
    return threads ? { total: threads.totalCount, resolved: threads.nodes.filter(thread => thread.isResolved).length } : (previousPr(previous, url, number)?.threads ?? null)
  }
  const toOpenPr = (pr: GhOpenPr): OpenPr => ({
    number: pr.number,
    title: pr.title,
    author: pr.author?.login ?? 'ghost',
    isDraft: pr.isDraft,
    url: pr.url,
    branch: pr.headRefName,
    review: ghReview(pr),
    comments: commentsOf(pr.number),
    threads: threadsOf(pr.number),
    runs: latestRuns(pipelinesOf(pr.statusCheckRollup, slug)),
    run: worst(latestRuns(pipelinesOf(pr.statusCheckRollup, slug))),
  })
  const repo: RepoPrs | undefined = 'data' in open ? { slug, url, prs: open.data.map(toOpenPr) } : undefined
  return {
    repo,
    sessionBranches: joinSessionBranches(sessionBranches, repo?.prs),
    branchPr: 'data' in mine ? { number: mine.data.number, title: mine.data.title, state: ghState(mine.data) } : 'isMissing' in mine && mine.isMissing ? null : undefined,
    branchRuns: !checks
      ? null
      : 'data' in checks
        ? latestRuns(pipelinesOf(checks.data.data.repository?.ref?.target.statusCheckRollup?.contexts.nodes, slug))
        : undefined,
  }
}

/** The GitHub provider: `gh` in the session's folder, one list, one branch PR, one check rollup and one count query per refresh. */
export function githubProvider(): Provider {
  return {
    cli: 'gh',
    async fetch(port, remote: Remote, context) {
      if (remote.host !== 'github') throw new Error(`GitHub provider given a ${remote.host} remote`)
      return fetchGitHub(port, remote.slug, context)
    },
  }
}
