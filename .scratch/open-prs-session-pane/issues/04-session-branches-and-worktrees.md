# Know this session's branches and their worktrees

Type: task
Status: ready-for-agent
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
