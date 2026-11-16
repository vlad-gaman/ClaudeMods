# agent-pipeline

Runs a vault ticket through test-first implementation, review and docs to a draft PR, with four subagents. It is a plugin of skills and agents plus a hooks module that guards them.

## What it has

- **Skills**: `pipeline` runs one ticket through tester, implementer, reviewer and documenter on a feature branch. `bootstrap` builds a repo's notes in the vault before its first run.
- **Agents**: `tester`, `implementer`, `reviewer`, `documenter`, each spawned only by `pipeline`.
- **Profiles** (`profiles/`): build and test commands and conventions for Angular, .NET, Java/Spring, React/Vite and Terraform.
- **Guards** (`hooks/register.ts`):
  - The implementer and documenter are refused test paths. The tester may edit only test paths, `D:\TestScripts` and the temp folder.
  - Jira and Confluence writes are refused between `pipeline_begin` and `pipeline_end`.
  - Pipeline agents (and, for `az`, the main loop too) are refused Azure resource changes, `terraform` beyond fmt and validate, and package publishing.

## Setup

The skills and guards hold paths from the machine they were written on (the Obsidian brain, the `resume-ticket` lock script, `D:\TestScripts`). Point them at your own before a run.

## Develop

```bash
claude plugin test .
```

Tests are in `tests/pipeline.test.ts`.
