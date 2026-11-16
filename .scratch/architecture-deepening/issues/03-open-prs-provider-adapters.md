# Split open-prs into GitHub and Azure adapters behind a Snapshot seam

Type: task
Status: needs-triage
Blocked by: 02

## Problem

`open-prs/hooks/register.tsx` (516 lines) mixes queries, mappers, CLI calls (`gh`, `az`), scheduler, retry and pane. `fetchPrs` also calls `$.ui.open` unasked. Tests route argv by string prefix, so a changed query can leave the fake passing.

## Goal

Two adapters satisfy one interface returning a `Snapshot`; the orchestrator and pane depend only on it. Two real adapters make the seam genuine. Scheduler tested against an in-memory adapter; mappers tested without the engine.

## Open questions

- Interface shape (design twice).
- Do it after 02 so state is per-register first.
