# Glossary

The words the code uses. Use these terms in names, comments, issues and replies. Taken from the current code only.

## Mods

- **Mod**: a plugin that has a hooks module. Plugins without one (skill or subagent plugins) are not mods. _Switchboard `refresh`._
- **Hooks module**: the file a mod lists in `hooks/hooks.json` (`register.tsx`). It exports `register`.
- **Register**: the function that attaches a mod's hooks with `on(event, hook)`.
- **Engine** (`$`): what a hook calls to reach the session: `$.session`, `$.ui`, `$.fs`, `$.process`, `$.command`, `$.clock`, `$.http`, `$.model`, `$.env`.
- **Atom**: a mod's saved state, keyed by plugin and key (`atom({ plugin, key }, initial)`), read with `read` and changed with `update`.
- **Enabled / disabled**: whether the mod is switched on. It takes effect on reload or restart.

## Interface

- **Pane**: a docked panel a mod opens with `$.ui.open({ id })`. Session Panel and Switchboard each draw one.
- **Band**: a block drawn above the prompt (`AbovePrompt`). Usage Band and Session Handoff draw bands. Each passes control on so other mods' bands also draw.
- **Status line**: where Usage Band puts its figures on surfaces with no band (VS Code, mobile).
- **Surface**: where the session is shown: `desktop`, `vscode`, `mobile`.
- **Toast**: a short message from `$.ui.toast`.
- **Slash command**: a command a mod registers with `$.command.register` (`/switchboard`, `/session-panel`, `/usage-band`, `/handoff-session`).
- **Switch** (Switchboard): the control that enables or disables a mod.
- **Note** (Switchboard): the one-line message shown after the last action.
- **Eye** (Switchboard): the control that closes or reopens a mod's pane without disabling the mod.

## Session

- **Session**: one run of Claude Code. Also called the **chat** in Usage Band.
- **Turn**: one prompt and its answer.
- **Context window**: the model's token capacity. **Context** is how much of it is used. The **compact window** is the size auto-compact measures against.
- **Prompt cache**: the cached prompt, kept alive for one hour (`CACHE_TTL_MS`; Session Handoff takes it from its `cache_minutes` option, default 60). It is **warm** while time remains and **cold** after.
- **5h** and **Week**: the two rate-limit windows (`five_hour`, `seven_day`).
- **Connector**: an MCP server a tool call came from (`mcp__<server>__<tool>`). Session Panel lists the ones used.
- **Skill**: a skill or prompt file run by the Skill tool or typed as a slash command. Built-in and MCP commands are not skills.
- **To-do**: one item of the session's task list, with status `pending`, `in_progress` or `completed`. Set by `update_plan`, `TodoWrite`, `TaskCreate` or `TaskUpdate`.
- **Context files**: the memory files loaded into the session, listed with their token counts.
- **Handoff** (Session Handoff): a document that summarises a session, with a prompt to continue it in a new chat.
- **Trigger** (Session Handoff): what starts a handoff: the slash command (`command`), the prompt cache about to go cold (`cache`), or context nearing its limit (`context`).
