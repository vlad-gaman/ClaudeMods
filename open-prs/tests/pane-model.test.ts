import { describe, expect, test } from 'claude-code/testing'
import { type PaneAtoms, paneModelOf } from '../hooks/pane-model'
import { LIMIT } from '../hooks/provider'
import type { OpenPr, Run } from '../types'

const pr = (number: number, over: Partial<OpenPr> = {}): OpenPr => ({
  number,
  title: `PR ${number}`,
  author: 'alice',
  isDraft: false,
  url: `https://github.com/o/r/pull/${number}`,
  branch: `b${number}`,
  review: 'required',
  comments: null,
  threads: null,
  runs: [],
  run: null,
  ...over,
})
const run = (state: Run['state']): Run => ({ name: 'ci', state, url: 'https://ci' })
const failure = { command: 'gh pr list', exitCode: 1, isTimeout: false, at: 0, message: 'boom' }

const atoms = (over: Partial<PaneAtoms> = {}): PaneAtoms => ({
  isLoaded: true,
  repo: { slug: 'o/r', url: 'https://github.com/o/r', prs: [] },
  branchPr: null,
  sessionBranches: [],
  branchRuns: [],
  failedCli: null,
  isRefreshing: false,
  remoteNote: 'origin is x',
  cliErrors: [],
  collapsed: [],
  ...over,
})
const withPrs = (prs: OpenPr[], over: Partial<PaneAtoms> = {}) => atoms({ repo: { slug: 'o/r', url: 'https://github.com/o/r', prs }, ...over })

describe('paneModelOf state', () => {
  const cases: [string, PaneAtoms, string][] = [
    ['not loaded is loading, whatever else is set', atoms({ isLoaded: false, failedCli: 'gh' }), 'loading'],
    ['an answer with a failed call is ready: the last answer stays', atoms({ failedCli: 'gh' }), 'ready'],
    ['a failed call with no answer is failed', atoms({ repo: null, failedCli: 'az' }), 'failed'],
    ['no answer and no failure is no-remote', atoms({ repo: null }), 'no-remote'],
  ]
  for (const [name, input, state] of cases) test(name, () => expect(paneModelOf(input).state).toBe(state))

  test('failed names the tool and carries the note and errors', () => {
    const model = paneModelOf(atoms({ repo: null, failedCli: 'az', isRefreshing: true, cliErrors: [failure] }))
    expect(model).toEqual({ state: 'failed', cli: 'az', isRefreshing: true, errors: { errors: [failure], isFolded: false } })
  })

  test('no-remote carries the note', () => {
    expect(paneModelOf(atoms({ repo: null, remoteNote: 'not in a git repo' }))).toEqual({ state: 'no-remote', note: 'not in a git repo' })
  })
})

describe('paneModelOf ready', () => {
  const ready = (input: PaneAtoms) => {
    const model = paneModelOf(input)
    if (model.state !== 'ready') throw new Error(`expected ready, got ${model.state}`)
    return model
  }

  test('a session PR is in the session card only, not again in Other', () => {
    const model = ready(withPrs([pr(12), pr(15)], { sessionBranches: [{ branch: 'b12', path: '/w', prNumber: 12 }] }))
    expect(model.session.rows.map(row => row.pr?.number)).toEqual([12])
    expect(model.other.groups.flatMap(group => group.prs.map(item => item.number))).toEqual([15])
    expect(model.other.count).toBe(1)
  })

  test('Other lists LIMIT PRs and says the count is capped past it', () => {
    const many = Array.from({ length: LIMIT + 1 }, (_, i) => pr(i + 1))
    const model = ready(withPrs(many))
    expect(model.other.groups.flatMap(group => group.prs)).toHaveLength(LIMIT)
    expect(model.other.count).toBe(LIMIT + 1)
    expect(model.other.isCapped).toBe(true)
    expect(ready(withPrs(many.slice(0, LIMIT))).other.isCapped).toBe(false)
  })

  test('the figures count only the listed PRs', () => {
    const many = Array.from({ length: LIMIT + 1 }, (_, i) => pr(i + 1, { run: run('succeeded'), threads: { total: 2, resolved: 1 } }))
    const { other } = ready(withPrs(many))
    expect(other.ci).toEqual({ ok: LIMIT, total: LIMIT })
    expect(other.threads).toEqual({ resolved: LIMIT, total: 2 * LIMIT })
    expect(other.counts).toEqual([{ key: 'required', n: LIMIT }])
  })

  test('a branch without a PR counts as no PR, and the own branch carries the branch runs', () => {
    const { session } = ready(withPrs([], { sessionBranches: [{ branch: 'feature', path: null, prNumber: null }], branchRuns: [run('failed')] }))
    expect(session.count).toBe(1)
    expect(session.counts).toEqual([{ key: 'none', n: 1 }])
    expect(session.rows[0]?.runs).toEqual([run('failed')])
  })

  test('each card folds on its own id, and errors carry theirs', () => {
    const model = ready(withPrs([], { collapsed: ['other', 'errors'], cliErrors: [failure] }))
    expect([model.session.isFolded, model.other.isFolded]).toEqual([false, true])
    expect(model.errors).toEqual({ errors: [failure], isFolded: true })
  })

  test('no errors card while there are no errors', () => {
    expect(ready(withPrs([])).errors).toBeNull()
  })
})
