# Open PRs pane: session-centred cards

Source: prototype verdict, variant A. Prototype code and `open-prs/prototype/VERDICT.md` are on the throwaway branch `refs/heads/claude/prototype-open-prs-41029d` (commits `2aa5b92`, `1798279`), not on master. Run it with `node open-prs/prototype/serve.mjs` (`?variant=A`) or `node open-prs/prototype/cli.mjs` on that branch.

## Question settled

"What should the Open PRs pane look like?" Answer: three collapsible cards, led by this session's own branches.

## Target

- **This session** card: only this session's branches. Per branch: PR title and number, branch, worktree path (or "no worktree"), status, unresolved thread count, latest runs as chips, a resolved/total thread bar. A branch without a PR shows "no PR".
- A **status bar** at the top of that card: PR statuses (changes / review / approved / draft), with a striped "no PR" segment for PR-less branches.
- **Other open PRs** card: a status strip, PRs grouped by status, a thread bar per PR.
- **CLI errors** card: exists only while there are errors. One bullet per failed CLI call (command, exit or timeout, time, message), separated by rules. Close clears them.
- Collapsed cards show total threads resolved/total and ci ok/total bars, plus the status bar.
- Icons: Lucide where the pane can draw them, else the glyphs ✓ ✗ ○ ◌ ◔ ◐ ⎇ ▾ ▸. The terminal gets glyphs only.

## Out of scope (dropped by the verdict)

Other sessions' or sub-sessions' PRs and branches, other repos, desktop sidebar sections. The mod API exposes no other session (`$.session.*` is current-session only). A shared `$.store` registry was judged feasible but fragile.

## Gaps in today's data model

- Unresolved and total review threads per PR.
- Several latest runs per PR or branch (today one `run`).
- More than one branch per session (today `git branch --show-current`), and a worktree path per branch.
- A recorded list of failed CLI calls.

## Open questions

- Can the real pane render cards, progress bars and icons? Today it is `Box`, `Text`, `Link`, `Button`. Ticket 01 answers it.
- Which "total progress" the collapsed bars mean: threads and CI were chosen.

## Tickets

`issues/01` to `06`. 02 to 05 are independent of each other; 06 builds the pane on all of them.
