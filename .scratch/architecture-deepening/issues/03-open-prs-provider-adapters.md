# Split open-prs into GitHub and Azure adapters behind a Snapshot seam

Type: task
Status: resolved
Blocked by: 02

## Problem

`open-prs/hooks/register.tsx` (516 lines) mixes queries, mappers, CLI calls (`gh`, `az`), scheduler, retry and pane. `fetchPrs` also calls `$.ui.open` unasked. Tests route argv by string prefix, so a changed query can leave the fake passing.

## Goal

Two adapters satisfy one interface returning a `Snapshot`; the orchestrator and pane depend only on it. Two real adapters make the seam genuine. Scheduler tested against an in-memory adapter; mappers tested without the engine.

## Open questions

- Interface shape (design twice).
- Do it after 02 so state is per-register first.

## Comments

Spec written: [../../open-prs-provider-adapters/spec.md](../../open-prs-provider-adapters/spec.md). Seam chosen with the owner: the provider function (both providers already return a Snapshot).

### Done

- `open-prs/hooks` now holds `register.tsx` (hooks, scheduler, retry, pane), `remote.ts` (origin to GitHub or Azure DevOps), `provider.ts` (the provider contract, `Snapshot`, `Port`, the `gh`/`az` helper), `github.ts` and `azure.ts`.
- The seam is the provider's `fetch(port, remote, context)`. The engine's hook check rejects `$` passed into a method call, so each provider gets a `Port` (`run` and `now`, closures over `$`) and never `$`.
- `fetch` does not open the pane. `fetchPrs` opens it after a successful snapshot, under the same conditions as before.
- One host lookup: `s.providers[remote.host]` gives the tool name (`gh`/`az`) for the failure note and the optional `countComments`, replacing the two host checks.
- Azure repo IDs and comment counts live in the provider instance made per `register`. `generation`/`isLive`, the per-register `State`, `azureOrg` and `isUnknown` are kept as ticket 02 left them.
- `tests/providers.test.ts` (11 tests): each provider through its `Port` with a stub CLI; the argv of every call is asserted once.

### Not done as specified

- Scheduler and pane tests against a stub provider: the harness always loads the real plugin, and `register` builds its own providers, so a test cannot inject a stub. The 111 hook tests in `tests/open-prs.test.tsx` still cover the scheduler and pane through the real providers' CLI calls.
- The argv-assertion tests in `tests/open-prs.test.tsx` duplicate the contract tests now; they were left in place.

### Results

- `claude plugin test .` in open-prs: `122 pass`, `0 fail`, `Ran 122 tests across 2 files` (111 hook tests, 11 provider tests).
- Type-check: TypeScript 5.9.2, `tsc -p . --noEmit` in a scratch copy with the engine types from `session-handoff/.claude-plugin/types`: exit 0.
