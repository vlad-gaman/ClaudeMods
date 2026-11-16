# Spec: runHandoff pure steps

Status: ready-for-agent
Source: architecture-deepening ticket 06

## Problem Statement

As the owner I rely on Session Handoff to write a handoff before the prompt cache goes cold. Its run function is one ~140-line block that sets the step, invalidates the view, races the model call against a timeout, verifies the result and persists the document. It is reachable only through the fake engine. Recent fixes (4aa2504, c185077, da31879) all landed in this glue, away from the pure files that have tests.

## Solution

Pull the decisions out of the run function into small pure functions: how the timeout race resolves, what verify accepts or rejects, and what is persisted for each outcome. The run function stays the one place that performs engine calls and calls those functions in order. No new adapter or seam: there is one real engine, and adding an interface for a second implementation that does not exist would fail the deletion test. The existing hook test stays the regression net.

## User Stories

1. As a user, I want a handoff to finish exactly as today, so that nothing regresses.
2. As a user, I want a timed-out handoff to be reported as timed out, never as a half document.
3. As a user, I want a handoff that fails verification to say why and keep nothing misleading.
4. As the maintainer, I want the timeout race decided in a pure function, so that its edge cases (finishes at the deadline, finishes after) are table tests.
5. As the maintainer, I want verify as a pure function over the result, so that each rejection reason has a test.
6. As the maintainer, I want the persist decision (what to write, where, with which status) as a pure function, so that failures to persist are covered without a fake engine.
7. As the maintainer, I want step names and indexes in one list, so that the step display and the code cannot drift (the duplicated lists and magic indexes from the earlier audit).
8. As the maintainer, I want the run function to read as a short sequence, so that a bug fix lands in a named step.

## Implementation Decisions

- New pure module(s) alongside the existing pure files in Session Handoff, with a function per decision: race outcome, verification verdict (with reason), persist plan, and the ordered step list.
- The run function keeps all engine calls (state updates, invalidate, the model call, file write) and delegates every decision to these functions.
- No engine adapter, no in-memory engine. Revisit only if a second real engine appears.
- Behaviour, step order and user-visible text stay identical. Any divergence found while extracting is recorded and fixed separately, with a red test first.
- Terms follow GLOSSARY (handoff, prompt cache); mention new terms there only if one is needed.

## Testing Decisions

- Good tests assert outputs of the pure functions for given inputs; they never assert call order or private state.
- Seam: the new pure functions directly, plus the existing hook test as the regression net (all of its current cases must still pass untouched).
- Add table tests for: race (before/at/after deadline, model error), verify (each rejection reason, accept), persist plan (success, write failure inputs).
- Prior art: session-handoff's trigger, argv and document tests, which already test pure files.
- `claude plugin test .` and type-check in session-handoff; full suite once at the end.

## Out of Scope

- An engine adapter or in-memory engine (ticket 06's original idea).
- Changing the handoff document format, the trigger timing or the view.
- The cache lifetime work (ticket 05).

## Further Notes

Ticket 06 was blocked on ticket 04 supplying a second adapter; ticket 04 shipped no shared adapter, so this spec takes the cheaper route that needs no seam. If the extraction finds the three recent fixes were really about ordering, say so in the ticket.
