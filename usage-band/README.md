# usage-band

A Claude Code mod that draws a two-row box above the prompt with your usage:

- **Context**: how full the context window is, with tokens used/window.
- **Session**: tokens sent (↑, input including cache) and received (↓) by this chat (resets on `/clear`).
- **Cost**: the chat's cost in USD.
- **5h** / **Week**: the rate-limit windows' percent used and time until reset.
- **Cache**: whether the prompt cache is warm, minutes left, and the share of input served from cache.

Figures turn yellow at 70% and red at 90%. Session and Week appear on a Claude subscription only (they come from the API's rate-limit headers). Press **Hide** or run `/usage-band` to toggle the band.
