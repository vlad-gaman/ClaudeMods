# open-prs

A side pane listing the repo's open GitHub or Azure DevOps PRs with their review state, comment count and pipeline runs. It also shows the current branch's PR and run.

## What you see

- **Repo link** and a **Refresh** button. The list refreshes every 3 minutes, and again on a turn once it is a minute old.
- **Pull requests**: the open count, then each PR with its author, `draft` flag, review state (approved, changes requested, review required) and comment count. The current branch's PR is marked.
- **Pipelines**: the latest run for the current branch and for each listed PR, with its state and a link.
- A note instead of the list when the remote is neither GitHub nor Azure DevOps, or when `gh` or `az` failed (it retries after 30 seconds and keeps the last list shown).

It reads the `origin` remote and calls `gh` (GitHub) or `az` (Azure DevOps) in the session's folder, so both must be installed and signed in. At most 50 PRs are listed.

## Commands

- `/prs`: reopen the pane after closing it.

## Develop

```bash
claude plugin test .
```

All tests are in `tests/open-prs.test.tsx`. Everything (CLI calls, parsing, state and the pane) is in `hooks/register.tsx`.
