# Profile: terraform

**Detect:** `*.tf` files. A repo that also matches an application profile gets both (Titan.AccountsSecurity.Auth0).

## Build and test

There are no unit tests. In **write** mode the Tester writes nothing, records the baseline and reports `green` with ADDED `none`, unless the repo already has `*.tftest.hcl` files. Every acceptance criterion is `integration` (a plan or a deploy shows it) or `external`, and goes into the PR as a manual check.

- **Setup check:** `terraform version`.
- **RUN:** a set of **checks**, joined with `;` so each runs: `terraform -chdir="<repo>" fmt -check -recursive`, then for every root module: `terraform -chdir="<repo>/<dir>" init -backend=false -input=false -lockfile=readonly` and `terraform -chdir="<repo>/<dir>" validate`. Root modules are every folder the pipeline YAML runs `plan` in (`terraform/root_modules/<name>` in the provisioning repos), not just those a change touches. A module whose `init` fails (a private module source with no access, or no committed `.terraform.lock.hcl` for `-lockfile=readonly`) is left out and named under NOTES; if every module is, RUN counts only `fmt`, and the PR says so.
- **Build:** the `init` and `validate` commands of RUN, without `fmt`. BUILD is `ok` when at least one module's `validate` ran and no module fails that didn't fail in the baseline; with no module run, report `blocked` naming the modules and why.
- **Counts:** TESTS and BASELINE are `<checks passed>/<checks run>`, one check being `fmt` or each module's `validate`. BASELINE_FAILING and FAILING name them: `fmt`, `validate terraform/root_modules/env_config`.
- **Filter:** none.
- **Allowed:** `fmt`, `validate`, `init -backend=false`, `providers`, `version`; the guard refuses the rest to pipeline agents. Anything else, `plan` included, reaches Azure state: `needs-approval` with the exact command, for Vlad to run.
- **Build output** (never committed): `.terraform/`, `*.tfplan`, `crash.log`.

## Tests

- **Test paths:** `*.tftest.hcl`, and a `test` or `tests` folder (Terratest in Go).
- Write tests only where the repo already has `*.tftest.hcl` that run with `terraform test` and no Azure provider calls.

## Our packages

The shared modules under `D:\AzureDevops\Titan Framework Shared\` (`terraform-azuredevops-library`, `terraform-azurerm-secrets-init`, and others). Before adding a resource pattern, check whether one of them or a module already in the repo covers it.

## Docs

- No doc comments. New variables and outputs carry a `description`, written as code by the Implementer.
- **Doc-comment lines:** none; the Documenter changes no `.tf` file.

## Running and processes

- Nothing runs locally beyond RUN.
- `*.tfvars` and variable groups may hold secrets: read only variable names and whether a value is set.
- Some provisioning repos keep UK and EU on separate branches (Memory note `provisioning-repo-region-branches` in the brain). A run covers only its base branch; a ticket for the other region sets its own `base_branch:`.

## Bootstrap

- **Read:** the root modules and their `versions.tf` / `providers.tf` (provider versions, backend kind); `module` sources, local and shared; per-environment `*.tfvars` (names only); the pipeline YAML (which root modules it plans and applies, and with which variable groups).
- **Source files:** `*.tf`.
- **Sync files:** `versions.tf`, `providers.tf`, `.terraform.lock.hcl`, pipeline YAML.
- **Conventions extras:** `## Resources and naming` (naming pattern, tags, how environments and regions are split); `## Shared modules` (sources and versions in use).
