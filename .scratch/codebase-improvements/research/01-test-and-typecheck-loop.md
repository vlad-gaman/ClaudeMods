# Test and type-check loop for the four mods

Type: research. Verified 2026-11-04 on this PC (Windows 11, Git Bash, Node v24.15.0, Claude Code CLI 2.1.318 at `C:\Users\scien\.local\bin\claude`).

No repo files were changed. All runs used copies of the mods in the scratchpad `C:\Users\scien\AppData\Local\Temp\claude\0fd068f53c786d4b\bc9df7c8-7385-4486-906f-feec5af596ee\scratchpad\mods\`, because `claude plugin validate`/`test` and the engine's type-writing all touch the mod folder.

## Short answer

- **Run tests:** `claude plugin test` from inside the mod folder. There is no package.json, no bun, no npm script. The engine's own runner does the work. It passes for session-panel (14/14), switchboard (2/2), and fails for usage-band (1 of 2 fails, see below). session-handoff has no tests.
- **Type-check:** there is no working command in the repo as it stands. `tsc -p <mod>` fails with `TS5083: Cannot read file '.../.claude-plugin/types/tsconfig.json'`, because that base is not in the repo. It is written by the Claude Code engine into a mod's `.claude-plugin/types/` only when the engine loads that mod from a folder it owns and hot-reloads.
- **Working type-check (scratch copy):** copy the mod, lay the engine's types into `.claude-plugin/types/`, and run TypeScript there. This works with TypeScript 5.9.2 taken from Antigravity's install (no global install).
- **Gaps:** no package.json or documented repo command; no committed `.claude-plugin/types/` base; the engine-written types I used are from Claude Code 2.1.309 while the installed CLI is 2.1.318; no CLI tsc on this PC (only the compiler API inside Antigravity).

## Test runner

Command, run from a mod folder (here a scratch copy):

```
claude plugin test .
```

Source: `claude plugin test --help` (the CLI itself): "Runs every *.test.ts and *.test.tsx under dir, each file in a child of this binary, in an environment like the one the mod's hooks run in. A test file imports its kit from 'claude-code/testing'. Exits 1 when a test fails."

Docs: https://code.claude.com/docs/en/plugins/mods/test.md, section "Write a test": "Give each test file a name that ends in `.test.ts`... Every test file needs at least one `test()`", and "In your shell, run the tests from the `first-mod` directory: `claude plugin test`". The docs say nothing about tsconfig or type-checking on that page.

Results on this PC (scratch copies, exit codes from the runner):

| Mod | Test files | Command | Result |
|---|---|---|---|
| session-panel | `hooks/register.test.tsx` (5 tests), `tests/todos.test.ts` (9 tests) | `claude plugin test .` | 14 pass, 0 fail, exit 0 |
| switchboard | `hooks/switchboard.test.tsx` (2 tests) | `claude plugin test .` | 2 pass, 0 fail, exit 0 |
| usage-band | `tests/band.test.ts` (2 tests) | `claude plugin test .` | 1 pass, 1 fail, exit 1 |
| session-handoff | none | `claude plugin test .` | "no *.test.ts or *.test.tsx under ...", exit 1 |

The one usage-band failure, verbatim from the run (`scratchpad\test-usage-band.txt`):

```
(fail) the band shows chat, session and week usage on every surface [37.69ms]
  AssertionError: expect(received).toMatchObject()
  ...
  nothing beneath the plugins answers session.usage: a test answers it with on('session.usage', ...): { value: ... } for a call on $, the event's own result otherwise
  the engine reported:
    usage-band's ui.render hook was skipped: usage-band: no implementation for session.usage
(pass) limits go yellow at 75% and red past 90%; the chat at 25% and past 40% [0.54ms]
```

Source of the failing test: `usage-band/tests/band.test.ts:20-25`. It stubs `session.measure`, `session.surfaces`, `ui.status`, and `ui.render`, but not `session.usage`, which `usage-band/hooks/register.tsx:21,150,191,209` calls. The engine's own message names the fix (add an `on('session.usage', ...)` stub). I did not change the test.

The test import `claude-code/testing` resolves at run time, not from a file in the mod. The declaration is inside the engine's types: `claude-code/index.d.ts` line 15843 of the bundled copy (`declare module 'claude-code/testing'`), see below.

## Type-check: where the tsconfig base comes from

### What the repo has

- `session-panel/tsconfig.json` and `switchboard/tsconfig.json` contain only `{ "extends": "./.claude-plugin/types/tsconfig.json" }`.
- `usage-band/` and `session-handoff/` have no tsconfig.json.
- No `.claude-plugin/types/` directory exists anywhere under `D:\ClaudeMods` (`git status` shows only `.claude/` and `.scratch/` untracked, and neither contains one).
- No package.json, no lockfile, no CI config, no scripts.

Running the repo's own config as-is (TypeScript 5.9.2, `--noEmit`, no files written):

```
cd D:\ClaudeMods\session-panel
node <scratch>\tsc-run.js -p . --noEmit
  -> error TS2468: Cannot find global value 'Promise'.
  -> error TS5083: Cannot read file 'D:/ClaudeMods/session-panel/.claude-plugin/types/tsconfig.json'.
  -> hooks/register.test.tsx(1,30): error TS2307: Cannot find module 'claude-code/testing'
  -> hooks/register.tsx(1,36): error TS2307: Cannot find module 'claude-code'
  exit=2
```

The same for switchboard (`TS5083`, then `Cannot find module 'claude-code'`). This is the "missing base" failure the question describes. The `Promise` and `find`/`includes` lib errors appear only because the base's `lib`/`target` is absent and TypeScript falls back to defaults.

### Where the base is supposed to come from

Primary source: the plugin-authoring skill documentation bundled with the engine, `C:\Users\scien\AppData\Local\Temp\claude\bundled-skills\2.1.309\0c3866f9ef34566dfdcc4e58e67c51fb\plugin-authoring\`:

- `reference.md` lines 39-52: "Its header carries a `tsconfig.json` that fits a hooks module ... A mod the engine loads from a folder it is being written in (this session's mods folder, or a `--plugin-dir` or `CLAUDE_CODE_PLUGIN_DIRS` folder the session hot-reloads) has the same declarations laid beside it, in `.claude-plugin/types/`, at every load and reload: `claude-code/index.d.ts`... `claude-code-tools/index.d.ts`... `claude-code-mcp/index.d.ts`... one entry per plugin its `plugin.json` lists under `dependencies`... and a `tsconfig.json` its own extends, so its editor and `tsc -p <mod folder>` type it with no step taken. There is no command to run. A folder the session loads from and does not hot-reload ... is never written in: a mod there is type-checked with the header's `tsconfig.json`, kept outside the mod folder."
- `types/claude-code.d.ts` lines 67-88 (the header): an example tsconfig with `"types": []` and `"include": [".claude-plugin/types", "hooks", "types", "tests"]`, then at lines 86-88: "A mod with no tsconfig of its own has these options without writing them: the engine gives it a tsconfig.json that extends .claude-plugin/types/tsconfig.json, which carries them with that folder as the one type root."

Docs (official, reachable): https://code.claude.com/docs/en/plugins/mods/create.md, section "Get type definitions for your version": "When Claude Code loads a mod from `--plugin-dir` in an interactive session, or a mod Claude wrote for you, it writes TypeScript declaration files into the mod's `.claude-plugin/types/` directory ... `tsconfig.json` | Compiler options that fit a hooks module." and "If your mod has no `tsconfig.json` of its own, Claude Code adds one at the mod's root that extends the generated one, so your editor and `tsc -p ./first-mod` type-check the mod without more setup."

So the base is an engine artifact. It is not, and was never meant to be, a committed repo file.

### The engine-written base that exists on this PC

Engine-written copies were found under `C:\Users\scien\.claude\dev-mods\<session-id>\<mod>\.claude-plugin\types\` (Nov 2 2026, written by Claude Code 2.1.309):

- `37d6be3b-ec2e-4b05-8de2-e7483a96c7a5\session-panel\.claude-plugin\types\`
- `4eba08d9-e02d-4b8a-8aa6-879500cc4415\session-handoff\.claude-plugin\types\`
- `625b992c-8a97-4c4d-a557-d355ba2f305a\switchboard\.claude-plugin\types\`

Each has `tsconfig.json` (identical across all three; md5 48fc2944...), `claude-code/index.d.ts`, `claude-code-tools/index.d.ts`, `claude-code-mcp/index.d.ts`, and a `.gitignore` containing `*`. The `tsconfig.json` (`dev-mods\...\session-panel\.claude-plugin\types\tsconfig.json`):

```json
{
  "compilerOptions": { "target": "es2023", "lib": ["es2023"], "module": "esnext", "moduleResolution": "bundler",
    "strict": true, "noUncheckedIndexedAccess": true, "noEmit": true, "skipLibCheck": true,
    "jsx": "react", "jsxFactory": "h", "jsxFragmentFactory": "Fragment",
    "typeRoots": ["."], "types": ["claude-code", "claude-code-tools", "claude-code-mcp"] },
  "include": ["../../hooks", "../../types", "../../tests"]
}
```

These are the files I staged in scratch copies. `typeRoots: ["."]` and the `include` paths are relative to `.claude-plugin/types/`, so they resolve to the mod's own `hooks/`, `types/`, `tests/`.

Version note: the dev-mod `claude-code/index.d.ts` is the first 16,973 lines of the bundled 2.1.309 `claude-code.d.ts` (22,676 lines); the rest is `claude-code-tools`. The bundled file and the dev-mod copies are the same 2.1.309 build. The installed CLI is 2.1.318 (`claude --version`), and I could not find a 2.1.318 copy of the skill on disk, so the types used here may be one version behind the CLI that runs the tests.

### Relation between each mod's `types/index.d.ts` and the base

- The base's `include` pulls in each mod's whole `types/` folder, so `types/index.d.ts` is type-checked together with `hooks/` and `tests/`.
- Each mod's `plugin.json` names it: `"types": "./types/index.d.ts"` (e.g. `session-panel/.claude-plugin/plugin.json`, `switchboard/.claude-plugin/plugin.json`, `usage-band/.claude-plugin/plugin.json`, `session-handoff/.claude-plugin/plugin.json`).
- Each `types/index.d.ts` only augments `declare module 'claude-code' { interface PluginState { <mod-name>: {...} } }` with that mod's state shape, plus exported mod types (e.g. `session-panel/types/index.d.ts` lines 1-5 and 7-19; `usage-band/types/index.d.ts` lines 1-16; `switchboard/types/index.d.ts` line 1 `Mod`; `session-handoff/types/index.d.ts` lines 1-22).
- `claude plugin validate` reports for each mod: `types ./types/index.d.ts declares state: <mod>.<keys>` and `declares on $: nothing`. That is consistent with the augmentation being state-only.
- The base's `types` array does not list the mod's own `types/index.d.ts`. That file reaches TypeScript through `include`, not through `types`.

## Type-check: commands that work

No global install was done. TypeScript 5.9.2 comes from Antigravity's bundled extension, `C:\Users\scien\AppData\Local\Programs\Antigravity\resources\app\extensions\node_modules\typescript\` (the package has only `lib/`; no `bin/`, no `tsc.js`). I wrote a three-line runner in the scratchpad, `tsc-run.js`:

```js
const ts = require(process.env.TS_PATH);
console.log('typescript', ts.version);
ts.executeCommandLine(ts.sys, ts.noop, process.argv.slice(2));
```

Setup and run, per mod, in a scratch copy:

```
S=<scratchpad>; SRC=~/.claude/dev-mods/37d6be3b-ec2e-4b05-8de2-e7483a96c7a5/session-panel/.claude-plugin/types
cp -r <repo>/<mod> $S/mods/<mod>
cd $S/mods/<mod>
mkdir -p .claude-plugin/types && cp -r "$SRC/." .claude-plugin/types/
[ -f tsconfig.json ] || echo '{ "extends": "./.claude-plugin/types/tsconfig.json" }' > tsconfig.json
TS_PATH="<Antigravity>/resources/app/extensions/node_modules/typescript/lib/typescript.js" node $S/tsc-run.js -p . --noEmit
```

Results (TypeScript 5.9.2, strict, noUncheckedIndexedAccess, from the staged base):

| Mod | Errors | Examples (file(line,col): message) |
|---|---|---|
| session-panel | 7 | `hooks/register.test.tsx(57,23)`: `{ command: string; }` not assignable to `CommandRunInput`; `hooks/register.tsx(157,17)`: object possibly undefined; `hooks/register.tsx(303,11)`: `unknown` not assignable to `RenderChildren` |
| switchboard | 9 | `hooks/register.tsx(98,18)`: `lucide` does not exist on type `Mod`; `hooks/register.tsx(190,23)`: `isPlaced` does not exist on `OpEventResult<"ui.open">`; `hooks/register.tsx(197,17)`: no overlap with `string` |
| usage-band | 1 | `tests/band.test.ts(25,19)`: stub `on('ui.render', ...)` returns `RenderNode \| null \| undefined`, not `RenderElement` |
| session-handoff | 1 | `hooks/register.tsx(57,9)`: `$.state.set` overload mismatch (`'string'` not `'working' \| 'ready' \| 'failed'`) |

Full outputs: `scratchpad\tsc-session-panel.txt`, `tsc-switchboard.txt`, `tsc-usage-band.txt`, `tsc-session-handoff.txt`. These are real findings in the code, not environment noise. They are input for the code-level work, not something to fix in this research.

Other checks: `claude plugin validate .` exits 0 for all four mods (`scratchpad\mods\*`). It prints warnings (`lucide` unknown field, missing author, `declares on $: nothing`) and, under "Plugin directory checks", refusals for a missing README (session-panel, switchboard), a missing LICENSE (all four), and a missing icon (switchboard, usage-band, session-handoff). These are directory-submission checks and do not change the exit code unless `--profile directory` is used.

## Gaps

1. No package.json, lockfile, or documented command. The repo has no way to run the tests without the CLI, and no `claude plugin test` in any docs in the repo (`CLAUDE.md`, `docs/agents/*.md`, READMEs). The only README files are session-handoff/README.md and usage-band/README.md, which I did not scan for commands.
2. The `.claude-plugin/types/` base is absent from the repo. `tsc -p <mod>` works only after the engine has written it, which happens only when a mod is loaded from a folder the engine owns and hot-reloads (for example `~/.claude/dev-mods/`). That is not the repo path `D:\ClaudeMods\<mod>`. Options: (a) document the scratch copy recipe above, (b) commit a generated base (the `.gitignore` the engine writes says `*`, so a committed base would go against the engine's own convention), or (c) a small script that copies from a dev-mod. Choosing one is a decision for the user.
3. The engine version that wrote the stubs (2.1.309) is older than the installed CLI (2.1.318). I did not confirm that 2.1.318 writes the same base; the `dev-mod` copies may be stale.
4. No TypeScript CLI on this PC. Antigravity ships TypeScript 5.9.2 as an API only, VS Code ships 6.0.3 with no bin either. The runner above is needed unless TypeScript is installed in a project (not done, per the no-install instruction).
5. usage-band's failing test needs a `session.usage` stub. Fixing it is test authoring, not research.
6. `claude plugin test` runs `*.test.ts`/`*.test.tsx` only inside the mod folder. It does not type-check. The test files do not import `tsc` errors into the test run, so the type errors above can be green in tests.
7. `claude plugin validate` also refuses a submission for missing README, LICENSE, and icon (directory profile); that is outside this question but the repo's `docs` plan will hit it.

## Sources

- Repo: `session-panel/tsconfig.json`, `switchboard/tsconfig.json` (extends line); test imports at `session-panel/hooks/register.test.tsx:1`, `session-panel/tests/todos.test.ts:1`, `switchboard/hooks/switchboard.test.tsx:1`, `usage-band/tests/band.test.ts:1`; `usage-band/tests/band.test.ts:20-25`; `*/types/index.d.ts` as cited above; `*/.claude-plugin/plugin.json` `"types"` lines.
- Engine docs in the bundled skill (version 2.1.309): `C:\Users\scien\AppData\Local\Temp\claude\bundled-skills\2.1.309\0c3866f9ef34566dfdcc4e58e67c51fb\plugin-authoring\reference.md` lines 39-52 and 81; `...\types\claude-code.d.ts` lines 29-35, 67-88, 15843.
- Engine-written base: `C:\Users\scien\.claude\dev-mods\37d6be3b-ec2e-4b05-8de2-e7483a96c7a5\session-panel\.claude-plugin\types\tsconfig.json` (and identical copies under `4eba08d9...\session-handoff` and `625b992c...\switchboard`).
- CLI: `claude plugin test --help`, `claude plugin validate --help`, `claude plugin --help`.
- Official docs: https://code.claude.com/docs/en/plugins/mods/test.md (test runner, `claude-code/testing`); https://code.claude.com/docs/en/plugins/mods/create.md, section "Get type definitions for your version" (types dir, tsconfig base); https://code.claude.com/docs/en/plugins/mods/overview.md, section "List what a mod does before you install one" (`claude plugin validate`). The overview and test pages say nothing about a standalone tsc command; the create page's type section is the only docs source for the base.
- TypeScript: `C:\Users\scien\AppData\Local\Programs\Antigravity\resources\app\extensions\node_modules\typescript\package.json` (version 5.9.2); VS Code's copy is 6.0.3 at `C:\Users\scien\AppData\Local\Programs\Microsoft VS Code\e646868227\resources\app\extensions\node_modules\typescript\`.

## Summary of working commands

- Tests (per mod, from the mod folder): `claude plugin test .`. session-panel 14/14 pass, switchboard 2/2 pass, usage-band 1 fail (missing `session.usage` stub), session-handoff none.
- Manifest and hooks check (per mod): `claude plugin validate .`. All four exit 0 with warnings.
- Type-check: not possible in the repo as committed (TS5083). Works in a scratch copy with the engine base staged from `~/.claude/dev-mods/...` and TypeScript 5.9.2 via `tsc-run.js`. Errors: session-panel 7, switchboard 9, usage-band 1, session-handoff 1.
