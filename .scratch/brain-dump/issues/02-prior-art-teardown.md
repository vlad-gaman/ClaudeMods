# 02 Prior-art teardown and conflict-detection techniques

Type: research
Status: resolved
Blocked by: none

## Question

Read the source of leowei31/brain-dump-mod and andi-f-1993/mod_brain_dump (the `wrap` / hook instruction text, how they ask questions, how they detect long drafts, what breaks). Also gather how prompt-refiner and requirements-interview skills (e.g. sorbh/interview-me, ckelsoe/prompt-architect, gupsammy/claudest brainstorm) phrase questions and, if any do, detect contradictions. Summarise what to copy, what to avoid, and which conflict/ambiguity-detection techniques exist (e.g. extract claims then pairwise-check). Write findings to `.scratch/brain-dump/research/02-prior-art-teardown.md`.

## Answer

See [research/02-prior-art-teardown.md](../research/02-prior-art-teardown.md). Copy: understand/clarify/rewrite split with a "go" gate, batched questions with a recommended option first, a `minWords` length trigger plus `raw:` / `structure:` escapes, one-question-at-a-time with skip-if-inferable, stop after rounds with no new theme, visible placeholders for unknowns. Avoid: in-memory-only mode state, detection tied to a UI only one client has, calling a finding a "contradiction" to the user, relying on the model alone for contradictions. No source runs an explicit pairwise check over extracted claims; that technique is general practice, unverified. Gaps: andi-f-1993's hook source unread; sources came via fetch summaries, so re-check quoted strings.
