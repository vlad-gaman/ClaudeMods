# Count resolved and unresolved review threads per PR

Type: task
Status: ready-for-agent
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
