# Audit: structure and readability of the four `hooks/register.tsx` files

Findings only. No source was edited. Line numbers are from the files as read on 2026-11-04.
Size is the effort to fix (S = under half a day, M = a day or two, L = more). Risk is the chance of changing behaviour (low / med / high).

Terms are checked against `D:\ClaudeMods\GLOSSARY.md`. The glossary has no entry for "handoff", "switch" or "to-do list as a pane", so those are noted as gaps.

## Constraints that bound any split

These apply to every mod. Any split that breaks one is high risk, even though each mod still installs on its own.

1. **Switchboard reads other mods' `register.tsx` as text.** `switchboard/hooks/register.tsx:122` reads `hooks.modules[0]`, and `:125` reads that file. It then regexes it for:
   - `command.register({ name: '...'` (`:126`), which gives the slash command shown in each row;
   - `ui.open({ id: ...` (`:129-130`), where an id can also be a `const NAME = '...'` in the same file.

   So `command.register`, every `ui.open` call, and `const PANE` (`session-panel/hooks/register.tsx:6`, `session-handoff` has no pane) must stay in `register.tsx`. If one moves, Switchboard silently loses that mod's eye and slash command.
2. **Two tests import from `register.tsx`.** `session-panel/tests/todos.test.ts:3` imports `applyTodoTool`, and `usage-band/tests/band.test.ts:3` imports `severity`. A split must either re-export them from `register.tsx` or change those imports. This is a decision for the split ticket.
3. **Engine state lives in two places.** Module-level state is used in some mods and closure state in others (see session-handoff below). Moving it changes when it resets, so treat any such move as behaviour-sensitive.

## session-handoff (446 lines)

| # | Where | Problem | Size | Risk |
|---|---|---|---|---|
| H1 | `:46-265` | `runHandoff` is about 220 lines. It reads the session, classifies files, tallies tools and skills, extracts links, asks the model for a summary, builds the Markdown document, writes two files, and reads them back to verify. The pure parts sit between the I/O. | L | high |
| H2 | `:97-111`, `:116-139`, `:166-173`, `:185-188`, `:190-222` | Pure logic buried in the flow: file classification (`changed` and `read` maps, including `read.delete` at `:110`), tool and skill counting, link extraction (`:119-124`), the fallback narrative when the model is unavailable, the continue-prompt text, and the document builder. These can become plain functions in sibling files with no behaviour change. | M | low |
| H3 | `:144-151` vs `:176-179` | `ask` and `fileList` are near-duplicates: each maps a `Map` to a Markdown bullet list with an `(xN)` suffix and a `- none` fallback. `ask` sorts and `fileList` does not, so `ask` is also a poor name. | S | low |
| H4 | `:169-172` and `:217-220` | The "last 6 requests" numbered list is built twice with the same `slice(-6)` and `${i + 1}. ${t}` mapping. | S | low |
| H5 | `:97` | `const read = new Map(...)` shadows the imported engine `read` (`:1`) inside `runHandoff`. The engine `read` is used in `register` at `:313` and `:332`. The shadowing is confusing to read. | S | low |
| H6 | `:74`, `:95`, `:114`, `:142`, `:230`, `:238`, `:259` | Step tracking is duplicated: a mutable `step` is set by hand before each block, and `mark(0..5)` (`:77`, `:88`, `:96`, `:111`, `:115`, `:135`, `:143`, `:223`, `:231`, `:239`, `:251`) passes the same magic indexes that `STEPS` (`:8-15`) defines. A reorder of `STEPS` silently breaks error attribution. | M | med |
| H7 | `:78-80` | `found` is checked for `'deny' in found` and then aliased as `messages`. The alias adds nothing. | S | low |
| H8 | `:159-162` | A 120-second timeout is written inline with `Promise.race`, and `.catch(() => null)` swallows errors from the model fork. Both are unnamed. | S | low |
| H9 | `:181-184` | Path building is done inline (`USERPROFILE` then `HOME` then `'.'`, plus the stamp and the session id prefix). Hard to test and easy to misread. | S | low |
| H10 | `:330-445` | The band's `ui.render` handler is about 115 lines. It builds the step list, the Copy, New chat, Open and Close buttons, and their click handlers inline. | L | med |
| H11 | `:391-400`, `:411-416`, `:430-432` | OS process branching is written three times inline. `isWindows` (`:267-268`) is checked at `:391`, `:411` and `:430`. `:415` uses a different test (`home.startsWith('/Users/')`) for macOS. The argv builders are pure and could be extracted. | M | med |
| H12 | `:385-390` | The "start new chat" URL is built inline, with an 8000-character cut-off at `:385`. The comment at `:383-384` gives 14,336 as the app's limit. The code uses a smaller cut-off. Neither the reason for 8000 nor the link between the two numbers is written down. | S | low |
| H13 | `:319-326` | The context trigger is a small state machine (`isContextArmed` re-armed below `threshold * 0.8`) buried in `turn.complete`. It is a pure function of `(armed, tokens)`. | S | low |
| H14 | `:272-275` | The comment above `ttl`/`runBefore`/`threshold` describes `runBefore`, not `ttl`. The magic numbers `60`, `5` and `250000` are the only documentation. | S | low |
| H15 | `:277-278`, `:37-38` | State is split. `isRunning`, `runId` (`:37-38`) and `view` (`:6`) are module-level; `cacheTimer` and `isContextArmed` (`:277-278`) are in the `register` closure. `isRunning` is checked in three places (`:50`, `:289`, `:312`). | M | med |
| H16 | `:17-21`, `:273` | Glossary gap. The trigger values `command`, `cache` and `context` are in code only, and "handoff" is not a glossary term. `ttl` is in minutes here, while `usage-band` keeps the same one-hour value as `CACHE_TTL_MS` in milliseconds (`usage-band/hooks/register.tsx:84`). These are not shared, by design. | S | low |
| H17 | `:66`, `:338` | The name `mark` means two things: a step-status setter in `runHandoff` and a status-glyph function in the render. | S | low |

Tests: none. Every item above is untested, so each split needs a first test file first.

## session-panel (419 lines)

| # | Where | Problem | Size | Risk |
|---|---|---|---|---|
| P1 | `:243-267` | The `tool.call` hook mixes three concerns: connector tracking (`:243-259`, including the MCP name parse at `:244-246`), icon fetch kick-off (`:256-258`), and to-do tracking (`:262-266`). | M | med |
| P2 | `:244-246`, `:262` | The MCP name parse is pure but inline. `String((e as any).tool)` is repeated (`:244`, `:262`). | S | low |
| P3 | `:14-64` | Data tables (`ICONS`, `CONN_ICON`, `BOX`, `FILE_ICON`, `KIND_OF`) make up about 40% of the file and sit beside logic. They can move to their own file. | S | low |
| P4 | `:24-25` | The comment on lines 24 is orphaned: it describes `BOX` (`:60-64`) but sits above `CONN_ICON`. | S | low |
| P5 | `:84-87`, `:150-153`, `:283-306` (Panel) | The SVG envelope (xmlns, width, height, viewBox) is written three times, in `svgOf`, `svgFilled` and the inline `Svg` usage. | S | low |
| P6 | `:188-191` vs `:248-252` | The "find or increment by key" update is repeated in `countSkill` and in the connector branch of `tool.call`. | S | low |
| P7 | `:162-173` | `loadTitle` mixes I/O (`:164-167`, transcript path built from `cwd`), regex parsing (`:168`), and an unescape trick (`:169`, `JSON.parse('"' + ... + '"')`). The regex parse is pure. | S | low |
| P8 | `:176-193` | `countSkill` has the pure rule "a typed command counts only if it is a skill or prompt file" at `:186`, plus the lookup at `:182`. The rule is buried with I/O at `:181`. | S | low |
| P9 | `:136-149` | `loadIcon` fetches from Simple Icons and extracts paths (`:143`). The path extraction is pure and sits inside an I/O function. | S | low |
| P10 | `:270-272` vs `:214-216` | `ui.render` pulls six atoms in one `Promise.all` (`:273-280`), then destructures them to one-letter names: `us`, `ss`, `fs`, `ts`, `ic`, `ti`. | S | low |
| P11 | `:273`, `:7` | Glossary drift. `fs` (`:273`) is confusing next to `$.fs`. The atom `used` (`:7`) holds Connectors, and `icons` (`:8`) holds connector rows. The atom `files` (`:10`) holds Context files, but Panel is titled "Context files" (`:373`). | S | low |
| P12 | `:283-344` | Render helpers `Panel`, `Sep`, `Slot`, `Item`, `rows` are defined inside the handler, so they are recreated on each render. They are the natural first split into a rendering file. | M | med |
| P13 | `:272` and `:233-272` | `'Svg' in ui ? (ui as any).Svg : null`. The file has 11 `any` casts (`:96`, `:136`, `:162`, `:176`, `:195`, `:233`, `:234`, `:244`, `:262`, `:264`, `:272`). Each one hides an engine type the mod could declare. | M | low |
| P14 | `:215`, `:221` | `ui.open({ id: PANE, title: 'Session' })` is written twice. | S | low |
| P15 | `:179`, `:181` | The command-list row type `{ name; description; source }` is written inline twice. | S | low |
| P16 | `:239` | `e.command !== 'session-panel' && e.origin?.kind !== 'plugin'` is a magic-string rule. A named predicate would say what it means. | S | low |
| P17 | `:49-52` | `KNOWN_CONNECTORS` hard-codes two connector ids for this person's account (Gmail, Claude Docs). The comment explains why, but the data is personal and lives in code. | S | low |

Tests: `session-panel/hooks/register.test.tsx` covers connector tracking (`:34`) and skill counting (`:44-74`) through the hook, 5 tests in all. `session-panel/tests/todos.test.ts` covers `applyTodoTool` (9 tests).

## switchboard (293 lines)

| # | Where | Problem | Size | Risk |
|---|---|---|---|---|
| S1 | `:25-77` | `LUCIDE` is a 53-line icon-markup table in the middle of the logic. It can move to its own file as-is. | S | low |
| S2 | `:19-23`, `:78-92` | `EMOJIS` and `ICONS` both map the same twelve words (usage, cost, tool, git, guard, sound, lint, switch, theme, clock, note, search) to a glyph or icon name. The word list is kept twice and can drift. | S | low |
| S3 | `:102` | `sourceOf` is never used. | S | low |
| S4 | `:16-17`, `:23`, `:92` vs `:103` | `nameOf` is used before it is defined (`:103`). It works, but reads badly. | S | low |
| S5 | `:110-147`, `:122-131` | `refresh` mixes process I/O (`:111`), JSON parsing (`:117`, `:122`, `:124`), regex parsing of another mod's source (`:126`, `:129-130`), icon read (`:132`), and writing the `mods` atom (`:141`). Pure parsers (`commandNameOf`, `panesOf`) can be extracted. The `JSON.parse(... as string)` pattern repeats at `:122` and `:124`. `JSON.parse` at `:117` is outside any try block, so bad output throws out of `refresh`. | M | med |
| S6 | `:126`, `:129-130` | The regexes depend on the exact text of other mods' source. This is the Constraint 1 above. Moving any `command.register` or `ui.open` out of `register.tsx` breaks this silently. | S (to document) | high if moved |
| S7 | `:153-175` | `toggleClosed` (eye) and `toggle` (enable/disable) follow the same pattern: act, then write a `note` message. `note` is written at `:113`, `:165`, `:171`. | S | low |
| S8 | `:168` | `toggle` is named for enable/disable. Glossary: "Enabled / disabled". The eye is `toggleClosed` (`:153`), and the glossary term is "Eye" (`GLOSSARY.md:22`). A reader cannot tell which toggle is which. | S | low |
| S9 | `:108`, `:217` | The atom `note` (`:108`) is called `message` in the render (`:217`). Glossary has no term for it. | S | low |
| S10 | `:215-216` | `const list = all` (`:216`) is an alias that adds nothing. | S | low |
| S11 | `:206`, `:253` | The `'switchboard@'` prefix check is written twice. | S | low |
| S12 | `:94-101` vs `:247-248` | `plainIcon` duplicates the SVG header from `iconSvg`. | S | low |
| S13 | `:231-245`, `:250-269` | `control` (switch) and `eye` both use the overlay trick (picture in flow, Button over it with a negative margin, comment at `:249`). The fallback branch is repeated too. A shared helper inside the file would remove one copy. | S | low |
| S14 | `:221-227` | `switchSvg` is a pure SVG generator inside the render. | S | low |
| S15 | `:212`, `:219` | `as Record<string, any>` (`:212`) and `e.surface === 'desktop' ? ui.Svg : undefined` (`:219`) differ from session-panel's `'Svg' in ui` check (`session-panel:272`). The same engine capability is read two ways. | S | low |
| S16 | `:12-14` | `BLURBS` hard-codes `'usage-band'`. Switchboard therefore knows about one other mod by name. | S (to note) | low |
| S17 | `:7`, `:9` | `CELL_PX` and magic widths `5`, `2`, `38`, `20` (`:222`, `:233`, `:235`, `:237`, `:258`) are explained in the comments at `:7-8` only. | S | low |
| S18 | `:111` | `claude plugin list --json` and `claude plugin` enable/disable (`:170`) are inline. Only `refresh` and `toggle` use them. | S | low |

Tests: `switchboard/hooks/switchboard.test.tsx` covers the switch on desktop (`:43`) and the eye (`:54`). It does not cover `refresh` parsing, the `ui.open`/`ui.close` pane tracking (`:187-201`), or `command.run` (`:203-209`).

## usage-band (273 lines)

| # | Where | Problem | Size | Risk |
|---|---|---|---|---|
| U1 | `:33` vs `:100`, `:128`, `:229-230` | Glossary clash. `Figures.session` (`:33`) holds the **5-hour rate-limit window**, but the band labels chat tokens "Session" (`sessionText`, `:100`; JSX `:229-230`). Glossary says "Session" means the chat, and "5h" means the rate-limit window (`GLOSSARY.md:26`, `:30`). The field name points the wrong way. | M (rename across types) | med |
| U2 | `:97`, `:57`, `:224` | `chatPercent` and `chatColor` format and colour the **context** percentage, not the chat. The names contradict the glossary's "Context". | S | low |
| U3 | `:125-135` and `:219-261` | The status line (`line`) and the band JSX build the same segments twice (Context, Session, Cost, 5h, Week, Cache). The cache warm/cold text is computed in both (`:132`, `:216`, `:251-256`). The two copies can drift. | M | med |
| U4 | `:20-23`, `:151`, `:195`, `:208` | `readCompactWindow` writes the `compactWindow` atom. It does not read it. The name is misleading. | S | low |
| U5 | `:138-147` | `pinStatus` sets the status line. Glossary term: "Status line". The name does not match. | S | low |
| U6 | `:61-62`, `:211` | `isCurrent` checks two things: the state shape (`typeof c.up`) and optionally `startedAt`. Its call at `:211` omits `startedAt`, so the two uses check different things under one name. | S | low |
| U7 | `:65-81`, `:154` | `syncChat` resets the chat's token counts when `startedAt` moves (`/clear`). It also adds deltas. Its name hides the reset. `refresh` calls it with zeros (`:154`) to trigger the reset. | S | low |
| U8 | `:149-156`, `:174-180` | `refresh` and `session.measure` both run `toFigures` then `pinStatus`. The sequence is duplicated. | S | low |
| U9 | `:258` | The Hide button calls `update(isHidden, true)` and does not call `pinStatus`. The `command.run` toggle does call it (`:269`). So after Hide, the status line on VS Code and mobile can keep showing until the next refresh. Possible inconsistency, not checked at runtime. | S | med |
| U10 | `:106-111` | `WRITE_USD_PER_MTOK = 10` (`:108`) is a price assumption. The comment states it. `recacheText` (`:110-111`) mixes the price with formatting. | S | low |
| U11 | `:202-219` | The render handler computes `toFigures(await $.session.usage(), ...)` when the atom is empty (`:209`), so a render can call the engine. | S | low |
| U12 | `:159-165` | `session.start` calls `next` first, then registers the command and refreshes. Other hooks call `next` last. Ordering is inconsistent. | S | low |
| U13 | `:20-23`, `:25-35` | `compactWindow` (`:16`) is declared apart from the other atoms (`:6-8`). `limit` (`:27`, `:152`) means the compact window, which is easy to mix up with the rate limits. | S | low |
| U14 | `:84`, session-handoff `:273` | The one-hour cache TTL appears in two mods with different units. Each mod keeps its own copy; this is noted, not a shared-code proposal. | S (to note) | low |

Tests: `usage-band/tests/band.test.ts` covers the band render end to end on two surfaces (`:20-42`, including the Hide press at `:34`) and `severity` (`:44-46`). Exported functions `line`, `compact`, `until`, `cacheLeft`, `hitPercent`, `toFigures` and `isCurrent` are not tested directly. `compact` and the cost text are reached only through the band test.

## Pure logic that is not tested (for the coverage ticket)

| Mod | Pure function(s) | Location |
|---|---|---|
| session-handoff | `fileOf`, `stamp`, `clip` | `:26-35` |
| session-handoff | file classification (changed, read) | `:97-111` |
| session-handoff | tool and skill tallies, link extraction | `:116-139` |
| session-handoff | fallback narrative, continue-prompt, document builder | `:166-173`, `:185-188`, `:190-222` |
| session-handoff | context trigger state machine | `:319-326` |
| session-handoff | argv builders for open, delete and new chat, and the URL builder | `:385-400`, `:430-432` |
| session-panel | `connTitle`, `connIcon`, `CONN_WORDS` lookup | `:43-58` |
| session-panel | `fileKind`, `KIND_OF` | `:75-82` |
| session-panel | `shorten` | `:156-159` |
| session-panel | MCP tool-name parse | `:244-246` |
| session-panel | transcript title regex and path | `:162-173` |
| session-panel | `svgFilled` / `svgOf` output | `:84-87`, `:150-153` |
| switchboard | `titleOf`, `emojiOf`, `lucideOf` | `:16-23`, `:92` |
| switchboard | `iconSvg` (incl. the `icon.svg` overlay path) | `:94-101` |
| switchboard | `refresh` parsing: `hooks.modules`, `command.register` regex, `ui.open` regex | `:119-135` |
| switchboard | `modOfPane` | `:149` |
| usage-band | `toFigures`, `compact`, `until`, `cacheLeft`, `hitPercent`, `cacheDetail`, `recacheText`, `line` | `:25-135` |
| usage-band | `isCurrent`, `syncChat` reset rule | `:61-81` |

Already tested and pure: `severity` (usage-band, `:54`), `applyTodoTool` (session-panel, `:96-132`), and the countSkill rule through the hook (session-panel, `:176-193`).

## Suggested split order (for the split ticket, not a decision)

1. session-handoff (L): move the pure builders and the step state out of `runHandoff`; first add a test file. Highest structural debt, zero tests.
2. usage-band (M): fix the `Figures.session` and `chatPercent` naming (U1, U2) and pull the duplicated status-line segments into one helper (U3). Existing band test covers the render.
3. session-panel (M): move `LUCIDE`-style data tables and the render helpers (P3, P12). Keep `PANE`, `command.register` and `applyTodoTool` exports in `register.tsx`.
4. switchboard (S to M): move `LUCIDE` (S1), delete `sourceOf` (S3), and document Constraint 1 (S6) before touching `refresh`.

## Summary

- Four files, 1,431 lines in total. session-handoff is the worst case: one 220-line function holds I/O and pure logic together, and it has no tests.
- Each mod has one or two clear naming clashes against the glossary: `Figures.session` (usage-band), `chatPercent` (usage-band), `toggle` vs `toggleClosed` (switchboard), `files` vs "Context files" (session-panel).
- Switchboard's regex reading of other mods' source (`switchboard/hooks/register.tsx:125-131`) limits every split: `command.register`, `ui.open` and `PANE` must stay in each `register.tsx`.
- Existing tests reach only parts of session-panel and usage-band through the hook, plus `applyTodoTool` and `severity`. The rest of the pure logic listed above is untested.
