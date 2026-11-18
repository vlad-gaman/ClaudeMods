import { describe, expect, test } from 'claude-code/testing'

import { azureProvider } from '../hooks/azure'
import { githubProvider } from '../hooks/github'
import type { FetchContext, Port } from '../hooks/provider'
import type { Remote } from '../hooks/remote'
import type { OpenPr, RepoPrs } from '../types'

// A stub CLI: each call takes the next answer in order, and every argv it was given is recorded once.
type Answer = { exitCode: number; stdout: string; stderr: string } | 'throw'
const ok = (data: unknown): Answer => ({ exitCode: 0, stdout: JSON.stringify(data), stderr: '' })
const fail = (stderr: string): Answer => ({ exitCode: 1, stdout: '', stderr })
const stubPort = (answers: Answer[], now = 0) => {
  const calls: string[][] = []
  let next = 0
  const port: Port = {
    run: async argv => {
      calls.push([...argv])
      const answer = answers[next++]
      if (answer === undefined) throw new Error(`no answer for ${argv.join(' ')}`)
      if (answer === 'throw') throw new Error('spawn ENOENT')
      return answer
    },
    now: async () => now,
  }
  return { port, calls }
}

const GITHUB: Remote = { host: 'github', slug: 'esendex/api' }
const AZURE: Remote = { host: 'azure', org: 'commify', project: 'Titan Accounts', name: 'api' }
const BRANCH: FetchContext = { branch: 'feature', previous: null }
const BUILD = 'https://commify.visualstudio.com/p/_build/results?buildId=7'
const NO_PR = 'no pull requests found for branch "feature"'
const ANY = expect.any(String)

const pr = (number: number, extra: Record<string, unknown> = {}) => ({
  number,
  title: `PR ${number}`,
  author: { login: 'alice' },
  headRefName: 'feature',
  isDraft: false,
  url: `https://github.com/esendex/api/pull/${number}`,
  reviewDecision: 'REVIEW_REQUIRED',
  latestReviews: [],
  statusCheckRollup: [],
  ...extra,
})
const counts = (...nodes: [number, number][]) => ({
  data: { repository: { pullRequests: { nodes: nodes.map(([number, totalCommentsCount]) => ({ number, totalCommentsCount })) } } },
})
const threadCounts = (...nodes: [number, number, boolean[]][]) => ({
  data: {
    repository: {
      pullRequests: {
        nodes: nodes.map(([number, totalCommentsCount, resolved]) => ({
          number,
          totalCommentsCount,
          reviewThreads: { totalCount: resolved.length, nodes: resolved.map(isResolved => ({ isResolved })) },
        })),
      },
    },
  },
})
const refChecks = (nodes: unknown[]) => ({ data: { repository: { ref: { target: { statusCheckRollup: { contexts: { nodes } } } } } } })
const QUERY = expect.stringMatching(/^query=/)

describe('GitHub provider', () => {
  test('calls gh once each for the open PRs, the branch PR, the branch checks and the counts', async () => {
    // Arrange
    const { port, calls } = stubPort([
      ok([]),
      ok({ number: 12, title: 'PR 12', state: 'OPEN', isDraft: false }),
      ok({ data: { repository: { ref: null } } }),
      ok(counts()),
    ])

    // Act
    await githubProvider().fetch(port, GITHUB, BRANCH)

    // Assert
    expect(calls).toEqual([
      ['gh', 'pr', 'list', '-R', 'esendex/api', '--state', 'open', '--limit', '51', '--json', 'number,title,author,isDraft,url,headRefName,reviewDecision,latestReviews,statusCheckRollup'],
      ['gh', 'pr', 'view', '--json', 'number,title,state,isDraft'],
      ['gh', 'api', 'graphql', '-f', QUERY, '-f', 'owner=esendex', '-f', 'name=api', '-f', 'ref=refs/heads/feature'],
      ['gh', 'api', 'graphql', '-f', QUERY, '-f', 'owner=esendex', '-f', 'name=api'],
    ])
  })

  test('skips the branch checks when there is no branch', async () => {
    // Arrange
    const { port, calls } = stubPort([ok([]), fail(NO_PR), ok(counts())])

    // Act
    const snapshot = await githubProvider().fetch(port, GITHUB, { branch: null, previous: null })

    // Assert
    expect(calls.map(argv => argv.slice(0, 3))).toEqual([
      ['gh', 'pr', 'list'],
      ['gh', 'pr', 'view'],
      ['gh', 'api', 'graphql'],
    ])
    expect(snapshot.branchRuns).toBeNull()
  })

  test('maps each PR to its review, comments and Azure pipeline, and names the repo', async () => {
    // Arrange
    const build = { __typename: 'CheckRun', name: 'api-ci', status: 'COMPLETED', conclusion: 'FAILURE', detailsUrl: BUILD }
    const reviewed = pr(12, { reviewDecision: 'APPROVED', statusCheckRollup: [build] })
    const { port } = stubPort([ok([reviewed]), fail(NO_PR), ok({ data: { repository: { ref: null } } }), ok(counts([12, 3]))])

    // Act
    const snapshot = await githubProvider().fetch(port, GITHUB, BRANCH)

    // Assert
    expect(snapshot.repo).toEqual({
      slug: 'esendex/api',
      url: 'https://github.com/esendex/api/pulls',
      prs: [
        {
          number: 12,
          title: 'PR 12',
          author: 'alice',
          isDraft: false,
          url: 'https://github.com/esendex/api/pull/12',
          branch: 'feature',
          review: 'approved',
          comments: 3,
          threads: null,
          runs: [{ name: 'api-ci', state: 'failed', url: BUILD }],
          run: { name: 'api-ci', state: 'failed', url: BUILD },
        },
      ],
    })
  })

  test('keeps the last comment count when the count call fails', async () => {
    // Arrange
    const previous: RepoPrs = {
      slug: 'esendex/api',
      url: 'https://github.com/esendex/api/pulls',
      prs: [{ number: 12, title: 'PR 12', author: 'alice', isDraft: false, url: 'x', review: 'required', comments: 5, run: null }],
    }
    const { port } = stubPort([ok([pr(12)]), fail(NO_PR), ok({ data: { repository: { ref: null } } }), fail('HTTP 502')])

    // Act
    const snapshot = await githubProvider().fetch(port, GITHUB, { branch: 'feature', previous })

    // Assert
    expect(snapshot.repo?.prs[0]?.comments).toBe(5)
  })

  test('counts the resolved and total review threads of each PR', async () => {
    // Arrange
    const { port } = stubPort([ok([pr(12)]), fail(NO_PR), ok({ data: { repository: { ref: null } } }), ok(threadCounts([12, 3, [true, false, true]]))])

    // Act
    const snapshot = await githubProvider().fetch(port, GITHUB, BRANCH)

    // Assert
    expect(snapshot.repo?.prs[0]?.threads).toEqual({ total: 3, resolved: 2 })
  })

  test('keeps the last thread counts when the count call fails, and is null when there were none', async () => {
    // Arrange
    const previous: RepoPrs = {
      slug: 'esendex/api',
      url: 'https://github.com/esendex/api/pulls',
      prs: [{ number: 12, title: 'PR 12', author: 'alice', isDraft: false, url: 'x', review: 'required', comments: 5, threads: { total: 4, resolved: 1 }, runs: [], run: null }],
    }
    const kept = stubPort([ok([pr(12)]), fail(NO_PR), ok({ data: { repository: { ref: null } } }), fail('HTTP 502')])
    const never = stubPort([ok([pr(12)]), fail(NO_PR), ok({ data: { repository: { ref: null } } }), fail('HTTP 502')])

    // Act
    const withPrevious = await githubProvider().fetch(kept.port, GITHUB, { branch: 'feature', previous })
    const withoutPrevious = await githubProvider().fetch(never.port, GITHUB, BRANCH)

    // Assert
    expect(withPrevious.repo?.prs[0]?.threads).toEqual({ total: 4, resolved: 1 })
    expect(withoutPrevious.repo?.prs[0]?.threads).toBeNull()
  })

  test('lists the newest five pipeline runs of a PR, and the worst of those five is its run', async () => {
    // Arrange
    const builds = [1, 2, 3, 4, 5, 6, 7].map(id => ({
      __typename: 'CheckRun',
      name: `p${id}`,
      status: 'COMPLETED',
      conclusion: id < 6 ? 'SUCCESS' : 'FAILURE',
      detailsUrl: `https://commify.visualstudio.com/p/_build/results?buildId=${id}`,
    }))
    const { port } = stubPort([ok([pr(12, { statusCheckRollup: builds })]), fail(NO_PR), ok({ data: { repository: { ref: null } } }), ok(counts())])

    // Act
    const snapshot = await githubProvider().fetch(port, GITHUB, BRANCH)

    // Assert
    const listed = snapshot.repo?.prs[0]
    expect(listed?.runs.map(run => run.name)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'])
    expect(listed?.run?.state).toBe('succeeded')
  })

  test('a PR with no pipeline lists no runs', async () => {
    // Arrange
    const { port } = stubPort([ok([pr(12)]), fail(NO_PR), ok({ data: { repository: { ref: null } } }), ok(counts())])

    // Act
    const snapshot = await githubProvider().fetch(port, GITHUB, BRANCH)

    // Assert
    expect(snapshot.repo?.prs[0]?.runs).toEqual([])
    expect(snapshot.repo?.prs[0]?.run).toBeNull()
  })

  test('lists the branch runs newest first, and none when the branch has no pipeline', async () => {
    // Arrange
    const build = (id: number) => ({ __typename: 'CheckRun', name: `b${id}`, status: 'COMPLETED', conclusion: 'SUCCESS', detailsUrl: `https://commify.visualstudio.com/p/_build/results?buildId=${id}` })
    const busy = stubPort([ok([]), fail(NO_PR), ok(refChecks([build(1), build(2)])), ok(counts())])
    const idle = stubPort([ok([]), fail(NO_PR), ok(refChecks([])), ok(counts())])

    // Act
    const withRuns = await githubProvider().fetch(busy.port, GITHUB, BRANCH)
    const withNone = await githubProvider().fetch(idle.port, GITHUB, BRANCH)

    // Assert
    expect(withRuns.branchRuns?.map(run => run.name)).toEqual(['b1', 'b2'])
    expect(withNone.branchRuns).toEqual([])
  })

  test('a failed branch-checks call leaves the branch runs as they were', async () => {
    // Arrange
    const { port } = stubPort([ok([]), fail(NO_PR), fail('HTTP 502'), ok(counts())])

    // Act
    const snapshot = await githubProvider().fetch(port, GITHUB, BRANCH)

    // Assert
    expect(snapshot.branchRuns).toBeUndefined()
  })

  test("joins this session's branches to their open PRs, and gives a branch with none a null PR", async () => {
    // Arrange
    const { port } = stubPort([ok([pr(12)]), fail(NO_PR), ok(counts())])
    const sessionBranches = [
      { branch: 'feature', path: 'D:/wt/feature' },
      { branch: 'topic', path: 'D:/wt/topic' },
    ]

    // Act
    const snapshot = await githubProvider().fetch(port, GITHUB, { branch: null, previous: null, sessionBranches })

    // Assert
    expect(snapshot.sessionBranches).toEqual([
      { branch: 'feature', path: 'D:/wt/feature', prNumber: 12 },
      { branch: 'topic', path: 'D:/wt/topic', prNumber: null },
    ])
  })

  test("this session's branches are unknown when the PR list failed, and unknown when not given", async () => {
    // Arrange
    const failed = stubPort([fail('HTTP 502'), fail(NO_PR), ok(counts()), fail('HTTP 502')])
    const given = stubPort([ok([]), fail(NO_PR), ok({ data: { repository: { ref: null } } }), ok(counts())])

    // Act
    const withFailedList = await githubProvider().fetch(failed.port, GITHUB, { branch: null, previous: null, sessionBranches: [] })
    const withoutBranches = await githubProvider().fetch(given.port, GITHUB, BRANCH)

    // Assert
    expect(withFailedList.sessionBranches).toBeUndefined()
    expect(withoutBranches.sessionBranches).toBeUndefined()
  })

  test('a gh call that cannot run is unknown: the repo is left as it was', async () => {
    // Arrange
    const { port } = stubPort(['throw', fail(NO_PR), ok(counts())])

    // Act
    const snapshot = await githubProvider().fetch(port, GITHUB, { branch: null, previous: null })

    // Assert
    expect(snapshot.repo).toBeUndefined()
  })

  test('a panicking PR list is retried without the rollup, and the runs come from the API', async () => {
    // Arrange
    const panic = { exitCode: 2, stdout: '', stderr: 'panic: runtime error: invalid memory address or nil pointer dereference' }
    const build = { __typename: 'CheckRun', name: 'api-ci', status: 'COMPLETED', conclusion: 'FAILURE', detailsUrl: BUILD }
    const rollups = { data: { repository: { pullRequests: { nodes: [{ number: 12, commits: { nodes: [{ commit: { statusCheckRollup: { contexts: { nodes: [build] } } } }] } }] } } } }
    const { port, calls } = stubPort([panic, fail(NO_PR), ok(counts()), ok([pr(12, { statusCheckRollup: undefined })]), ok(rollups)])

    // Act
    const snapshot = await githubProvider().fetch(port, GITHUB, { branch: null, previous: null })

    // Assert
    expect(calls[0]?.at(-1)).toContain('statusCheckRollup')
    expect(calls[3]?.at(-1)).not.toContain('statusCheckRollup')
    expect(calls[4]).toEqual(['gh', 'api', 'graphql', '-f', QUERY, '-f', 'owner=esendex', '-f', 'name=api'])
    expect(snapshot.repo?.prs[0]?.runs).toEqual([{ name: 'api-ci', state: 'failed', url: BUILD }])
  })

  test('the PRs still show, without runs, when the fallback runs call fails too', async () => {
    // Arrange
    const panic = { exitCode: 2, stdout: '', stderr: 'panic' }
    const { port } = stubPort([panic, fail(NO_PR), ok(counts()), ok([pr(12)]), fail('HTTP 502')])

    // Act
    const snapshot = await githubProvider().fetch(port, GITHUB, { branch: null, previous: null })

    // Assert
    expect(snapshot.repo?.prs.map(open => open.number)).toEqual([12])
    expect(snapshot.repo?.prs[0]?.runs).toEqual([])
  })

  test('a branch with no PR is a confirmed none, and a failed view is unknown', async () => {
    // Arrange
    const none = stubPort([ok([]), fail(NO_PR), ok(counts())])
    const failed = stubPort([ok([]), fail('HTTP 502'), ok(counts())])

    // Act
    const confirmed = await githubProvider().fetch(none.port, GITHUB, { branch: null, previous: null })
    const unknown = await githubProvider().fetch(failed.port, GITHUB, { branch: null, previous: null })

    // Assert
    expect(confirmed.branchPr).toBeNull()
    expect(unknown.branchPr).toBeUndefined()
  })

  test('an Azure remote is refused', async () => {
    const { port } = stubPort([])
    await expect(githubProvider().fetch(port, AZURE, BRANCH)).rejects.toThrow('GitHub provider given a azure remote')
  })
})

describe('Azure DevOps provider', () => {
  const scope = ['--org', 'https://dev.azure.com/commify', '--project', 'Titan Accounts', '-o', 'json']
  const prsArgv = (...filter: string[]) => ['az', 'repos', 'pr', 'list', ...scope, '--repository', 'api', ...filter, '--query', ANY]

  test('calls az once each for the active PRs, the branch PR, the runs and the repo id', async () => {
    // Arrange
    const { port, calls } = stubPort([ok([]), ok([]), ok([]), ok('repo-id')])

    // Act
    await azureProvider().fetch(port, AZURE, BRANCH)

    // Assert
    expect(calls).toEqual([
      prsArgv('--status', 'active', '--top', '51'),
      prsArgv('--source-branch', 'refs/heads/feature', '--status', 'all', '--top', '1'),
      ['az', 'pipelines', 'runs', 'list', ...scope, '--top', '200', '--query-order', 'QueueTimeDesc', '--query', ANY],
      ['az', 'repos', 'show', ...scope, '--repository', 'api', '--query', 'id'],
    ])
  })

  test('calls no branch PR or branch runs without a branch', async () => {
    // Arrange
    const { port, calls } = stubPort([ok([]), ok([]), ok('repo-id')])

    // Act
    const snapshot = await azureProvider().fetch(port, AZURE, { branch: null, previous: null })

    // Assert
    expect(calls.map(argv => argv.slice(0, 4))).toEqual([
      ['az', 'repos', 'pr', 'list'],
      ['az', 'pipelines', 'runs', 'list'],
      ['az', 'repos', 'show', '--org'],
    ])
    expect(snapshot.branchRuns).toBeNull()
    expect(snapshot.branchPr).toBeNull()
  })

  test('lists the latest run of each definition for a PR and the branch, newest first, five at most', async () => {
    // Arrange
    const run = (definition: number, branch: string) => ({ id: 100 + definition, branch, status: 'completed', result: 'succeeded', name: `def-${definition}`, definition, repo: 'repo-id' })
    const runs = [
      run(1, 'refs/pull/7/merge'), run(2, 'refs/pull/7/merge'), run(1, 'refs/pull/7/merge'),
      run(3, 'refs/pull/7/merge'), run(4, 'refs/pull/7/merge'), run(5, 'refs/pull/7/merge'), run(6, 'refs/pull/7/merge'),
      run(9, 'refs/heads/feature'),
    ]
    const { port } = stubPort([ok([azPr(7)]), ok([]), ok(runs), ok('repo-id')])

    // Act
    const snapshot = await azureProvider().fetch(port, AZURE, BRANCH)

    // Assert
    expect(snapshot.repo?.prs[0]?.runs.map(listed => listed.name)).toEqual(['def-1', 'def-2', 'def-3', 'def-4', 'def-5'])
    expect(snapshot.repo?.prs[0]?.run?.name).toBe('def-1')
    expect(snapshot.branchRuns?.map(listed => listed.name)).toEqual(['def-9'])
  })

  test('a PR with no runs lists none, and a failed runs call keeps its last runs', async () => {
    // Arrange
    const old = { name: 'old', state: 'succeeded' as const, url: 'https://dev.azure.com/o' }
    const previous: RepoPrs = {
      slug: 'Titan Accounts/api',
      url: 'https://dev.azure.com/commify/Titan%20Accounts/_git/api/pullrequests',
      prs: [{ number: 7, title: 'PR 7', author: 'Bob', isDraft: false, url: 'x', review: 'required', comments: null, threads: null, runs: [old], run: old }],
    }
    const idle = stubPort([ok([azPr(7)]), ok([]), ok('repo-id')])
    const failed = stubPort([ok([azPr(7)]), fail('TF400'), ok('repo-id')])

    // Act
    const none = await azureProvider().fetch(idle.port, AZURE, { branch: null, previous: null })
    const kept = await azureProvider().fetch(failed.port, AZURE, { branch: null, previous })

    // Assert
    expect(none.repo?.prs[0]?.runs).toEqual([])
    expect(kept.repo?.prs[0]?.runs).toEqual([old])
    expect(kept.repo?.prs[0]?.run).toEqual(old)
  })

  test('the threads call for each PR names the PR and the project, and counts text comments through publish', async () => {
    // Arrange
    const threads = [
      { isDeleted: false, comments: [{ type: 'text', isDeleted: null }, { type: 'system', isDeleted: null }] },
      { isDeleted: true, comments: [{ type: 'text', isDeleted: null }] },
    ]
    const provider = azureProvider()
    const listing = stubPort([ok([azPr(7)]), ok([]), ok('repo-id')])
    const shown = (await provider.fetch(listing.port, AZURE, { branch: null, previous: null })).repo
    if (!shown) throw new Error('expected a repo')
    const shownPr = shown.prs[0]
    if (!shownPr) throw new Error('expected a PR')
    const published: OpenPr[] = []
    const count = stubPort([ok(threads)])

    // Act
    await provider.countComments?.(count.port, AZURE, shown, async change => {
      published.push(change(shownPr))
    })

    // Assert
    expect(listing.calls.map(argv => argv[1] + ' ' + argv[2])).toEqual(['repos pr', 'pipelines runs', 'repos show'])
    expect(count.calls).toEqual([
      [
        'az', 'devops', 'invoke', '--org', 'https://dev.azure.com/commify', '--area', 'git', '--resource', 'pullRequestThreads',
        '--route-parameters', 'project=Titan Accounts', 'repositoryId=api', 'pullRequestId=7', '--api-version', '7.1', '-o', 'json',
        '--query', ANY,
      ],
    ])
    expect(published.map(pr => pr.comments)).toEqual([1])
    expect(published.map(pr => pr.threads)).toEqual([{ total: 1, resolved: 0 }])
  })

  test('counts review threads by status, leaving out deleted and system-only threads', async () => {
    // Arrange
    const threads = [
      { isDeleted: false, status: 'active', comments: [{ type: 'text', isDeleted: false }] },
      { isDeleted: false, status: 'fixed', comments: [{ type: 'text', isDeleted: false }, { type: 'text', isDeleted: false }] },
      { isDeleted: false, status: 'closed', comments: [{ type: 'system', isDeleted: false }] },
      { isDeleted: true, status: 'active', comments: [{ type: 'text', isDeleted: false }] },
      { isDeleted: false, status: 'byDesign', comments: [{ type: 'text', isDeleted: false }] },
      { isDeleted: false, status: 'wontFix', comments: [{ type: 'text', isDeleted: false }] },
    ]
    const provider = azureProvider()
    const listing = stubPort([ok([azPr(7)]), ok([]), ok('repo-id')])
    const shown = (await provider.fetch(listing.port, AZURE, { branch: null, previous: null })).repo
    if (!shown) throw new Error('expected a repo')
    const shownPr = shown.prs[0]
    if (!shownPr) throw new Error('expected a PR')
    const published: OpenPr[] = []

    // Act
    await provider.countComments?.(stubPort([ok(threads)]).port, AZURE, shown, async change => {
      published.push(change(shownPr))
    })

    // Assert
    expect(published.map(pr => pr.threads)).toEqual([{ total: 4, resolved: 3 }])
    expect(published.map(pr => pr.comments)).toEqual([5])
  })

  test('a failed threads call keeps the last thread counts', async () => {
    // Arrange
    const provider = azureProvider()
    const listing = stubPort([ok([azPr(7)]), ok([]), ok('repo-id')])
    const shown = (await provider.fetch(listing.port, AZURE, { branch: null, previous: null })).repo
    if (!shown) throw new Error('expected a repo')
    const shownPr = shown.prs[0]
    if (!shownPr) throw new Error('expected a PR')
    const published: OpenPr[] = []
    const first = stubPort([ok([{ isDeleted: false, status: 'active', comments: [{ type: 'text', isDeleted: false }] }])], 0)
    await provider.countComments?.(first.port, AZURE, shown, async change => {
      published.push(change(shownPr))
    })

    // Act: ten minutes later the threads call fails
    await provider.countComments?.(stubPort([fail('TF401019')], 600_000).port, AZURE, shown, async change => {
      published.push(change(shownPr))
    })

    // Assert
    expect(published.map(pr => pr.threads)).toEqual([{ total: 1, resolved: 0 }, { total: 1, resolved: 0 }])
  })

  test("joins this session's branches to the active PRs by source branch", async () => {
    // Arrange
    const { port } = stubPort([ok([{ ...azPr(7), branch: 'refs/heads/feature' }]), ok([]), ok('repo-id')])

    // Act
    const snapshot = await azureProvider().fetch(port, AZURE, {
      branch: null,
      previous: null,
      sessionBranches: [{ branch: 'feature', path: 'D:/wt/feature' }],
    })

    // Assert
    expect(snapshot.sessionBranches).toEqual([{ branch: 'feature', path: 'D:/wt/feature', prNumber: 7 }])
    expect(snapshot.repo?.prs[0]?.branch).toBe('feature')
  })

  test('a Github remote is refused', async () => {
    const { port } = stubPort([])
    await expect(azureProvider().fetch(port, { host: 'github', slug: 'o/r' }, BRANCH)).rejects.toThrow('Azure provider given a github remote')
  })
})

function azPr(number: number) {
  return { number, title: `PR ${number}`, author: 'Bob', isDraft: false, status: 'active', votes: [] }
}
