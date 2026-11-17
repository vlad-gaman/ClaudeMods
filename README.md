# ClaudeMods

Eight mods for Claude Code. A mod is a plugin with a hooks module (see [GLOSSARY.md](GLOSSARY.md)). Mods need Claude Code 2.1.287 or later.

| Mod | What it does |
| --- | --- |
| [agent-pipeline](agent-pipeline/README.md) | Runs a vault ticket through test-first implementation, review and docs to a draft PR, with four subagents. |
| [brain-dump](brain-dump/README.md) | Turns a long, unstructured prompt into one structured prompt: it asks about points that conflict or are unclear, then runs the result only after you type go. |
| [model-router](model-router/README.md) | Picks haiku, sonnet or opus once per session from the first prompt and routes plain subagents to cheaper models. |
| [open-prs](open-prs/README.md) | A side pane listing the repo's open GitHub or Azure DevOps PRs with their review state, comment count and pipeline runs. |
| [session-handoff](session-handoff/README.md) | Writes a handoff file for the current session, so a new chat can pick it up. |
| [session-panel](session-panel/README.md) | A pane showing this session's connectors, skills, context files and to-do list. |
| [switchboard](switchboard/README.md) | A side panel to switch each mod and plugin on or off. |
| [usage-band](usage-band/README.md) | A band above the prompt showing usage for this chat, the 5h window and the week. |

## Install

Clone the repo first:

```bash
git clone https://github.com/vlad-gaman/ClaudeMods.git
cd ClaudeMods
```

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

## Releases

A push to `main` releases every mod whose files changed. Each release is tagged `<mod>-v<version>`, takes the version from the mod's `.claude-plugin/plugin.json`, and attaches a zip of the mod (tracked files, without `tests/`). A mod that changed without a version bump has its tag already, so it is skipped with a warning in the run summary: bump the version to release it.

To release every mod whose current version has no release yet (the first time, or after a missed run), run the **Release mods** workflow by hand with `all` ticked. The workflow is `.github/workflows/release.yml`; the logic is `.github/scripts/release.sh`, which `DRY_RUN=1` runs without creating anything.

To use a release: unzip it and load the folder with `claude --plugin-dir ./<mod>`.
