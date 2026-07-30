# Agent Instructions — YuiHime

## Structure
- `server.ts` = daemon entrypoint (Express + WS). UI is served alongside unless `--no-ui`.
- `web/` is a separate Vite React app (builds to `dist/web`). `src/App.tsx` is an empty shell; real UI lives in `web/src/app/` (state, handlers, effects, controller, layout).
- `src/` = daemon only. `shared/` (`@shared/*`) acts as the only cross-boundary layer between daemon and web.

## Module Registration
- Modules auto-register via `RegistryInitializer.ts` (Vite glob in browser, filesystem scan in Node). Each driver/provider/addon is a standalone file (`src/drivers/ai-providers/*.ts`, `src/drivers/tools/*/index.ts`, `addons/*`, `src/modules/*.ts`).
- **Never edit manual registration.**

## Commands
- `npm run dev` — daemon + Vite dev middleware
- `npm run build` — builds web (`dist/web`) then server (`dist/server.cjs`)
- `npm run build:bin` — single binary via `pkg`
- `npm run lint` — `tsc --noEmit`
- Tests in `yui_tests/` are standalone and run with `tsx` (no test framework configured).
- `python3 tools/update_log.py` — prepend `UPDATE_LOG.md` entry
- `python3 tools/push_gh.py` — update logs + git add/commit/push

## Paths & Config
- Path aliases (tsconfig.json): `@/*` → `src/*`, `@shared/*` → `shared/*`, `@web/*` → `web/src/*`
- `web/vite.config.ts` has AI Studio specific HMR/watch config. Do not modify.
- Default operational data: `~/.yuihime/` (absolute). CLI overrides: `--db-path`, `--config`, `--addons`, `--agent`, `--port`.
- Config file: `~/.yuihime/data/config.toml` (or `$YUIHIME_CONFIG`). This is the permanent source of truth.
- Default constants live in `shared/constants.ts`.
- `.yuihime/` is gitignored but `!/**/config.toml` is explicitly untracked-allowed.
- `bun.lock` exists; project uses npm.

## Native Dependencies
- `better-sqlite3` requires native rebuild on ARM or fresh install. Run `npm install` to build.

## 📐 Architecture & Bundling Guidelines

1. **Strict Frontend/Backend Isolation:**
   - Web files (`web/src/**`) MUST NEVER statically or dynamically import Node.js backend modules (`src/core/**`, `shared/drivers/**`, `fs`, `path`).
   - Any backend communication from the UI must happen exclusively via HTTP REST endpoints (`fetch()`) or WebSockets.

2. **Bundling & Relative Resolution Strategy:**
   - Avoid absolute dynamic paths such as `import('/home/.../dist/cortex.js')` or `import(`${process.cwd()}/database.js`)`.
   - All core services (`database`, `cortex`, `storageServer`, agent definitions) MUST be statically imported at the entrypoint level (`server.ts`) so `esbuild` bundles them directly into `dist/server.cjs`.
   - Never rely on raw `src/*.ts` files existing in the runtime directory after compilation.

3. **LLM Output Sanitization:**
   - All JSON responses received from AI models must be sanitized via regex (`/\{[\s\S]*\}/`) prior to calling `JSON.parse()` to handle markdown code fences (` ```json ... ``` `) gracefully.

4. **Graceful Shutdown & Signal Handling:**
   - Always ensure WebSocket servers and Telegram polling clients handle `EADDRINUSE` and `SIGINT`/`SIGTERM` to prevent lingering processes on restart.

## Modularity Rules
- **Immutable Core**: `server.ts`, `web/src/app/layout.tsx`, `src/core/kernel/` are infrastructure only.
- **File Splitting SOP**: split any code file > 1300 lines. Exception: `src/core/cortex/cortexThinkEngine.ts` (~1783 lines) is currently monolitic — do not split without a refactoring plan.
- **Dynamic Settings**: each module exposes `configSchema` (type, label, default). UI auto-renders from it. Do NOT hardcode settings in `ModularSettings.tsx`.
- **Prompt Registry**: register prompts via `PromptRegistry.getInstance().register('id:key', template)`. Expose as `textarea` in `configSchema`. Use `PromptRegistry.getInstance().compile(id, vars)`. Always provide a default fallback.
- **LLM Centralization**: all AI generation must pass through `ProviderGatewayModule`. Modules must use `context.think`, not direct provider `generate` calls.
- **StandardizedProcessor** is exported as `NeuralProcessor` from `src/core/kernel/processor.ts`.
- **English internal prompts**: all system instructions and correction keywords are in English.
- **Agent replies to user**: Bahasa Indonesia.
- **No dynamic imports for agent definitions**: `src/core/agents/definitions/*.ts` must use static `import` statements in `RegistryInitializer.ts`. Dynamic `import()` with `fast-glob` glob patterns causes `ERR_MODULE_NOT_FOUND` in `dist/server.cjs` because esbuild bundles the logic inline but runtime glob resolution looks for raw `.ts` files outside `dist/`.
- **No dynamic imports for database.js**: `src/core/database.ts` must use static `import` statements. Dynamic `import()` with relative paths like `../../database.js` causes `ERR_MODULE_NOT_FOUND` in `dist/server.cjs` because Node.js resolves the path relative to the bundled CJS output directory instead of the source tree.
- **No dynamic imports for Node.js builtins in Vite context**: In files consumed by Vite (browser build), dynamic `await import('fs')`, `await import('path')`, or `await import('module')` trigger rollup warnings about "dynamic import will not move module into another chunk". Use static imports (`import fs from 'fs'`, etc.) and rely on `serverModuleStubPlugin` in `web/vite.config.ts` to provide browser stubs.
- **No dynamic import of `./cortex.js`**: Use static `import { Cortex } from './cortex.js'` in `RegistryInitializer.ts`. Dynamic `import('./cortex.js')` causes `ERR_MODULE_NOT_FOUND` at runtime in `dist/server.cjs`.
- **Regex sanitize JSON.parse for LLM responses**: Before `JSON.parse()` on raw LLM output (especially in DYNAMIC_SYNTHESIS and monologue-stripping paths), use `rawResponse.match(/\{[\s\S]*\}/)` to extract the valid JSON object first, handling markdown code fences and stray text safely.
- **Always create a new todo list when fixing errors**: When a user reports a bug or error, start a fresh todo list to track the investigation and fix steps. Do not reuse todos from previous tasks.

## Logging & Docs
- `UPDATE_LOG.md` is very large. **Only read lines 1–15.** To prepend, edit below the `---` line (line 5). For review, read at most lines 1–35.
- **Always update `UPDATE_LOG.md` via `python3 tools/update_log.py` on every change.** This is not optional.
- `MODULES.md`: update when adding or changing modules.

## Versioning
- `Major.Minor` in `package.json` and `UPDATE_LOG.md`. Minor for daily bugfix; major for architecture refactor (reset minor to 0).
