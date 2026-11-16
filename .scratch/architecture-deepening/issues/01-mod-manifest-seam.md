# Give a mod's declared surface a seam (mod manifest)

Type: task
Status: resolved
Blocked by:

## Problem

`switchboard/hooks/source.ts` and `refresh` in `switchboard/hooks/register.tsx` (l.20-55) regex other mods' `register.tsx` source text to find command names and pane ids. A reformat or renamed const silently drops a mod from Switchboard. Tests fake `fs.read` by `endsWith`. (Regex-over-source confirmed in `source.ts`.)

## Goal

One module answers "what does this mod declare" (command, panes, icon, enabled), hiding CLI argv, install layout, `hooks.json`/`plugin.json` parsing. Switchboard reads its result instead of source text.

## Constraints

- Existing rule (codebase-improvements ticket 02): `command.register({ name` and `ui.open({ id` plus `const PANE` must stay in each `register.tsx` while Switchboard regexes them. This ticket removes that constraint; update the note.
- No change required in the other mods.
- Deletion test: deleting `source.ts` alone only moves the regexes; the seam is the fix.

## Done when

- Switchboard no longer reads other mods' source text.
- `refresh` failure paths are tested without `fs.read` fakes.
- `claude plugin test .` passes in switchboard; type-check clean per `README.md`.
- Design the interface first (see `codebase-design`, DESIGN-IT-TWICE) and record the choice here before implementing.

## Comments

### Interface chosen (decided before implementing)

Source of a mod's declared surface: `claude plugin validate --json <installPath>`. The engine analyses each mod's hooks module and reports `command.run{command=X}` and `ui.render{component=Pane, requestId=X}` in the `hooks:` note of its hooks content. Switchboard reads that output, not source text. Checked on the installed cache copies: `session-panel` gives `command.run{command=session-panel}` and `ui.render{component=Pane, requestId=session-panel}`. Its `ui.open` id is `PANE = 'session-panel'`, the same as the requestId. `open-prs` (`PANE = 'open-prs'`) matches the same way. The validate run writes nothing (`git status` on `session-panel` unchanged, cache folder untouched). About 0.7 s per mod, run in parallel per refresh.

Alternatives considered:

- **plugin.json declaration** (`"switchboard": { "command", "panes" }`): rejected. Every other mod would have to add it before it keeps its slash command and eye. That breaks "no change required in the other mods" in practice.
- **Runtime observation** (watch `command.register` and `ui.open` events): rejected. The eye would only appear after a mod's pane first opens, and the behaviour is unverified against the real engine.

Module `hooks/manifest.ts`, with two narrow ports so tests need no engine:

- `Run = (argv) => Promise<{ exitCode, stdout, stderr }>`
- `Read = (path) => Promise<string | undefined>` (used only for `plugin.json` and `icon.svg`)
- `listMods(run, read) => Promise<{ mods } | { error }>`: the whole listing. `refresh` in `register.tsx` only calls it and stores the result.

Decisions:

- A plugin is a mod when its validate output has a hooks entry (a `contents` item of type `hooks`), whether or not it names a command or pane. A skills-only plugin has none, so it is not listed.
- Validate exits non-zero, or its output is not JSON: the plugin is dropped, as an unreadable one was before.
- A mod with unreadable or invalid `plugin.json` is still listed, with an empty description.
- Pane ids are the unique `requestId`s of Pane renders. Multi-pane mods that open a pane id not rendered as a Pane are no longer closed by the eye.

Risks: the seam depends on the text of validate notes (pinned by tests). A CLI change to that wording breaks the eye and command silently; the tests catch it on upgrade.

### Review (code-review skill, staged diff)

- Standards: README and comments used "answers"/"renders" where GLOSSARY says Slash command and Pane. Fixed to "registers"/"opens".
- Spec: the recorded hooks-entry rule was not the one in the first draft of the code. Ticket now matches the code, which the tests pin.
- `declaredOf` is no longer exported (only `listMods` is the interface).
- Not changed: the old "keep the literal" rule is still recorded in .scratch/codebase-improvements/issues/02-audit-structure-and-readability.md, outside this ticket's scope.
- Not changed: test-fixture duplication and the `Read` port name (judgement calls).
