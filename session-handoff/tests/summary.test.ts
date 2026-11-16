import { expect, test } from 'claude-code/testing'

import { raceSummary, summaryDetail, summaryText } from '../hooks/summary'

const ANSWER = { isAnswered: true as const, text: '  ## Goal\nShip it.  ' }
const NOT = { isAnswered: false as const, text: undefined, reason: 'api-error' }

// A promise the test settles by hand, so the order of the race is set by the test.
const deferred = <T>() => {
  let settle!: (value: T) => void
  const promise = new Promise<T>(resolve => (settle = resolve))
  return { promise, settle }
}

test('summaryText is the trimmed reply when answered and not blank, else null', () => {
  const table: [unknown, string | null][] = [
    [null, null],
    [undefined, null],
    [NOT, null],
    [{ isAnswered: true, text: '   ' }, null],
    [ANSWER, '## Goal\nShip it.'],
  ]
  for (const [reply, expected] of table) {
    expect(summaryText(reply as never)).toBe(expected)
  }
})

test('summaryDetail says where the summary came from, by the answered flag', () => {
  expect(summaryDetail(ANSWER as never)).toBe('summary by the model')
  expect(summaryDetail(NOT as never)).toBe('summary from last requests')
  expect(summaryDetail(null)).toBe('summary from last requests')
  // Pinned as it is today: an answer with blank text is still "by the model",
  // though the narrative falls back. Divergence noted in ticket 06.
  expect(summaryDetail({ isAnswered: true, text: '' } as never)).toBe('summary by the model')
  expect(summaryText({ isAnswered: true, text: '' } as never)).toBe(null)
})

test('raceSummary keeps the reply when it lands before the deadline', async () => {
  const late = deferred<never>()
  expect(await raceSummary(Promise.resolve(ANSWER) as never, late.promise.then(() => null))).toBe(ANSWER as never)
})

test('raceSummary gives null when the deadline lands before the reply', async () => {
  const reply = deferred<typeof ANSWER>()
  const result = raceSummary(reply.promise as never, Promise.resolve(null))
  reply.settle(ANSWER)
  expect(await result).toBe(null)
})

test('raceSummary keeps the reply when both have settled, the reply listed first', async () => {
  expect(await raceSummary(Promise.resolve(ANSWER) as never, Promise.resolve(null))).toBe(ANSWER as never)
})

test('raceSummary gives null when the model call fails', async () => {
  expect(await raceSummary(Promise.reject(new Error('api')) as never, new Promise(() => {}))).toBe(null)
})
