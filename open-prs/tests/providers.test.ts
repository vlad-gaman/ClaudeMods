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
      ['gh', 'pr', 'list', '-R', 'esendex/api', '--state', 'open', '--limit', '51', '--json', 'number,title,author,isDraft,url,reviewDecision,latestReviews,statusCheckRollup'],
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
    expect(snapshot.branchRun).toBeNull()
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
          review: 'approved',
          comments: 3,
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

  test('a gh call that cannot run is unknown: the repo is left as it was', async () => {
    // Arrange
    const { port } = stubPort(['throw', fail(NO_PR), ok(counts())])

    // Act
    const snapshot = await githubProvider().fetch(port, GITHUB, { branch: null, previous: null })

    // Assert
    expect(snapshot.repo).toBeUndefined()
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
    expect(snapshot.branchRun).toBeNull()
    expect(snapshot.branchPr).toBeNull()
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
  })

  test('a Github remote is refused', async () => {
    const { port } = stubPort([])
    await expect(azureProvider().fetch(port, { host: 'github', slug: 'o/r' }, BRANCH)).rejects.toThrow('Azure provider given a github remote')
  })
})

function azPr(number: number) {
  return { number, title: `PR ${number}`, author: 'Bob', isDraft: false, status: 'active', votes: [] }
}
