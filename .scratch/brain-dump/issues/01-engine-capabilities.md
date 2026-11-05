# 01 Engine capabilities for a brain-dump mod

Type: research
Status: resolved
Blocked by: none

## Question

What can a mod's hooks do that a brain-dump mod needs? Specifically: can a hook intercept a submitted prompt and replace, hold or augment it; can it read the live draft in the prompt box (for the long-draft banner) and write text back into the prompt box; can it ask the user questions (band, pane, `$.ui`) and receive typed answers; can it call a model (`$.model`) or must it inject an instruction into the main chat; what state survives restart (atoms)? Source: Claude Code mod docs (https://code.claude.com/docs/en/plugins/mods/create.md and linked pages) and the engine types the existing mods in this repo use. Write findings to `.scratch/brain-dump/research/01-engine-capabilities.md`.

## Answer

See [research/01-engine-capabilities.md](../research/01-engine-capabilities.md). A `prompt.submit` hook can replace or drop a prompt; `$.prompt.read()` / `$.prompt.fill()` read and write the draft; `$.ui.ask` asks one question per call (typed text via "Other"); `$.model.complete/fork/classify` can call a model; only `$.store` survives restart. Unverified (test early): holding a submit on `$.ui.ask`, live `$.prompt.read()`, `$.prompt.fill` mid-turn, and `$.model.complete`'s return type.
