# One per-register run-state module

Type: task
Status: resolved
Blocked by:

## Problem

`open-prs/hooks/register.tsx` (l.306-314, module-level state confirmed) and `model-router/hooks/register.ts` (l.44-87: `hinted`, `agentModels`, `writing`) keep state at module scope. `repoIds` and `commentCounts` in open-prs are never reset, so they leak across `register` calls and the 1,279-line open-prs test relies on it (unverified). `session-handoff` already moved to a per-register `Run` object (commit 44b02d6): that is the model.

## Goal

Every mod creates its run state per `register` call with one reset rule; three conventions become one.

## Done when

- No module-level mutable JavaScript state in `open-prs` or `model-router` register paths. Engine atoms stay module-level (they are engine-owned, persisted state); model-router's skill-run log is written through one (`runLog`), so two States that overlap share its compare-and-set.
- Tests no longer depend on cross-test leakage. The harness registers once per test, so a register-twice test cannot be written through it; the log's cross-State guarantee is covered by the atom compare-and-set and a test that appends to a log an earlier session wrote.
- Tests and type-check pass in each touched mod.
- Both mods are committed (93c2f0a), so the earlier "untracked" note no longer applies.

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

### Follow-up review of model-router

- **Stale State log writes:** `appendLog` queued writes on `s.writing`, so two States (old and new after a re-register) could read the same file and drop each other's lines. The log now lives in an engine atom (`runLog`, `{ seq, runs }`); each append is an `update` (compare-and-set with retry), and the file is written from that value. After each write the value is re-read, and a write that a newer append overtook is redone. Seeding from the file happens when `seq` is 0. A disposal flag was not added: a stale State's runs are real runs, and a flag would drop them.
- **Reset and lock literal:** `newState()` builds the State in `register`; `endTurn(s)` is the one reset used by `turn.complete`. `lockFor(choice, sessionModel, startedAt, isPinned)` builds the `Lock` at the four sites (`/route`, `/model` change, resumed session, default).
- **Skill-run log scope:** pre-existing. `readLog`, `appendLog` and the `writing` queue were in model-router before this ticket (the Problem cites them at l.44-87); the ticket moved the queue into State and did not add the log.
- **New test:** "a run appended after an earlier session keeps the lines that session logged" guards the seeding path. It would also pass on the old code, so it is a regression guard, not a red test.
- **Results:** `claude plugin test .` in model-router: `66 pass`, `0 fail`. Type-check (TypeScript 6.0.3, scratch copy with the engine types): exit 0.

### Review fixes (open-prs/hooks/register.tsx)

- **Stale State:** new engine atom `generation`. `session.start` claims the next value into `s.generation`; `isLive` compares it with the atom. A superseded State's tick cancels itself, and `load`, `fetchPrs`, `countComments` and each atom write check `isLive` first. The check reads the atom, so no module-level state was added.
- **Reopening:** `isOpened` is gone. The pane opens only when `$.ui.panes()` (the engine's record) does not list `open-prs` and `isDismissed` is false.
- **Azure base URL:** `azureOrg(remote)` builds `https://dev.azure.com/<org>` for `--org`, the web links and the threads call.
- **CliResult:** a thrown or never-run call is `{ isUnknown: true }`, not `isMissing: false`.

### Test

- Added `opening again > does not open the pane again when it is already open`. The test engine now answers `ui.panes` and records each `ui.open` as an open pane. Before the change it failed with `Received: ["open-prs"]`.
- Not written: a stale-tick test, an in-flight write test, and a dismissed-pane test. The harness registers once per test, the test `$` has no `$.state`, and a test cannot write plugin atoms, so a second register and the generation bump cannot be produced. The `isLive` guard is checked by review only, so the first "Done when" test is still open.

### Results

- `claude plugin test .` in open-prs: `111 pass`, `0 fail`, `Ran 111 tests across 1 file.` (110 before, plus the new test).
- Type-check: TypeScript 5.9.2, `tsc -p . --noEmit` in a scratch copy with the engine types from `session-handoff/.claude-plugin/types`: exit 0.
