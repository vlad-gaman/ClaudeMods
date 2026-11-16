# session-panel

A pane showing this session's connectors, skills, context files and to-do list, each in its own sub-panel. It opens with the session and updates as the session goes on.

## What you see

- **To-do**: the session's title, then each to-do with its status (empty ring for `pending`, ring and dot for `in_progress`, filled ring for `completed`). It follows `update_plan`, `TodoWrite`, `TaskCreate` and `TaskUpdate`.
- **Context files**: the memory files loaded into the session, each with its type and token count, and the folder it is in.
- **Connectors**: each connector used so far, with its brand icon when one is found, how many times it was called and the last tool called. A claude.ai connector shows under its name; a few ids are named in `hooks/data.ts` (`KNOWN_CONNECTORS`).
- **Skills**: each skill run by the Skill tool or typed as a slash command, how many times, and the first words of its description. Built-in and MCP commands are not counted.

The terminal shows text marks instead of icons.

## Commands

- `/session-panel`: open the pane (it also opens when the session starts). A dismissed pane stays closed at later session starts until this command reopens it. A pane closed by a plugin opens again at the next session.

## Develop

```bash
claude plugin test .
```

Tests are in `tests/`: what the pane lists, through the hook (`track.test.tsx`, `parse.test.tsx`), the to-do rules (`todos.test.ts`), the name, icon and parsing helpers (`names.test.ts`), and the pane lifecycle (`lifecycle.test.tsx`, with the fake engine copied in `pane-lifecycle-engine.ts`; the canonical copy is `docs/fixtures/pane-lifecycle-engine.ts`). The lifecycle test cannot raise the person's close, so the dismissal it records is not covered by a test. The tables are in `hooks/data.ts`, the helpers in `hooks/names.ts`, the to-do rules in `hooks/todos.ts`, the pane drawing in `hooks/view.tsx`, and the hooks and state in `hooks/register.tsx`.
