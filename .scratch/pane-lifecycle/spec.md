# Spec: pane lifecycle rule and shared test fixture

Status: ready-for-agent
Source: architecture-deepening ticket 04

## Problem Statement

As the owner I have three mods that open a pane (Switchboard, Open PRs, Session Panel). "When does a pane open, count as dismissed by the person, or reopen" is re-derived in each mod, and two fixes (cd2c552, 256db88) both patched that rule. Mods are separate plugins and the README states they share no helper code, so a shared runtime module is not available. Each mod's tests carry their own fake engine.

## Solution

Write the pane lifecycle rule down once in the GLOSSARY and make each mod apply it the same way, each inside its own plugin. Add one canonical fake-engine fixture, copied (not imported) into each mod's tests, so the rule is verified identically in all three. User-visible behaviour stays as today unless a mod diverges from the written rule; any divergence is a bug fix in that mod.

## User Stories

1. As a user, I want a pane I closed myself to stay closed across reloads, so that mods do not nag.
2. As a user, I want a pane closed because the plugin unloaded to come back next time, so that unloading is not counted as dismissal.
3. As a user, I want the slash command to reopen a dismissed pane in every mod, so that behaviour is predictable.
4. As a user, I want a placed pane to be remembered as open, so that I do not re-place it.
5. As the maintainer, I want the rule stated once in the glossary, so that a new mod copies it.
6. As the maintainer, I want one fake engine with open/close/origin events, so that each mod's pane tests read the same.
7. As the maintainer, I want the same four cases (open, dismiss by person, close on unload, reopen by command) tested in each mod, so that drift shows as a failing test.
8. As Switchboard's user, I want its eye toggle to reflect the other mods' panes as today.
9. As an Open PRs user, I want a re-register not to reopen a pane I dismissed.

## Implementation Decisions

- No shared runtime module, because plugins are packaged separately. The shared artefacts are a written rule in GLOSSARY.md ("dismissed", "closed on unload", "reopen") and a fixture.
- Rule, from current code: a close whose origin is the person counts as dismissed; a close whose origin is unload does not; the command reopens; placement is remembered.
- Each mod keeps its own pane code (Open PRs tracks dismissed state itself; Switchboard watches open/close events for other mods' panes; Session Panel opens on its command). Align only where a mod deviates from the written rule.
- The ticket 02 review found Open PRs resets its opened flag on every register and can reopen the pane; check it against the rule.
- The canonical fixture lives in one reference location in the repo and is copied into each mod's tests, matching how mods already repeat stubs.
- A helper that only wraps the engine's atom call fails the deletion test; none is built.

## Testing Decisions

- Good tests assert what the user sees (pane open or closed, command result), not which engine call ran.
- Seam: the mod hook with the canonical fake engine; one lifecycle test file per mod covering the four cases.
- Prior art: Switchboard's open/close event tests and Open PRs' dismissal tests.
- `claude plugin test .` and type-check in each touched mod; full suites once at the end.

## Out of Scope

- A shared runtime library or cross-plugin imports.
- Changing what any pane shows.
- Session-handoff, which has no pane.

## Further Notes

Ticket 06 (runHandoff steps) was blocked on this; with no shared adapter it stays speculative.
