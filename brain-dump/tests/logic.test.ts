import { expect, test } from 'claude-code/testing'

import {
  EXPIRY_MS,
  applyUpdate,
  buildPrompt,
  countWords,
  decideSubmit,
  isExpired,
  parseArgs,
  parseJson,
  shouldOffer,
  structurePrefix,
  triage,
  withGoLine,
} from '../hooks/logic'
import type { Finding, Pending } from '../types'

const NOW = 1_000_000

const finding = (id: string, kind: Finding['kind'], costly = false): Finding => ({
  id,
  kind,
  subject: id,
  costly,
  question: `Question ${id}?`,
  header: 'Scope',
  options: ['A (recommended)', 'B'],
  assumption: `Assume ${id}.`,
})

const pending = (stage: Pending['stage'], at = NOW): Pending => ({
  dump: 'the dump',
  points: [],
  findings: [],
  answers: [],
  prompt: 'the prompt',
  stage,
  at,
})

test('countWords splits on whitespace', () => {
  expect(countWords('')).toBe(0)
  expect(countWords('   \n ')).toBe(0)
  expect(countWords('one  two\nthree\tfour')).toBe(4)
})

test('shouldOffer is true at exactly minWords and above, not below', () => {
  const base = { minWords: 200, isEnabled: true, isFlowActive: false, isIgnored: false }
  expect(shouldOffer({ ...base, words: 199 })).toBe(false)
  expect(shouldOffer({ ...base, words: 200 })).toBe(true)
  expect(shouldOffer({ ...base, words: 500 })).toBe(true)
})

test('shouldOffer is false when off, mid-flow or ignored', () => {
  const base = { minWords: 200, words: 300, isEnabled: true, isFlowActive: false, isIgnored: false }
  expect(shouldOffer({ ...base, isEnabled: false })).toBe(false)
  expect(shouldOffer({ ...base, isFlowActive: true })).toBe(false)
  expect(shouldOffer({ ...base, isIgnored: true })).toBe(false)
})

test('structurePrefix takes the text after structure:', () => {
  expect(structurePrefix('structure: do the thing')).toBe('do the thing')
  expect(structurePrefix('  Structure:   do it ')).toBe('do it')
  expect(structurePrefix('structure:')).toBe('')
  expect(structurePrefix('please structure: this')).toBeNull()
  expect(structurePrefix('go')).toBeNull()
})

test('parseArgs reads on, off, empty and text', () => {
  expect(parseArgs('on')).toEqual({ kind: 'on' })
  expect(parseArgs(' OFF ')).toEqual({ kind: 'off' })
  expect(parseArgs('')).toEqual({ kind: 'bare' })
  expect(parseArgs('resume')).toEqual({ kind: 'resume' })
  expect(parseArgs('fix the export button')).toEqual({ kind: 'text', text: 'fix the export button' })
})

test('decideSubmit with no pending dump passes the prompt through', () => {
  expect(decideSubmit(null, 'go', NOW)).toEqual({ kind: 'pass' })
})

test('decideSubmit on a ready dump: go, cancel, edit, case and spaces ignored', () => {
  const p = pending('ready')
  expect(decideSubmit(p, ' Go ', NOW)).toEqual({ kind: 'go' })
  expect(decideSubmit(p, 'CANCEL', NOW)).toEqual({ kind: 'cancel' })
  expect(decideSubmit(p, 'edit', NOW)).toEqual({ kind: 'edit' })
})

test('decideSubmit on a ready dump leaves other text alone and keeps the dump', () => {
  expect(decideSubmit(pending('ready'), 'something else', NOW)).toEqual({ kind: 'pass' })
})

test('decideSubmit while asking or reading blocks every submit', () => {
  for (const stage of ['asking', 'reading'] as const) {
    expect(decideSubmit(pending(stage), 'go', NOW)).toEqual({
      kind: 'drop',
      reason: 'Finish or cancel the brain dump first.',
    })
  }
})

test('decideSubmit after edit sends the text as typed and clears the dump', () => {
  expect(decideSubmit(pending('editing'), 'go', NOW)).toEqual({ kind: 'sent-edited' })
  expect(decideSubmit(pending('editing'), 'my edited prompt', NOW)).toEqual({ kind: 'sent-edited' })
})

test('an expired dump is cleared and the prompt passes', () => {
  const old = pending('ready', NOW - EXPIRY_MS - 1)
  expect(isExpired(old, NOW)).toBe(true)
  expect(isExpired(pending('ready', NOW - EXPIRY_MS), NOW)).toBe(false)
  expect(decideSubmit(old, 'go', NOW)).toEqual({ kind: 'expired' })
})

test('triage asks conflicts, then costly ambiguities, then costly gaps', () => {
  const fs = [
    finding('g', 'gap', true),
    finding('a', 'ambiguity', true),
    finding('c', 'conflict'),
    finding('low', 'ambiguity'),
    finding('lowgap', 'gap'),
  ]
  const t = triage(fs, 8)
  expect(t.ask.map(f => f.id)).toEqual(['c', 'a', 'g'])
  expect(t.assumed.map(f => f.id)).toEqual(['low', 'lowgap'])
  expect(t.left).toEqual([])
})

test('triage past the cap leaves conflicts open and the rest become assumptions', () => {
  const fs = [finding('c1', 'conflict'), finding('c2', 'conflict'), finding('a', 'ambiguity', true)]
  const t = triage(fs, 1)
  expect(t.ask.map(f => f.id)).toEqual(['c1'])
  expect(t.left.map(f => f.id)).toEqual(['c2', 'a'])
})

test('applyUpdate replaces, adds and removes points and merges new findings', () => {
  const points = [
    { id: 'p1', subject: 'export', requirement: 'whole table', value: '' },
    { id: 'p2', subject: 'export', requirement: 'only filtered', value: '' },
  ]
  const next = applyUpdate(
    { points, findings: [finding('c', 'conflict')] },
    {
      points: [
        { id: 'p1', subject: 'export', requirement: 'only filtered', value: '' },
        { id: 'p3', subject: 'file', requirement: 'orders.csv', value: '' },
      ],
      removed: ['p2'],
      findings: [finding('new', 'gap', true)],
      resolved: ['c'],
    },
  )
  expect(next.points.map(p => p.id)).toEqual(['p1', 'p3'])
  expect(next.points[0]?.requirement).toBe('only filtered')
  expect(next.findings.map(f => f.id)).toEqual(['new'])
})

test('applyUpdate does not duplicate a finding already queued', () => {
  const next = applyUpdate(
    { points: [], findings: [finding('x', 'gap', true)] },
    { points: [], removed: [], findings: [finding('x', 'gap', true)], resolved: [] },
  )
  expect(next.findings).toHaveLength(1)
})

const SECTIONS = {
  title: 'Add CSV export',
  goal: ['Export orders'],
  context: [],
  task: ['Add a button', 'Write orders.csv'],
  constraints: [],
  doneWhen: ['The file downloads'],
}

test('buildPrompt omits empty sections and keeps the order', () => {
  const text = buildPrompt({ ...SECTIONS, decisions: [], assumptions: [], open: [] })
  expect(text).toBe(
    [
      'Add CSV export',
      '',
      '## Goal',
      '- Export orders',
      '',
      '## Task',
      '- Add a button',
      '- Write orders.csv',
      '',
      '## Done when',
      '- The file downloads',
    ].join('\n'),
  )
})

test('buildPrompt adds Decisions and Assumptions only when non-empty, and lists open items first', () => {
  const text = buildPrompt({
    ...SECTIONS,
    decisions: ['Filtered rows over the whole table (you chose this)'],
    assumptions: ['papaparse is used'],
    open: ['Whole table or filtered rows: not settled'],
  })
  expect(text.indexOf('Not settled')).toBeLessThan(text.indexOf('## Goal'))
  expect(text).toContain('## Decisions\n- Filtered rows over the whole table (you chose this)')
  expect(text).toContain('## Assumptions\n- papaparse is used')
  expect(text.indexOf('## Done when')).toBeLessThan(text.indexOf('## Decisions'))
  expect(text.indexOf('## Decisions')).toBeLessThan(text.indexOf('## Assumptions'))
})

test('the go line is only in the display text', () => {
  const sent = buildPrompt({ ...SECTIONS, decisions: [], assumptions: [], open: [] })
  expect(sent).not.toContain('Type go')
  expect(withGoLine(sent)).toContain(
    'Type go to run it, edit to change it first, or cancel to get your dump back.',
  )
})

test('parseJson reads plain JSON and fenced JSON, and returns null on junk', () => {
  expect(parseJson('{"a":1}')).toEqual({ a: 1 })
  expect(parseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  expect(parseJson('Here you go: {"a":1} done')).toEqual({ a: 1 })
  expect(parseJson('no json')).toBeNull()
  expect(parseJson('{broken')).toBeNull()
})
