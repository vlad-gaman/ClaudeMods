# Pane lifecycle module

Type: grilling
Status: resolved
Blocked by:

## Problem

"When does a pane open, count as dismissed, reopen" is re-derived per mod: switchboard (`origin.kind === 'unload'`, `isPlaced`, l.99-107), open-prs (`origin.kind === 'person'`, l.426), session-panel (own wiring). Fixes cd2c552 and 256db88 both patched that rule. Tests use three fake engines.

## Goal (to be confirmed)

One module owns open, dismiss and reopen; each mod passes its pane id and view. Keep it to behaviour: a helper that only hides `atom(...)` fails the deletion test.

## Open questions

- Packaging: each mod is its own plugin. Can a module be shared across plugins at all? Same question blocks 05.
- Is a copy-per-mod with a shared test fixture good enough?

## Comments

Spec written: [../../pane-lifecycle/spec.md](../../pane-lifecycle/spec.md). Owner decision: no shared runtime module (mods share no code); shared written rule plus a copied test fixture.

- Implemented in 94f1379 and the README wording fix that follows it. The rule is in GLOSSARY.md "Pane lifecycle". The canonical fake engine is docs/fixtures/pane-lifecycle-engine.ts, copied unchanged into each mod's tests/pane-lifecycle-engine.ts.
- Lifecycle tests (tests/lifecycle.test.tsx) cover open, a plugin-origin close (not a dismissal), and reopen by command or eye. The harness cannot raise the person's close (origin person) or an unload, so dismissal by the person and close on unload are not tested; the code paths are read in each hooks/register.tsx.
- Behaviour fix: session-panel reopened its pane on every session start, even after the person closed it. It now records the person's close in an atom and leaves the pane closed until /session-panel. This fix has no red test (see above).
- open-prs and switchboard already followed the rule; no code change.
- Open point: a placed open clears switchboard's closed state, but an unplaced open does not; the eye press clears it regardless. The glossary follows the spec's "placed" wording.
