# Is type-checking part of the improvements, and how?

Type: grilling
Status: resolved
Blocked by:

## Question

`tsc` cannot run as committed because the tsconfig base is engine-generated and absent ([research/01](../research/01-test-and-typecheck-loop.md)). Decide whether a documented/committed type-check recipe belongs in this effort (it touches the docs and test loop), whether to fix the 18 strict errors.

## Answer

Decided with the owner (all five recommendations accepted). Type-checking is in scope, narrowly, because `claude plugin test` does not type-check and the ticket-05 refactors need a check tests can't give.

1. **Base:** documented recipe: run `claude --plugin-dir ./<mod>` once interactively (official docs: this writes `.claude-plugin/types/` into the mod), then `tsc -p ./<mod> --noEmit`. The generated folder stays untracked (the engine writes a `.gitignore` of `*`). First implementation step: confirm it works for a mod in this repo; fallback is the scratch-copy recipe in [research/01](../research/01-test-and-typecheck-loop.md).
2. **tsconfig:** add the same one-line `tsconfig.json` (`extends ./.claude-plugin/types/tsconfig.json`) to usage-band and session-handoff, so all four match.
3. **TypeScript:** `npx -p typescript tsc -p ./<mod> --noEmit`; no `package.json`, nothing added to the repo.
4. **The 18 strict errors:** fixed only by correcting types (local declarations, `lucide` on `Mod`, `isPlaced` result type, indexed-access guards, `any` casts where the right type is clear). No runtime change; a real bug found is logged as a bug note, not fixed.
5. **Done means:** each mod's implementation ticket finishes only when `claude plugin test .` passes and `tsc -p . --noEmit` reports zero errors for that mod.

The root README gets a type-check section with the recipe in (1) to (3) (this lifts the exclusion in the docs plan).
