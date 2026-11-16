import { expect, test } from 'claude-code/testing'

import { failed, stepList, withStep } from '../hooks/steps'
import type { StepName } from '../hooks/data'

const NAMES: StepName[] = ['read', 'files', 'links', 'write', 'save', 'check']
const LABELS = [
  'Read the conversation',
  'Find the files used',
  'List skills, tools and links',
  'Write the handoff',
  'Save it',
  'Check it',
]

test('stepList gives the six steps in order, all waiting', () => {
  expect(stepList()).toEqual(LABELS.map(label => ({ label, status: 'pending' })))
})

test('withStep sets the status and detail of the named step only, and does not mutate', () => {
  const start = stepList()
  for (const [n, name] of NAMES.entries()) {
    const after = withStep(start, name, 'done', `detail ${n}`)
    expect(after[n]).toEqual({ label: LABELS[n], status: 'done', detail: `detail ${n}` })
    expect(after.filter((_, i) => i !== n)).toEqual(start.filter((_, i) => i !== n))
  }
  expect(start.every(s => s.status === 'pending')).toBe(true)
})

test('failed marks the named step as an error with the message and ends the phase', () => {
  for (const [n, name] of NAMES.entries()) {
    const out = failed(stepList(), name, new Error('boom'))
    expect(out.phase).toBe('failed')
    expect(out.steps[n]).toEqual({ label: LABELS[n], status: 'error', detail: 'boom' })
    expect(out.steps.filter((_, i) => i !== n).every(s => s.status === 'pending')).toBe(true)
  }
})

test('failed turns a thrown non-Error into its text', () => {
  expect(failed(stepList(), 'save', 'disk full').steps[4]).toMatchObject({ detail: 'disk full' })
})
