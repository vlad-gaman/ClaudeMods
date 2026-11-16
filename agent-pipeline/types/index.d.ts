export type PipelineRun = { ticket: string; startedAt: number }

declare module 'claude-code' {
  interface PluginState {
    'agent-pipeline': { run: PipelineRun | null }
  }
}
