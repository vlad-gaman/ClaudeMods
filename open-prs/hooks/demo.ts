import type { CliFailure } from './cli-log'
import type { SessionBranch } from './provider'
import type { BranchPr, OpenPr, RepoPrs, Run } from '../types'

/** Stub data for `/prs-demo`: the shapes of every card, so the pane's look can be seen without a repo. */
const run = (name: string, state: Run['state']): Run => ({ name, state, url: 'https://example.com/run' })
const pr = (number: number, title: string, author: string, branch: string, review: OpenPr['review'], isDraft: boolean, threads: OpenPr['threads'], runs: Run[]): OpenPr => ({
  number,
  title,
  author,
  isDraft,
  url: `https://example.com/pull/${number}`,
  branch,
  review,
  comments: threads?.total ?? 0,
  threads,
  runs,
  run: runs[0] ?? null,
})

export const DEMO_REPO: RepoPrs = {
  slug: 'example/demo',
  url: 'https://example.com/example/demo',
  prs: [
    pr(139, 'Pane: show pipelines per PR', 'you', 'claude/pane-pipelines', 'required', true, { total: 4, resolved: 2 }, [run('build #88', 'running'), run('test #88', 'queued'), run('lint #87', 'succeeded')]),
    pr(142, 'Add retry to provider fetch', 'you', 'claude/retry-fetch', 'approved', false, { total: 3, resolved: 3 }, [run('build #85', 'succeeded'), run('test #85', 'succeeded')]),
    pr(150, 'Docs: changelog for 0.5', 'you', 'claude/docs-changelog', 'changes', false, { total: 2, resolved: 1 }, [run('build #30', 'succeeded'), run('test #30', 'succeeded')]),
    pr(137, 'Azure: count comments lazily', 'maria', 'maria/azure-comments', 'changes', false, { total: 11, resolved: 4 }, [run('ci', 'failed')]),
    pr(131, 'Docs: explain refresh cadence', 'sam', 'sam/docs-refresh', 'required', false, null, []),
    pr(120, 'Fix pane flicker on resize', 'alex', 'alex/flicker', 'required', false, { total: 5, resolved: 2 }, [run('ci', 'succeeded')]),
    pr(128, 'Bump ink to 5.1', 'dependabot', 'deps/ink', 'approved', false, { total: 1, resolved: 1 }, [run('ci', 'partial')]),
    pr(124, 'WIP: switch to websockets', 'sam', 'sam/websockets', 'required', true, { total: 1, resolved: 0 }, [run('ci', 'failed')]),
  ],
}

export const DEMO_BRANCHES: SessionBranch[] = [
  { branch: 'claude/pane-pipelines', path: '/work/demo/.claude/worktrees/pane-pipelines', prNumber: 139 },
  { branch: 'claude/retry-fetch', path: '/work/demo/.claude/worktrees/retry-fetch', prNumber: 142 },
  { branch: 'claude/docs-changelog', path: null, prNumber: 150 },
  { branch: 'claude/spike-sockets', path: '/work/demo/.claude/worktrees/spike-sockets', prNumber: null },
]

export const DEMO_BRANCH_PR: BranchPr | null = null
export const DEMO_RUNS: Run[] = [run('build #12', 'failed')]

export const demoErrors = (now: number): CliFailure[] => [
  { command: 'gh pr view --json number,title,state,isDraft', exitCode: 1, isTimeout: false, at: now, message: 'could not determine current branch: not on any branch' },
]
