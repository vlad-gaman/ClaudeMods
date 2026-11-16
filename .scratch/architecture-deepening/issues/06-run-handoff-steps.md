# Make runHandoff's steps testable

Type: task
Status: resolved
Blocked by:

## Problem

`session-handoff/hooks/register.tsx` l.51-190 is one ~140-line function (setStep + invalidate, `Promise.race` vs timeout, verify, persist), reachable only through a fake engine (`tests/handoff.test.tsx`, 373 lines). Recent fixes (4aa2504, c185077, da31879) landed in this glue, not in the tested pure files.

## Goal

A handoff-run module with an in-memory engine adapter. Speculative: one real adapter today, so the seam stays hypothetical unless 04 supplies a second. Revisit after 04; wontfix if 04 is rejected.

## Comments

Spec written: [../../run-handoff-steps/spec.md](../../run-handoff-steps/spec.md). Owner decision: extract pure steps, no adapter seam (ticket 04 supplied no second adapter, so the Blocked by line is dropped).

Resolved: the pure steps are in `session-handoff/hooks/steps.ts` (step list, withStep, failed), `summary.ts` (raceSummary, summaryText, summaryDetail), `verify.ts` (verifySaved) and `save.ts` (savePlan), with tests in `session-handoff/tests/`. `runHandoff` keeps every engine call in the same order. `handoff.test.tsx` is unchanged and passes.

Recent fixes, checked against the ticket's claim that they landed in this glue:
- 4aa2504 is in usage-band, not session-handoff. It is about an untouched cache reading as cold, not ordering.
- c185077 (restore and persist of the last panel) is in this glue. It adds `persist` in `finally` and `restore` on `session.start`. It does not change step order. Its correctness depends on `persist` running after the final phase is set, which is unchanged.
- da31879 is in session-panel, not this glue, and is about connector titles.
So none of the three was an ordering fix inside `runHandoff`.

Divergence found, not fixed (fix it separately with a red test first): the write step's detail says "summary by the model" whenever the fork answered, even when the reply is blank and the narrative falls back to the last requests. `summaryDetail` pins this today in `summary.test.ts`.
