import { expect, test } from 'claude-code/testing'
import type { RepoPrs } from '../types'
import { INERT, outcomeOf, publish, writesOf } from '../hooks/snapshot'

const repo = { prs: [{ number: 1 }] } as unknown as RepoPrs
const empty = { prs: [] } as unknown as RepoPrs

test('writesOf: a field left undefined is absent, so the atom keeps its last answer', () => {
  expect(writesOf({})).toEqual({})
})

test('writesOf: null clears an atom: repo and branchPr to null, branchRuns to an empty list', () => {
  expect(writesOf({ repo: null, branchPr: null, branchRuns: null })).toEqual({ repo: null, branchPr: null, branchRuns: [] })
})

test('writesOf: a value replaces the atom', () => {
  const branchPr = { number: 1, title: 't', state: 'OPEN', isDraft: false } as never
  const sessionBranches = [{ branch: 'a', path: null, prNumber: 1 }]
  expect(writesOf({ repo, branchPr, branchRuns: [], sessionBranches })).toEqual({ repo, branchPr, branchRuns: [], sessionBranches })
})

test('writesOf: an empty session branch list clears, an undefined one keeps', () => {
  expect(writesOf({ sessionBranches: [] })).toEqual({ sessionBranches: [] })
  expect('sessionBranches' in writesOf({ repo })).toBe(false)
})

test('outcomeOf: a failed repo lookup names the provider tool', () => {
  expect(outcomeOf({ branchPr: null }, { cli: 'gh' })).toEqual({ failed: 'gh', hasPrs: false })
})

test('outcomeOf: no provider (no remote) never fails', () => {
  expect(outcomeOf({ repo: null }, null)).toEqual({ failed: null, hasPrs: false })
  expect(outcomeOf({}, null).failed).toBeNull()
})

test('outcomeOf: hasPrs only when the list has PRs', () => {
  expect(outcomeOf({ repo }, { cli: 'az' })).toEqual({ failed: null, hasPrs: true })
  expect(outcomeOf({ repo: empty }, { cli: 'az' })).toEqual({ failed: null, hasPrs: false })
})

test('INERT: nothing to retry and nothing to open', () => {
  expect(INERT).toEqual({ failed: null, hasPrs: false })
})

test('publish: a register superseded mid-fetch changes no atom and returns the inert outcome', async () => {
  const applied: unknown[] = []
  const outcome = await publish({ repo }, { cli: 'gh' }, { isLive: async () => false, apply: async (...args) => void applied.push(args) })
  expect(applied).toEqual([])
  expect(outcome).toEqual(INERT)
})

test('publish: a live register applies the whole snapshot once, with the failed tool, and returns the outcome', async () => {
  const applied: unknown[] = []
  const outcome = await publish({ repo, branchPr: null }, { cli: 'gh' }, { isLive: async () => true, apply: async (...args) => void applied.push(args) })
  expect(applied).toEqual([[{ repo, branchPr: null }, null]])
  expect(outcome).toEqual({ failed: null, hasPrs: true })
})
