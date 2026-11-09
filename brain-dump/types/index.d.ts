/** One atomic requirement pulled out of the dump. */
export type Point = {
  id: string
  subject: string
  requirement: string
  value: string
}

/**
 * Something to ask about or assume. `kind` is internal: the owner never sees
 * the words conflict or contradiction.
 */
export type Finding = {
  id: string
  kind: 'conflict' | 'ambiguity' | 'gap'
  subject: string
  /** A wrong guess is hard to undo (deleting, security, data, money). */
  costly: boolean
  question: string
  /** At most 12 characters. */
  header: string
  /** 2 to 4 labels, the recommended one first and ending "(recommended)". */
  options: string[]
  /** What to state in Assumptions if the owner is not asked. */
  assumption: string
}

export type Answer = { findingId: string; subject: string; answer: string }

export type Sections = {
  title: string
  goal: string[]
  context: string[]
  task: string[]
  constraints: string[]
  doneWhen: string[]
  decisions: string[]
  assumptions: string[]
  /** Conflicts still open, listed above the Goal. */
  open: string[]
}

export type Stage = 'reading' | 'asking' | 'ready' | 'editing'

export type Pending = {
  dump: string
  points: Point[]
  findings: Finding[]
  answers: Answer[]
  prompt: string
  stage: Stage
  /** Epoch ms; the dump expires 24 hours later. */
  at: number
}

/** What the "ready" band shows. */
export type ReadyView = { preview: string[]; count: number }

declare module 'claude-code' {
  interface PluginState {
    'brain-dump': {
      ready: ReadyView | null
      busy: string | null
    }
  }
}
