# switchboard

A side panel to switch each Claude Code mod and plugin on or off. It lists every installed mod with a switch, and for a mod that opens a pane, an eye to close or reopen that pane without disabling the mod.

## Install

```
/plugin install switchboard --marketplace vlad-gaman/ClaudeMods
```

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

Switchboard asks the engine, not the mod's source. For each installed plugin it runs `claude plugin validate --json <folder>`, which reports what the plugin's hooks module declares: the slash command it registers (`command.run`) and the panes it opens (`ui.render` with `component=Pane`). A plugin with no hooks module is not a mod. Nothing in another mod needs a particular layout or spelling, so reformatting its `register.tsx` does not drop it from the panel. A plugin whose validate fails is left out.

## Develop

```bash
claude plugin test .
```

Tests are in `tests/`: the mod list and what each mod declares (`manifest.test.ts`, with in-memory ports and no engine), how mods are shown (`parse.test.tsx`), the switch and the eye (`switch.test.tsx`), the names and icon picks (`names.test.ts`), a session starting (`start.test.tsx`), and the pane lifecycle as the eye shows it (`lifecycle.test.tsx`, with the fake engine in `pane-lifecycle-engine.ts`; the canonical copy is `docs/fixtures/pane-lifecycle-engine.ts`). The lifecycle test cannot raise the person's close or an unload, so the state those leave is not covered by a test. The tables are in `hooks/data.ts`, the listing in `hooks/manifest.ts`, the name and icon picks in `hooks/names.ts`, the panel drawing in `hooks/view.tsx`, and the hooks and state in `hooks/register.tsx`.
