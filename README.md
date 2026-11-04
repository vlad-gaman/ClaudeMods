# ClaudeMods

Four mods for Claude Code. A mod is a plugin with a hooks module (see [GLOSSARY.md](GLOSSARY.md)). Mods need Claude Code 2.1.287 or later.

| Mod | What it does |
| --- | --- |
| [session-handoff](session-handoff/README.md) | Writes a handoff file for the current session, so a new chat can pick it up. |
| [session-panel](session-panel/README.md) | A pane showing this session's connectors, skills, context files and to-do list. |
| [switchboard](switchboard/README.md) | A side panel to switch each mod and plugin on or off. |
| [usage-band](usage-band/README.md) | A band above the prompt showing usage for this chat, the 5h window and the week. |

## Install

Load a mod from its folder for one session (nothing is written to settings):

```bash
claude --plugin-dir ./usage-band
```

Repeat the flag to load several mods. Edits reload with `/reload-plugins`.

To keep a mod installed, add a local marketplace and install from it. Only `usage-band` ships a `marketplace.json`:

```bash
claude plugin marketplace add ./usage-band
claude plugin install usage-band@local-mods
```

Docs: [Create a mod](https://code.claude.com/docs/en/plugins/mods/create.md), [Install and manage plugins](https://code.claude.com/docs/en/plugins/install.md).

## Test

Run from inside a mod folder:

```bash
cd usage-band
claude plugin test .
```

Tests live in `<mod>/tests/`, one `*.test.ts` or `*.test.tsx` file per area (pure logic in `.ts`, hook behaviour through the engine in `.tsx`). They import from `claude-code/testing`.

Stub engine calls with `on`, so no session or network is needed. For example, `usage-band/tests/band.test.ts` replaces the usage reading:

```ts
on('session.usage', () => ({ value: { context, rateLimits, cost, startedAt: 1 } }))
```

Each mod's tests repeat their own stubs; there is no shared helper code. See the official [testing docs](https://code.claude.com/docs/en/plugins/mods/test.md).

## Type-check

`claude plugin test` does not type-check. Load the mod once in an interactive session, which writes the engine types into `.claude-plugin/types/` (untracked), then run `tsc`:

```bash
claude --plugin-dir ./usage-band
npx -p typescript tsc -p ./usage-band --noEmit
```

A change to a mod is done when its tests pass and `tsc` reports zero errors.

## Docs rule

Change a README in the same commit as the behaviour it describes. Each README's first sentence matches its `plugin.json` description, and READMEs use the terms in [GLOSSARY.md](GLOSSARY.md).
