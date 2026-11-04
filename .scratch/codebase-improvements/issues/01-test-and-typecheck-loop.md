# How do tests and type-checking run?

Type: research
Status: resolved
Blocked by: 

## Question

The tests import `claude-code/testing` and two `tsconfig.json` files extend a missing `./.claude-plugin/types/tsconfig.json`; the repo has no `package.json` or documented command. Establish how to run the existing tests and type-check each mod (runner, where the tsconfig base comes from, how the `types/index.d.ts` files relate). Report the working commands and what is missing. Make no repo changes.

## Answer

Full findings: [research/01-test-and-typecheck-loop.md](../research/01-test-and-typecheck-loop.md) (not independently re-run; commands as reported by the research agent, CLI 2.1.318).

- **Tests:** `claude plugin test .` from each mod folder; no package.json involved. session-panel 14 pass; switchboard 2 pass; usage-band 1 pass, 1 fail (`tests/band.test.ts:20-25` never stubs `session.usage`, which `hooks/register.tsx` calls); session-handoff has no tests.
- **Type-check:** `tsc -p <mod>` fails as committed (TS5083): each tsconfig extends `./.claude-plugin/types/tsconfig.json`, which is absent. The engine writes that base plus `claude-code/` d.ts folders into a mod's `.claude-plugin/types/` only when it loads the mod from a folder it owns; copies exist under `C:\Users\scien\.claude\dev-mods\<session>\<mod>\.claude-plugin\types\` (engine 2.1.309). With them staged, strict errors: session-panel 7, switchboard 9, usage-band 1, session-handoff 1 (real: `noUncheckedIndexedAccess`, a `lucide` field missing from the Mod type, state typing).
- **Gaps:** no documented command or committed base (a recipe vs generated base needs a decision); no tsc CLI on this PC; engine types older than the CLI; `claude plugin validate` passes but flags missing README/LICENSE/icon.
