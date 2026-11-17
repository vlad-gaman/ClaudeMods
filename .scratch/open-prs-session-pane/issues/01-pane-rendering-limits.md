# Find what the real pane can draw

Type: research
Status: resolved
Blocked by:

## Question

Can the Open PRs pane render collapsible cards, progress bars, a segmented status bar, chips and icons with the engine's UI components, or only `Box`/`Text`/`Link`/`Button`? What is the closest the real pane gets to the variant A mock, and which parts need a fallback (glyph bars, `Button` as chevron toggle)?

## Done when

- `## Answer` lists, per element in [spec.md](../spec.md) (card, chevron collapse, thread bar, status bar with striped segment, run chips, icons), whether the pane can draw it and how. Use the installed engine types and a throwaway render test, not memory.
- Collapse state: where it lives (atom vs component state) and whether it survives a re-render.
- Ticket 06's layout is adjusted to match, if needed.

## Comments

## Answer

Checked against the installed engine types (`session-handoff/.claude-plugin/types/claude-code/index.d.ts`, `Elements.terminal`) and a throwaway render test run with `claude plugin test .` in a scratch copy (deleted afterwards). The test kit validates the drawn tree against the surface table (`ui.drawn()`), but it does not paint, so colours and backgrounds are checked as props only.

The terminal table is `Box`, `Text`, `Button`, `Input`, `Select`, `Link`, `Code`, `Markdown`, `Client`, `Raster` and `Image`. There is no `Progress`, `Chip`, `Badge` or `Icon`, and no `Svg` (Svg exists only on desktop, vscode and mobile).

Per element:

- **Collapsible card: yes.** A `Box` with `borderStyle="round"` and a column layout; collapse by not rendering the body. Verified: the border survives into the drawn tree.
- **Chevron toggle: yes.** `Button` with `plain` and the label `▾ Name` / `▸ Name`, a unique `key`, and an `onPress` that writes the collapse atom. Verified: pressing it swaps the label and removes the body.
- **Thread or progress bar: yes, as glyphs.** `Text` with `█`/`░` and a `color`, plus the count. No `Progress` element exists, so this is the fallback and it is the only route.
- **Segmented status bar: yes.** A row `Box` of `Text` segments, each a run of glyphs sized to its share. Verified.
- **Striped "no PR" segment: yes, as glyphs.** `Text` of `╱╱╱` with `backgroundColor` (accepted by the tree validator, not painted in the test). A `Raster` (terminal-only cell grid with glyph, fg and bg per cell, repainted through `$.ui.blit`) could paint true stripes, but it is overkill for this pane.
- **Run chips: yes.** `Text` with `backgroundColor` and `color` (or `inverse`), or a `Button` if a chip must be pressable. Verified: props accepted.
- **Icons: no Lucide on the terminal.** The terminal surface has no `Svg`, so use glyphs only (✓ ✗ ○ ◌ ◔ ◐ ⎇ ▾ ▸), as the spec already says. The `"lucide"` field in `open-prs/.claude-plugin/plugin.json` is the mod's own icon, not a pane element.

Collapse state: it lives in a plugin atom, not in component state. `atom({ plugin: 'open-prs', key: 'collapsed' }, [])` holds the collapsed card ids, and `PluginState['open-prs']` in `types/index.d.ts` needs a matching field. Writes come from `onPress` only (a write during `ui.render` is refused). The atom survives re-renders (the render reads it, so a write redraws it) and survives unmount and remount of the pane (verified). The alternative, a `Client` module with `setState`, keeps state across Pane redraws (verified) but is dropped when the pane remounts, and it needs a separate module file. Do not use it here.

Ticket 06's layout: it needs small changes, not a restructure. Cards are bordered `Box`es with a `Button` chevron; the bars, status strip and chips are `Text` glyph runs with `backgroundColor`; the collapse set is the `collapsed` atom, not `Client`. Drop any Lucide icon in the plan and use the glyph set. Add the `collapsed` field to the `open-prs` `PluginState` when 06 lands (06 owns that edit, not this ticket).

Not verified: actual painting of `backgroundColor` and colours, and the look of glyph bars at the pane's real width.
