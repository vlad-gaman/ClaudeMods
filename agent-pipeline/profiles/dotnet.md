# Profile: dotnet

**Detect:** a `*.sln` or `*.csproj` file.

## Build and test

- **Setup check:** `dotnet --version`.
- **Build:** `dotnet build "<solution>" -nodeReuse:false`, where `<solution>` is the absolute path of the `.sln`, or of the project file when there is none.
- **RUN:** `dotnet build "<solution>" -nodeReuse:false && dotnet test "<solution>" --no-build --blame-hang-timeout 5m`, plus a `--filter` that leaves out tests needing Azure or a shared dev resource (start from the conventions note's `## Test filter`).
- **Build output** (never committed): `bin/`, `obj/`, `TestResults/`, `*.trx`.

## Tests

- **Test paths:** a folder named `test` or `tests`, or a project folder ending in `Tests` or `.Test` (`Foo.Tests`, `Foo.UnitTests`, `Foo.Test`).
- **Libraries:** xUnit, Moq, AutoFixture: only those the test projects already reference.
- Mock dependencies (services, repositories, clients) with Moq and verify calls on them. Build DTOs and value objects with AutoFixture where it helps; never mock them.
- Mark each test with `// Arrange`, `// Act`, `// Assert`.
- A right-reason compile error stops the whole test project from building.

## Our packages

Titan.PlatS.\*, Titan.Common.\* and Titan.Workflows.\* NuGet packages. Check them with the `nuget-source` skill at the version the solution references, before adding a helper, extension, base class, client or middleware. Never decompile or inspect package DLLs.

## Docs

- XML doc comments (`///`) on public types and members added or changed. Build after: a bad `cref` breaks it.
- **Doc-comment lines** (the Documenter's only change to production files): lines starting `///`.

## Running and processes

- Before `dotnet run`, check the queue, namespace and connection settings it loads (`appsettings*.json`, launch profiles). Any pointing at Azure or a shared dev resource: `needs-approval` with the exact command.
- Never kill dotnet or MSBuild processes by name. Stop what you started by its PID.

## Bootstrap

- **Read:** the `.sln`; each `.csproj` (target framework, our package references and versions); `Directory.Build.props`, `global.json`, `nuget.config`; `Program.cs`, `Startup`, DI registration; `appsettings*.json` keys that reach Azure or a shared dev resource; test projects with their traits, categories, fixtures and AutoFixture customisations.
- **Source files** each component must cover: production `*.cs`, except generated code and `Migrations/`.
- **Sync files** whose change re-reads the conventions: `*.sln`, `*.csproj`, `Directory.Build.props`, `global.json`, `nuget.config`.
- **Conventions extras:** `## Our packages` (the Titan.\* references, versions and what the repo uses them for).
