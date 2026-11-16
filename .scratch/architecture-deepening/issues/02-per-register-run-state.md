# One per-register run-state module

Type: task
Status: resolved
Blocked by:

## Problem

`open-prs/hooks/register.tsx` (l.306-314, module-level state confirmed) and `model-router/hooks/register.ts` (l.44-87: `hinted`, `agentModels`, `writing`) keep state at module scope. `repoIds` and `commentCounts` in open-prs are never reset, so they leak across `register` calls and the 1,279-line open-prs test relies on it (unverified). `session-handoff` already moved to a per-register `Run` object (commit 44b02d6): that is the model.

## Goal

Every mod creates its run state per `register` call with one reset rule; three conventions become one.

## Done when

- No module-level mutable state in `open-prs` or `model-router` register paths.
- Tests no longer depend on cross-test leakage (add a test that registers twice and sees fresh state).
- Tests and type-check pass in each touched mod.

Note: `open-prs` and `model-router` are untracked; coordinate with the owner's uncommitted work before editing.

## Comments

### Verified claims (before editing)

- **repoIds and commentCounts never reset:** true. In `open-prs/hooks/register.tsx` they were module-level Maps and `register` never cleared them.
- **The open-prs test relies on the leak:** false. Clearing `repoIds`, `commentCounts`, `fetching`, `fetchedAt` and `isDocked` at the start of `register` in a scratch copy gave 110/110 pass. Full reset of model-router's module state in a scratch copy gave 65/65 pass.
- **Module state is shared across tests:** false. A probe in a scratch copy of model-router put a counter in module state and exposed it through the status text. Each test saw a count of 1, so `claude plugin test` loads a fresh module for every test.
- **Timers are safe to drop from the old register:** the engine docs (claude-code types, `clock`) say a hot reload cancels a plugin's pending waits with the old environment, so `register` no longer cancels the previous `tick` and `retry`.

### Decisions

- **Name:** `State`, not `Run`. In open-prs `Run` already means a pipeline run (GLOSSARY), and the ticket asked for one shape, not that name.
- **Shape:** one `State` object is created in `register` and passed as `s` to the helpers, following session-handoff's `run` (commit 44b02d6). Atoms stay module-level, since they are engine-owned persisted state.
- **Scope of reset:** every field starts fresh per `register`, including the `repoIds` and `commentCounts` caches. Azure repo IDs and comment counts are re-fetched after a re-register. That costs one `az repos show` and up to twelve thread calls per pass.
- **Test:** the ticket asked for a red test that registers twice. The harness gives each test a fresh module and registers once per test, so a register-twice test cannot be written through it. No red test was added. The existing 175 tests cover the behaviour and were green before and after.

### Changes

- `open-prs/hooks/register.tsx`: `State` type; `load`, `fetchPrs`, `refresh`, `kick`, `refreshNow`, `fromAzure`, `countComments` take `s`; all module `let`/`Map` state removed.
- `model-router/hooks/register.ts`: `State` type (`hinted`, `pinnedSkill`, `openRuns`, `expected`, `agentModels`, `writing`); `lockTo`, `hint`, `routedModel`, `appendLog`, `openRun`, `closeRuns`, `noteStep`, `allAgentModels` take `s`; module state removed.

Both files keep their CRLF or LF line endings.

### Results

- `claude plugin test .` in open-prs: `110 pass`, `0 fail`, `Ran 110 tests across 1 file`.
- `claude plugin test .` in model-router: `65 pass`, `0 fail`, `Ran 65 tests across 1 file`.
- Type-check: TypeScript 5.9.2 (Antigravity copy), `tsc -p . --noEmit` in a scratch copy of each mod with the engine types from `~/.claude/dev-mods/37d6be3b.../session-panel/.claude-plugin/types`. open-prs exit 0, model-router exit 0. The repo has no `.claude-plugin/types` base, so this uses a copy.
- code-review skill: not run as written. It diffs `HEAD` against a fixed point, and both mods are untracked. Review was done by reading the changes directly.
