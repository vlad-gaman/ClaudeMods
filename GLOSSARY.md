# Glossary

The words the code uses. Use these terms in names, comments, issues and replies. Taken from the current code only.

## Mods

- **Mod**: a plugin that has a hooks module. Plugins without one (skill or subagent plugins) are not mods. _Switchboard `refresh`._
- **Hooks module**: the file a mod lists in `hooks/hooks.json` (`register.tsx`). It exports `register`.
- **Register**: the function that attaches a mod's hooks with `on(event, hook)`.
- **Engine** (`$`): what a hook calls to reach the session: `$.session`, `$.ui`, `$.fs`, `$.process`, `$.command`, `$.clock`, `$.http`, `$.model`, `$.env`, `$.prompt`, `$.store`.
- **Atom**: a mod's saved state, keyed by plugin and key (`atom({ plugin, key }, initial)`), read with `read` and changed with `update`.
- **Enabled / disabled**: whether the mod is switched on. It takes effect on reload or restart.

## Interface

- **Pane**: a docked panel a mod opens with `$.ui.open({ id })`. Session Panel, Switchboard and Open PRs each draw one.
- **Band**: a block drawn above the prompt (`AbovePrompt`). Usage Band, Session Handoff and Brain Dump draw bands. Each passes control on so other mods' bands also draw.
- **Status line**: where Usage Band puts its figures on surfaces with no band (VS Code, mobile).
- **Surface**: where the session is shown: `desktop`, `vscode`, `mobile`.
- **Toast**: a short message from `$.ui.toast`.
- **Slash command**: a command a mod registers with `$.command.register` (`/switchboard`, `/session-panel`, `/usage-band`, `/handoff-session`, `/brain-dump`, `/prs`, `/route`).
- **Switch** (Switchboard): the control that enables or disables a mod.
- **Note** (Switchboard): the one-line message shown after the last action.
- **Eye** (Switchboard): the control that closes or reopens a mod's pane without disabling the mod.

## Pane lifecycle

- **Placed**: a pane the surface has drawn. An open answers `isPlaced: true`; an open that waits undrawn (`isPlaced: false`) is open but not placed. Switchboard's eye treats a placed pane as open.
- **Closed on unload**: a pane the engine dropped because its plugin unloaded (close origin `unload`). Not a dismissal: the mod opens its pane again at its next session. _Avoid_: dismissed.
- **Dismissed**: a pane the person closed by hand (close origin `person`: the close mark or ctrl+x x). A mod keeps a dismissed pane closed: no open at a session start, a refresh or a turn, across reloads, until its command reopens it. The mod saves the dismissal in its own atom. _Avoid_: hidden, collapsed.
- **Closed by a plugin**: a pane a plugin closed with `$.ui.close` (close origin `plugin`, such as the eye). Not a dismissal: the mod opens it again at its next session.
- **Reopen by command**: the mod's slash command clears its dismissed state and opens the pane, placed or not.

## Session

- **Session**: one run of Claude Code. Also called the **chat** in Usage Band.
- **Turn**: one prompt and its answer.
- **Context window**: the model's token capacity. **Context** is how much of it is used. The **compact window** is the size auto-compact measures against.
- **Prompt cache**: the cached prompt, kept alive for one hour (`CACHE_TTL_MS`; Session Handoff takes it from its `cache_minutes` option, default 60). It is **warm** while time remains and **cold** after. Before any call has touched it (a new session) it is **empty**, neither warm nor cold.
- **Prompt cache lifetime**: how long the prompt cache stays warm after a call, in minutes (default 60). Usage Band and Session Handoff each take it from their own `cache_minutes` option; the engine does not expose it, so a change must be made in both mods.
- **5h** and **Week**: the two rate-limit windows (`five_hour`, `seven_day`).
- **Connector**: an MCP server a tool call came from (`mcp__<server>__<tool>`). Session Panel lists the ones used.
- **Skill**: a skill or prompt file run by the Skill tool or typed as a slash command. Built-in and MCP commands are not skills.
- **To-do**: one item of the session's task list, with status `pending`, `in_progress` or `completed`. Set by `update_plan`, `TodoWrite`, `TaskCreate` or `TaskUpdate`.
- **Context files**: the memory files loaded into the session, listed with their token counts.
- **Handoff** (Session Handoff): a document that summarises a session, with a prompt to continue it in a new chat.
- **Trigger** (Session Handoff): what starts a handoff: the slash command (`command`), the prompt cache about to go cold (`cache`), or context nearing its limit (`context`).
- **Dump** (Brain Dump): a long, unstructured prompt the owner types or pastes.
- **Interrogation** (Brain Dump): the questions asked, one at a time, about points in a dump that conflict, are unclear or are missing and costly to guess.
- **Structured prompt** (Brain Dump): the one prompt built from the dump and the answers (Goal, Context, Task, Constraints, Done when, Decisions, Assumptions). It is sent only when the owner types `go`.
- **Pending dump** (Brain Dump): the dump and its structured prompt, kept in `$.store` per session until `go`, `cancel` or 24 hours pass.

## Open PRs

- **Branch PR**: the open PR for the current branch, marked in the pane.
- **Card**: one of the boxes in the Open PRs pane: **This session**, **Other open PRs**, and **CLI errors**. The first two share one look: a header, a status bar, a legend, and the branches or PRs.
- **Pane model**: what the Open PRs pane shows, worked out from the mod's atoms: loading, failed, no remote, or ready with its two cards. The view only draws it.
- **Snapshot**: what one fetch found: the repo's PRs, the branch PR, its runs and the session's branches. Each field is tri-state: unknown (the call failed, so the last answer stays), none (confirmed, so it clears) or a value.
- **Publish**: applying a snapshot to the pane's atoms, only while its register is still the live one.
- **Run**: a pipeline run (GitHub check or Azure pipeline) shown with its state.

## Model Router

- **Tier**: `haiku`, `sonnet` or `opus`.
- **Lock**: the tier chosen once for the session from the first prompt. **Pinned** when set with `/route <tier>`, so prompts never raise it.
- **Skill log**: the per-run record of a skill's models, time and cost.
- **Skill run**: one use of a skill, from its `Skill` call or typed command to its end, logged with its models, time and cost. Not the Open PRs **Run**, which is a CI pipeline run.

## Agent Pipeline

- **Pipeline**: one ticket taken through tester, implementer, reviewer and documenter to a draft PR.
- **Run flag**: set by `pipeline_begin` and cleared by `pipeline_end`; while set, Jira and Confluence writes are refused.
- **Shell refusal**: the reason a Bash or PowerShell command line is refused, or none when it may run. `az` writes are refused to everyone; terraform and package publishing only to pipeline agents.
- **Role**: one of `implementer`, `tester`, `documenter`, `reviewer`.
