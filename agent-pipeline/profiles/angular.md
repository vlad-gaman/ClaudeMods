# Profile: angular

**Detect:** an `angular.json`. Its folder is the **app root** (`Titan.Amigo.UI`, `ui/scp-app`); run every command below from there.

## Build and test

- **Setup:** `npm ci` when `node_modules` is missing or `package-lock.json` changed. Never `npm install <package>` or change a dependency in `package.json`.
- **Setup check:** `node -v` at the `.nvmrc` major when there is one, and Chrome installed (`CHROME_BIN`, or Chrome in Program Files).
- **Build:** `cd "<app root>" && npx ng build`. **Lint:** `cd "<app root>" && npx ng lint`, when `angular.json` has a `lint` target.
- **RUN:** `cd "<app root>" && npx ng test --watch=false --browsers=ChromeHeadless` (Karma and Jasmine). Narrow with `--include <glob>` while iterating; the reported RUN is the full suite. Chrome not found: `blocked`.
- **Filter:** `--include` cannot exclude, so specs needing Azure or a shared dev environment are listed in the conventions note's `## Test filter` and their failures go in BASELINE_FAILING.
- **Build output** (never committed): `node_modules/`, `dist/`, `coverage/`, `.angular/`.

## Tests

- **Test paths:** `*.spec.ts` beside the file it tests.
- **Libraries:** Jasmine (`describe`, `it`, `expect`) with Angular `TestBed`, and whatever testing helpers `package.json` already has.
- Mock dependencies (services, stores, HTTP) with `jasmine.createSpyObj` or the repo's existing stubs, and verify calls on them. HTTP goes through the Angular HTTP testing providers the repo already uses.
- Follow the existing specs' layout and naming. Mark tests with `// Arrange`, `// Act`, `// Assert` where the existing specs do.
- A right-reason compile error stops the whole Karma bundle from building.

## Our packages

`@commify/*` packages in `package.json`. Read their installed source under `node_modules/@commify/<name>/`, which is the version the app compiles against, before writing a component, pipe, directive or service they may already provide. Never edit `node_modules`.

## Docs

- No doc comments unless the repo's public members already carry TSDoc; then match it.
- **Doc-comment lines:** lines inside `/** ... */` blocks (starting `/**`, `*` or `*/`).

## Running and processes

- Before `ng serve`, check `src/environments/*.ts` and any proxy config. API URLs pointing at Azure or a shared dev environment: `needs-approval` with the exact command.
- Never kill `node` or Chrome processes by name. Stop what you started by its PID.

## Bootstrap

- **Read:** `angular.json`; `package.json` (Angular version, scripts, test runner, `@commify/*` dependencies); `tsconfig*.json`; `karma.conf.js`; the ESLint config; `src/environments/`; `app.config.ts` or `app.module.ts` and the routes; existing specs and test helpers.
- **Source files** each component must cover: `*.ts` and `*.html` under the app root's `src/`, except `*.spec.ts`, `src/test.ts` and `src/environments/`.
- **Sync files:** `angular.json`, `package.json`, `tsconfig*.json`, `karma.conf.js`, the ESLint config.
- **Conventions extras:** `## Our packages` (the `@commify/*` dependencies, versions and what the app uses them for); `## State and HTTP` (services, stores, interceptors).
