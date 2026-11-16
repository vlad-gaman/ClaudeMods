# Profile: react-vite

**Detect:** a `package.json` that depends on `react` and `vite` (read it with `git show`), with no `angular.json`.

## Build and test

- **Setup:** `npm ci` when `node_modules` is missing or `package-lock.json` changed. Never `npm install <package>` or change a dependency in `package.json`.
- **Setup check:** `node -v`.
- **Build:** `cd "<repo>" && npx tsc --noEmit && npm run build`. **Lint:** `cd "<repo>" && npm run lint`, when the script exists.
- **RUN:** `cd "<repo>" && npx vitest run`, narrowed with a file filter while iterating; the reported RUN is the full suite.
- **Filter:** `--exclude <glob>`.
- **Build output** (never committed): `node_modules/`, `dist/`, `coverage/`.

## Tests

- **Test paths:** `*.test.ts(x)` or `*.spec.ts(x)` beside the code, or a `__tests__/` folder; follow what the repo uses.
- **Libraries:** Vitest (`describe`, `it`, `expect`, `vi.fn`, `vi.mock`), plus Testing Library when `package.json` has it.
- Mock modules and dependencies with `vi.mock` / `vi.fn` and verify calls on them. Mark tests with `// Arrange`, `// Act`, `// Assert` where the existing tests do.

## Our packages

None. Check the repo itself for existing code.

## Docs

- No doc comments unless the repo's exported members already carry TSDoc; then match it.
- **Doc-comment lines:** lines inside `/** ... */` blocks (starting `/**`, `*` or `*/`).

## Running and processes

- `npm run dev` is local; stop it by its PID. Never kill `node` by name.

## Bootstrap

- **Read:** `package.json` (scripts, dependencies), `vite.config.*`, `vitest.config.*`, `tsconfig*.json`, the entry point and router, existing tests and helpers.
- **Source files:** `*.ts` and `*.tsx` under `src/`, except test paths.
- **Sync files:** `package.json`, `vite.config.*`, `vitest.config.*`, `tsconfig*.json`.
- **Conventions extras:** none.
