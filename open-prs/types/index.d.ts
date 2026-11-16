export type PrState = 'open' | 'draft' | 'merged' | 'closed'

export type RunState = 'queued' | 'running' | 'succeeded' | 'partial' | 'failed' | 'cancelled'

export type Run = { name: string; state: RunState; url: string }

export type ReviewState = 'approved' | 'changes' | 'required'

export type OpenPr = {
  number: number
  title: string
  author: string
  isDraft: boolean
  url: string
  review: ReviewState
  comments: number | null
  run: Run | null
}

export type RepoPrs = { slug: string; url: string; prs: OpenPr[] }

export type BranchPr = { number: number; title: string; state: PrState }

declare module 'claude-code' {
  interface PluginState {
    'open-prs': {
      repo: RepoPrs | null
      branchPr: BranchPr | null
      branchRun: Run | null
      isDismissed: boolean
      isLoaded: boolean
      failedCli: 'gh' | 'az' | null
      isRefreshing: boolean
      remoteNote: string
      generation: number
    }
  }
}
