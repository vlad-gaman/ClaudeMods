# Record failed CLI calls for a CLI errors card

Type: task
Status: resolved
Blocked by:

## Problem

Today a failed `gh` or `az` call only sets `failedCli` ("Couldn't load PRs: gh failed or timed out"). The pane needs a list of failures with detail, and a Close that clears it (spec: [spec.md](../spec.md)).

## Goal

Record each failed CLI call: the command, exit code or timeout, time, message. Keep it in an atom, capped (say 20), cleared by a Close press. Redact tokens and credentials from the command and message before storing (URLs with `user@`, `Authorization`, `token=`, PATs). The `CliResult` in `provider.ts` carries `isMissing`/`isUnknown` only, so widen it or log at `cli()`.

## Done when

- A failed call appends an entry; a success does not; "no pull requests found" is not an error.
- Redaction has tests with a token in argv and in stderr.
- A Close action clears the list; `register` state per register stays fresh (see GLOSSARY "Pane lifecycle").
- `claude plugin test .` in `open-prs` is green.

## Comments

- Done. `hooks/cli-log.ts`: `CliFailure = { command; exitCode: number | null; isTimeout; at; message }`, `failureOf` (a gh or az call that exits non-zero; "no pull requests found" and every other tool are not failures), `thrownFailureOf` (a call that throws: timeout or cannot run), `redact` (URL credentials, `Authorization`, `token=`/`password=`/`pat=` pairs and flags, GitHub `gh*_` and `github_pat_` tokens), `withFailure` (keeps the newest 20), `recordFailure($, failure)` and `clearCliErrors($)`. The atom `cliErrors` (`CliFailure[]`, default `[]`) lives in `cli-log.ts`.
- The log is written at the port in `register.tsx` (`portOf($, s)`), not in `cli()`. That way the comment-count and thread calls are logged too, and the providers still see only the Port. Writes happen only while the register is live.
- Deviations: (1) no Close button yet: the render is unchanged, so ticket 06 wires `clearCliErrors($)` to its Close. (2) Azure DevOps PATs have no fixed shape, so they are not redacted. (3) A timeout is recognised from the thrown message only; the exit path of a timed-out `$.process.run` is not known from here.
- Tests: 161 pass (147 before, plus 14 pure cases in `tests/cli-log.test.ts`). The hook harness has no atom store (its `$` has no `state`, and the fake engine has none), so the register's recording and Close are not covered by a hook test: they are verified only by the pure functions and by the existing hook tests still passing with the port wrapper in place.
