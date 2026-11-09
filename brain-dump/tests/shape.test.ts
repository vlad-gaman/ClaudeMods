import { expect, test } from 'claude-code/testing'

import { toFindings, toOptions, toPoints, toSections, toUpdate } from '../hooks/shape'

test('toOptions keeps 2 to 4 labels and marks the first as recommended', () => {
  expect(toOptions(['A', 'B', 'C', 'D', 'E'])).toEqual(['A (recommended)', 'B', 'C', 'D'])
  expect(toOptions(['A (recommended)', 'B'])).toEqual(['A (recommended)', 'B'])
  expect(toOptions([])).toEqual(['Yes (recommended)', 'No'])
  expect(toOptions('junk')).toEqual(['Yes (recommended)', 'No'])
})

test('toFindings cuts the header to 12 characters and drops entries with no question', () => {
  const got = toFindings([
    { id: 'f1', kind: 'conflict', question: 'Which?', header: 'A very long header', options: ['X', 'Y'], costly: true },
    { id: 'f2', kind: 'gap' },
    { kind: 'weird', question: 'Q?' },
  ])
  expect(got).toHaveLength(2)
  expect(got[0]).toMatchObject({ id: 'f1', kind: 'conflict', header: 'A very long ', costly: true })
  expect(got[1]).toMatchObject({ id: 'f3', kind: 'gap', costly: false, assumption: 'Q?' })
})

test('toPoints, toUpdate and toSections survive missing fields', () => {
  expect(toPoints([{ requirement: 'a' }, { id: 'x' }])).toEqual([
    { id: 'p1', subject: '', requirement: 'a', value: '' },
  ])
  expect(toUpdate(null)).toEqual({ points: [], removed: [], findings: [], resolved: [] })
  expect(toSections({ goal: ['g', 3], task: 'no' })).toMatchObject({ title: 'Task', goal: ['g'], task: [] })
})
