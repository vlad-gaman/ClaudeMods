import { expect, test } from 'claude-code/testing'

import { savePlan } from '../hooks/save'

const NOW = Date.UTC(2026, 10, 4, 12)

test('savePlan names the files, writes the document then the prompt, and sets the view', () => {
  const plan = savePlan('/d', NOW, 'abcdef123456', '/p', 'DOC')
  const path = '/d/2026-11-04T12-00-00-abcdef12.md'
  const promptPath = '/d/2026-11-04T12-00-00-abcdef12.prompt.txt'
  expect(plan.path).toBe(path)
  expect(plan.promptPath).toBe(promptPath)
  expect(plan.prompt).toContain(`read the handoff file at ${path} (working directory: /p)`)
  expect(plan.writes).toEqual([
    { path, text: 'DOC' },
    { path: promptPath, text: plan.prompt },
  ])
  expect(plan.view).toEqual({ path, promptPath, prompt: plan.prompt, cwd: '/p' })
})

test('the document is written before the prompt', () => {
  const [first, second] = savePlan('/d', NOW, 'abcdef123456', '/p', 'DOC').writes
  expect(first!.path.endsWith('.md')).toBe(true)
  expect(second!.path.endsWith('.prompt.txt')).toBe(true)
})
