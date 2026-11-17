import type { OpenPr, PrState, RepoPrs, ReviewState, Run, RunState } from '../types'
import { type FetchContext, LIMIT, type Port, type Provider, type Snapshot, cli, latestRuns, previousPr, worst } from './provider'
import type { Remote } from './remote'

// The shapes of the `az` JSON this provider reads. The argv of each call is pinned in tests/providers.test.ts.
type AzPr = {
  number: number
  title: string
  author: string | null
  isDraft: boolean | null
  status: string
  votes: { vote: number; isRequired: boolean | null; isGroup: boolean | null }[] | null
}
type AzThreads = { isDeleted: boolean | null; status: string | null; comments: { type: string | null; isDeleted: boolean | null }[] | null }[] | null
type AzCounts = { count: number; threads: { total: number; resolved: number }; at: number }
type AzRun = { id: number; branch: string; status: string; result: string | null; name: string; definition: number; repo: string | null }

type Azure = Extract<Remote, { host: 'azure' }>

const AZ_RUNS = 200
const AZ_THREAD_CALLS = 6
const COUNT_MS = 10 * 60_000
const COUNTS_PER_PASS = 12
const AZ_PR_FIELDS =
  '[].{number:pullRequestId,title:title,author:createdBy.displayName,isDraft:isDraft,status:status,votes:reviewers[].{vote:vote,isRequired:isRequired,isGroup:isContainer}}'
const AZ_THREADS = 'value[].{isDeleted:isDeleted,status:status,comments:comments[].{type:commentType,isDeleted:isDeleted}}'
// Thread statuses that mean resolved; active, pending and a thread with no status are still open.
const RESOLVED_STATUSES = ['fixed', 'closed', 'wontFix', 'byDesign']
const AZ_RUN_FIELDS = '[].{id:id,branch:sourceBranch,status:status,result:result,name:definition.name,definition:definition.id,repo:repository.id}'

const azState = (pr: AzPr): PrState =>
  pr.status === 'active' ? (pr.isDraft ? 'draft' : 'open') : pr.status === 'completed' ? 'merged' : 'closed'

function azRunState(run: AzRun): RunState {
  if (run.status === 'completed')
    return run.result === 'succeeded' ? 'succeeded' : run.result === 'partiallySucceeded' ? 'partial' : run.result === 'canceled' ? 'cancelled' : 'failed'
  return run.status === 'inProgress' ? 'running' : run.status === 'cancelling' ? 'cancelled' : 'queued'
}

function azReview(pr: AzPr): ReviewState {
  const votes = pr.votes ?? []
  if (votes.some(({ vote }) => vote < 0)) return 'changes'
  return votes.some(({ vote }) => vote >= 5) && !votes.some(({ vote, isRequired, isGroup }) => isRequired && !isGroup && vote <= 0) ? 'approved' : 'required'
}

const commentsIn = (threads: AzThreads) =>
  (threads ?? []).filter(thread => !thread.isDeleted).flatMap(thread => thread.comments ?? []).filter(c => c.type === 'text' && !c.isDeleted).length

/** The review threads: live threads with a live text comment. System-only threads are not counted. */
const threadsIn = (threads: AzThreads) => {
  const review = (threads ?? []).filter(thread => !thread.isDeleted && (thread.comments ?? []).some(c => c.type === 'text' && !c.isDeleted))
  return { total: review.length, resolved: review.filter(thread => RESOLVED_STATUSES.includes(thread.status ?? '')).length }
}

/** The organisation URL: the base of the `az --org` argument and of every web link. */
const azureOrg = (remote: Azure) => `https://dev.azure.com/${remote.org}`

async function fetchAzure(
  port: Port,
  remote: Azure,
  { branch, previous }: FetchContext,
  repoIds: Map<string, string>,
  commentCounts: Map<string, AzCounts>,
): Promise<Snapshot> {
  const org = azureOrg(remote)
  const scope = ['--org', org, '--project', remote.project, '-o', 'json']
  const web = `${org}/${encodeURIComponent(remote.project)}`
  const git = `${web}/_git/${encodeURIComponent(remote.name)}`
  const url = `${git}/pullrequests`
  const prs = (...filter: string[]) =>
    cli<AzPr[]>(port, ['az', 'repos', 'pr', 'list', ...scope, '--repository', remote.name, ...filter, '--query', AZ_PR_FIELDS])
  const [open, mine, runs, repoId] = await Promise.all([
    prs('--status', 'active', '--top', String(LIMIT + 1)),
    branch ? prs('--source-branch', `refs/heads/${branch}`, '--status', 'all', '--top', '1') : null,
    cli<AzRun[]>(port, ['az', 'pipelines', 'runs', 'list', ...scope, '--top', String(AZ_RUNS), '--query-order', 'QueueTimeDesc', '--query', AZ_RUN_FIELDS]),
    repoIds.has(git) ? { data: repoIds.get(git) ?? '' } : cli<string>(port, ['az', 'repos', 'show', ...scope, '--repository', remote.name, '--query', 'id']),
  ])
  if ('data' in repoId) repoIds.set(git, repoId.data)

  // Only the project's latest runs are read, so a PR whose run has dropped out of them keeps the last one shown.
  const known = 'data' in runs && 'data' in repoId ? runs.data.filter(run => run.repo === repoId.data) : null
  // The latest run of each definition, newest first.
  const runsOf = (ref: string, all: AzRun[]): Run[] => {
    const matching = all.filter(run => run.branch === ref)
    const latest = matching.filter((run, i) => matching.findIndex(other => other.definition === run.definition) === i)
    return latest.map(run => ({ name: run.name, state: azRunState(run), url: `${web}/_build/results?buildId=${run.id}` }))
  }
  const toOpenPr = (pr: AzPr): OpenPr => {
    // A PR whose runs have dropped out of the project's latest keeps the runs it showed last.
    const fresh = known ? latestRuns(runsOf(`refs/pull/${pr.number}/merge`, known)) : []
    const runs = fresh.length > 0 ? fresh : (previousPr(previous, url, pr.number)?.runs ?? [])
    return {
      number: pr.number,
      title: pr.title,
      author: pr.author ?? 'unknown',
      isDraft: pr.isDraft ?? false,
      url: `${git}/pullrequest/${pr.number}`,
      review: azReview(pr),
      comments: commentCounts.get(`${git}/pullrequest/${pr.number}`)?.count ?? previousPr(previous, url, pr.number)?.comments ?? null,
      threads: commentCounts.get(`${git}/pullrequest/${pr.number}`)?.threads ?? previousPr(previous, url, pr.number)?.threads ?? null,
      runs,
      run: worst(runs),
    }
  }
  const branchPr = mine && 'data' in mine ? mine.data[0] : undefined
  return {
    repo: 'data' in open ? { slug: `${remote.project}/${remote.name}`, url, prs: open.data.map(toOpenPr) } : undefined,
    branchPr: !mine ? null : 'data' in mine ? (branchPr ? { number: branchPr.number, title: branchPr.title, state: azState(branchPr) } : null) : undefined,
    branchRuns: !branch ? null : known ? latestRuns(runsOf(`refs/heads/${branch}`, known)) : undefined,
  }
}

/**
 * The Azure DevOps provider: `az` in the session's folder. Its repo IDs and comment counts are kept per register, so a
 * new register starts them fresh.
 */
export function azureProvider(): Provider {
  const repoIds = new Map<string, string>()
  const commentCounts = new Map<string, AzCounts>()
  return {
    cli: 'az',
    async fetch(port, remote, context) {
      if (remote.host !== 'azure') throw new Error(`Azure provider given a ${remote.host} remote`)
      return fetchAzure(port, remote, context, repoIds, commentCounts)
    },
    // ADO has no comment count on the PR list: each PR costs a threads call, so counts follow the list and refresh more slowly.
    async countComments(port, remote, shown: RepoPrs, publish) {
      if (remote.host !== 'azure') throw new Error(`Azure provider given a ${remote.host} remote`)
      const org = azureOrg(remote)
      const now = await port.now()
      const countedAt = (pr: OpenPr) => commentCounts.get(pr.url)?.at ?? -Infinity
      const due = shown.prs
        .slice(0, LIMIT)
        .filter(pr => now - countedAt(pr) >= COUNT_MS)
        .sort((a, b) => countedAt(a) - countedAt(b))
        .slice(0, COUNTS_PER_PASS)
      for (let i = 0; i < due.length; i += AZ_THREAD_CALLS) {
        const batch = due.slice(i, i + AZ_THREAD_CALLS)
        const results = await Promise.all(
          batch.map(pr =>
            cli<AzThreads>(port, [
              'az', 'devops', 'invoke', '--org', org, '--area', 'git', '--resource', 'pullRequestThreads',
              '--route-parameters', `project=${remote.project}`, `repositoryId=${remote.name}`, `pullRequestId=${pr.number}`,
              '--api-version', '7.1', '-o', 'json', '--query', AZ_THREADS,
            ]),
          ),
        )
        const at = await port.now()
        results.forEach((result, j) => {
          const pr = batch[j]
          if (pr && 'data' in result && result.data) commentCounts.set(pr.url, { count: commentsIn(result.data), threads: threadsIn(result.data), at })
        })
        await publish(pr => ({ ...pr, comments: commentCounts.get(pr.url)?.count ?? pr.comments, threads: commentCounts.get(pr.url)?.threads ?? pr.threads }))
      }
    },
  }
}
