# Which register.tsx files get split, and how?

Type: grilling
Status: resolved
Blocked by:

## Question

Using the audit ([research/02](../research/02-audit-structure-and-readability.md)), decide per mod which smells to fix, the file split inside each mod, the convention for naming/placing extracted helper files, and the order (the audit suggests one). Respect the constraints in the map's Decisions so far. Decide whether tests come first for session-handoff before it is split.

## Answer

Decided with the owner (all five recommendations accepted):

1. **Scope:** behaviour-preserving only: move pure logic, data tables and render helpers into sibling files; remove duplication and dead code (unused `sourceOf`, the `list` alias, `ask`/`fileList` and last-6 duplicates, repeated SVG envelope, repeated prefix checks); rename to match `GLOSSARY.md`. Out: the `any` casts and engine typing (ticket 06) and the possible usage-band Hide-button bug (U9: Hide does not call `pinStatus`), logged as a separate bug note.
2. **Layout:** extracted files sit flat in `hooks/` beside `register.tsx`, named by role: `data.ts` (tables), a noun per pure-logic file (`document.ts`, `argv.ts`, `figures.ts`), `view.tsx` (render code). `register.tsx` keeps the hooks, `command.register`, `ui.open` and `const PANE` (switchboard regexes them, Constraint 1). First implementation step: confirm the engine bundles sibling imports from `register.tsx`.
3. **Tests:** tests import `applyTodoTool` and `severity` from their new files; no re-exports left in `register.tsx`.
4. **Renames:** usage-band `Figures.session`→`fiveHour`, `chatPercent`/`chatColor`→`contextPercent`/`contextColor`, `readCompactWindow`→`loadCompactWindow`, `pinStatus`→`setStatusLine`; switchboard `toggle`→`toggleEnabled` (`toggleClosed` stays for the Eye); session-panel atoms `files`→`contextFiles`, `used`→`connectors`, one-letter names (`us`/`ss`/`fs`/`ts`/`ic`/`ti`) given real names; session-handoff's two `mark`s told apart and the engine `read` no longer shadowed. Glossary terms Handoff, Trigger, Switch and Note added to `GLOSSARY.md`.
5. **Order (one implementation ticket per mod):** usage-band, switchboard, session-panel, session-handoff. Each follows the coverage plan: tests first, then the split.
