# Pane lifecycle module

Type: grilling
Status: needs-triage
Blocked by:

## Problem

"When does a pane open, count as dismissed, reopen" is re-derived per mod: switchboard (`origin.kind === 'unload'`, `isPlaced`, l.99-107), open-prs (`origin.kind === 'person'`, l.426), session-panel (own wiring). Fixes cd2c552 and 256db88 both patched that rule. Tests use three fake engines.

## Goal (to be confirmed)

One module owns open, dismiss and reopen; each mod passes its pane id and view. Keep it to behaviour: a helper that only hides `atom(...)` fails the deletion test.

## Open questions

- Packaging: each mod is its own plugin. Can a module be shared across plugins at all? Same question blocks 05.
- Is a copy-per-mod with a shared test fixture good enough?
