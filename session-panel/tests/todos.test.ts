import { expect, test } from 'claude-code/testing'

import { applyTodoTool } from '../hooks/todos'

const PLAN = 'mcp__ccd_turn__update_plan'
const WRAP = 'mcp__ccd_turn__wrap_up'
const todo = (id: string, text: string, status: 'pending' | 'in_progress' | 'completed') => ({ id, text, status })
const items = [
  { content: 'a', status: 'in_progress' },
  { content: 'b', status: 'pending' },
  { content: 'c', status: 'pending' },
] as const

test('update_plan items replaces the list', () => {
  const out = applyTodoTool([todo('9', 'old', 'pending')], PLAN, { items })
  expect(out.map(t => [t.id, t.text, t.status])).toEqual([['0', 'a', 'in_progress'], ['1', 'b', 'pending'], ['2', 'c', 'pending']])
})

test('advance completes the current step and starts the next', () => {
  const list = applyTodoTool([], PLAN, { items })
  const out = applyTodoTool(list, PLAN, { advance: true })
  expect(out.map(t => t.status)).toEqual(['completed', 'in_progress', 'pending'])
})

test('advance with nothing in progress still starts the first pending step', () => {
  const list = [todo('0', 'a', 'completed'), todo('1', 'b', 'pending')]
  expect(applyTodoTool(list, PLAN, { advance: true }).map(t => t.status)).toEqual(['completed', 'in_progress'])
})

test('done and start use 1-based positions', () => {
  const list = applyTodoTool([], PLAN, { items })
  const out = applyTodoTool(list, PLAN, { done: [1], start: 3 })
  expect(out.map(t => t.status)).toEqual(['completed', 'pending', 'in_progress'])
})

test('wrap_up checks everything off', () => {
  const out = applyTodoTool(applyTodoTool([], PLAN, { items }), WRAP, {})
  expect(out.every(t => t.status === 'completed')).toBe(true)
})

test('TodoWrite replaces the list', () => {
  const out = applyTodoTool([todo('x', 'old', 'pending')], 'TodoWrite', { todos: [{ content: 'new', status: 'pending' as const }] })
  expect(out).toEqual([todo('0', 'new', 'pending')])
})

test('TaskCreate appends with the engine id, and nothing without one', () => {
  const made = applyTodoTool([], 'TaskCreate', { subject: 'job' }, { result: { task: { id: 7 } } })
  expect(made).toEqual([todo('7', 'job', 'pending')])
  expect(applyTodoTool([], 'TaskCreate', { subject: 'job' }, { result: {} })).toEqual([])
})

test('TaskUpdate renames, changes status, and deletes', () => {
  const list = [todo('1', 'a', 'pending'), todo('2', 'b', 'pending')]
  expect(applyTodoTool(list, 'TaskUpdate', { taskId: 1, subject: 'A', status: 'completed' })[0]).toEqual(todo('1', 'A', 'completed'))
  expect(applyTodoTool(list, 'TaskUpdate', { taskId: 1, status: 'deleted' }).map(t => t.id)).toEqual(['2'])
})

test('other tools leave the list alone', () => {
  const list = [todo('1', 'a', 'pending')]
  expect(applyTodoTool(list, 'Read', {})).toBe(list)
})
