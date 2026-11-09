# brain-dump

Turns a long, unstructured prompt into one structured prompt: it asks about points that conflict or are unclear, then runs the result only after you type go.

## How it works

1. Type or paste a long prompt (a **dump**). At 200 words or more, a band offers **Structure** or **Ignore**. You can also start it with `/brain-dump` or by beginning a prompt with `structure:`.
2. The mod reads the dump and asks you one question at a time about anything that conflicts, is unclear, or is missing and costly to guess. The recommended answer is first. Type `enough` under "Other" (or dismiss the question) to stop asking.
3. It shows one **structured prompt** above the prompt box: Goal, Context, Task, Constraints, Done when, then Decisions (what you chose) and Assumptions (what it guessed; edit or veto before go). Empty sections are left out. A conflict still open when you stop is listed at the top under "Not settled". If an earlier dump is still pending, you are asked whether to replace it. Dumps over 60,000 characters are not structured.
4. Type one of:
   - `go`: sends the structured prompt.
   - `edit`: puts the structured prompt in the box so you can change it by hand; the next Enter sends it as typed.
   - `cancel`: puts your original dump back in the box.

Your original dump is kept in the plugin store until you finish. If the model fails, the dump goes back in the box.

## Commands

- `/brain-dump <text>`: structure `<text>`.
- `/brain-dump`: structure the last draft the band saw; with no draft, shows whether auto-detect is on.
- `/brain-dump on` and `/brain-dump off`: turn the band on or off (kept between sessions; default on). `/brain-dump` and `structure:` work either way.
- `/brain-dump resume`: puts a saved dump back in the box (kept 24 hours).

A slash command replaces the box, which is why bare `/brain-dump` uses the draft last seen by the band.

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `minWords` | 200 | Words in a draft that raise the band |
| `maxQuestions` | 8 | Most questions asked about one dump |

In a non-interactive (`-p`) run the mod does nothing.

## Develop

```bash
claude plugin test .
```

Tests are in `tests/`: the pure logic (`logic.test.ts`: word count, submit decisions, triage, prompt builder, expiry), the model-reply cleanup (`shape.test.ts`) and the whole flow through the engine (`flow.test.tsx`). The logic lives in `hooks/logic.ts`, `hooks/shape.ts` and the model prompts in `hooks/data.ts`, the bands in `hooks/view.tsx`, and the hooks, flow and slash command in `hooks/register.tsx`.

Whether the model finds the right conflicts is not covered by tests. Try it by hand on messy dumps; `.scratch/brain-dump/prototypes/06-flow-transcript.md` is the first sample.
