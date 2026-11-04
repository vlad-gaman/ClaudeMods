# What tests does each mod get?

Type: grilling
Status: resolved
Blocked by: 01

## Question

With the test loop known, decide per mod: the first test file for `session-handoff`, and which pure logic in each mod must be covered. Settle test file locations and naming (`tests/` vs `hooks/*.test.tsx` is inconsistent today).

## Answer

Decided with the owner (all five recommendations accepted):

1. **Location/naming:** every mod uses `tests/`, one file per topic (`tests/todos.test.ts`, `tests/band.test.ts`, `tests/switch.test.tsx`). Move `session-panel/hooks/register.test.tsx` and `switchboard/hooks/switchboard.test.tsx` into `tests/`; verify `claude plugin test .` still discovers them.
2. **session-handoff first test:** a basic test through the hook: the slash command registers, and a run against a stubbed session produces a handoff document with changed files, tool tallies, links and the fallback narrative. Unit tests for the extracted builders follow the ticket-05 split.
3. **Order:** tests before the split. Logic buried in `register` (session-handoff, session-panel `connTitle`/`fileKind`/`shorten`, switchboard `refresh` parsing) is tested through the hook first; direct unit tests are added as logic is extracted.
4. **Must cover:**
   - session-handoff: file classification, tool and skill tallies, link extraction, document builder, fallback narrative, context-trigger state machine, argv and URL builders.
   - session-panel: `connTitle`, `connIcon`, `fileKind`, `shorten`, MCP tool-name parse, transcript title regex.
   - switchboard: `refresh` parsing (`hooks.modules`, `command.register` and `ui.open` regexes; highest priority, since it is the contract with every other mod), `modOfPane`, `titleOf`/`emojiOf`/`lucideOf` fallbacks.
   - usage-band: `toFigures`, `compact`, `until`, `cacheLeft`, `hitPercent`, `line`, `isCurrent`/`syncChat` reset rule.
   - Skip: SVG output, icon and emoji tables, JSX layout.
5. **usage-band failing test:** fixing the missing `session.usage` stub in `tests/band.test.ts:20-25` is the first coverage item (no behaviour change). Removed from ticket 06.
