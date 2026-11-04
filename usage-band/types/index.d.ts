export type Window = { percentUsed: number; resetsAt?: string }

export type Figures = {
  contextPercent?: number
  contextTokens?: number
  contextWindow?: number
  costUsd?: number
  fiveHour?: Window
  week?: Window
}

export type ChatTokens = { startedAt: number; up: number; down: number; cacheRead: number; cachedAt?: number }

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { figures: Figures | null; chat: ChatTokens | null; isHidden: boolean; compactWindow: number | null }
  }
}
