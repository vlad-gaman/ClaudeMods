---
name: pipeline
description: Run one ticket through the agent pipeline (tests first, code, review, docs) to a draft PR.
disable-model-invocation: true
argument-hint: <ticket path | NN-slug | Jira key | free text> [--opus | <role>=<haiku|sonnet|opus> ...]
model: sonnet
---

# Pipeline

Takes one ticket Vlad names through Tester → Implementer → Reviewer → Documenter on a feature branch, and ends with a draft PR and the ticket on `ready-for-human`, or with a **stop** and the reason. You orchestrate: the agents write the code and tests, you run git, the lock and the vault.

Brain: `C:\Users\vlad.gaman\Google Drive\My Drive\Obsidian\Brain` (spaces; quote it). Design and the reason behind each rule: `Agents\_shared\pipeline-design.md`; read it only for a case these steps don't cover.

## Rules

- **Repo commands:** git as `git -C "<repo>"`; `gh` and `az` from inside the repo folder.
- **Pushes** go only to the run branch, which is never `main`, `master`, the default branch or the base branch. Never force-push, pass `--no-verify`, or pass `-Force` to the lock script.
- **Jira** is read-only.
- **Asking Vlad:** an agent's `blocked` or `needs-approval` pauses the run: ask Vlad its QUESTIONS, then give the same turn again with his answer. An approved command you run yourself, checkpoint as `wip(pipeline): approved command`, and pass on its output; a refused one is passed on as refused.
- **Secrets:** no secret value in a brief, note, commit or PR; name where it lives.

## Definitions

- **Lock script:** `pwsh -NoProfile -File C:/Users/vlad.gaman/.claude/skills/resume-ticket/resume-ticket.ps1 -Key <NN-slug> -Repo <Repo> -Cwd "<repo>"`, plus one switch. The owner is `CLAUDE_CODE_SESSION_ID`; check it's set before the first call, and stop if not.
  - `-Check`: exit 0 `FREE`, or exit 2 `LOCKED` with the holder and age, whoever holds it and however old.
  - `-Claim`: exit 0 `CLAIMED`, or exit 2 `LOCKED` when any lock exists or another session wins it. It never takes over an aged lock and needs no Handover.
  - `-Release`: exit 0 `RELEASED`, or exit 2 `NOT RELEASED` when the lock isn't this session's; report that to Vlad and leave it.
  - Exit 1 (`NO MATCH`, `AMBIGUOUS`): report the list and stop.
  - Reporting a lock to Vlad, give him the command to clear it himself: the lock script with `-Release -Force`.
- **Base branch:** the ticket's `base_branch:` when set (a region branch, a hotfix), else the index's `base_branch:` (a per-repo override, like `develop` for a repo that releases develop → master), else the default branch. Run branches are cut from `origin/<base>`, synced against it and PR'd into it.
- **Profiles:** the index's `profiles:` list, each the file `C:/Users/vlad.gaman/.claude/mods/agent-pipeline/profiles/<name>.md`. They hold each language's commands, test paths, build output, doc-comment lines and sync files.
- **Test paths:** the same for every profile: what `TEST_PATH` in `C:/Users/vlad.gaman/.claude/mods/agent-pipeline/hooks/register.ts` matches, the rule the guard enforces (`test`, `tests`, `*.Test`, `*Tests`, `__tests__` and `__mocks__` folders; `.spec`, `.test` and `.e2e-spec` JS/TS files; `.tftest.hcl`).
- **Model override:** Vlad's prompt may name a model for one role (`implementer=opus`, `tester=opus`) or for all of them (`--opus`). Hold it for the whole run, including retries and fixes, and log it in the run note's `## Turns`. Without one, each role keeps its frontmatter model.
- **Brief:** each turn is a new `Agent` call with `subagent_type` `agent-pipeline:<role>`, `model` only when a model override names that role (else none: the frontmatter pins it), and a brief carrying the **common part**: the absolute repo path, branch, Jira key, the ticket's What to build, Acceptance criteria and Context (and Handover, if any), comments used, and the absolute paths of the conventions and lessons notes and of the profiles. Tester **run** and **fix** briefs add RUN, BASELINE_FAILING and the AC lines of the latest Tester report that has them; fix briefs also name each test or finding to fix with its reason. Other additions are in each step. Record the branch and HEAD before the spawn.
- **Report:** act on the block at the end of the reply. A missing block, a RESULT or VERDICT outside its list, or `done` with `BUILD: failed`, `BUILD: not run` or `TESTS: not run`: a **retry**.
- **Diff check:** after every agent turn. On another branch: `git switch <run branch>`. HEAD moved: `git reset --soft <recorded HEAD>`. Either is a breach. Then the turn's changes are `git diff --name-only HEAD` plus `git ls-files --others --exclude-standard`, leaving out the profiles' build output. The Tester changes only test paths; the Implementer no test paths; the Reviewer nothing; the Documenter no test paths, and in production files only the doc-comment lines of the profile that owns the file's extension (`git diff -U0 HEAD`). On every breach, restore the breaching tracked files (`git restore --staged --worktree -- <path>`), delete the breaching untracked ones and drop that turn's COMMENTS; then retry naming the breach.
- **Retry:** give the same turn once more, saying what was wrong. If the retry fails in any way, stop.
- **Checkpoint:** after every turn that passes the diff check and the report check, before the next spawn: `git add -A` and commit `wip(pipeline): <role> <mode>`. A commit hook that fails is a stop.
- **Budgets,** for the whole run, logged in the run note:
  - **Test rounds** (3): an Implementer turn that returns `done` and passes the report check, plus the Tester run that checks it. Other Implementer turns count none.
  - **Test fixes** (3): Tester fix turns for a `test-dispute` or `tests-outdated`.
  - **Review rounds** (3): a Reviewer turn that returns `changes` with a `blocking` or `major` finding, plus its fixes. A `changes` with neither counts as `pass`.
- **Comments used:** the running total of every checkpointed report's COMMENTS, against the change set's budget of 3.
- **Stop:** how the run ends early depends on how far it got.
  - **Before the claim:** report the reason to Vlad; write nothing.
  - **Before the first agent turn:** switch back to the start branch; on a vault ticket, set `status` back to `ready-for-agent` (or the `needs-info` a check called for, with its questions in a comment) and release the lock; close the run note if it exists with `result: stopped: <reason>`; call `pipeline_end` if `pipeline_begin` succeeded; report, naming any branch you created.
  - **After the first agent turn:** Finish, stop path.

## Steps

### 1. Read the input

- **Vault ticket** (a path, an `NN-slug`, or a Jira key that a note under `Tickets\` has as `key:`): read the note.
- **Jira key** with no note: read the issue with the Atlassian MCP's `getJiraIssue` (summary, description, Acceptance Criteria `customfield_19166`, else the criteria in the description).
- **Free text:** draft What to build and acceptance criteria from it and show them to Vlad; carry on when he confirms.

Then find:
- **Repo:** the `repo:` of the service note the ticket's `services:` links when it's a local path (`D:/...`, not a GitHub slug), else `D:\Github\<folder>` from the ticket's folder `Tickets\<folder>\`, else the repo of the current directory; ask Vlad if none fits. `<Repo>` is the repo path's folder name.
- **Agents notes:** `Agents\<Repo>\<Prefix>.index.md`, `<Prefix>` being `<Repo>` without `Titan.`. Missing: stop, and tell Vlad to run `/agent-pipeline:bootstrap <Repo>` first. An index with no `profiles:`, or a profile with no file: stop, and tell Vlad to add it (or rebuild with bootstrap).
- **Jira key:** the ticket's `key:` unless it's `local`, else from its `branch:` (`CO-1234_...`), else ask Vlad now. The PR title needs it.

Done when you have the ticket, the repo, the index and the key.

### 2. Check and claim

**Preflight**, every input:

1. `git status --porcelain` is empty; else stop and list the files. Record the current branch as **start branch**.
2. `git fetch`; take the default branch from `git symbolic-ref refs/remotes/origin/HEAD` (or `git ls-remote --symref origin HEAD`), then the base branch; `git rev-parse origin/<base>` is the **sync SHA**. No `origin/<base>`: stop.
3. The host from `git remote get-url origin`: GitHub, or Azure DevOps (`dev.azure.com/<org>/<project>/_git/<repo>`, keep org and project); any other: stop.
4. The ticket's `branch:`, if set, isn't the base, the default, `main` or `master`.
5. Each profile's **Setup check** passes (a JDK, Node, Chrome, the CLI); else stop and name what's missing.

**Vault ticket:**

1. Lock script `-Check`. `LOCKED`, or `status: claimed` with the lock `FREE`: stop and report it.
2. Check in order:
   - `type: ticket`, and the file name doesn't end in `-spec.md` or `-map.md`;
   - `status: ready-for-agent`; anything else: stop and report it;
   - each **Blocked by** link resolves to one note (Glob `Tickets\**\<name>.md`; none or several: stop and list them). Any on `wontfix`: `needs-info` naming it. Else any not `resolved`: stop and list them;
   - **Acceptance criteria** has an item; else `needs-info` asking for them.
3. Lock script `-Claim`; `LOCKED`: stop. A check that called for `needs-info`: stop now. Otherwise set `status: claimed`.

Jira-only and free-text inputs have no lock; two runs on the same key aren't prevented.

**Every input:** call the mod's `pipeline_begin` tool with the ticket's `NN-slug`, Jira key or `free text` (it shows as `mcp__agent-pipeline__pipeline_begin`; load it with ToolSearch if deferred). An error is a stop.

Done when the run flag is set and a vault ticket is `claimed`.

### 3. Branch and sync

1. **Branch:**
   - The ticket's `branch:` if set. Switch to it (tracking `origin/<branch>` when only the remote has it, creating it from `origin/<base>` when neither has it), then `git merge --ff-only origin/<branch>` if the remote is ahead. Not fast-forward, or the switch fails (a branch checked out in another worktree): stop.
   - Else `<KEY>_<words>`: the Jira key, then the ticket title's first six words in lowercase, letters and digits only, joined by `_` (like `CO-5638_us_region_support`). If that name exists locally or on origin, stop. Create it from `origin/<base>` and write it to the ticket's `branch:`.
   - **Run start** is the branch head, or its parent when the head's subject starts `WIP:` and the head isn't on origin (a stopped run's commit, folded in at step 8). **Base** is `git merge-base HEAD origin/<base>`.
2. Create the run note `Agents\<Repo>\runs\<Prefix>.run-YYYY-MM-DD-HHmm.md`: frontmatter `description`, `updated`, `ticket` (wikilink, Jira key, or `free text`), `branch`, `base`, `result: running`; body `## Sync`, `## Turns`, `## Review`. Link it under the index's `## Runs`.
3. **Sync the Agents notes** to the sync SHA, reading files with `git show <sync SHA>:<path>`. When the ticket's `base_branch:` differs from the index's, the notes track another branch: only check the ticket's `path:line` references, leave every note and `last_synced_commit` as they are, and say so in `## Sync`. Otherwise:
   - `git diff --name-status <last_synced_commit> <sync SHA>`. If `last_synced_commit` isn't an ancestor, or more than 100 files changed, update only the conventions and the index, leave `last_synced_commit` as it is, and tell Vlad at the end to run `/agent-pipeline:bootstrap <Repo>` asking for a rebuild.
   - Otherwise update in place the component notes whose `source_paths` match a changed file, following renames; deprecate a note whose files are all deleted the way bootstrap does (step 6). Re-read the conventions sections that build or test config changes touch (the profiles' sync files, pipeline YAML). Set `last_synced_commit` to the sync SHA.
   - Check each `path:line` in the ticket still points at what it describes; note those that moved.
   - Fill the run note's `## Sync`.

Done when the branch is checked out at run start and the run note exists.

### 4. Tests first

Brief the Tester in **write** mode (common part only). Act on RESULT:

- `red`: keep RUN, BASELINE, BASELINE_FAILING, TESTS, ADDED, COMPILE and AC; this is the **red run**.
- `green` with ADDED `none` (a refactor, or no unit criteria): keep RUN, BASELINE, BASELINE_FAILING and AC; this is the **baseline run**, and the existing tests are the spec.
- `failing`, or `green` with tests ADDED (new tests that already pass): retry.

Log every turn of the run in the run note's `## Turns`: role, mode, RESULT, counts.

Done when you hold RUN and a red or baseline run.

### 5. Implement

Brief the Implementer: the common part plus RUN, BASELINE_FAILING, the failing tests, COMPILE, and the failures or findings to fix. Act on RESULT:

| RESULT | Next |
| --- | --- |
| `done` | Tester **run**. `green`: step 6, or back to step 6's re-review. `red` or `failing`: the next test round, with its FAILING; after the third, stop. |
| `test-dispute` | Tester **fix** with each DISPUTED test and the Implementer's reason. The Tester's NOTES name the tests it kept. All changed: back to the Implementer. Any kept: pause and ask Vlad, giving both sides, and log his ruling for Finish. If he upholds the dispute, brief the Tester again saying his ruling makes it hold; if not, brief the Implementer that the test stands. A test disputed a second time in the run is a stop. |
| `tests-outdated` | Tester **fix** with each OUTDATED test and the criterion that changes it, then back to the Implementer. |

A Tester fix that returns `failing` is a retry. A fourth test fix is a stop.

Done when the Tester's run is `green`.

### 6. Review

Brief the Reviewer: the common part plus base, the latest Tester run (command and counts) and the AC lines of the latest Tester report that has them, and from the second turn its previous findings with how each was handled.

- `pass`: go to step 7.
- `changes`: one review round. The `blocking` and `major` findings are fixed, in this order:
  1. Findings on test files, and `AC<n>` findings that a criterion isn't proven, go to the Tester in **fix** mode.
  2. Then findings on production files, `AC<n>` findings that a criterion isn't met, and a Tester fix that returned `red`, go to the Implementer as a test round (step 5), whose Tester run is the check.
  3. With nothing for the Implementer, the Tester's `green` fix run is the check.

  Then re-review.

On every verdict, keep the `minor` and `note` findings and UNVERIFIED for the PR, deduplicated by `file:line`.

After the third review round's fixes, give the Reviewer one last turn that counts no round and gets no fixes: a `blocking` finding there is a stop; `major` ones join the kept findings.

Done when the Reviewer passes, or its last turn has no `blocking` finding.

### 7. Document

Brief the Documenter: repo path, base, Jira key, branch, the ticket, the red run (or the baseline run) and the final green run with commands and counts, the kept findings and UNVERIFIED as reviewer notes, the manual checks (from the latest Tester report with AC lines, those sorted `integration` or `external`), the absolute path of `Agents\<Repo>\`, the index's `service:`, and the absolute paths of the profiles. When step 3 skipped the sync for a ticket `base_branch:`, the brief also says to leave the component notes unchanged.

`BUILD: failed`, or LINT errors marked `yours`: retry. Show those marked `elsewhere` to Vlad at the end.

Done when you hold PR_TITLE, PR_BODY and `BUILD: ok`.

### 8. Commit and open the draft PR

1. `git reset --soft <run start>`, `git add -A`, and check `git status --short`: unstage the profiles' build output and list it for Vlad. Commit: a subject under 72 characters, a short bullet list of the most important changes, and the session's commit attribution line. A commit hook that fails: stop, changes left staged.
2. `git push -u origin <branch>`. Rejected: amend the subject to start `WIP:`, then stop.
3. Write PR_BODY to a file under `$TEMP`, then from the repo folder:
   - GitHub: `gh pr create --draft --base <base> --head <branch> --title "<PR_TITLE>" --body-file <file>`
   - Azure DevOps, in PowerShell: `az repos pr create --organization https://dev.azure.com/<org> --project <project> --repository <Repo> --draft true --source-branch <branch> --target-branch <base> --title "<PR_TITLE>" --description (Get-Content <file> -Raw)`. Over 4000 characters: shorten the reviewer notes to `[sev] file:line` first.

   Failed: stop; the branch is pushed with no PR.
4. Add the PR URL to `related_prs` of every component note in the Documenter's CHANGED.

Done when the draft PR exists.

### 9. Finish

**Success:** on a vault ticket, `status: ready-for-human`, the PR URL in `prs`, `[x]` on each criterion the latest Tester report with AC lines proves with a unit test that passes (named there and not in its FAILING; a `unit — none` line stays unticked), and a `## Comments` entry `- YYYY-MM-DD HH:mm: Pipeline run: draft PR <url>.` listing the manual checks.

**Stop path:** if HEAD is the run branch, nothing is staged from a failed hook, and there are changes since run start, commit them as one unpushed commit (as in step 8.1, subject starting `WIP:`). A vault ticket gets `needs-info` when the spec is the problem (missing or contradictory criteria, a ruling that sends the spec back), with the exact questions in a comment; otherwise `ready-for-human` and a Handover, in this format the lock script parses, where `<state>` is `WIP commit, not pushed`, `pushed, no PR` or `changes staged, commit hook failed`:

```markdown
## Handover (YYYY-MM-DD HH:mm)

To continue, start in `<absolute repo path>` and run `/resume-ticket <NN-slug>`.

**Done (<branch>, <state>):**
- <what's verified, with rounds spent>

**Open, in order:**
1. <next action, or what it's blocked on>
```

With no vault ticket, the Handover goes in the run note.

Then, on both paths:

1. Close the run note: `result` (`pr` or `stopped: <reason>`), every turn, the review findings, the PR URL, what's left.
2. Append to the lessons note's `## Lessons`, one line each, `- YYYY-MM-DD: <lesson> ([[<run note>]])`, for what generalises: a test round that wasn't green, a `major` or worse finding, a breach, a gotcha from an agent's NOTES. Append Vlad's rulings and directions to the decisions note's `## Decisions` the same way.
3. Run `powershell -NoProfile -File C:/Users/vlad.gaman/.claude/hooks/brain/brain-lint.ps1 -Quiet` and fix errors in notes you wrote; after two fixing passes, list what's left for Vlad.
4. Lock script `-Release` (vault tickets), then call `pipeline_end`. These two run even when the steps above fail.
5. Tell Vlad: the PR or the stop reason, rounds spent, reviewer notes and UNVERIFIED, manual checks, sync notes, lint errors, files left unstaged, and agents' NOTES worth a ticket.

Done when the lock is released, the run flag is cleared, and Vlad has the summary.
