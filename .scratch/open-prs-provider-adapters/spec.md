# Spec: open-prs provider adapters

Status: ready-for-agent
Source: architecture-deepening ticket 03

## Problem Statement

As the owner I maintain Open PRs, which shows pull requests from GitHub and Azure DevOps. The mod is one 500-line hook where the fetch scheduler, retry, the pane, the remote parsing and both providers' CLI calls and mappers live together. A change to a `gh` or `az` query can leave a test passing, because tests route CLI calls by string prefix on the argv. The fetch function also opens the pane as a side effect, so scheduling cannot be tested on its own.

## Solution

Each provider is one deep module with one interface: given a remote (and the per-register run state), return a `Snapshot`. The scheduler, retry, pane and refresh logic depend only on that interface and are tested against a stub provider. Each provider's mappers and CLI calls are tested through its own interface. Nothing changes for the user: the same pane, the same figures, the same refresh cadence.

## User Stories

1. As a developer on a GitHub repo, I want my open PRs, review state and checks shown as today, so that nothing regresses.
2. As a developer on an Azure DevOps repo, I want my PRs, pipeline runs and comment counts shown as today, so that nothing regresses.
3. As the maintainer, I want a test to fail when a `gh` query changes shape, so that I do not ship a silently broken query.
4. As the maintainer, I want to test retry and refresh timing without faking `gh` or `az`, so that scheduler tests are short.
5. As the maintainer, I want fetching to return data without opening the pane, so that "when does the pane open" is decided in one place.
6. As the maintainer, I want to add a third host by writing one provider, so that the scheduler is untouched.
7. As a developer with no origin remote, I want the same "no origin remote" note as today.
8. As a developer whose `gh` or `az` is missing or logged out, I want the same failure note naming the tool as today.
9. As a developer, I want the tri-state of a snapshot (unknown, none, value) to keep its current meanings.
10. As a developer, I want credentials stripped from the shown origin URL as today.

## Implementation Decisions

- Provider interface: takes the engine, the parsed remote and the run state; returns a `Snapshot`. GitHub and Azure each implement it today (both already return a `Snapshot`), so the seam has two real adapters.
- Each provider owns its CLI argv, JSON field selection, mappers (state, review, check/run to run state) and its own caches (Azure repo ids and comment counts, which live in the per-register run state from ticket 02).
- The orchestrator keeps remote parsing, current-branch lookup, the scheduler, retry, the Refreshing indicator and pane open/dismiss logic.
- Fetching must not call the pane-open API; the orchestrator opens the pane after a successful snapshot.
- Provider selection is a single lookup on the remote's host, replacing the two separate host checks.
- Shared pure helpers (comment-count merge, remote base URL) move to the module that owns them; the Azure base URL is built once.
- Ticket 04's decision: mods share no runtime code, so this split stays inside the open-prs plugin.

## Testing Decisions

- Good tests assert external behaviour (the `Snapshot` returned, the atoms the pane shows), not which private function ran.
- Seam: the provider function. Each provider is tested through its interface with a stub CLI returning recorded JSON; the argv for each call is asserted once per provider in a contract test so a changed query fails.
- The scheduler and pane are tested at the hook against a stub provider, with no `gh`/`az` fakes.
- Prior art: the existing open-prs hook tests (110 tests); keep them as the regression net and migrate argv-prefix routing to the provider tests.
- Run `claude plugin test .` in the mod, type-check per README, and the full suite once at the end.

## Out of Scope

- Any change to what the pane shows or how often it refreshes.
- Sharing code with other mods (see ticket 04).
- Adding a third provider.
- The Azure per-register cache cost noted in the ticket 02 review.

## Further Notes

Do after ticket 02 (done). The `Snapshot` tri-state would benefit from a named type with a comment; do it in passing, not as scope.
