# Issue tracker: GitHub

Issues for this repo live in GitHub Issues: https://github.com/vlad-gaman/ClaudeMods/issues. Use the `gh` CLI (run it inside the clone, so it picks the repo from `origin`).

## Conventions

- One ticket is one GitHub issue. Its body holds the problem or question, the goal, and a "Done when" list.
- Triage state is a label (see `triage-labels.md` for the role strings). A resolved ticket is a closed issue, with the answer in its last comment.
- A ticket's type (`research`, `prototype`, `grilling`, `task`) is a `Type:` line at the top of the body.
- A blocker is a `Blocked by: #12, #15` line near the top of the body. A ticket is unblocked when every issue it lists is closed.
- Specs and maps are still files, `.scratch/<feature-slug>/spec.md` and `map.md`, because they are long and reviewed with the code. An issue links its spec by repo path.
- The tickets written before 2026-11-17 were migrated from `.scratch/<feature>/issues/`. Those files stay as history; each migrated issue ends with a "Migrated from" line naming its file. New tickets are created only as GitHub issues.

## When a skill says "publish to the issue tracker"

Create a GitHub issue: `gh issue create --title "<title>" --body-file <file> --label <label>`. Write the body to a scratch file first, so multi-line text is not squeezed through a shell string.

## When a skill says "fetch the relevant ticket"

`gh issue view <number> --comments`. The user will normally pass the number or the URL.

## Comments and resolving

Append conversation with `gh issue comment <number> --body-file <file>`. To resolve a ticket, comment the answer, then `gh issue close <number> --reason completed` (or `--reason "not planned"` for `wontfix`).

## Wayfinding operations

Used by `/wayfinder`. The **map** is still the file `.scratch/<effort>/map.md` (Notes / Decisions-so-far / Fog); its **children** are GitHub issues.

- **Child ticket**: a GitHub issue whose body holds the question, with `Type:` and `Blocked by:` lines.
- **Blocking**: `Blocked by: #N, #N` in the body. Unblocked when each listed issue is closed.
- **Frontier**: `gh issue list --state open`, then the open issues with no open blockers and no assignee; lowest number first.
- **Claim**: assign yourself (`gh issue edit <number> --add-assignee @me`) before any work.
- **Resolve**: comment the answer, close the issue, then append a context pointer (gist + issue link) to the map's Decisions-so-far.
