# Map: codebase improvements

Label: wayfinder:map

## Destination

A prioritised improvement spec for the four mods (`session-handoff`, `session-panel`, `switchboard`, `usage-band`): a decided list of test, structure/readability and docs improvements, each with its approach, ready to become implementation tickets.

## Notes

- Domain: Claude Code mods. Use the terms in `GLOSSARY.md`. Consult `domain-modeling` when a term changes.
- In scope: (2) test coverage, (3) structure and readability, (4) docs.
- Out of scope: shared code across mods, new features.
- Each mod stays independently installable. Its `hooks/hooks.json` keeps pointing at `hooks/register.tsx`; a mod may split into several files inside itself, behaviour unchanged.
- Coverage means a basic test for the untested mod plus the pure logic of every mod, not a coverage percentage.
- Docs means READMEs for mods without one, plus a root README or `CLAUDE.md` section for run, test and install. No code comments.
- Plan, don't do: tickets produce decisions, not code changes.

## Decisions so far

<!-- - [title](issues/NN-slug.md): gist -->

- [How do tests and type-checking run?](issues/01-test-and-typecheck-loop.md): tests run with `claude plugin test .` per mod (usage-band has 1 failing test: missing `session.usage` stub); `tsc` can't run as committed because the tsconfig base `.claude-plugin/types/tsconfig.json` is engine-generated and absent, and staged types give 18 strict errors; no documented command exists.
- [Audit each register.tsx for structure and readability smells](issues/02-audit-structure-and-readability.md): findings per mod in `research/02-...md`; splits must keep `command.register`/`ui.open`/`const PANE` in `register.tsx` (switchboard regexes them) and keep test imports working; biggest target is session-handoff's `runHandoff`.
- [What tests does each mod get?](issues/03-coverage-plan.md): all tests move to `tests/`, one file per topic; fix usage-band's red test first; session-handoff gets a through-the-hook test, then tests before each split, unit tests added as logic is extracted; must-cover list per mod, switchboard `refresh` parsing first.
- [Which register.tsx files get split, and how?](issues/05-structure-plan.md): behaviour-preserving splits only, flat role-named files in `hooks/` (`data.ts`, noun files, `view.tsx`), `command.register`/`ui.open`/`PANE` stay in `register.tsx`; glossary-driven renames; order usage-band, switchboard, session-panel, session-handoff; `any` casts go to ticket 06, the Hide-button bug is a separate note.
- [What docs get written?](issues/04-docs-plan.md): new root `README.md` (install from local folder, test, develop; `CLAUDE.md` gets a pointer line); one README template for all four mods, first sentence = `plugin.json` description, glossary terms; update README with the behaviour in the same commit; short Testing section, no shared code; LICENSE/icon/author and the type-check docs left out.
- [Is type-checking part of the improvements, and how?](issues/06-typecheck-approach.md): yes, narrowly; documented recipe (`claude --plugin-dir ./<mod>` once, then `npx -p typescript tsc -p ./<mod> --noEmit`), generated base stays untracked, one-line tsconfig in all four mods, the 18 errors fixed by type-only changes, and "done" = tests pass and zero type errors; root README gets the recipe.

## Not yet specified



## Out of scope

- Shared code between mods (each mod stays self-contained).
- New features.

## Compiled

The destination is reached: the plan is compiled at [../mods-improvements/spec.md](../mods-improvements/spec.md), with one implementation ticket per mod and one for the root docs.
