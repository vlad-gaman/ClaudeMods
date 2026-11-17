# Know this session's branches and their worktrees

Type: task
Status: resolved
Blocked by:

## Problem

The "This session" card lists this session's branches with a worktree path each, including branches with no PR. Today `currentBranch` runs `git branch --show-current` and keeps one branch (spec: [spec.md](../spec.md)).

## Goal

Read `git worktree list --porcelain` through the `Port` to get, for the session's repo, each worktree's path and branch. Decide which are "this session's": the current worktree's branch plus any branch the session has switched to or created. Name the rule in the ticket's `## Answer` before building, since the API has no per-session branch list (only `$.session.repo()` and the current directory). Join each branch to its PR where one exists; the rest are "no PR".

## Done when

- A pure function maps porcelain output to `{ branch, path }[]`, tested with detached HEAD, bare, and several-worktree cases.
- The snapshot carries `sessionBranches: { branch; path: string | null; prNumber: number | null }[]`.
- `claude plugin test .` in `open-prs` is green.

## Comments

## Answer

**This session's branches** = the branch checked out in the session's own worktree, plus the branch of each linked worktree of the repo.

- Own worktree: `git branch --show-current` in the session folder (already read), with the path from `$.session.repo()`'s root. A detached HEAD contributes no branch.
- Linked worktrees: from `git worktree list --porcelain`, excluding the first entry (the main checkout), bare entries, detached entries, the session's own path, and any branch already listed.
- PR join: an open PR whose head branch is that branch, else "no PR".

Why: the API has no per-session branch list, but the session knows its own worktree exactly. Linked worktrees are where parallel work is created, and the main checkout is treated as the person's own. Known limit: other sessions' linked worktrees also appear, because the API cannot tell which session made one.

- Done. `hooks/worktrees.ts` has `parseWorktrees` (porcelain to `{ path, branch, isMain }[]`; bare entries left out, detached gives `branch: null`), `sessionBranchesOf` (the rule above) and `listWorktrees(port)` (undefined when the call fails). The register reads the branch and the worktree list through the Port and passes `sessionBranches` to the provider; each provider joins them to its open PRs by the new `OpenPr.branch` (head branch). `Snapshot.sessionBranches: SessionBranch[]` where `SessionBranch = { branch; path: string | null; prNumber: number | null }`, unknown (undefined) when the PR list or the worktree list failed. The register writes a new `sessionBranches` atom (`SessionBranch[]`, default `[]`).
- Deviations: `parseWorktrees` returns `isMain` too, so a bare main repo does not make the next worktree look like the main checkout. The session's own path comes from `$.session.repo()`'s `root`, not from porcelain.
- Bug fixed on the way: the no-remote fallback in the register still said `branchRun: null` after ticket 03, so the branch runs would not clear without a remote. It now says `branchRuns: null`.
- Tests: 147 pass (133 before, plus 14: 9 for worktrees and 5 for the provider joins, GitHub and Azure). The hook harness routes `git worktree list` to an empty answer.
