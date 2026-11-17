# session-handoff

Writes a handoff file for the current session automatically on /handoff-session, shortly before the prompt cache goes cold, and when the context grows past a token threshold. The handoff summarises the session and holds a prompt to continue it in a new chat. Handoffs are saved in `~/.claude/handoffs/`. The panel of the last finished handoff comes back when the app restarts, until you press Close.

## Install

```
/plugin install session-handoff --marketplace vlad-gaman/ClaudeMods
```

## What you see

A band above the prompt with six numbered steps: read the conversation, find the files used, list skills, tools and links, write the handoff, save it, check it. Each step shows a mark (`✓` done, `…` running, `✗` failed, `·` waiting) and a short detail. A failed step is marked and the band says so.

Four buttons sit under the steps. They work once the handoff is saved:

- **Copy prompt**: copies the handoff.
- **Start a new chat with it** (desktop only): opens a new chat with the handoff as its prompt. A handoff over 8,000 characters is passed as a prompt that names the file instead.
- **Open file**: opens the handoff in the system's default app.
- **Close**: hides the band and deletes the handoff files.

The handoff is a Markdown file: the model's summary (goal, current state, decisions, open problems, next steps), or the last requests when the model does not answer within 120 seconds, then files changed, files read, skills used, tools used, links and recent user requests.

It starts in one of three ways (the trigger, named in the file):

- `command`: you type `/handoff-session`.
- `cache`: with the default options, 55 minutes after a turn ends, 5 minutes before the prompt cache goes cold (cache lifetime minus lead time). A new turn cancels it. It is skipped while an earlier handoff is still showing.
- `context`: the context passes 250k tokens. It fires once, and arms again when the context falls below 80% of the threshold (200k by default).

## Options

Set in `/config`. The defaults are the values below, except `cache_minutes`, whose default is in `plugin.json`.

- `cache_minutes`: how long the prompt cache stays warm after a turn. Usage Band has an option of the same name; set both to the same value.
- `lead_minutes` (5): the cache handoff runs this long before the cache goes cold. The wait is `cache_minutes - lead_minutes`, at least 1 minute.
- `context_tokens` (250000): the context handoff fires past this many tokens.

Each must be a number of at least 1; the app refuses a lower value.

## Commands

- `/handoff-session`: write a handoff now.

## Develop

```bash
claude plugin test .
```

Tests are in `tests/`: the whole run through the hook (`handoff.test.tsx`), the document and its parts (`document.test.ts`), the commands the buttons run (`argv.test.ts`) and the context trigger and the cache wait (`trigger.test.ts`), and the pure run steps (`steps.test.ts`, `summary.test.ts`, `verify.test.ts`, `save.test.ts`). The step names, titles and limits are in `hooks/data.ts`, the document in `hooks/document.ts`, the commands and link in `hooks/argv.ts`, the context trigger in `hooks/trigger.ts`, the run steps in `hooks/steps.ts`, `hooks/summary.ts`, `hooks/verify.ts` and `hooks/save.ts`, the band in `hooks/view.tsx`, and the run and the hooks in `hooks/register.tsx`.
