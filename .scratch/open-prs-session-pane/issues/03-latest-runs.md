# Keep the latest several runs per PR and branch

Type: task
Status: ready-for-agent
Blocked by:

## Problem

Each PR and the branch carry one `run` (the worst state, via `worst`). The pane shows the latest runs as chips and a "ci ok/total" bar (spec: [spec.md](../spec.md)), which needs several runs.

## Goal

Providers return the latest N runs (start with 5) per PR and for the branch, newest first, each with its state, name and url. Keep the single worst-state `run` derivable from the list so nothing else changes meaning.

## Done when

- `OpenPr` and the branch answer carry `runs: Run[]`; `run` is computed from it.
- Provider tests cover both hosts: several runs, none, and a failed call keeping the last answer.
- `claude plugin test .` in `open-prs` is green.

## Comments
