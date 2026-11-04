# What docs get written?

Type: grilling
Status: resolved
Blocked by: 01

## Question

Decide the docs deliverables: READMEs for `session-panel` and `switchboard`, and the root README / `CLAUDE.md` section for run, test and install. Settle contents and how existing READMEs are kept consistent.

## Answer

Decided with the owner (all six recommendations accepted):

1. **Root docs:** a new root `README.md` for people: the four mods, install, test, develop. `CLAUDE.md` stays agent-skills setup plus one line pointing at the README.
2. **Install:** install from a local folder, using the steps in the official docs (check them when writing). No marketplace route promised for all four; only usage-band has a `marketplace.json`.
3. **Per-mod README template (all four):** what it does (one paragraph), what you see (pane or band), commands, develop (`claude plugin test .`). New READMEs for session-panel and switchboard; session-handoff and usage-band reshaped to the template (usage-band's "two-row box" and "Session" token row clash with `GLOSSARY.md`).
4. **Consistency:** each README's first sentence matches its `plugin.json` description; READMEs use `GLOSSARY.md` terms; the root README states the rule "change a README in the same commit as the behaviour it describes". No automated check.
5. **Testing section (root README):** the command, the `tests/` layout from the coverage plan, a pointer to the official `claude-code/testing` docs, and a few lines on stubbing engine calls such as `session.usage`. No shared helper code. This settles the map's test-fixtures-in-docs item.
6. **Left out:** LICENSE, author and icon (`claude plugin validate` directory checks), which matter only if publishing; the README's type-check section, which waits on the type-check approach ticket.
