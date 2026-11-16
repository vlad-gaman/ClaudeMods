# model-router

Picks haiku, sonnet or opus once per session from the first prompt and routes plain subagents to cheaper models. Choosing once keeps the prompt cache warm.

## What it does

- **Locks one model per session.** The first prompt is classified: opus for "think hard", design, debug, review and similar starts, stack traces and long prompts; haiku for short lookups and chores; otherwise the default model. The choice shows on the status line and in a toast. A short follow-up ("yes", "go ahead") never picks.
- **Hints** when a later prompt looks harder than the lock, without switching (a switch means a cold cache).
- **Subagents** with no model of their own run on a cheaper one: `Explore` on haiku, `general-purpose` on sonnet.
- **Skill log**: each skill run's model, time and cost goes to `state/model-router/skill-runs.jsonl` under your `.claude` folder.
- Haiku is never picked on a 1M window.

## Options

- `defaultModel`: the model for a first prompt that matches no rule (`sonnet`, `opus` or `haiku`; default `sonnet`).

## Commands

- `/route`: show the router's status.
- `/route haiku | sonnet | opus`: lock that model now and pin it, with a cold cache.
- `/route auto`: unpin and route again. `/route off` stops routing.
- `/route log [on | off]`: show the skill log, or switch it.

## Develop

```bash
claude plugin test .
```

Tests are in `tests/model-router.test.ts`. The classifier, lock, subagent routing, skill log and slash command are in `hooks/register.ts`.
