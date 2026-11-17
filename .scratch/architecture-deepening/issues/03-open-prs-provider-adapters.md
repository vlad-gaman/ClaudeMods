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

### Code review (fb1fd2a, `6efb60d...HEAD`)

Standards and Spec were reviewed by two separate sub-agents. Findings fixed in this commit:

- README used terms GLOSSARY.md does not define (provider, Snapshot, Port, tri-state). Rephrased in glossary terms; GLOSSARY.md was not touched (outside scope).
- Azure base URL was built again for each thread call batch. It is now built once per count pass.
- The two argv-assertion tests in `tests/open-prs.test.tsx` duplicated the contract tests. Removed; the contract tests now pin the argv.

Findings left as they are:

- The hook tests still cannot inject a stub provider, so the spec's scheduler and pane tests against a stub provider remain not done (see above).
- Duplicated host guards (`if (remote.host !== ...) throw`) in each provider, and the duplicated draft/state mapping in `ghState`/`azState`: judgement calls, kept for clarity.
- `ADO_BUILD` in `github.ts` recognises Azure build URLs; it is a pipeline-shape check kept in the GitHub module, which the spec's split would move. Left for ticket 04 or a follow-up.
- Spec wording "takes the engine ... and the run state": providers take a `Port` and `FetchContext`; Azure caches live in the provider closure. The engine's `$`-passing rule forced the Port.

Results after the review fixes: `claude plugin test .` in open-prs: `120 pass`, `0 fail`, `Ran 120 tests across 2 files` (109 hook tests, 11 provider tests). Type-check exit 0.

## Decision (2026-11-17)

No injection point. Tried `makeRegister(providers)` with `export const register = makeRegister()`: the engine refuses the module (`register is exported as something other than a const function`). So `register` must stay a literal const function that builds its own providers, a stub provider cannot be injected, and the scheduler and pane stay covered through the real providers' CLI calls (123 tests pass). The spec line on stub-provider tests is dropped.
