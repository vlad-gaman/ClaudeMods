---
name: bootstrap
description: Build a repo's Agents notes in the brain vault before its first pipeline run.
disable-model-invocation: true
argument-hint: <repo name or path>
allowed-tools: Bash(git fetch:*), Bash(git status:*), Bash(git rev-parse:*), Bash(git symbolic-ref:*), Bash(git ls-remote:*), Bash(git log:*), Bash(git show:*), Bash(git ls-tree:*), Bash(git merge-base:*)
---

# Bootstrap

Builds `Agents\<Repo>\` in the brain, the memory the agent pipeline reads for one repo: an index, conventions, decisions, lessons and component notes. Run it once per repo before the first `/agent-pipeline:pipeline` run; after that the pipeline's sync keeps the notes current.

Brain: `C:\Users\vlad.gaman\Google Drive\My Drive\Obsidian\Brain` (the path has spaces; quote it). For a case these steps don't cover, read `Agents\_shared\pipeline-design.md`, sections Tickets and Vault memory.

## Rules

- **Writes:** only inside `Agents\<Repo>\`, plus `Agents\_shared\ticket-schema.md` on the first bootstrap. The notes from step 2 outside `Agents\` are linked from the index; their content and frontmatter stay unchanged. Where one is wrong or missing something structural, list it in the summary; the `brain` skill owns those notes.
- **Repo:** read-only. Use only the git commands in this skill's `allowed-tools`. Build and test nothing.
- **Code wins:** where a vault note and the code disagree, write what the code does and list the conflict.
- **Names:** `<Repo>` is the repo folder name, which is also the service note's name and the `Tickets\<Repo>\` folder. `<Prefix>` is `<Repo>` without `Titan.` (`AccountsSecurity.NotificationService`). Note names are unique across the Obsidian vault, so before creating a note Glob `**/<name>.md` from `C:\Users\vlad.gaman\Google Drive\My Drive\Obsidian`, the parent of the brain.
- **Frontmatter:** repo paths with forward slashes, wikilinks quoted (`"[[Titan.AccountsSecurity.NotificationService]]"`), dates `YYYY-MM-DD`.
- **Links:** every `[[link]]` resolves. Link a note that exists; name anything else in plain text. Put format examples, such as `[[NN-slug]]`, in code.
- **Secrets:** name where a secret lives (the config key, or the Key Vault and secret name). The brain holds no secret values or connection strings, and neither does your output.

## Steps

### 1. Find the repo

Resolve the argument to a repo folder: a path as given, or a name looked up through the `repo:` field of `Services\<name>.md`, else `D:\Github\<name>`. With no argument, use the repo of the current directory. Run `git fetch`, take the default branch from `git symbolic-ref refs/remotes/origin/HEAD` (or `git ls-remote --symref origin HEAD` when that's unset). Then the **base branch**, the one run branches are cut from and PR'd into: on a rebuild, the existing index's `base_branch:`; else `develop` when `origin/develop` exists and most of the last 10 first-parent merges on `origin/<default>` came from it: their second parent is an ancestor of `origin/develop` (`git log origin/<default> --first-parent --merges -10 --format=%P`, then `git merge-base --is-ancestor <second parent> origin/develop`), which typically works for Azure DevOps's `Merged PR` subjects too (squash merges have no second parent and don't count); else the default branch. Record `origin/<base>`'s commit as `last_synced_commit`.

Take the file list from `git ls-tree -r --name-only <commit>`, never from the folder, which holds ignored copies (`.claude\worktrees\`, `bin\`, `obj\`). Read a listed file from the working tree when `HEAD` is that commit and `git status` is clean, otherwise with `git show <commit>:<path>`, so the notes describe the base branch and not a feature branch.

If `Agents\<Repo>\<Prefix>.index.md` already has a `last_synced_commit`, the repo is bootstrapped: stop and tell Vlad the pipeline's sync keeps it current. If he asked for a rebuild, carry on, and in step 6 rewrite the index, conventions and component notes in place, keeping decisions, lessons, `runs\` and every `related_prs` as they are.

Then the **profiles**: every file in `C:/Users/vlad.gaman/.claude/mods/agent-pipeline/profiles/` whose **Detect** line matches the file list (reading a file with `git show` where the line names its content). A repo can match several (a .NET API with an Angular UI); a repo matching none: stop and tell Vlad which languages it holds, so a profile can be added first.

Done when you have the repo path, `<Repo>`, `<Prefix>`, the default and base branches, the profiles and the commit.

### 2. Inventory the brain

List every note about the repo, each tagged **link** (outside `Agents\`) or **existing** (inside `Agents\<Repo>\`):

- the service note `Services\<Repo>.md`, its module notes `Services\<Repo> - *.md`, and the sub-domain notes it lists;
- Event notes that name the repo as a publisher or consumer;
- TADs, Domain notes and Memory facts that link the service note or name the repo (Grep the brain for both);
- ticket notes under `Tickets\<Repo>\`, and ticket notes elsewhere whose `services:` links the service note;
- every note already in `Agents\<Repo>\`.

With no service note, record that: the index then names `<Repo>` in plain text, and the summary lists it for `brain`.

Done when every note that links the service note or names the repo is on the list.

### 3. Read the code

- **Profiles:** everything each profile's Bootstrap **Read** line lists: build files, startup, config, tests.
- **CI:** the pipeline YAML (`.azure-pipelines\`, `azure-pipelines*.yml`, `.github\workflows\`), for the real build and test commands and the test projects it runs.
- **Guidance:** `CLAUDE.md`, `AGENTS.md`, `README`, `docs/`, `.editorconfig`, ADRs.
- **Startup:** entry point and wiring; logging, options, error handling, mapping.
- **Config:** the keys that reach Azure or a shared dev resource (Service Bus, Event Grid, Key Vault, databases, storage), by key name and resource kind.
- **Tests:** the test projects or folders, what each covers, naming and layout, helpers, fixtures and test-data builders, and how the tests that need Azure, Docker or a shared dev resource are marked.

Then pick the components: one per production project, merging thin ones (Models, Common, Contracts) into the component that uses them, and splitting a project only where it holds areas a ticket would change separately (an API beside its queue consumers). Aim for 3 to 8; the merge rule wins over one per project. Give each `source_paths`: quoted, forward-slash globs relative to the repo root, matched against `git diff --name-only`.

Done when every heading in the conventions shape (step 6) has an answer or `not found`, and every file in the file list that a profile's **Source files** line covers, and that isn't a test path (as the pipeline skill defines it), matches exactly one component's `source_paths`, except the exclusions the profile names, which you list.

### 4. Check the tickets

If `Agents\_shared\ticket-schema.md` doesn't exist, draft it: the frontmatter fields and body sections the pipeline reads, each with its allowed values. Take them from `~/.claude/skills/setup-matt-pocock-skills/issue-tracker-local.md` and `triage-labels.md` beside it, and the status table in the design's Tickets section; those stay the source of truth and are named by path. Add the variations the notes under `Tickets\` actually show. If it exists, check this repo's tickets against it and list each difference.

Either way, list this repo's tickets on `in-progress` (legacy: listed, left unchanged) and on `ready-for-agent`.

Done when every ticket note under `Tickets\` has been read for a new schema, or every ticket of this repo from step 2 has been checked against an existing one.

### 5. Propose the plan

Show Vlad before writing anything:

- the base branch and the merges that point to it, when it isn't the default branch;
- the profiles and the files that matched each;
- the notes to create, with names, and the existing ones to rewrite, reorganise or deprecate, with what supersedes each;
- the components with their `source_paths`, and the files left out;
- the notes the index will link, grouped as in step 2;
- the conflicts between brain notes and code;
- the ticket schema draft or its differences, and the two ticket lists.

Done when Vlad approves; apply his changes first.

### 6. Write the notes

Write components, conventions, decisions, lessons and, if drafted, `ticket-schema.md`, then the index, which links them all. `runs\` stays empty until the first pipeline run.

**Existing notes in `Agents\<Repo>\`:** a note that already has a target name is rewritten in place, keeping what is still true. Fold what is still true from the others into the new notes, and mark each superseded one with frontmatter `status: deprecated` and `superseded_by: "[[<new note>]]"`, and a `> [!warning] Deprecated — see [[<new note>]]` callout under its title, body untouched.

Every note has frontmatter `description` and `updated`; the shapes below add to that.

- **`<Prefix>.index.md`:** also `repo`, `default_branch`, `base_branch` (always, even when it equals `default_branch`, so a rebuild keeps the choice), `profiles` (a list, like `[dotnet, angular]`), `last_synced_commit`, and `service: "[[<Repo>]]"` (with no service note, `service: <Repo>` unquoted, which the pipeline passes on as the service note name). Body: one line of purpose with a link to the service note; `## Notes` linking conventions, decisions and lessons; `## Components`, one line each, `- [[<Prefix>.<Component>]] - <description>`; `## Related`, the step 2 links grouped as Service, Modules, Sub-domains, Domains, Events, TADs, Memory, with the ticket folder `Tickets\<Repo>\` in plain text; `## Runs`, empty.
- **`<Prefix>.conventions.md`:** one section per heading, each pattern with one example file (`path:line`) for the agents to copy.
  - `## Build and test`: per profile, the project or app root, runtime version, and the build and test commands as CI runs them, adjusted to the profile's Build and RUN (its required flags kept).
  - `## Test filter`: the tests that need Azure, Docker or a shared dev resource, how they're marked, and a filter in the profile's syntax that leaves them out.
  - `## Tests`: projects or folders and what each covers, naming, layout, helpers, fixtures, mocking and test-data use.
  - `## Code patterns`: DI, options, logging, error handling, async, mapping. Link a Memory fact where one covers a pattern.
  - Each profile's **Conventions extras**.
  - `## Config that reaches Azure`: keys by name and resource kind.
  - `## Gotchas`: those from the repo's docs and code, each with its source; for gotchas in brain notes, a link to that section (`[[Titan.AccountsSecurity.NotificationService#Gotchas]]`).
- **`<Prefix>.decisions.md`:** `## Decisions`, one line each: date, decision, link to its source (an ADR path, a spec's `## Decisions`, a TAD, or a ticket's Comments). Empty if none; the pipeline appends.
- **`<Prefix>.lessons.md`:** `## Lessons`, empty; the pipeline appends after failed rounds.
- **`components\<Prefix>.<Component>.md`:** also `source_paths` and `related_prs: []`. Body: purpose; entry points (types, endpoints, handlers, consumers); dependencies (other components, our packages, Azure resources by kind); tests (the test project and folder that cover it); links to the service, module, sub-domain and event notes it implements.
- **`Agents\_shared\ticket-schema.md`:** the approved draft from step 4, field examples in code.

Done when every note in the approved plan exists.

### 7. Lint and report

Run `powershell -NoProfile -File C:/Users/vlad.gaman/.claude/hooks/brain/brain-lint.ps1 -Quiet` and fix errors in notes you wrote until no ERROR line names one of them. Then give Vlad the summary: notes created, rewritten and deprecated; conflicts; brain notes outside `Agents\` that need a `brain` update, including a missing service note; lint errors in other notes; the ticket lists; anything you couldn't verify.

Done when no lint ERROR names a note you wrote and the summary is out.
