# Profile: java-spring

**Detect:** a `pom.xml` (Maven, usually Spring Boot).

## Build and test

- **Setup check:** a JDK at the `pom.xml`'s `<java.version>` or newer (`java -version`). Missing or older: `blocked`, asking Vlad for that JDK. This machine has no JDK today, so runs block here until one is installed.
- **Maven:** `./mvnw` (`mvnw.cmd` on Windows) when the repo has it, else `mvn`; always `-B`.
- **Build:** `cd "<repo>" && mvn -B -q test-compile`.
- **RUN:** `cd "<repo>" && mvn -B test`, leaving out tests that need Docker (Testcontainers), Azure or a shared dev resource as the conventions note's `## Test filter` says (`-DexcludedGroups=...`, or a Surefire exclude). Narrow with `-Dtest=<Class>` while iterating; the reported RUN is the full filtered suite.
- **Build output** (never committed): `target/`.

## Tests

- **Test paths:** `src/test/` in each module, or the repo's own `test` or `tests` folder (Titan.Billing uses `tests/`).
- **Libraries:** JUnit 5, Mockito, AssertJ, and Spring Boot test slices: only those the `pom.xml` already has.
- Mock dependencies with Mockito (`@ExtendWith(MockitoExtension.class)`, `@Mock`, `@InjectMocks`) and verify calls on them. Use a Spring slice (`@WebMvcTest`, `@DataJpaTest`) only where the repo already runs one locally without Docker or Azure.
- Follow the existing tests' naming and markers (`// Arrange` `// Act` `// Assert`, or `// given` `// when` `// then`).
- A right-reason compile error stops the module's tests from compiling.

## Our packages

No shared Java library. Check the repo itself, including its other modules, for existing code.

## Docs

- Javadoc on public types and methods added or changed, where the repo's public API already has Javadoc. Build after.
- **Doc-comment lines:** lines inside `/** ... */` blocks (starting `/**`, `*` or `*/`).

## Running and processes

- Before `mvn spring-boot:run`, check `application*.yml` / `.properties` and the active profile: a datasource, queue or URL pointing at Azure or a shared dev resource is `needs-approval` with the exact command.
- Never kill `java` processes by name. Stop what you started by its PID.

## Bootstrap

- **Read:** each `pom.xml` (parent and Spring Boot version, `<java.version>`, modules, dependencies); `.mvn/`; `application*.yml` / `.properties` keys that reach Azure or a shared dev resource; the `@SpringBootApplication` class and `@Configuration` classes; test layout, tags and Testcontainers use; the CI workflow's build and test commands.
- **Source files:** production `*.java` under each module's `src/main/java/` (or the repo's own source root), except generated code.
- **Sync files:** `pom.xml` files, `.mvn/`, `application*.yml` / `.properties`.
- **Conventions extras:** `## Persistence` (JPA, Flyway or Liquibase, the database modules).
