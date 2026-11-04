# switchboard

A side panel to switch each Claude Code mod and plugin on or off. It lists every installed mod with a switch, and for a mod that opens a pane, an eye to close or reopen that pane without disabling the mod.

## What you see

- **Mod rows**: an icon, the mod's title, a one-line description, and its slash command. The icon is the mod's own `icon.svg`, else the Lucide icon named by `lucide` in its `plugin.json`, else one picked from words in its name (a puzzle piece when none fits). The terminal shows an emoji instead.
- **Switch**: runs `claude plugin enable` or `disable` for that mod. It takes effect on reload or restart.
- **Eye**: closes or reopens the mod's pane. The mod stays enabled. It appears only for a mod that opens a pane, and not for switchboard itself.
- **Message line**: what the last switch or eye press did, or why it failed.
- **Refresh**: reads the installed mods again.

A mod here is an installed plugin with a hooks module. Plugins with only subagents or skills are not listed.

## Commands

- `/switchboard`: open the panel.

## How it finds a mod's command and panes

Switchboard reads each mod's `hooks/register.tsx` as text. Because of that, `command.register`, `ui.open` and `PANE` must stay literal in every other mod's `register.tsx`: a single-quoted `name:` in `command.register({ name: '…' })`, and `ui.open({ id: … })` with a quoted id or a `const` the id names. Move them behind a helper and the mod loses its slash command and its eye in the panel.

## Develop

```bash
claude plugin test .
```

Tests are in `tests/`: how mods are read and shown (`parse.test.tsx`), the switch and the eye (`switch.test.tsx`), the source readers (`source.test.ts`) and the name and icon picks (`names.test.ts`). The tables are in `hooks/data.ts`, the readers in `hooks/source.ts` and `hooks/names.ts`, the panel drawing in `hooks/view.tsx`, and the hooks and state in `hooks/register.tsx`.
