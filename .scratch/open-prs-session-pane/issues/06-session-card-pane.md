# Build the card pane (variant A)

Type: task
Status: resolved
Blocked by: 01, 02, 03, 04, 05

## Goal

Replace the pane render in `open-prs/hooks/register.tsx` with the variant A layout in [spec.md](../spec.md): collapsible **This session**, **Other open PRs** and **CLI errors** cards, the status bar with a striped "no PR" segment, thread and CI bars on collapsed cards, run chips, glyph icons. Draw it as far as ticket 01 says the engine allows, with the glyph fallbacks it names.

Reference: the prototype on `refs/heads/claude/prototype-open-prs-41029d` (`open-prs/prototype/`, `VERDICT.md`). Read it with `git show`; do not merge the branch.

## Adjusted by ticket 01 (resolved, `046bc4e`)

The terminal has no `Progress`, `Chip`, `Icon` or `Svg`. So: cards are `Box borderStyle="round"` with a plain `Button` chevron (`▾ Name` / `▸ Name`); thread and CI bars are `█`/`░` glyph `Text`; the status bar is a row of `Text` segments, the "no PR" segment `╱╱╱` with `backgroundColor`; run chips are `Text` with `backgroundColor`; no Lucide, glyphs only. Collapse state is an atom `collapsed` (ids of collapsed cards) with a matching `PluginState['open-prs']` field in `types/index.d.ts`, written from `onPress` only. Not `Client`. Not verified by 01: real painting of backgrounds and bar width at the pane's width, so check that by eye once built.

## Done when

- The pane shows the three cards from the real data (tickets 02 to 05), keeping Loading, no-remote and "couldn't load" states.
- Collapse state is kept as ticket 01 decided; pane lifecycle rules (open once, dismissal, reopen by `/prs`) are unchanged.
- Hook tests updated or added for each card and for the empty cases (no PR, no errors hides the CLI errors card).
- `open-prs/README.md` describes the new pane; version bumped (minor).
- `claude plugin test .` in `open-prs` is green.

## Comments

- Done. The pane draws the three cards: **This session** (its branches from `sessionBranches`, each with PR, branch, worktree or "no worktree", status, unresolved count, thread bar and run chips; a branch with no PR says "no PR"), **Other open PRs** (up to 50, grouped by status, thread bar and chips per PR), and **CLI errors** (only while `cliErrors` is non-empty, with a Close that empties it). Collapsed cards show the status bar, a thread bar and a CI bar. The status bar has a striped `╱` segment for "no PR". Pure helpers are in `hooks/cards.ts` (tested in `tests/cards.test.ts`); the render is thin.
- Collapse state is the `collapsed` atom (card ids), written from `onPress` only, with the matching `PluginState['open-prs'].collapsed` field.
- Deviations: (1) the `cliErrors` atom and its writers moved from `cli-log.ts` into `register.tsx`, because the engine's state scan only reads atoms defined in the file that reads them; `cli-log.ts` is pure again. (2) `branchRun` was dropped (the render reads `branchRuns`), with its type field. (3) The CLI errors card is also drawn under "Couldn't load", so the reason for a failed load is visible. (4) Run chips are `Text` with a background, as ticket 01 says, so a run no longer links to its URL (the URL is still in the provider data). (5) The "unresolved" count is shown per PR and per branch as a separate line; the comment count stays after the author.
- Not verified: painting of background colours and bar widths at the pane's real width (the status bar is fixed at 40 cells, bars at 10), and a type-check (no `tsc` is installed here and `open-prs/tsconfig.json` extends a types folder this mod does not have).
- Tests: 187 pass (161 before, plus the card helper tests and the card hook tests; the pane tests moved to the new layout).
