# Improve switchboard: tests, split, type-check, README

Status: resolved
Blocked by: 01

Apply the rules in [spec.md](../spec.md) to `switchboard` (293-line `hooks/register.tsx`).

1. **Move** `hooks/switchboard.test.tsx` to `tests/switch.test.tsx`. The `tsconfig.json` already exists.
2. **Tests first (highest priority):** `refresh` parsing through the hook: `hooks.modules`, the `command.register` and `ui.open` regexes (including the `const NAME = '...'` pane id case), `modOfPane`, and the `titleOf`/`emojiOf`/`lucideOf` fallbacks. This is the contract every other mod depends on.
3. **Split:** `data.ts` (`LUCIDE` table S1; merge the duplicated `EMOJIS` and `ICONS` word lists S2), pure parsers (`commandNameOf`, `panesOf`) out of `refresh` (S5), `view.tsx` for render helpers (`switchSvg`, one `control`/`eye` overlay helper S13, `plainIcon` vs `iconSvg` S12). Delete unused `sourceOf` (S3), drop the `list` alias (S10), one `'switchboard@'` check (S11).
4. **Renames:** `toggle` to `toggleEnabled` (`toggleClosed` stays for the Eye).
5. **Type-check:** zero errors (9 known, including `lucide` missing on `Mod` in `types/index.d.ts` and `isPlaced` on `OpEventResult<"ui.open">`).
6. **README** (new) in the template. Say in it that `command.register`, `ui.open` and `PANE` must stay literal in other mods' `register.tsx`.

Audit items S1-S18 in [research/02](../../codebase-improvements/research/02-audit-structure-and-readability.md). The `JSON.parse` outside a try block at `:117` (S5) would be a behaviour change: log it, do not fix.

## Comments

Already delivered in c89d7c5 (tests moved to tests/, data/names/source/view split, README). The JSON.parse-outside-try question is logged in bugs/switchboard-pane-watch.md.
