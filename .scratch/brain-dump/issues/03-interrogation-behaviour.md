# 03 Interrogation behaviour

Type: grilling
Status: resolved
Blocked by: 02

## Question

What counts as a conflict (two points that cannot both hold) versus an ambiguity (a point with several readings) versus a gap (missing info)? Which of them must the mod ask about and which may it resolve with a stated assumption? One question at a time or a batch? Question cap and stop rule? What does the user see when no conflicts are found? How are answers folded back so the final prompt has no conflicting points?

## Answer

Decided with the user (all recommendations accepted, 2026-11-05).

- **Findings** (internal labels only; the user sees plain questions, never "contradiction"): *conflict* = two points that cannot both hold; *ambiguity* = one point with several readings that change the result; *gap* = something the task needs that the dump never says.
- **Ask vs assume:** always ask about every conflict, and about any ambiguity or gap where a wrong guess is costly or hard to undo (deleting or overwriting, security, data, money). Low-stakes ambiguities and gaps become stated assumptions, shown in a labelled Assumptions line in the final prompt for the user to veto before "go". Conflicts are never resolved silently.
- **Delivery:** one question at a time, recommended option first, conflicts first, then costly ambiguities and gaps.
- **Stop rule:** stop when no open conflict or costly ambiguity/gap remains. Hard cap of 8 questions (an option, default 8). Typing "enough" stops early. On cap or "enough", remaining items become visible assumptions or `[you fill this in: ...]` placeholders, and any still-open conflict is listed at the top of the prompt.
- **No findings:** skip the interrogation, show the structured prompt at once with one line ("No conflicts found; N assumptions listed"), wait for "go".
- **Detection:** extract the dump's atomic points (subject, requirement, value) with one model pass, then compare points sharing a subject and flag incompatible values. Not proven in any prior-art tool: the spec marks it "to validate" on sample messy dumps.
- **Fold-back:** each answer updates the points list (losing side of a conflict dropped, resolved ambiguity replaces the vague point). Only points touched by the answer are re-checked, so a conflict created by an answer is caught. The final prompt is built from the points list, never by appending answers to the dump. The original dump stays untouched (where it is kept: ticket 04).
- **Abandonment:** "cancel" restores the original dump to the prompt box, nothing runs. Any other new prompt is treated normally and the interrupted dump is kept in `$.store` for `/brain-dump resume`, expiring after about a day. The resume part is optional if `$.store` proves awkward.
