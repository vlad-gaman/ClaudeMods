# switchboard: the pane watchers read the wrong fields, so they may never fire

Status: needs-triage

Found while doing [02-switchboard](../issues/02-switchboard.md). Not fixed there (behaviour-preserving only). Both are the type errors the type-check reported; they were silenced with type-only casts that keep today's behaviour.

- **`ui.open` hook** (`switchboard/hooks/register.tsx`, the `on('ui.open', …)` hook): reads `result.isPlaced`, but `next(e)` answers `{ value: { isPlaced } }`. So `isPlaced` is always undefined and a mod is never taken off the closed list when its pane opens from outside (its own `session.start`, a command, the person). The eye's own reopen still works, as it updates the list itself.
- **`ui.close` hook** (the `on('ui.close', …)` hook): compares `e.origin === 'unload'`, but `origin` is an object `{ kind: 'person' | 'plugin' | 'unload' }`. So the unload case is never skipped, and a mod whose pane closes on unload is marked closed.

If both are real, the fix is `result.value.isPlaced` and `e.origin.kind === 'unload'`. Not reproduced: a test cannot drive `ui.open` or `ui.close` from the engine's `$` (neither is a function there), which is also why these hooks have no test.

## Also noticed

`refresh` calls `JSON.parse(ran.stdout)` outside a try block: if `claude plugin list --json` prints something that is not JSON, `refresh` throws and the panel keeps its old list with no message. Fix would be a try with a message on the `note` line.
