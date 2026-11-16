import { expect, test } from 'claude-code/testing'

import { VERIFY_FAILED, verifySaved } from '../hooks/verify'

const DOC = '# Handoff\n\n## Recent user requests\n1. ask\n'
const PROMPT = 'Continue the work.'
const EXPECTED = { doc: DOC, prompt: PROMPT }

test('verifySaved accepts the files as written and counts the document characters', () => {
  expect(verifySaved({ doc: DOC, prompt: PROMPT }, EXPECTED)).toEqual({ isOk: true, characters: DOC.length })
})

test('verifySaved rejects each mismatch with its own reason and the shared message', () => {
  const table: [string, { doc: unknown; prompt: unknown }, string][] = [
    ['doc-unreadable', { doc: undefined, prompt: PROMPT }, 'doc-unreadable'],
    ['doc-length', { doc: DOC + 'x', prompt: PROMPT }, 'doc-length'],
    ['doc-section', { doc: DOC.replace('user requests', 'xxxx requests'), prompt: PROMPT }, 'doc-section'],
    ['prompt-unreadable', { doc: DOC, prompt: null }, 'prompt-unreadable'],
    ['prompt-differs', { doc: DOC, prompt: PROMPT + '.' }, 'prompt-differs'],
  ]
  for (const [name, saved, reason] of table) {
    expect([name, verifySaved(saved, EXPECTED)]).toEqual([
      name,
      { isOk: false, reason, message: VERIFY_FAILED },
    ])
  }
})

test('the shared message is the text the failed check shows', () => {
  expect(VERIFY_FAILED).toBe('the saved file does not match what was written')
})
