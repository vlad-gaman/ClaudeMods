# Record failed CLI calls for a CLI errors card

Type: task
Status: ready-for-agent
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
