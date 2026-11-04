# Spec: improve the four mods (tests, structure, docs, type-check)

Compiled from the resolved map [codebase-improvements](../codebase-improvements/map.md). Each decision's detail lives in its ticket there; this file is the ordered plan.

Mods: `session-handoff`, `session-panel`, `switchboard`, `usage-band`. Terms follow `GLOSSARY.md`.

## Out of scope

Shared code between mods (each stays self-contained and independently installable); new features; LICENSE, author and icon; publishing or a marketplace route for all four; the usage-band Hide-button bug (log it, do not fix: Hide does not call `pinStatus`, `usage-band/hooks/register.tsx:258` vs `:269`).

## Rules for every mod

1. **Behaviour-preserving only** ([structure plan](../codebase-improvements/issues/05-structure-plan.md)). No runtime change. A real bug found along the way is logged as a bug note, not fixed.
2. **Hard constraints on any split.** `command.register`, every `ui.open` call and `const PANE` stay in `hooks/register.tsx`: switchboard regexes other mods' source for them (`switchboard/hooks/register.tsx:122-131`). `hooks/hooks.json` keeps pointing at `hooks/register.tsx`.
3. **Layout.** Extracted files sit flat in `hooks/`, named by role: `data.ts` (tables), a noun per pure-logic file (`document.ts`, `argv.ts`, `figures.ts`), `view.tsx` (render code). Tests import from the new files; no re-exports left in `register.tsx`.
4. **Tests first** ([coverage plan](../codebase-improvements/issues/03-coverage-plan.md)). All tests live in `tests/`, one file per topic. Logic still buried in `register` is tested through the hook before the split; direct unit tests are added as logic is extracted. Skip SVG output, icon and emoji tables, and JSX layout.
5. **Type-check** ([approach](../codebase-improvements/issues/06-typecheck-approach.md)). Each mod has the one-line `tsconfig.json` extending `./.claude-plugin/types/tsconfig.json`. The 18 strict errors are fixed by type-only changes.
6. **Renames** follow the glossary (listed per mod in the tickets).
7. **README** per mod follows the template ([docs plan](../codebase-improvements/issues/04-docs-plan.md)): what it does (one paragraph; first sentence matches the `plugin.json` description), what you see, commands, develop (`claude plugin test .`). Glossary terms only.
8. **Done means** for a mod: `claude plugin test .` passes, `tsc -p . --noEmit` reports zero errors, the README exists in the template, and the mod's work is one commit.

## Order

| # | Ticket | Why here |
|---|---|---|
| 01 | usage-band | smallest, has a render test, has the red test to fix; proves the convention and the assumptions below |
| 02 | switchboard | its `refresh` parsing is the contract with every mod; get it covered early |
| 03 | session-panel | |
| 04 | session-handoff | no tests and a 220-line `runHandoff`; needs the most test work before it can be split |
| 05 | root README and `CLAUDE.md` pointer | needs the verified recipe from 01 |

## Assumptions to verify in ticket 01 (the plan depends on them)

- The engine bundles sibling imports from `hooks/register.tsx`.
- `claude plugin test .` still finds tests after they move into `tests/`.
- `claude --plugin-dir ./<mod>` run interactively writes `.claude-plugin/types/` into the repo folder (the official docs say so; the research only saw it for engine-owned folders). Fallback: the scratch-copy recipe in [research/01](../codebase-improvements/research/01-test-and-typecheck-loop.md).

### Result (verified in ticket 01, 2026-11-04)

- **Sibling imports: hold.** `hooks/register.tsx` imports `./figures` and `./view` and the hooks and tests run.
- **Tests in `tests/`: hold.** `claude plugin test .` finds them.
- **`--plugin-dir` writes types: holds, interactive only.** `claude --plugin-dir ./usage-band -p "…"` wrote nothing; an interactive `claude --plugin-dir ./usage-band` wrote `.claude-plugin/types/` (with its own `.gitignore` of `*`). After that, `npx -p typescript tsc -p ./usage-band --noEmit` runs.
- **Test stubs.** A hook test that mounts the band needs `session.usage`, `session.start` (returning `{ cwd }`), `command.register` and `session.surfaces` stubs, and `session.start` must run first (see the [bug note](bugs/usage-band-hide-button.md)).
