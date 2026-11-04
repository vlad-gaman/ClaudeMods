import type { Todo } from '../types'

type Item = { content: string; status: Todo['status'] }

// What the task-list tools are called with: only the fields each one reads.
export type TodoInput = {
  todos?: readonly Item[]
  items?: readonly Item[]
  advance?: boolean
  done?: readonly number[]
  start?: number
  taskId?: string | number
  subject?: string
  status?: Todo['status'] | 'deleted'
}

// What TaskCreate answers.
export type TodoResult = { result?: { task?: { id?: string | number } } }

// The tools that edit the to-do list. TaskCreate is the one whose result is needed (it carries the new id).
export const TODO_TOOLS = new Set(['mcp__ccd_turn__update_plan', 'mcp__ccd_turn__wrap_up', 'TodoWrite', 'TaskCreate', 'TaskUpdate'])

const fromItems = (items: readonly Item[]): Todo[] => items.map((t, i) => ({ id: String(i), text: t.content, status: t.status }))

// The to-do list after one task-list tool call. `input` is the call's arguments, `result` what the tool answered.
// The desktop app's update_plan: items replaces the list, advance/done/start move the marks, wrap_up checks all off.
export const applyTodoTool = (todos: Todo[], tool: string, input: TodoInput, result?: TodoResult): Todo[] => {
  if (tool === 'mcp__ccd_turn__wrap_up') return todos.map(t => ({ ...t, status: 'completed' as const }))

  if (tool === 'TodoWrite') return fromItems(input.todos ?? [])

  if (tool === 'TaskCreate') {
    const id = result?.result?.task?.id
    return id === undefined ? todos : [...todos, { id: String(id), text: input.subject ?? '', status: 'pending' as const }]
  }

  if (tool === 'TaskUpdate')
    return todos
      .filter(t => !(t.id === String(input.taskId) && input.status === 'deleted'))
      .map(t =>
        t.id === String(input.taskId)
          ? { ...t, text: input.subject ?? t.text, status: input.status && input.status !== 'deleted' ? input.status : t.status }
          : t,
      )

  if (tool === 'mcp__ccd_turn__update_plan') {
    let list: Todo[] = Array.isArray(input.items) ? fromItems(input.items) : todos
    if (input.advance) {
      const i = list.findIndex(t => t.status === 'in_progress')
      list = list.map((t, k) => (k === i ? { ...t, status: 'completed' as const } : t))
      const n = list.findIndex(t => t.status === 'pending')
      if (n >= 0) list = list.map((t, k) => (k === n ? { ...t, status: 'in_progress' as const } : t))
    }
    const done = input.done
    if (Array.isArray(done)) list = list.map((t, k) => (done.includes(k + 1) ? { ...t, status: 'completed' as const } : t))
    const start = input.start
    if (typeof start === 'number') list = list.map((t, k) => (k === start - 1 ? { ...t, status: 'in_progress' as const } : t))
    return list
  }

  return todos
}
