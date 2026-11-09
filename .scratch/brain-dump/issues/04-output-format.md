# 04 Structured prompt format

Type: grilling
Status: resolved
Blocked by: 02

## Question

Which sections does the structured prompt have (existing mods use Role/Context/Task/... or Job/Why/Context/Boundaries/Definition of done)? Fixed or adaptive to the dump? How are the user's original wording, open assumptions and resolved conflicts recorded? Where is the original dump kept?

## Resolution (2026-11-09, decided with the owner)

- **Sections: fixed core, empties dropped.** Goal, Context, Task, Constraints, Done when. A section the dump gave nothing for is omitted, not filled with "none stated".
- **Provenance: two extra sections.** `Assumptions` lists what the mod assumed (visible, so the user can correct it before "go"). `Decisions` records each resolved conflict as "X over Y, because you said so".
- **Original dump: kept in `$.store` only,** not in the prompt. Keeps the run prompt short; "cancel" (see 03) restores it from the store.
