# One owner for the prompt cache lifetime

Type: research
Status: resolved
Blocked by:

## Problem

`usage-band/hooks/figures.ts:52` hard-codes `CACHE_TTL_MS` (60 min); `session-handoff/hooks/data.ts:29` has `CACHE_TTL_MIN` and honours the `cache_minutes` option. When the option changes, the two mods disagree on warm/cold. The default also lives in `data.ts`, `plugin.json` and the README. (Both constants confirmed to exist; the disagreement is unverified.)

## Question

Can plugins share a module or read another mod's option? If yes, build one prompt-cache module (lifetime, warm/cold/empty, default). If no, decide the fallback (usage-band reads the same option name; one documented default).

## Done when

The packaging answer is recorded here, then a task ticket is raised for the chosen route. Smallest candidate, a real bug.

## Comments

Spec written: [../../prompt-cache-lifetime/spec.md](../../prompt-cache-lifetime/spec.md). Owner decision: research whether the engine exposes the cache expiry first; fallback is a per-mod cache_minutes option with a drift test.

Research (primary source: the engine types shipped in `usage-band/.claude-plugin/types/claude-code/index.d.ts`, the same as `session-handoff`; the CLI docs were not queried):

- Answer: no. The engine does not expose the prompt cache expiry or its lifetime in minutes.
- `$.session.usage()` (`SessionUsage`): `context`, `rateLimits`, `cost`, `startedAt`. No cache field.
- Per-call `usage` (`ModelCompleteResult`): `cache_read_input_tokens` and `cache_creation_input_tokens` only, no time.
- PreModelSwitch and PostModelSwitch inputs: `prompt_cache_warm: boolean` and `cache_ttl: '5m' | '1h'`. A tier, not minutes, and only on a model switch.
- SessionStart input (resume or fork): `prompt_cache_likely_expired: boolean`. A flag, not the expiry time.

Route taken: the spec's fallback. Usage Band gains `cache_minutes` (default 60, same title, default and parsing as Session Handoff: a missing or invalid value falls back to 60). The GLOSSARY term "Prompt cache lifetime" states the figure once. Session Handoff's default copies are reduced to the code default (`CACHE_TTL_MIN`) and plugin.json; the README copy is removed. A pure `cacheWaitMs` in `session-handoff/hooks/data.ts` gives lifetime minus lead.

Limits found while building it:

- A test cannot read another mod's folder: the runtime rejects `node:fs`, dynamic imports, and imports of `plugin.json` outside the mod. Each mod's drift test therefore pins the 60 figure against its own manifest default (checked through the engine, with no options), so a changed default fails both mods' tests until both and the GLOSSARY are updated. No automated cross-mod comparison.
- `session-handoff/hooks/register.tsx` still inlines `Math.max(1, cacheMinutes - leadMinutes) * 60000`. It should call `cacheWaitMs` from `hooks/data.ts`. Not changed here: that file belongs to the other ticket in progress.
