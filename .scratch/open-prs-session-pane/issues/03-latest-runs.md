# Keep the latest several runs per PR and branch

Type: task
Status: resolved
Blocked by:

## Problem

Each PR and the branch carry one `run` (the worst state, via `worst`). The pane shows the latest runs as chips and a "ci ok/total" bar (spec: [spec.md](../spec.md)), which needs several runs.

## Goal

Providers return the latest N runs (start with 5) per PR and for the branch, newest first, each with its state, name and url. Keep the single worst-state `run` derivable from the list so nothing else changes meaning.

## Done when

- `OpenPr` and the branch answer carry `runs: Run[]`; `run` is computed from it.
- Provider tests cover both hosts: several runs, none, and a failed call keeping the last answer.
- `claude plugin test .` in `open-prs` is green.

## Comments

- Done. `OpenPr.runs: Run[]` (newest first, at most `RUNS = 5`, exported from `hooks/provider.ts`), and `OpenPr.run` is `worst(runs)`. The branch answer is `Snapshot.branchRuns: Run[] | null | undefined` (replaces `branchRun`); the register writes a new `branchRuns` atom and keeps `branchRun` as `worst(branchRuns)`, so the render is unchanged.
- Deviations: `run` is the worst of the five listed runs, not of every run (the ticket says `run` is computed from `runs`). Azure lists the latest run per definition, newest first, as before. GitHub has no run timestamps in the rollup, so its order is the rollup order, not a true "newest first". A failed call keeps the last runs; a PR whose Azure runs drop out keeps the runs it showed.
- Tests: 133 pass (127 before, plus 6 new GitHub and Azure cases; the existing "no branch" tests now assert `branchRuns`).
