import { describe, expect, test } from 'claude-code/testing'
import {
  bar,
  ciTotals,
  failureKind,
  groupByStatus,
  noun,
  segmentWidths,
  sessionRows,
  statusBar,
  statusCounts,
  statusOf,
  threadText,
  threadTotals,
} from '../hooks/cards'
import type { BranchPr, OpenPr, Run } from '../types'

const run = (state: Run['state'], name = 'ci'): Run => ({ name, state, url: `https://ci/${name}` })
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

describe('bar', () => {
  test('fills the share of the width that is done, and leaves the rest empty', () => {
    expect(bar(3, 5)).toBe('██████░░░░')
    expect(bar(1, 3, 4)).toBe('█░░░')
    expect(bar(5, 5)).toBe('██████████')
  })

  test('is all empty when nothing is counted yet', () => {
    expect(bar(0, 0)).toBe('░░░░░░░░░░')
  })
})

describe('threadText', () => {
  test('shows the bar with resolved over total', () => {
    expect(threadText({ total: 5, resolved: 3 })).toBe('██████░░░░ 3/5 resolved')
    expect(threadText({ total: 0, resolved: 0 })).toBe('░░░░░░░░░░ 0/0 resolved')
  })

  test('shows nothing while the count is unknown', () => {
    expect(threadText(null)).toBeNull()
  })
})

describe('statusOf', () => {
  test('a draft is a draft whatever its review state', () => {
    expect(statusOf({ isDraft: true, review: 'changes' })).toBe('draft')
  })

  test('an open PR takes its review state', () => {
    expect(statusOf({ isDraft: false, review: 'changes' })).toBe('changes')
    expect(statusOf({ isDraft: false, review: 'required' })).toBe('required')
    expect(statusOf({ isDraft: false, review: 'approved' })).toBe('approved')
  })
})

describe('statusCounts', () => {
  test('counts each status in card order, leaving out the empty ones', () => {
    expect(statusCounts(['draft', 'changes', 'draft', 'none'])).toEqual([
      { key: 'changes', n: 1 },
      { key: 'draft', n: 2 },
      { key: 'none', n: 1 },
    ])
  })
})

describe('segmentWidths', () => {
  test('splits the width by share, every counted segment at least one cell, summing to the width', () => {
    expect(segmentWidths([2, 1, 0, 1], 40)).toEqual([20, 10, 0, 10])
    expect(segmentWidths([1, 1, 1], 10)).toEqual([4, 3, 3])
    expect(segmentWidths([1, 99], 10).reduce((a, b) => a + b, 0)).toBe(10)
    expect(segmentWidths([1, 99], 10)[0]).toBeGreaterThanOrEqual(1)
  })

  test('nothing counted gives no width', () => {
    expect(segmentWidths([], 40)).toEqual([])
    expect(segmentWidths([0, 0], 10)).toEqual([0, 0])
  })
})

describe('statusBar', () => {
  test('gives each status its width, the no-PR segment last', () => {
    expect(
      statusBar(
        [
          { key: 'changes', n: 1 },
          { key: 'none', n: 3 },
        ],
        40,
      ),
    ).toEqual([
      { key: 'changes', width: 10 },
      { key: 'none', width: 30 },
    ])
  })
})

describe('sessionRows', () => {
  test('joins each branch to its open PR, and a branch with none says so', () => {
    const open = pr(12, { threads: { total: 5, resolved: 3 }, runs: [run('failed')], run: run('failed') })

    const rows = sessionRows(
      [
        { branch: 'a', path: '/w/a', prNumber: 12 },
        { branch: 'b', path: null, prNumber: null },
      ],
      [open],
      null,
      [run('succeeded')],
    )

    expect(rows).toEqual([
      {
        branch: 'a',
        path: '/w/a',
        pr: { number: 12, title: 'PR 12', url: 'https://github.com/o/r/pull/12', status: 'required' },
        threads: { total: 5, resolved: 3 },
        runs: [run('failed')],
      },
      { branch: 'b', path: null, pr: null, threads: null, runs: [] },
    ])
  })

  test("the own branch's PR shows even when it is not open, with the branch runs", () => {
    const branchPr: BranchPr = { number: 9, title: 'Old', state: 'merged' }

    const rows = sessionRows([{ branch: 'a', path: '/repo', prNumber: null }], [], branchPr, [run('succeeded')])

    expect(rows).toEqual([
      { branch: 'a', path: '/repo', pr: { number: 9, title: 'Old', url: null, status: 'merged' }, threads: null, runs: [run('succeeded')] },
    ])
  })

  test("the own branch's open PR is read from the list, not the branch answer", () => {
    const branchPr: BranchPr = { number: 12, title: 'PR 12', state: 'open' }

    const [row] = sessionRows([{ branch: 'a', path: '/repo', prNumber: null }], [pr(12, { review: 'approved' })], branchPr, [])

    expect(row?.pr).toEqual({ number: 12, title: 'PR 12', url: 'https://github.com/o/r/pull/12', status: 'approved' })
  })

  test('only the own branch takes the branch runs', () => {
    const rows = sessionRows(
      [
        { branch: 'a', path: '/repo', prNumber: null },
        { branch: 'c', path: '/w/c', prNumber: null },
      ],
      [],
      null,
      [run('running')],
    )

    expect(rows[0]?.runs).toEqual([run('running')])
    expect(rows[1]?.runs).toEqual([])
  })
})

describe('groupByStatus', () => {
  test('groups the PRs in card order, leaving out the empty groups', () => {
    const prs = [pr(1, { isDraft: true }), pr(2, { review: 'changes' }), pr(3, { review: 'required' }), pr(4, { review: 'changes' })]

    expect(groupByStatus(prs).map(group => [group.status, group.prs.map(item => item.number)])).toEqual([
      ['changes', [2, 4]],
      ['required', [3]],
      ['draft', [1]],
    ])
  })
})

describe('totals', () => {
  test('threads sum the PRs that have a count', () => {
    expect(threadTotals([{ total: 5, resolved: 3 }, null, { total: 2, resolved: 2 }])).toEqual({ resolved: 5, total: 7 })
  })

  test('CI counts the PRs with a run and how many of those succeeded', () => {
    expect(ciTotals([run('succeeded'), run('failed'), null])).toEqual({ ok: 1, total: 2 })
  })
})

describe('failureKind and noun', () => {
  test('says what kind of failure a CLI call was', () => {
    expect(failureKind({ exitCode: 1, isTimeout: false })).toBe('exit 1')
    expect(failureKind({ exitCode: null, isTimeout: true })).toBe('timed out')
    expect(failureKind({ exitCode: null, isTimeout: false })).toBe('could not run')
  })

  test('picks the singular or plural noun for a count', () => {
    expect(noun(1, 'branch', 'branches')).toBe('1 branch')
    expect(noun(0, 'branch', 'branches')).toBe('0 branches')
    expect(noun(2, 'branch', 'branches')).toBe('2 branches')
  })
})
