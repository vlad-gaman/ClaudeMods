# Build the card pane (variant A)

Type: task
Status: ready-for-agent
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
