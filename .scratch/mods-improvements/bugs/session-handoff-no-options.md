# session-handoff: the README promised options the mod does not read

Status: needs-triage

Found while doing [04-session-handoff](../issues/04-session-handoff.md). Not fixed there (behaviour-preserving only).

The old README said "Thresholds and the cache lifetime are set in the mod's options." The code reads no options: the 60-minute cache lifetime, the 5-minute lead time and the 250k-token threshold are constants (`session-handoff/hooks/data.ts`, `CACHE_TTL_MIN`, `RUN_BEFORE_COLD_MIN`, `CONTEXT_THRESHOLD`). The new README states the fixed values. If options were meant, `plugin.json` would list them and the hooks would read them.

## Also noticed

The `plugin.json` description says "5 minutes before the prompt cache goes cold", which holds only while the cache lifetime stays 60 minutes (`CACHE_TTL_MIN - RUN_BEFORE_COLD_MIN` is the wait).
