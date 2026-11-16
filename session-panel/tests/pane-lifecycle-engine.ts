// Canonical fake engine for pane open and close events. Reference copy: copy this file, unchanged, to
// `<mod>/tests/pane-lifecycle-engine.ts` and import `paneEngine` from the mod's `tests/lifecycle.test.tsx`. Mods share
// no code, so do not import it across plugins. The rule it serves is the "Pane lifecycle" section of GLOSSARY.md.
//
// The fake keeps the plugin's panes in memory and answers `ui.open`, `ui.close` and `ui.panes` from them. Every close
// that reaches it is recorded with the origin the engine stamped on it. The harness's test `$` has no `ui.open` or
// `ui.close`, so a test opens and closes a pane through the mod's own hooks, or through an inline plugin that calls
// `$.ui.open` or `$.ui.close` (origin `plugin`). The person's close and an unload are raised by the engine itself;
// a test cannot raise them, so no test here reaches those origins.
import type { On, PaneCloseOrigin, UiPane } from 'claude-code'

export type PaneEngine = {
  /** The plugin's open panes, in open order. */
  panes: UiPane[]
  /** Every `ui.open` the engine answered, by pane id. */
  opened: string[]
  /** Every close that found its pane open, with the origin the engine stamped on it. */
  closed: { id: string; kind: PaneCloseOrigin['kind'] }[]
}

/** Answers the pane calls from memory. `placed` false makes every open wait undrawn, as a narrow terminal does. */
export function paneEngine(on: On, placed = true): PaneEngine {
  const engine: PaneEngine = { panes: [], opened: [], closed: [] }

  on('ui.open', (_, e) => {
    engine.opened.push(e.id)
    if (!engine.panes.some(p => p.id === e.id)) {
      engine.panes.push({ id: e.id, title: e.title ?? e.id, isShown: true, isFocused: false, isPlaced: placed })
    }

    return { value: placed ? { isPlaced: true } : { isPlaced: false, reason: 'the terminal is 100 columns wide' } }
  })

  on('ui.close', (_, e) => {
    // An id that is not open is left alone: nothing is recorded.
    if (engine.panes.some(p => p.id === e.id)) {
      engine.panes = engine.panes.filter(p => p.id !== e.id)
      engine.closed.push({ id: e.id, kind: e.origin.kind })
    }

    return { value: undefined }
  })

  on('ui.panes', () => ({ value: engine.panes }))

  return engine
}
