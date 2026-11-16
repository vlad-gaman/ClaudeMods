# One owner for the prompt cache lifetime

Type: research
Status: ready-for-agent
Blocked by:

## Problem

`usage-band/hooks/figures.ts:52` hard-codes `CACHE_TTL_MS` (60 min); `session-handoff/hooks/data.ts:29` has `CACHE_TTL_MIN` and honours the `cache_minutes` option. When the option changes, the two mods disagree on warm/cold. The default also lives in `data.ts`, `plugin.json` and the README. (Both constants confirmed to exist; the disagreement is unverified.)

## Question

Can plugins share a module or read another mod's option? If yes, build one prompt-cache module (lifetime, warm/cold/empty, default). If no, decide the fallback (usage-band reads the same option name; one documented default).

## Done when

The packaging answer is recorded here, then a task ticket is raised for the chosen route. Smallest candidate, a real bug.

## Comments

Spec written: [../../prompt-cache-lifetime/spec.md](../../prompt-cache-lifetime/spec.md). Owner decision: research whether the engine exposes the cache expiry first; fallback is a per-mod cache_minutes option with a drift test.
