# Audit each register.tsx for structure and readability smells

Type: research
Status: resolved
Blocked by: 

## Question

Read the four `hooks/register.tsx` files (270-450 lines each). List concrete structure and readability problems per mod (mixed concerns, pure logic buried in `register`, duplication within a mod, unclear names against GLOSSARY.md), with line references and a rough size/risk for each. Findings only; no edits.

## Answer

Full audit: [research/02-audit-structure-and-readability.md](../research/02-audit-structure-and-readability.md) (per-mod tables with file:line, size, risk; untested pure logic; suggested split order). Spot-checked: switchboard reads other mods' `register.tsx` as text.

Binding constraints on any split:
- `command.register({ name` and `ui.open({ id` calls, plus the `const PANE` they name, must stay in each mod's `register.tsx` (switchboard regexes them, `switchboard/hooks/register.tsx:122-131`).
- `applyTodoTool` (session-panel) and `severity` (usage-band) are imported from `register` by tests: re-export or change the imports.

Headlines:
- session-handoff: `runHandoff` ~220 lines mixing I/O and pure logic; duplicated lists; magic step indexes; no tests.
- session-panel: `tool.call` mixes three concerns; render helpers defined inside render; 11 `as any`; data tables extractable; atoms `files`/`used` misnamed vs glossary.
- switchboard: LUCIDE table and EMOJIS/ICONS extractable; unused `sourceOf`; `refresh` mixes I/O, parsing, atom writes; `toggle`/`toggleClosed` vs glossary "Enabled/disabled", "Eye".
- usage-band: "Session" label vs `Figures.session` (5h window) clash; `readCompactWindow` writes; status line and band JSX repeat segments; Hide button may not call `pinStatus` (unchecked).
