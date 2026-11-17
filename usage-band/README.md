# usage-band

A band above the prompt showing usage for this chat, the 5h window and the week. Where a surface draws no band (VS Code, mobile), the same figures go to the status line instead.

## Install

```
/plugin install usage-band --marketplace vlad-gaman/ClaudeMods
```

## What you see

- **Context**: how full the context window is, with tokens used/window. Measured against the compact window when one is set. Yellow from 25%, red above 40%.
- **Session** (the chat's tokens): tokens sent (↑, input including cache) and received (↓) by this chat. Starts over on `/clear`.
- **Cost**: the chat's cost in USD.
- **5h** and **Week**: the rate-limit windows' percent used and time until reset. Yellow from 75%, red above 90%. They appear on a Claude subscription only (they come from the API's rate-limit headers).
- **Cache**: whether the prompt cache is warm, cold or empty (empty: no call has touched it yet, as in a new session), the minutes left and the share of input served from it. When cold, the estimated cost to write the context back.

The **Hide** button hides the band.

## Options

Set in `/config`.

- `cache_minutes` (60): how long the prompt cache stays warm after a call. The cache state and minutes left count against it. Session Handoff has an option of the same name; set both to the same value.

## Commands

- `/usage-band`: hide or show the band.

## Develop

```bash
claude plugin test .
```

Tests are in `tests/`: the figure and format logic (`figures.test.ts`), the chat count (`chat.test.ts`) and the band itself (`band.test.ts`). The logic lives in `hooks/figures.ts`, the band drawing in `hooks/view.tsx`, and the hooks, state and slash command in `hooks/register.tsx`.
