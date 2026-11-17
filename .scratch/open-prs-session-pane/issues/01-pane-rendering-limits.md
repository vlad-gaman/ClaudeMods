# Find what the real pane can draw

Type: research
Status: ready-for-agent
Blocked by:

## Question

Can the Open PRs pane render collapsible cards, progress bars, a segmented status bar, chips and icons with the engine's UI components, or only `Box`/`Text`/`Link`/`Button`? What is the closest the real pane gets to the variant A mock, and which parts need a fallback (glyph bars, `Button` as chevron toggle)?

## Done when

- `## Answer` lists, per element in [spec.md](../spec.md) (card, chevron collapse, thread bar, status bar with striped segment, run chips, icons), whether the pane can draw it and how. Use the installed engine types and a throwaway render test, not memory.
- Collapse state: where it lives (atom vs component state) and whether it survives a re-render.
- Ticket 06's layout is adjusted to match, if needed.

## Comments
