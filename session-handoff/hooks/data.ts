import type { HandoffView } from '../types'

// The six steps of a handoff, in order, by name. A step's place in the band
// is its place here, so the order is set in one spot.
export const STEP_LABELS = {
  read: 'Read the conversation',
  files: 'Find the files used',
  links: 'List skills, tools and links',
  write: 'Write the handoff',
  save: 'Save it',
  check: 'Check it',
} as const

export type StepName = keyof typeof STEP_LABELS

export const STEPS = Object.keys(STEP_LABELS) as StepName[]

export const TITLES: Record<HandoffView['trigger'], string> = {
  command: 'Handoff requested',
  cache: 'Prompt cache goes cold soon',
  context: 'Context window is getting full',
}

export const READ_TOOLS = new Set(['Read'])
export const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

// The prompt cache stays warm this many minutes after a turn.
export const CACHE_TTL_MIN = 60
// The cache trigger runs the handoff this many minutes before the cache goes cold.
export const RUN_BEFORE_COLD_MIN = 5
// The context trigger fires once the context passes this many tokens.
export const CONTEXT_THRESHOLD = 250000
// It is re-armed once the context falls below this share of the threshold.
export const CONTEXT_REARM = 0.8

// The model gets this long to write the summary before the fallback is used.
export const SUMMARY_TIMEOUT_MS = 120000

// How many of the latest user requests the handoff lists.
export const RECENT_REQUESTS = 6
// How many links the handoff lists.
export const MAX_LINKS = 40

// A handoff shorter than this many characters is passed to a new chat as the
// prompt itself; a longer one is passed by path. The app takes at most 14,336
// characters of prompt, and URL-encoding makes the text longer, so the
// cut-off sits well below that.
export const INLINE_PROMPT_MAX = 8000

export const SUMMARY_PROMPT =
  'Write a handoff summary of this session for a fresh session that will continue the work. ' +
  'Use exactly these sections as markdown headings: Goal, Current state, Decisions and why, ' +
  'Open problems, Next steps (numbered, concrete, in order). Name real files and commands. ' +
  'Facts only from this conversation, no preamble, at most 450 words. Do not call tools.'
