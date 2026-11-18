# Spec: a triggers module that owns when a handoff may start

Status: ready-for-agent
Source: GitHub issue #38 (architecture review, candidate 5)

## Problem Statement

In Session Handoff the logic that can break sits in `hooks/register.tsx`: cancelling and re-arming the cache timer, arming on context use, `isRunning`, and the undismissed-view check, all changed from several handlers. The small helpers (`trigger.ts`) have interfaces as large as their bodies. The context trigger also disarms when it fires even if the handoff did not start (one already running), so a context-full handoff can be lost until usage falls below 80%.

## Solution

`hooks/triggers.ts` replaces `hooks/trigger.ts` and exports `createTriggers(deps, options)`, which owns the run state, the cache timer and the context arm state. Interface: `onTurnStart()`, `onTurnComplete()`, `start(trigger) -> { started: boolean }`.

## Decisions

- `start(trigger)` owns `isRunning`: returns `{ started: false }` if a handoff is running, otherwise sets the flag, awaits the injected `run(trigger)`, and clears the flag in `finally`. `runHandoff` no longer touches `Run`; the view `id` stays with it.
- Narrow injected deps, not the `$` engine: `after(ms, fn)` (clock), `hasOpenView()`, `contextTokens()`, `run(trigger)`. Options: `cacheMinutes`, `leadMinutes`, `contextTokens`. `register.tsx` builds deps from `$` in one place.
- `register.tsx` keeps the `agentId !== undefined` filter; the module only sees main-thread turns.
- `/handoff-session` reply wording stays in `register.tsx`, chosen from `{ started }`.
- Context trigger: the arm state changes only when `start('context')` actually started (fix; red test first). Today it disarms regardless.
- Guard contract kept as is: the cache trigger is blocked by an undismissed view and is not re-armed until the next turn completes; the context trigger is not blocked by it.
- `contextTrigger` and `cacheWaitMs` become internals tested through the interface; `CACHE_TTL_MIN`, `RUN_BEFORE_COLD_MIN`, `CONTEXT_*` and `cacheWaitMs` stay in `data.ts`.
- `summary.ts`, `save.ts`, `steps.ts`, `verify.ts` and their tests stay (settled by #6). `cache_minutes` stays a per-mod option (settled by #5; engine does not expose the lifetime). No GLOSSARY change (Trigger already defined), no ADR.

## Testing Decisions

- New `tests/triggers.test.ts` with a mock clock and stub deps: fires once; cache blocked by an undismissed view; context re-arms below 80%; context not disarmed when a handoff is already running; cache wait is lifetime minus lead.
- `tests/trigger.test.ts` is replaced by it. `tests/handoff.test.tsx` stays untouched as the regression net.
- `claude plugin test .` and type-check in session-handoff.

## Out of Scope

- Changing the guard rules, trigger timing, handoff steps or view.
- Usage Band.

## Release

Bump `session-handoff` patch version in `.claude-plugin/plugin.json` (Q5 is a fix).
