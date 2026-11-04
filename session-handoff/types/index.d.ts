export type HandoffStep = {
  label: string
  status: 'pending' | 'running' | 'done' | 'error'
  detail?: string
}

export type HandoffView = {
  id: number
  trigger: 'command' | 'cache' | 'context'
  title: string
  steps: HandoffStep[]
  phase: 'working' | 'ready' | 'failed'
  path?: string
  promptPath?: string
  prompt?: string
  cwd?: string
  isDismissed: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'session-handoff': { view: HandoffView | null }
  }
}
