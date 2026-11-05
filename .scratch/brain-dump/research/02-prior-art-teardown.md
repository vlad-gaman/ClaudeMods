# 02 Prior-art teardown and conflict-detection techniques

Type: research. Verified 2026-11-05 by fetching public GitHub and raw.githubusercontent.com pages (WebFetch, which summarises through a small model). Quotes marked "verbatim" were returned by the fetch; anything not quoted was paraphrased by the fetch and should be checked against the raw file before reuse. Fetched content was treated as untrusted data; nothing was executed.

## Short answer

- **Copy from leowei31/brain-dump-mod:** the "understand, clarify, rewrite" phase split, the batched clarifying questions through a question tool with a recommended option first, the "do not run until I say go" gate, and the `dump:` prefix trigger.
- **Copy from andi-f-1993/mod_brain_dump:** the `minWords` threshold (default 120) with a visible "detected" signal before Enter, and the `raw:` / `structure:` escape hatches.
- **Copy from sorbh/interview-me:** one question at a time, a coverage tracker, "never ask things that can be inferred", and a hard-block rule for security gaps.
- **Copy from gupsammy/claudest brainstorm:** rotating question styles, and a saturation rule (propose closure after 4+ rounds with no new theme).
- **Avoid:** relying on the model to notice contradictions with no procedure (every source does this), and exposing a "contradiction" label to the user (brainstorm explicitly avoids it).
- **Gap:** no fetched source runs an explicit pairwise contradiction check over extracted claims. The closest is interview-me's optional red-team pass. If the mod needs real conflict detection, it has to be designed here, not borrowed.
- **Gap:** two source files could not be read: andi-f-1993's hook source (the `hooks/` folder listing timed out and guessed paths returned 404) and prompt-architect's question wording beyond the README. Their wording claims below rest on READMEs only.

## Sources and what each one shows

### leowei31/brain-dump-mod

Repo: https://github.com/leowei31/brain-dump-mod. Root: `.claude-plugin/`, `brain-dump/`, `README.md`.

- Source of the wrap text: `brain-dump/hooks/register.tsx` (fetched from https://raw.githubusercontent.com/leowei31/brain-dump-mod/main/brain-dump/hooks/register.tsx).
- The wrapper opens with the role and no-execution rule, verbatim: "You are a prompt-engineering partner." and "Do NOT carry out the task yet." It defines three phases (Understand, Clarify, Rewrite), ends with "Only execute after I say go.", and wraps the dictation in `<brain_dump>` tags.
- Question mechanism, verbatim: "Use the AskUserQuestion tool to ask the 3 to 6 questions whose answers would most change the final prompt." Also "Batch them in one call. Offer concrete options with your recommended one first." and "Skip anything you can infer or look up in the codebase. Ask nothing the dump already answered."
- Activation: `/dump` arms the next message (status "brain-dump: armed"); `/dump on` or `always` wraps every message; `/dump off` disables; `dump:` prefix matched by `/^\s*dump\s*:\s*/i`. In `next` mode the mode resets after one wrapped prompt. Skips commands, meta messages and non-user origins.
- Output: nine sections (Role, Context, Task, Inputs, Constraints, Steps, Output format, Success criteria, Assumptions).
- Long-draft detection: none. The README says the source does not describe one.
- Known limits (README): needs a Claude Code build that supports mods; mode state is in memory and resets on mod reload; quality depends on the dictation tool's transcription.

### andi-f-1993/mod_brain_dump

Repo: https://github.com/andi-f-1993/mod_brain_dump. Root: `.claude-plugin/`, `hooks/`, `tests/`, `types/`, `README.md`, `tsconfig.json`.

- Long-draft detection (README): a draft of at least `minWords` words (default 120) is not run. An orange line above the prompt box says "Brain dump detected" before Enter, so the user sees it before sending. Threshold set in `/config`.
- Output: Claude pulls out requirements, asks clarifying questions where something material is missing, and writes a prompt under five headings: Job, Why, Context, Boundaries, Definition of done. The result goes into the prompt box, not sent.
- Controls: `raw: ...` sends unchanged; `structure: ...` structures a short prompt; `/brain-dump on|off` persists across sessions.
- Limits (README): the Ignore button exists only in Claude Code; in the Projects app Claude cannot see drafts, so detection appears only in the reply; short prompts are not auto-structured.
- Not verified: the hook source that builds the instruction text. The `hooks/` listing timed out, and `hooks/index.ts` returned 404. Re-check before quoting its wording.

### sorbh/interview-me

Repo: https://github.com/sorbh/interview-me. The skill is at `skills/interview-me/SKILL.md` (the top-level SKILL.md path returned 404; the fetched SKILL.md file is the one under `skills/`).

- Phrasing: asks through AskUserQuestion, one question at a time. Verbatim: "One question at a time — Never batch questions." 2 to 4 options each; avoid obvious choices. A coverage tracker before each question (e.g. "Problem [done] | Users [done] | API Design [in progress]").
- Inference rule, verbatim: "Never ask things that can be inferred from the input or codebase analysis."
- Contradictions: verbatim-like rule "Contradictions with previous answers → Challenge directly." Also probes "Missing edge cases". If the user pushes back, one or two follow-ups, then accept and record both positions in a Decisions Log.
- Ambiguity: no separate check. Vague answers are handled by gap probing and follow-ups.
- Red-team pass (optional, separate agent): looks for "answers that conflict across coverage areas, incompatible assumptions" under a Contradictory Decisions dimension; findings already in the Decisions Log are dropped. This is the nearest thing to a pairwise check in the sources, and it runs after the interview, not during it.
- Hard block: security and privacy gaps must be addressed or explicitly accepted before the spec is written.

### ckelsoe/prompt-architect

Repo: https://github.com/ckelsoe/prompt-architect. Skill at `skills/prompt-architect/SKILL.md` (fetched). The question-count and sample-question bullets come from the README; the framework, placeholder and contradiction bullets come from SKILL.md, which was fetched but summarised by the fetch tool, not quoted.

- Questions (README): "Asks 3-5 targeted questions at a time"; adapts to the framework chosen; sample numbered questions such as "What type of user data? (names, emails, profiles, etc.)".
- Each framework has a canned question set. Questions open by asking for the user's own material (document, data, draft) before situation, audience and output format.
- Unknown facts become visible `[you fill this in: ...]` placeholders, not invented defaults. Stated prohibitions must carry into the final prompt as explicit "Do not" / "Never" lines. Worth copying.
- Contradictions: no explicit cross-check of answers. "Ask Before Assuming" says to clarify ambiguities but gives no procedure. Ambiguity is scored in a rubric on the original prompt ("Is the goal clear and unambiguous?"), not on answers.

### gupsammy/claudest, claude-thinking plugin, brainstorm skill

Path: https://raw.githubusercontent.com/gupsammy/claudest/main/plugins/claude-thinking/skills/brainstorm/SKILL.md (fetched).

- Frontmatter description: triggers include "interview me about", "stress-test my idea", "grill me on". Arguments: `[topic] [--grill]`. Tools: Read, Write, AskUserQuestion, Bash, Glob, Grep.
- Style varies by domain: adversarial for strategy, gentle for personal decisions, Socratic for abstract topics.
- Phrasing: AskUserQuestion, "2-3 related questions per round"; rotates forward-looking ("What happens if...?"), backward-looking ("Why this approach over...?") and introspective ("What are you not saying?") questions. `--grill` mode: one question at a time, each with a recommended answer.
- Contradictions, verbatim: "When answers seem contradictory, ask gentle follow-ups that surface the tension without labeling it a 'contradiction'." No formal mechanism; judgment-based.
- Saturation, verbatim-like: propose closure "after 4+ rounds where no new theme emerges", or "when the user gives consecutively shorter answers across 3+ rounds." A new detail inside an existing theme does not reset the counter. `--grill` mode skips saturation; completion means every branch is a resolved decision or an explicit deferral.

## What to copy

1. Split the job into understand, clarify, rewrite, and gate execution on an explicit "go" (brain-dump-mod).
2. Batch clarifying questions in one tool call, with a recommended option first, and skip anything inferable from the codebase (brain-dump-mod). Ask one at a time when the stakes are high (interview-me, `--grill`).
3. Skip-if-inferable rule (brain-dump-mod, interview-me).
4. Length trigger shown before send, with an escape hatch (`raw:`) and a manual `structure:` path (andi-f-1993).
5. Coverage tracker so the user sees progress (interview-me).
6. Saturation / closure proposal after several rounds with no new theme (brainstorm).
7. Unknowns become visible placeholders, and stated prohibitions carry into the output (prompt-architect).
8. Hard-block security or privacy gaps (interview-me).

## What to avoid

- Activation state held only in memory, which resets on mod reload (brain-dump-mod limitation). Persist mode state if it matters.
- Detection that depends on a UI the host may not have, such as the Ignore button, which exists only in Claude Code (andi-f-1993).
- Labelling a finding "contradiction" to the user. Brainstorm surfaces tension as a gentle follow-up instead.
- Relying only on the model's judgment for contradictions. Every source does this, and none documents a check that would catch a miss.
- Batching many questions at once (brain-dump-mod asks 3 to 6; prompt-architect 3 to 5). Keep the batch small or go one at a time for real decisions.

## Conflict and ambiguity techniques (from sources, plus general practice)

From the sources:

- **Judgment-based follow-up during the interview**: brainstorm's "gentle follow-ups" rule. Cheap, no structure, misses things that are not raised.
- **Decisions Log plus pushback limit**: interview-me records a position; if the user disagrees, one or two follow-ups, then accept and record both. Keeps the conversation from looping.
- **Post-interview red-team pass**: interview-me's separate agent reads all answers together, looking for conflicts across coverage areas, and drops anything already logged. This is the only source with a check over the whole answer set.
- **Scoring rubric on the prompt**: prompt-architect's Clarity dimension flags vague terms, unresolved pronouns and unstated objectives. Works on the draft, not the answers.

General technique, not verified against a source in this teardown (the ticket suggested it):

- **Extract then pairwise-check**: pull atomic claims or decisions from the dump and each answer into a list (subject, predicate, value), then compare pairs that share a subject and flag opposite or incompatible values. Keep the comparison to the same subject key so it stays cheap. Use the same Decisions Log to avoid re-flagging. This needs a designed extraction step. None of the fetched sources do it.

## Open items

- Read andi-f-1993's hook file to get its exact injected wording. The `hooks/` listing timed out; try again later or use `gh api repos/andi-f-1993/mod_brain_dump/contents/hooks`.
- Confirm prompt-architect's question wording against the raw SKILL.md. The fetch summarised it rather than quoting it.
- Decide whether the mod needs a pairwise contradiction pass. No source supplies a tested one.
