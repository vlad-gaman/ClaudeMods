# Map: brain-dump mod

Label: `wayfinder:map`

## Destination

A decided spec at `.scratch/brain-dump/spec.md` for a new **brain-dump** mod in this repo, ready to hand to a build session. The mod takes a long, unstructured prompt, interrogates the user about anything conflicting or ambiguous, shows one structured prompt, and runs it only after the user says "go". Triggers: auto-detect long drafts (banner) plus explicit commands and an on/off toggle.

## Notes

- Domain: Claude Code mods (see `GLOSSARY.md`, `README.md`). Use glossary terms; add new ones (e.g. Dump, Interrogation) to the glossary only when the spec settles them.
- Prior art (2026-11-05): [leowei31/brain-dump-mod](https://github.com/leowei31/brain-dump-mod) (explicit `/dump` / `dump:` trigger, a `wrap` hook text, asks a batch of questions, runs on "go"; output Role/Context/Task/Inputs/Constraints/Steps/Output format/Success criteria/Assumptions) and [andi-f-1993/mod_brain_dump](https://github.com/andi-f-1993/mod_brain_dump) (auto-detect at `minWords`=120, banner with Ignore, `raw:` / `structure:` prefixes, `/brain-dump on|off`, result placed in prompt box; output Job/Why/Context/Boundaries/Definition of done). Both have 0 stars and 3 commits. Neither mentions conflict detection: that is this mod's differentiator.
- Planning only: decisions, not code.
- User decisions so far: own mod (not a fork); trigger = both auto and explicit; final step = run after the user says "go".

## Decisions so far

- [01 Engine capabilities](issues/01-engine-capabilities.md): hooks can intercept, replace or drop a submitted prompt, read and fill the draft, ask via `$.ui.ask`, call a model; only `$.store` persists. Several behaviours unverified.
- [02 Prior-art teardown](issues/02-prior-art-teardown.md): copy the "go" gate, length trigger with escapes, skip-if-inferable questions; avoid memory-only state; no existing tool does explicit conflict checking.
- [03 Interrogation behaviour](issues/03-interrogation-behaviour.md): internal conflict/ambiguity/gap split; always ask conflicts and costly items, assume the rest visibly; one question at a time, cap 8, "enough" to stop; extract-then-compare detection (to validate); answers update a points list; "cancel" restores the dump, resume via `$.store` optional.

## Not yet specified

- Where the interrogation happens (in chat, in a pane, or in a band) and how answers come back: depends on what the engine allows.
- Whether the mod rewrites via a hook-injected instruction (like both existing mods) or calls `$.model` itself: depends on engine capabilities.
- Test plan, README and glossary wording, mod name/slash command names.

## Out of scope

- Voice recording / dictation (both existing mods rely on an external dictation tool).
- Executing the structured prompt's task; the mod only structures and hands off.
