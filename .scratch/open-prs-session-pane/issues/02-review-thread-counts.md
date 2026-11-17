# Count resolved and unresolved review threads per PR

Type: task
Status: resolved
Blocked by:

## Problem

The pane needs "resolved/total threads" and an unresolved count per PR (spec: [spec.md](../spec.md)). `OpenPr` has only a comment count today, filled by each provider's `countComments`.

## Goal

Each provider reports, per PR, total and resolved review threads. GitHub: GraphQL `reviewThreads` (`isResolved`). Azure DevOps: thread status (active/pending versus fixed/closed/wontFix/byDesign). Put the fields on `OpenPr` in `open-prs/types/index.d.ts`, filled through the existing `countComments` after-the-list path so the list is not delayed.

## Done when

- `OpenPr` has `threads: { total: number; resolved: number } | null` (null while unknown or when the call failed).
- Provider tests cover both hosts, including a failed call keeping the last answer, using the `Port` stubs in `open-prs/tests/providers.test.ts`.
- Hook tests still pass; `claude plugin test .` in `open-prs` is green.

## Comments

- Done. `OpenPr.threads: { total; resolved } | null`. GitHub reads `reviewThreads(first: 100)` inside the existing comment-count query, so no extra call; the resolved count covers the first 100 threads of a PR (a PR with more is undercounted). Azure reads the thread `status` in the existing threads call in `countComments`: review threads are live threads with a live text comment; `fixed`, `closed`, `wontFix`, `byDesign` count as resolved, anything else (active, pending, no status) as unresolved. A failed call keeps the last counts, and a PR never counted stays `null`.
- Tests: 127 pass (123 before, plus 4 new GitHub and Azure cases; the existing thread-count test and the GitHub maps test now also assert `threads`).
