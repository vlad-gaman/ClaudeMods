# 05 Triggers, controls and options

Type: grilling
Status: resolved
Blocked by: 01

## Question

Given what the engine allows: what is the auto-detect rule (word threshold, option name and default), what does the banner offer (Structure / Ignore), which explicit commands exist (slash command, prefix), how does on/off persist, and which options go in `plugin.json`? How does "go" (and "cancel") get expressed?

## Resolution (2026-11-09, decided with the owner)

- **Auto-detect:** a draft with at least `minWords` words triggers the banner. Option `minWords` in `plugin.json`, default **200** (higher than andi-f-1993's 120, to cut false triggers on ordinary long prompts). Word count only; no structure heuristic.
- **Banner:** two choices, **Structure** (starts the interrogation) and **Ignore** (sends the draft as-is, this once).
- **Explicit triggers:** slash command `/brain-dump` (structures the current draft regardless of length), prefix `structure:` (forces the flow on a short prompt), and `/brain-dump on|off` (toggles auto-detect, persisted in `$.store`).
- **Not chosen:** a `raw:` skip prefix (the banner's Ignore covers skipping) and a "Turn off" button on the banner.
- **"go" / "cancel":** typed words in the prompt box. "go" runs the structured prompt, "cancel" restores the dump from `$.store` (see 03, 04). No dependence on `$.ui.ask` buttons.
- **Open for the spec:** the on/off default (assumed on) and any further `plugin.json` options beyond `minWords`; the question cap of 8 from 03 could also be an option.
