# Improve session-handoff: first tests, split, type-check, README

Status: ready-for-agent
Blocked by: 01

Apply the rules in [spec.md](../spec.md) to `session-handoff` (446-line `hooks/register.tsx`; no tests today).

1. **First test, through the hook** (`tests/handoff.test.tsx`): the `/handoff-session` command registers, and a run against a stubbed session writes a handoff document with changed files, tool tallies, links and the fallback narrative. Add the one-line `tsconfig.json`.
2. **More tests before splitting, through the hook:** file classification, tool and skill tallies, link extraction, document builder, fallback narrative, the context-trigger state machine (`isContextArmed`, re-armed below `threshold * 0.8`), argv and URL builders.
3. **Split `runHandoff` (about 220 lines, H1):**
   - `document.ts`: builders, fallback narrative, continue-prompt (H2-H4, H9).
   - `argv.ts`: open, delete and new-chat argv and URL builders, with one OS branch instead of three (H11, H12).
   - A pure trigger function (H13).
   - `view.tsx`: the band render (H10).
   - Named constants for the 120 s timeout (H8) and for `ttl`/`runBefore`/`threshold`, with a correct comment (H14).
   - Step indexes tied to `STEPS` by name, not magic numbers (H6).
   - Unit tests added for each extracted piece.
4. **Renames:** tell the two `mark`s apart (H17), stop shadowing the engine `read` (H5), drop the `messages` alias (H7).
5. **Type-check:** zero errors (1 known: `$.state.set` overload at `hooks/register.tsx:57`).
6. **README** reshaped to the template.

Audit items H1-H17 in [research/02](../../codebase-improvements/research/02-audit-structure-and-readability.md). Step 2 matters: this is the riskiest split and starts with no safety net.
