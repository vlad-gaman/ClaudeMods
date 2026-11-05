# 01 Engine capabilities for the brain-dump mod

Type: research
Ticket: `.scratch/brain-dump/issues/01-engine-capabilities.md`
Date: 2026-11-05

## Sources

Short names used below:

- **create** = https://code.claude.com/docs/en/plugins/mods/create.md
- **events** = https://code.claude.com/docs/en/plugins/mods/events.md
- **api** = https://code.claude.com/docs/en/plugins/mods/api.md
- **interface** = https://code.claude.com/docs/en/plugins/mods/interface.md
- **reference** = https://code.claude.com/docs/en/plugins/mods/reference.md
- **d.ts** = https://raw.githubusercontent.com/anthropics/claude-code/main/mods/types/claude-code.d.ts (13,440 lines; the reference says the copy on GitHub can be older than the installed build, and the installed copy is written to `.claude-plugin/types/` on load. That directory is not in this worktree, so the installed copy could not be checked.)
- **repo** = files in this worktree

Engine types cited from d.ts are quoted from that file.

## Short answers

| Question | Answer | Mechanism | Source |
| :- | :- | :- | :- |
| Intercept a submitted prompt and replace it? | Yes | `prompt.submit` hook returns `next({ ...e, text })`. The rewritten text is what the model gets, and what is shown on screen. | events "Rewrite or add to a prompt"; d.ts `prompt.submit` |
| Stop a prompt and put it back in the box? | Yes | Return `{ drop: reason }` without `next`. The text goes back into the input box, and the user sees `Prompt dropped by a hook:` with the reason. | events; reference Events, Prompts |
| Hold a prompt until the user decides? | Probably yes, not verified | `$.ui.ask` inside a `prompt.submit` hook. Time spent inside a mods API call does not count toward the hook's 10 s limit. Not shown for `prompt.submit` in the docs; the example is `tool.call`. | events "Hold a tool call until the user decides"; reference Limits |
| Add text for Claude only (not shown in transcript)? | Yes | `next({ ...e, context: [...(e.context ?? []), text] })` | events |
| Read the live draft in the prompt box? | Yes, two ways | Pull: `await $.prompt.read()` returns `PromptBox` `{ text, cursor }`. Push: a `prompt.edit` hook gets every edit (`text`, `cursor`, `start`, `end`, `inputText`). | d.ts `PromptBox`, `PromptEditInput`, `prompt.edit` |
| Write text into the prompt box? | Yes | `await $.prompt.fill({ text, mode })`, where `mode` is `replace` (default), `append` or `insert`. It fills the draft only. The user still edits it or presses Enter. | d.ts `prompt.fill` / `$.prompt.fill`; reference Commands |
| Show a banner that reacts to the draft? | Yes | `ui.render` on `PromptHint`, which gets `isDraft`, `isWorking`, `hint`. Or on `AbovePrompt`, with a band. | reference Render sites; interface |
| Ask the user questions and get typed answers? | Yes, limited | `$.ui.ask(question, options)` shows the AskUserQuestion dialog. It resolves to the chosen label, or the text typed under "Other". Options: 2 to 4 labels, or `{ options, header, multiSelect }`. It rejects when dismissed and in `-p` runs. | d.ts `ui.ask`, `AskOptions`; events |
| Typed answers in a pane or band | Yes | `Input({ key, onSubmit, onInput })` runs `onSubmit(value)` on Enter. | interface "Take typed input"; reference Elements |
| Call a model directly? | Yes | `$.model.complete({ model, prompt, system, maxTokens, timeoutMs })`, a single tool-less call. `$.model.fork({ prompt })` runs over the session's own transcript and cache. `$.model.classify(text, labels)` picks a label. Billed to the user's session credentials. | api "Call a model"; d.ts `model` |
| Inject an instruction into the main chat instead? | Yes | `$.prompt.submit({ text })` starts a turn. Claude reads the text after a line naming the mod as sender, unless `asUser: true`. Also `next({ ...e, context })` on `prompt.submit`. | api "Start a turn from a background job"; events |
| What survives a restart? | `$.store` only | `$.store` is JSON on disk, shared by all sessions, 4 MiB total. `$.state` / `atom` lasts until the session ends or `/clear`, `/resume`, `/branch`. Module variables are lost on reload. | interface "Keep state"; reference Commands and Limits; repo `session-handoff/hooks/register.tsx` |

## Details

### 1. Prompt interception

- `prompt.submit` fires "when a prompt is submitted, before the turn starts". `next(e)` runs the hooks below and the UserPromptSubmit settings hooks. Rewrite with `next({ ...e, text })`, or stop with `{ drop: reason }`. "A broken plugin never blocks a prompt." (d.ts `prompt.submit`)
- A `drop` returned after `next` has let the prompt through does not stop the turn. The hook fails. (events)
- If the hook throws or times out, the prompt is sent. To fail closed, add `.catch` with `{ drop }` when `next.called` is false. (events "Handle a hook that fails"; reference The hook function)
- A prompt typed while a turn runs fires at Enter, with that turn's id. (d.ts `prompt.submit`)
- Other events that touch prompt text: `prompt.fill` (text about to go in the box), `prompt.edit` (each user edit), `prompt.suggest` (dim suggestion), `prompt.autocomplete`, `prompt.context`, `prompt.section`, `skill.prompt`. (reference Prompts and what Claude reads)

Holding a prompt for a user decision (inference, not in the docs for this event):
- The `tool.call` example holds a call with `await $.ui.ask(...)` (events). The docs say time spent inside a mods API call such as `$.ui.ask` does not count toward the hook time limit. Nothing says whether an awaiting `prompt.submit` hook keeps the turn from starting. Check with a test before building on it.
- An alternative that uses only documented behaviour: on the first prompt, stash the dump in an atom and return `{ drop }` or a `$.ui.ask`. When the user types `go` (a later `prompt.submit`), the hook calls `next({ ...e, text: storedStructuredPrompt })`.

### 2. Reading and writing the prompt box

Reading the draft:
- `await $.prompt.read()` resolves to `PromptBox`: `text` (the draft so far, `''` where there is no box) and `cursor` (UTF-16 offset). It is a pull call. Use it from a `ui.render` hook or a timer, for the long-draft banner. Do not poll on a timer for every keystroke. (d.ts `PromptBox`, `$.prompt.read`)
- `prompt.edit` is a push event. It fires for each key the editor treats as an edit, or a paste. The payload is the draft before the edit (`text`, `cursor`) and the splice (`start`, `end`, `inputText`). A burst of keys is one edit. `origin.kind` is `composer`. (d.ts `PromptEditInput`)
- `prompt.edit` has a 50 ms budget per hook (reference Limits). Do not do work in it. A long-draft check should run there only as a cheap length test, or read the draft from `PromptHint` / a timer.
- `prompt.edit` can rewrite the edit (`next({ ...e, inputText })`) or consume it. Do not use it for prompt replacement. The mod does not need that for this feature.

Writing the prompt box:
- `await $.prompt.fill({ text, mode })` puts `text` in the draft. `mode` is `replace` (default), `append` or `insert` (at cursor). It resolves to `PromptFilled`: `isFilled` is false when no box can take it (headless, or under a dialog) or when a `prompt.fill` hook keeps it out. (d.ts `$.prompt.fill`, `PromptFilled`)
- It does not send. The user edits the text or presses Enter. That suits a "show the structured prompt, then run on go" flow.
- `$.prompt.suggest({ text })` is different: a dim Tab-to-accept suggestion. It shows nothing while the box holds text. (d.ts `$.prompt.suggest`)

### 3. Asking questions

- `await $.ui.ask(question, options?)` shows the engine's AskUserQuestion dialog and resolves to the chosen label, the chosen labels comma-joined (multi-select), or the free text typed under "Other". "Compare it with the labels exactly." It rejects when dismissed, and in `-p` runs. Options: 2 to 4 labels. Fewer than 2 get padded with Yes/No. Object form adds `header` (12 characters max) and `multiSelect`. (d.ts `ui.ask`, `AskOptions`)
- It asks one question per call. A batch of interrogation questions means one `ask` per question, in sequence. There is no documented multi-question call.
- A pane or band can take typed answers with `Input({ key, onSubmit, onInput, rows, placeholder, submitLabel })`, plus `Button` and `Select`. Pressing Enter calls `onSubmit`. Those controls need a `key`. (interface; reference Elements)
- Panes are opened with `$.ui.open({ id, title, focus, closeOnEscape, rows, columns })`. A pane the mod opens unasked appears only from 144 columns (110 after the user has opened it once). (interface "Open a pane at the right time"; reference Limits)
- A `ui.render` hook on the `AskUserQuestion` site can restyle the dialog. Permission prompts cannot be changed by a mod. (interface "Change what Claude Code already draws")
- `ui.press`, `ui.input`, `ui.select` events fire before a mod's control callback runs. Another mod can change or block that text. (interface "Respond to presses and typing")

### 4. Calling a model

- `await $.model.complete({ model, prompt, system?, maxTokens?, timeoutMs? })` resolves to the reply's text. "No tools, no history, no system prompt beyond the CLI's identity block and `request.system`." (d.ts `complete`)
- `maxTokens` defaults to 1024, up to 64,000 (reference Limits).
- `await $.model.fork({ prompt })` runs one tool-less completion over the session's own transcript, sharing its cache. It resolves to `{ text, usage }` or `null` on a cold snapshot or API error. (d.ts `fork`)
- `await $.model.classify(text, labels, { model? })` returns the chosen label, or `undefined` when the model names none. (d.ts `classify`)
- The calls bill to the user's own session credentials (api "Call a model").
- Conflict: api.md shows `complete` returning an object (`r.isAnswered`, `r.text`, `r.usage`, `r.reason`). d.ts `complete` is typed `Promise<string>`. The two disagree. Use the installed build's `.claude-plugin/types/` file to decide, and do not depend on `isAnswered` until that is checked.

### 5. Model versus injected instruction

Both routes exist.
- Injected instruction: `prompt.submit` with `next({ ...e, context })` adds text Claude reads. `$.prompt.submit` starts a new turn from a background job. Both use the main chat and its model, and its tools.
- Direct model call: `$.model.complete` gives a single answer with no tools and no transcript. This suits a small rewrite or a conflict check that does not need the conversation.
- For a rewrite that Claude then acts on, the existing mods use injected instructions (`session-handoff` uses `$.model.fork` for its summary, `prompt.submit` for the handoff text).

### 6. State across restart

- `atom({ plugin, key }, initial)` with `read(...)` and `update(...)` from `claude-code`. Hold each atom in a `const` at module level. (interface "Keep state")
- `$.state` lasts "until the session ends, or the user runs `/clear`, `/resume`, or `/branch`". It survives a module reload, not a session end. It redraws any `ui.render` that reads it. (interface "Keep state")
- Module-level variables are lost on every module reload, which happens on each save in development. (interface)
- `$.store.get/set/delete/keys` is a JSON key-value store under `~/.claude/plugins/store/`. It is shared by every session on the machine and persists until the mod deletes the key or `cleanupPeriodDays` removes it. Total limit 4 MiB. A get followed by a set is not atomic. (interface; reference Limits and Methods)
- Repo evidence: `session-handoff/hooks/register.tsx` keeps the view in an atom (line 29) and says "The panel outlives a restart: a finished or dismissed handoff is kept in the plugin's store, and put back on `session.start`." Its `restore` reads from `$.store`. Follow that pattern for brain-dump state that must survive a restart.
- Repo evidence: `session-panel/hooks/register.tsx` lines 11 to 16 use atoms with a `{ shape }` option. No mod in the repo uses `$.store` for a draft.

### 7. Limits to design around

From reference Limits:
- Hook execution time: 10 s per event, not counting time inside `next` or a mods API call (except `$.clock.sleep`). 50 ms for `prompt.edit`.
- `.catch` handler: 1 s.
- `$.ui.invalidate('ui.render')`: throttled to 10 a second (30 in the terminal for the visible pane, the band, and the hint line).
- `$.ui.toast`: 4 s by default.
- `$.process.run`: 30 s default timeout.
- `$.store`: 4 MiB total.
- `claude -p` runs: prompts from a mod are refused at `--max-turns`. Submitting prompts at every turn end can loop without a limit (api "A claude -p run with your mod never exits").

### 8. Repo facts

- `usage-band/types/index.d.ts` and `session-handoff/types/index.d.ts` are small stubs that declare `PluginState` for atoms. They are not the engine types. The engine types are written to `.claude-plugin/types/` on load, which is untracked and not in this worktree.
- `GLOSSARY.md` already defines Engine (`$`), Atom, Band, Pane, Toast, Slash command. Its Engine list (`$.session`, `$.ui`, `$.fs`, `$.process`, `$.command`, `$.clock`, `$.http`, `$.model`, `$.env`) omits `$.prompt`, `$.store`, `$.state`, `$.tool`, `$.settings`, `$.agent`. Add `$.prompt` before the brain-dump spec uses it.

## Open items to check in a build

1. Whether a `prompt.submit` hook that awaits `$.ui.ask` holds the turn. Test with a stub mod on a local `--plugin-dir` before relying on it.
2. The return type of `$.model.complete`: string (d.ts on GitHub) or object with `isAnswered` (api.md). Check the installed `.claude-plugin/types/claude-code/index.d.ts`.
3. Whether `$.prompt.read()` returns the draft while the user is typing, or only at the moment of the call. The d.ts says "the draft as typed so far", which suggests live. Confirm in a session.
4. Whether `$.prompt.fill` can be used while a turn is running. The d.ts says it is refused "under a dialog or headless", and says nothing about a running turn.
5. Whether `ui.ask` can be used during a `prompt.submit` and whether its option limit (2 to 4) fits the interrogation questions. Most questions need free text, which goes through "Other".

## Implication for the spec

- Intercepting and rewriting the prompt is documented and simple. The structured prompt can replace the dump at submit time.
- Reading and writing the draft is documented: `$.prompt.read`, `prompt.edit`, `$.prompt.fill`. The banner can use `PromptHint` or a timer.
- Interrogation can use `$.ui.ask` for one question at a time, with free text through "Other", or a pane with `Input`. Batching many questions in one pane is possible but needs more UI work.
- Restart durability needs `$.store`. Atoms alone are lost at session end.
- Avoid a `$.model.complete` call on the critical path until its return type is confirmed.
