# open-prs

A side pane listing the repo's open GitHub or Azure DevOps PRs with their review state, comment count and pipeline runs. It also shows the current branch's PR and run.

## Install

```
/plugin install open-prs --marketplace vlad-gaman/ClaudeMods
```

## What you see

- **Repo link** and a **Refresh** button. The list refreshes every 3 minutes, and again on a turn once it is a minute old.
- **This session**: the branches this session works on: the session's own branch and the branch of each linked worktree of the repo. Each shows its PR (number and title, linked), its branch, its worktree folder (or "no worktree"), its status (approved, changes requested, review required, draft, merged or closed, or "no PR"), its unresolved thread count, a resolved/total thread bar, and its latest runs as chips.
- **Other open PRs**: every open PR that is not on one of this session's branches (at most 50), grouped by status, each with its author, comment count, thread bar and latest runs as chips.
- **CLI errors**: appears only while a `gh` or `az` call has failed. One entry per failed call: the command (tokens redacted), the exit code or "timed out" or "could not run", the time and the message. **Close** empties it. The last 20 failures are kept.
- Each card has a header with a chevron (`▾` open, `▸` collapsed) that folds it. A collapsed card shows its status bar and a thread bar and a CI bar (CI ok/total). A folded card stays folded across refreshes and when the pane is reopened.
- The status bar at the top of a card shows its PRs by status, in colours, with a shaded (`▒`) segment for branches that have no PR. Its legend gives the counts.
- A note instead of the cards when the remote is neither GitHub nor Azure DevOps, or when `gh` or `az` failed (it retries after 30 seconds and keeps the last list shown).

On the desktop the status, branch, unresolved-thread and run icons are Lucide icons in the status colours (red changes or failed, amber review or partial, green approved or passed, blue running, grey draft, queued or no PR); thread bars are green once every thread is resolved and amber until then. Everywhere else the bars and icons are terminal glyphs (`█`/`░`/`▒`, `✓ ✗ ○ ◌ ◔ ◐ ⎇ ▾ ▸`). Run chips show the state glyph and the run name; they do not link to the run.

It reads the `origin` remote and calls `gh` (GitHub) or `az` (Azure DevOps) in the session's folder, so both must be installed and signed in. The branches of other sessions' linked worktrees also appear under This session, since the mod cannot tell which session made a worktree.

## Commands

- `/prs`: reopen the pane. A dismissed pane stays closed through refreshes and new sessions until this command reopens it.

## Develop

```bash
claude plugin test .
```

The hook tests in `tests/open-prs.test.tsx` run the pane, the scheduler and retry through the engine. `tests/lifecycle.test.tsx` runs open, close and reopen against the fake engine in `tests/pane-lifecycle-engine.ts` (the canonical copy is `docs/fixtures/pane-lifecycle-engine.ts`); it cannot raise the person's close, so the dismissal that close records is not covered by a test. The host tests in `tests/providers.test.ts` run each host module with a stub CLI in place of the engine and assert the argv of every call.

Files under `hooks/`:

- `register.tsx`: the hooks, the scheduler, retry, the pane and the atoms they keep (the CLI errors log and the folded cards included).
- `cards.ts`: the pure helpers the pane draws with (bars, status counts and segments, the session's rows, grouping and totals).
- `worktrees.ts`: reads `git worktree list` and works out this session's branches.
- `cli-log.ts`: the failed `gh` and `az` calls, redacted, capped at 20.
- `remote.ts`: reads the `origin` remote as GitHub or Azure DevOps.
- `provider.ts`: the contract every host module meets, the `gh`/`az` call helper, and the fetch result (a failed call keeps the last answer shown; a confirmed "none" clears it).
- `github.ts`: the GitHub module, which runs `gh`.
- `azure.ts`: the Azure DevOps module, which runs `az`.

A third host is one more module file and one entry in the `providers` map in `register.tsx`.
