# Write the root README and point CLAUDE.md at it

Status: resolved
Blocked by: 01

Per the [docs plan](../../codebase-improvements/issues/04-docs-plan.md) and the [type-check approach](../../codebase-improvements/issues/06-typecheck-approach.md).

- New root `README.md`:
  - What the four mods are, one line each, linking their READMEs.
  - **Install** from a local folder, using the steps in the official docs (check them).
  - **Test**: `claude plugin test .` per mod, the `tests/` layout, a few lines on stubbing engine calls such as `session.usage`, a pointer to the official `claude-code/testing` docs. No shared helper code.
  - **Type-check**: the recipe verified in ticket 01 (`claude --plugin-dir ./<mod>` once, then `npx -p typescript tsc -p ./<mod> --noEmit`).
  - The rule: change a README in the same commit as the behaviour it describes.
- `CLAUDE.md`: one line pointing at the README. Leave the agent-skills sections unchanged.
- Check each mod README's first sentence still matches its `plugin.json` description.

## Comments

Already delivered in 5a2bb33 (root README, CLAUDE.md pointer). Verified: all ticket bullets covered; each mod README first sentence matches its plugin.json description.
