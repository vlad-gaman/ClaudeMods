# Spec: brain-dump mod

Status: decided, ready for a build session. Planning only; no code exists.
Sources: tickets 01 to 06 under `issues/`, research under `research/`, transcript under `prototypes/06-flow-transcript.md`. Terms follow `GLOSSARY.md`.

## Purpose

The owner types or dictates a long, unstructured prompt (a **dump**). The mod finds points that conflict or are unclear, asks about them, then shows **one structured prompt**. The prompt runs only after the owner types `go`.

Out of scope: dictation, and running the task itself. The mod structures and hands off.

## Name and layout

Mod `brain-dump`, in `brain-dump/` at the repo root, like the other mods: `.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.tsx`, `types/index.d.ts` stub, `README.md`. Slash command `/brain-dump`. Add it to the repo `README.md` and to `switchboard` if that lists mods by hand (check when building).

## Options (`plugin.json`)

| Option | Default | Meaning |
| :- | :- | :- |
| `minWords` | 200 | Words in a draft that raise the banner |
| `maxQuestions` | 8 | Hard cap on questions per dump |

Auto-detect on/off is not an option: it lives in `$.store` key `brain-dump:enabled`, default **on** (assumption; owner not asked), flipped by `/brain-dump on|off`.

## Triggers

1. **Auto-detect.** A `ui.render` hook on `PromptHint` reads the draft (`isDraft`, or `$.prompt.read()`). At `minWords` or more words, and enabled, and no flow active, it shows the banner: `Long draft (N words). Turn it into one clear prompt? [Structure] [Ignore]`. Count words with a whitespace split. Do no work in `prompt.edit` (50 ms budget).
2. **Structure** (banner) or **`/brain-dump`**: start the flow on the current draft, whatever its length. Empty draft: toast "Nothing to structure."
3. **`structure:` prefix** on a submitted prompt: a `prompt.submit` hook starts the flow on the text after the prefix.
4. **Ignore**: dismiss the banner for this draft; the prompt is sent untouched when submitted. The banner returns only for a new draft.
5. **`/brain-dump on|off`**: persist in `$.store`, toast the new state. `/brain-dump` alone with a draft starts the flow; with no draft and no argument it shows the state.

When off, only `/brain-dump` and `structure:` work. There is no `raw:` prefix; Ignore covers it.

## Flow

```
draft ──Structure──▶ save dump ──▶ extract points ──▶ find conflicts / ambiguities / gaps
   ▲                                                      │
 cancel                                  none ────────────┤
   │                                                      ▼
   │                          ask one question at a time (cap, "enough")
   │                                                      │
   │                                                      ▼
   └────────────── show structured prompt ──▶ go ──▶ run
```

1. **Save.** Write the dump to `$.store` key `brain-dump:pending` with the draft text, a timestamp and the stage. Clear the prompt box with `$.prompt.fill({ text: '' })`. Show a band "Reading your dump..." while the model works.
2. **Extract** (one `$.model.complete` call, JSON out): atomic points `{ id, subject, requirement, value }` from the dump.
3. **Find** (second call or the same, JSON out): compare points sharing a subject. Label each finding `conflict` (two points cannot both hold), `ambiguity` (one point, several readings that change the result) or `gap` (the task needs something the dump never says). Add `costly: true` when a wrong guess is hard to undo (deleting or overwriting, security, data, money). Labels are internal; the owner never sees "conflict" or "contradiction" in a question.
4. **Triage.** Ask about every conflict and every costly ambiguity or gap. Turn the rest into assumptions (low-stakes) in the Assumptions section. A fact that is not new to the project (for example a dependency already in the repo) is an assumption, not a question.
5. **No findings to ask about:** skip to step 7 with one line "No conflicts found; N assumptions listed".
6. **Ask** (see Questions). After each answer update the points list and re-check only the points that answer touched, so a conflict created by an answer is caught. Stop when no open conflict or costly item remains, at `maxQuestions`, or on `enough`. Leftovers become assumptions or `[you fill this in: ...]` placeholders; a conflict still open is listed at the top of the prompt.
7. **Build** the structured prompt from the points list (never by appending answers to the dump). Store it in `brain-dump:pending` (stage `ready`). Show it in a band or pane (Interface) with the line `Type go to run it, edit to change it first, or cancel to get your dump back.`
8. **`go`** ends the flow, see Submit handling.

## Questions

- Asked with `$.ui.ask(question, { options, header })`: 2 to 4 labelled options, **recommended option first and labelled "(recommended)"**, free text through "Other". Header is 12 characters at most (for example "Scope"). Show `Question i of n` in the question text, where n is the number of findings queued (it can shrink).
- Order: conflicts first, then costly ambiguities, then costly gaps.
- Wording: plain, states both sides ("You asked for both the whole table and only what is filtered. Which should the button export?"). Written by the model from the finding; the prompt for it must say "never use the words conflict or contradiction".
- `enough` is accepted as typed text under "Other". If `$.ui.ask` rejects (dismissed), treat it as `enough`. In `-p` runs `ask` rejects, so the mod does nothing there: no banner, `structure:` is not handled, the prompt goes through unchanged.

## Structured prompt format

Fixed core sections, in this order, **empty ones omitted**: `Goal`, `Context`, `Task`, `Constraints`, `Done when`. Then, when non-empty: `Decisions` (each resolved conflict as "X over Y (you chose this)") and `Assumptions` (edit or veto before go). A one-line title above `Goal` says what the task is. The original dump is **not** in the prompt; it stays in `$.store`. Use the user's own wording for requirements where possible; do not invent requirements. The `Type go...` line is part of the *display*, never part of the text that is sent.

## Submit handling (`prompt.submit` hook)

Read `brain-dump:pending`. If its stage is `ready` and the submitted text, trimmed and lowercased, is:

- `go`: `next({ ...e, text: structuredPrompt })`, then delete the key. The structured prompt is what the model gets and what is shown.
- `cancel`: `$.prompt.fill({ text: originalDump })`, delete the key, return `{ drop: 'Brain dump cancelled; your dump is back in the prompt box.' }`.
- `edit`: `$.prompt.fill({ text: structuredPrompt })`, keep the key at stage `editing`, return `{ drop: ... }`. The next submit is an ordinary prompt: the key is deleted and the text goes through as typed. (`edit` is a small addition to the owner's go/cancel decision, so the owner can change the prompt by hand; flag it for confirmation.)
- anything else: treat as a new prompt; leave the pending dump in `$.store` for `/brain-dump resume`, expiring after about 24 hours. `resume` is optional; drop it if `$.store` proves awkward.

While the stage is `asking` (questions in flight), a submit is dropped with "Finish or cancel the brain dump first."

The hook must fail closed: a thrown error before `next` has been called returns `{ drop }` with the reason, never sends the raw structured text half-built. A prompt typed while a turn runs fires `prompt.submit` too: only treat `go`, `cancel`, `edit` when no flow is mid-question.

## State (`$.store`)

| Key | Value |
| :- | :- |
| `brain-dump:enabled` | boolean, default true |
| `brain-dump:pending` | `{ dump, points, findings, answers, prompt, stage, at }`, stage one of `reading`, `asking`, `ready`, `editing` |

One pending dump at a time. A new dump while one is pending: ask `$.ui.ask` "Replace the earlier dump?" first. Expire pending after 24 hours. `$.store` is shared by all sessions: scope the key by session id if two sessions can race (assumption: cheap to add, decide in the build).

## Interface

- **Banner**: `PromptHint` (draft-reactive) plus an `AbovePrompt` band for the Structure / Ignore buttons. Pass control on so other mods' bands also draw.
- **Structured prompt display**: `AbovePrompt` band, collapsed to a count and a first-lines preview, with `Show all` opening a pane via `$.ui.open`. A pane opened unasked appears only from 144 columns, so on a narrow window fall back to `$.prompt.fill` after the owner types `edit`.
- Toasts: state changes (on/off), errors ("Couldn't read the dump; sent as written."), and the no-findings line.
- Add glossary terms **Dump**, **Structured prompt**, **Interrogation**, **Pending dump** when the build lands.

## Failure handling

- Any model call fails or times out: toast, clear the pending key, and let the original dump through unchanged on the next submit. The mod never loses the dump.
- Malformed JSON from the model: one retry, then the same as above.
- Dump over a size that the model call allows: skip the flow with a toast.
- Dismissed `ask` = `enough`. Closed banner = Ignore for that draft.

## Engine choices and what is still unverified

Model route: `$.model.complete` (tool-less, no transcript), not an instruction injected into the main chat. This keeps extraction deterministic and testable and keeps the main transcript clean until the owner says go. All of these come from `research/01-engine-capabilities.md` and **must be checked first in a stub mod**:

1. Does a `prompt.submit` hook that awaits `$.ui.ask` hold the turn? The design does not need it: it runs the flow from the banner, a slash command and `structure:`, and uses `drop` plus `go`, the documented fallback.
2. `$.model.complete` return type: string (d.ts) or object (api.md). Wrap it in one helper so the build changes one line.
3. Is `$.prompt.read()` live while typing? If not, count words on `prompt.edit` with a cheap length test only.
4. May `$.prompt.fill` be used while a turn runs? If not, `cancel` and `edit` queue the fill for the turn's end.
5. Does the `ask` option limit (2 to 4) fit? Most questions fit in 2 to 3 options.
6. **Detection quality**: extract-then-compare is not proven by any prior-art tool. Validate on 5 to 10 real messy dumps before trusting it. The transcript in `prototypes/06-flow-transcript.md` is the first sample; expected findings: the filtered-versus-whole-table conflict and the `orders.csv` gap, with `papaparse` as an assumption.

## Test plan

Pure logic in a module with no engine calls, so it tests without the engine (see `README.md` for the repo's test and type-check commands):

- Word count and the `minWords` threshold, including exactly at the threshold.
- Submit handling table: `go`, `cancel`, `edit`, other text, prompt typed mid-flow, no pending dump.
- Triage: conflicts and costly items asked, low-stakes ones become assumptions, cap and `enough` produce placeholders, an open conflict is listed at the top.
- Points update after an answer, and the re-check of touched points.
- Prompt builder: empty sections omitted, Decisions and Assumptions present only when non-empty, the closing line absent from the sent text, the dump absent from the prompt.
- Expiry of `pending` after 24 hours, one pending at a time.
- Failure handling: model error, bad JSON, dismissed `ask`.
- Detection quality: a fixture folder of messy dumps with expected findings, run against the live model by hand, not in CI.

## Open for the owner

- ~~`edit` as a third typed word~~ Confirmed by the owner (2026-11-09).
- ~~Default for auto-detect (assumed on)~~ Confirmed on by the owner (2026-11-09).
- Whether `/brain-dump resume` is worth building in the first version.
