# Improve usage-band: tests, split, type-check, README

Status: resolved
Blocked by:

Apply the rules in [spec.md](../spec.md) to `usage-band` (273-line `hooks/register.tsx`). Do the steps in order.

1. **Verify the spec's three assumptions** (sibling imports, test discovery after the move, `--plugin-dir` writing types). Record the result in the spec; if one fails, stop and report.
2. **Red test:** stub `session.usage` in `tests/band.test.ts:20-25` (no behaviour change). Add the one-line `tsconfig.json`.
3. **Tests first:** cover `toFigures`, `compact`, `until`, `cacheLeft`, `hitPercent`, `line`, and the `isCurrent`/`syncChat` reset rule (some are exported already; others via the hook).
4. **Split:** `figures.ts` (pure figure and format logic), `view.tsx` (band render), `data.ts` if any tables. Hooks, state and `command.register` stay in `register.tsx`. Remove the duplicated status-line and band segments (U3) and the repeated `toFigures` then `pinStatus` sequence (U8). The `severity` test imports from its new file.
5. **Renames:** `Figures.session` to `fiveHour` (also in `types/index.d.ts`), `chatPercent`/`chatColor` to `contextPercent`/`contextColor`, `readCompactWindow` to `loadCompactWindow`, `pinStatus` to `setStatusLine`.
6. **Type-check:** zero `tsc` errors (1 known: `tests/band.test.ts(25,19)`).
7. **README** in the template. Fix "two-row box" and the "Session" token row wording against the glossary.
8. Log the Hide-button question (see the spec's out-of-scope list) as a bug note.

Audit items U1-U14 in [research/02](../../codebase-improvements/research/02-audit-structure-and-readability.md).

## Comments

Already delivered in 2eb342d (tests, split into figures.ts/view.tsx, renames, tsconfig, README) and 143d5e4 (review fixes). Hide-button question logged in bugs/usage-band-hide-button.md.
