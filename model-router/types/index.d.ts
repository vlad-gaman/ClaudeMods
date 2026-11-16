export type ModelTier = 'haiku' | 'sonnet' | 'opus'
export type Choice = { tier: ModelTier; reason: string }
export type Lock = Choice & { sessionModel: string; startedAt: number; isPinned?: boolean }
export type SkillMode = 'fork' | 'inline'
export type SkillRun = {
  at: string
  skill: string
  mode: SkillMode
  pick: string
  models: string[]
  seconds: number
  usd?: number
  outcome?: 'failed' | 'background' | 'interrupted'
}

declare module 'claude-code' {
  interface PluginState {
    'model-router': { lock: Lock | null; isOff: boolean }
  }
}
