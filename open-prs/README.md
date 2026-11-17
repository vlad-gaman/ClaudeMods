# open-prs

A side pane listing the repo's open GitHub or Azure DevOps PRs with their review state, comment count and pipeline runs. It also shows the current branch's PR and run.

## Install

```
/plugin install open-prs --marketplace vlad-gaman/ClaudeMods
```

## What you see

- **Repo link** and a **Refresh** button. The list refreshes every 3 minutes, and again on a turn once it is a minute old.
- **Pull requests**: the open count, then each PR with its author, `draft` flag, review state (approved, changes requested, review required) and comment count. The current branch's PR is marked.
- **Pipelines**: the latest run for the current branch and for each listed PR, with its state and a link.
- A note instead of the list when the remote is neither GitHub nor Azure DevOps, or when `gh` or `az` failed (it retries after 30 seconds and keeps the last list shown).

It reads the `origin` remote and calls `gh` (GitHub) or `az` (Azure DevOps) in the session's folder, so both must be installed and signed in. At most 50 PRs are listed.

## Commands

- `/prs`: reopen the pane. A dismissed pane stays closed through refreshes and new sessions until this command reopens it.

## Develop

```bash
claude plugin test .
```

The hook tests in `tests/open-prs.test.tsx` run the pane, the scheduler and retry through the engine. `tests/lifecycle.test.tsx` runs open, close and reopen against the fake engine in `tests/pane-lifecycle-engine.ts` (the canonical copy is `docs/fixtures/pane-lifecycle-engine.ts`); it cannot raise the person's close, so the dismissal that close records is not covered by a test. The host tests in `tests/providers.test.ts` run each host module with a stub CLI in place of the engine and assert the argv of every call.

Files under `hooks/`:

- `register.tsx`: the hooks, the scheduler, retry and the pane.
- `remote.ts`: reads the `origin` remote as GitHub or Azure DevOps.
- `provider.ts`: the contract every host module meets, the `gh`/`az` call helper, and the fetch result (a failed call keeps the last answer shown; a confirmed "none" clears it).
- `github.ts`: the GitHub module, which runs `gh`.
- `azure.ts`: the Azure DevOps module, which runs `az`.

A third host is one more module file and one entry in the `providers` map in `register.tsx`.
