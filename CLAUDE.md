## Agent skills

### Issue tracker

Issues are GitHub issues at https://github.com/vlad-gaman/ClaudeMods/issues (use `gh`). Specs and maps stay under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

See `README.md` for what the mods are and how to install, test and type-check them.

## Releases

Every change to a mod bumps the `version` in its `.claude-plugin/plugin.json` (patch for a fix, minor for a feature). A push to `main` releases each changed mod as `<mod>-v<version>` with a zip, and a pull request fails `Check mod versions` when a changed mod keeps its version. See `README.md`.
