# Spec: one source for the prompt cache lifetime

Status: ready-for-agent
Source: architecture-deepening ticket 05

## Problem Statement

As the owner I run Usage Band and Session Handoff together. Session Handoff takes the prompt cache lifetime from its `cache_minutes` option (default 60) and runs its handoff that long after a turn, minus `lead_minutes`. Usage Band always assumes 60 minutes to say whether the cache is warm or cold. If I change the option the two disagree: the band says warm while the handoff already ran, or the reverse. The 60 also sits in three places in Session Handoff (code default, plugin.json, README). Mods are separate plugins with their own options and share no code, so one cannot read the other's option.

## Solution

Stop guessing where the engine can tell us. First find out whether the engine reports the real expiry (or the lifetime) of the prompt cache. If it does, both mods read it and `cache_minutes` becomes an override or goes away. If it does not, both mods carry their own `cache_minutes` option with the same default, the default is written once in GLOSSARY, and a test fails if the two defaults drift.

## User Stories

1. As a user, I want Usage Band's warm/cold verdict to match when Session Handoff considers the cache cold, so that the two never contradict.
2. As a user, I want a changed cache lifetime to take effect in both mods, so that I set it once.
3. As a user, I want the cache "minutes left" figure to count down against the same lifetime Session Handoff uses.
4. As the maintainer, I want the 60-minute default defined in one documented place per mod, so that a change is one edit plus a drift test.
5. As the maintainer, I want a failing test if the two mods' defaults differ, so that drift is caught.
6. As the maintainer, I want the research result recorded, so that the next person knows whether the engine exposes the expiry.
7. As a user with no option set, I want today's behaviour (60 minutes) unchanged.
8. As a user with an invalid option value, I want the default used, as Session Handoff already does.

## Implementation Decisions

- Step 1 is research, recorded in the ticket: does the engine expose the prompt cache expiry or lifetime (per-call usage fields, session info, model info)? Primary sources only: the engine types and docs shipped with the CLI. The reference types already searched mention the cache only for reads, writes and invalidation; treat that as a lead, not proof.
- If the engine exposes it: both mods read it; the option survives only if it still overrides the value (record the decision). Warm/cold/empty logic stays in Usage Band; the trigger timing stays in Session Handoff.
- If not: Usage Band gains a `cache_minutes` option with the same name, default and parsing rules as Session Handoff's (invalid or missing falls back to 60). Both defaults are stated in GLOSSARY once (term: prompt cache lifetime).
- Within Session Handoff the three copies of the default are reduced to the code default and plugin.json, with a test that they match.
- No cross-plugin import and no shared runtime module (ticket 04 decision).

## Testing Decisions

- Good tests assert the visible result: warm, cold or empty and the minutes left at a given clock, for a given option value.
- Usage Band: extend the existing figures tests (cache state and minutes left) with a non-default lifetime.
- Session Handoff: extend the trigger tests to prove the wait is lifetime minus lead for a non-default value.
- Drift test: read both plugin.json files and assert the `cache_minutes` defaults are equal (and equal to the GLOSSARY figure if the test can read it cheaply).
- Prior art: usage-band figures tests, session-handoff trigger tests.
- `claude plugin test .` and type-check in each touched mod; full suites once at the end.

## Out of Scope

- A shared runtime module or cross-plugin option reading.
- Changing the lead time logic or the handoff itself.
- Pricing or re-cache cost text in Usage Band.

## Further Notes

This is a real bug (the mods disagree once the option changes) and the smallest of the architecture candidates. If the research shows the engine exposes nothing, the fallback is cheap and complete.
