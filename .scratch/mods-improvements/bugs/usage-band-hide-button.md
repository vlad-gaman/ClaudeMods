# usage-band: the Hide button may leave the status line showing

Status: needs-triage

Found while doing [01-usage-band](../issues/01-usage-band.md). Not fixed there (behaviour-preserving only).

The **Hide** button's `onPress` sets `isHidden` to true and nothing else (`usage-band/hooks/register.tsx`, the `band(...)` call in the `ui.render` hook). The `/usage-band` command also calls `setStatusLine` after toggling, which clears the status line. If a session has a band surface and a status-line surface at the same time (`session.surfaces` lists `vscode` or `mobile` as well as one that draws the band), pressing Hide may leave the status line on screen.

Not reproduced: it needs a session with both kinds of surface. If it is real, the fix is one line: call `setStatusLine` in the Hide handler.

## Also noticed

`ui.render` calls `loadCompactWindow`, which writes an atom, while the first render has no compact window yet. The engine forbids state writes during a render hook (`state.set: denied`), so on a first render before `session.start` has run, the band is skipped. In normal use `session.start` loads the window first, so it does not show. The tests work around it by running `session.start` before mounting.
