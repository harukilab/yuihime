# Plan: CLI TUI Settings Editor

## Goal
Add a `--settings` CLI flag to the server that launches a terminal-based interactive settings editor, letting users configure modules without the web UI.

## Context
- Web settings UI (`web/src/ui/ModularSettings.tsx`) renders forms dynamically from each module's `configSchema` (type, label, default, options, etc.)
- Server-side already has `SettingsManager` (`src/core/kernel/settings.ts`) for direct read/write of `config.toml`
- `SystemRegistry.getModules()` (`shared/core/registry.ts:216`) returns all modules with their `configSchema`
- Existing TUI patterns: `src/bin/terminal.ts` (readline REPL) and `src/core/server/onboarding.ts` (synchronous readSync wizard with ANSI boxes)
- No TUI library in dependencies; project uses raw ANSI escape codes + Node readline/readSync
- `--config` flag already exists but is for specifying config file path, not for TUI

## Implementation

### 1. Create `src/core/server/settingsTUI.ts`
New file — the TUI settings editor. Key functions:

- `listModules(settings)` — fetch all modules from `SystemRegistry.getModules()`, load current settings via `SettingsManager.getInstance().load()`, display a navigable module list grouped by `ModuleType` (Consciousness, Tools, Speech, Hearing, Vision, Artistry, STM, LTM, Bridges, etc.)
- `renderModuleConfig(module, currentSettings)` — render the `configSchema.fields` for a selected module as interactive form fields:
  - `boolean` → toggle `[✓]` / `[ ]`
  - `select` / `multiselect` → numbered list with arrow keys or number input
  - `number` / `slider` → text input with min/max/step validation
  - `string` / `password` / `textarea` / `color` → text input
  - `string` with `options` in schema → searchable select
- `renderFields(fields, currentValues)` — generic field renderer mapping each `configSchema` type to a TUI input widget (ANSI-styled, readline-based)
- `saveAndExit(settings)` — call `SettingsManager.getInstance().save(settings)`, then broadcast via WebSocket if available
- `startSettingsTUI()` — main entry: show module list → select module → edit fields → save → return to list

Navigation: arrow keys or number input to select modules, `Enter` to open config, `s` to save, `q` to quit (prompt if unsaved changes).

### 2. Modify `server.ts`
- Add import: `import { startSettingsTUI } from "./src/core/server/settingsTUI.js";`
- Add CLI flag handling in the argv loop (around line 120): `else if (arg === "--settings") { argsOverride.settingsMode = true; }`
- After bootstrap, if `argsOverride.settingsMode` is true, call `startSettingsTUI()` instead of or in addition to the existing terminal mode

### 3. No new dependencies
Use only existing Node.js builtins (`readline`, `fs`, `path`) and existing project imports (`SettingsManager`, `SystemRegistry`). No npm package installation needed.

## File List
- New: `src/core/server/settingsTUI.ts` (~400-600 lines)
- Modified: `server.ts` (add import + CLI flag + launch logic)

## Validation
1. Run `npx tsc --noEmit` to verify no type errors
2. Run `node dist/server.cjs --settings` (or `npx tsx server.ts --settings` in dev) to verify the TUI launches
3. Verify settings changes persist to `config.toml` after save
4. Verify unsaved changes prompt on quit
5. Verify all field types render correctly (boolean, select, number, string, textarea, password, color, slider, multiselect)

## Risks
- Readline does not support arrow-key navigation natively; the TUI will use number-based selection (like `onboarding.ts`) rather than full cursor movement. This is acceptable and consistent with existing patterns.
- `configSchema` fields may have `dynamicOptions: true` which requires async fetching; the TUI must handle this gracefully (show loading indicator, fetch on module selection).
- Large configSchemas with many fields may exceed terminal height; implement scrolling or pagination.
