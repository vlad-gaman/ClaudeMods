import type { Port } from './provider'

/** One worktree of the repo: its folder, the branch it has checked out (null when detached), and whether it is the main checkout. */
export type Worktree = { path: string; branch: string | null; isMain: boolean }

/**
 * Maps `git worktree list --porcelain` to its worktrees. A bare entry is left out, but it still counts as the first
 * entry, so the entry after a bare repository is not taken for the main checkout.
 */
export function parseWorktrees(porcelain: string): Worktree[] {
  const entries = porcelain.split(/\r?\n\s*\r?\n/).filter(entry => entry.trim() !== '')
  return entries.flatMap((entry, index) => {
    const lines = entry.split(/\r?\n/)
    const path = lines.find(line => line.startsWith('worktree '))?.slice('worktree '.length)
    if (!path || lines.includes('bare')) return []
    const ref = lines.find(line => line.startsWith('branch '))?.slice('branch '.length)
    return [{ path, branch: ref ? ref.replace(/^refs\/heads\//, '') : null, isMain: index === 0 }]
  })
}

const normalize = (path: string) => path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

/**
 * This session's branches (the rule is in issues/04): the branch of the session's own worktree first, then the branch of
 * each linked worktree that is not the main checkout, not detached and not the session's own folder. A branch is listed once.
 */
export function sessionBranchesOf(worktrees: Worktree[], own: { path: string | null; branch: string | null }) {
  const ownPath = own.path === null ? null : normalize(own.path)
  const isOwn = (worktree: Worktree) => ownPath !== null && normalize(worktree.path) === ownPath
  const mine = own.branch ? [{ branch: own.branch, path: own.path }] : []
  const linked = worktrees
    .filter(worktree => !worktree.isMain && worktree.branch !== null && !isOwn(worktree))
    .map(worktree => ({ branch: worktree.branch ?? '', path: worktree.path }))
  const all = [...mine, ...linked]
  return all.filter((entry, i) => all.findIndex(other => other.branch === entry.branch) === i)
}

/** The worktrees of the session's repo, or undefined when the call failed or could not run: the last answer then stays. */
export async function listWorktrees(port: Port): Promise<Worktree[] | undefined> {
  try {
    const { exitCode, stdout } = await port.run(['git', 'worktree', 'list', '--porcelain'], 10_000)
    return exitCode === 0 ? parseWorktrees(stdout) : undefined
  } catch {
    return undefined
  }
}
