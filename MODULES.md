# YuiHime Modules & Architecture Map

Peta struktur direktori pasca-pemisahan Web UI ↔ Daemon (lihat UPDATE_LOG `[4.55]`).

## Struktur Root
- `server.ts` — Entry point DAEMON (Node/Express). `serveWebUI(app)` dijalankan hanya bila `!YUIHIME_NO_UI && !--no-ui`.
- `shared/` — Modul dipakai DAEMON & WEB (alias `@shared/*`).
- `web/` — React app (UI only). Vite root di `web/`, build ke `dist/web` (alias `@web/*`, `@`).
- `src/` — DAEMON murni (alias `@/*` → `src/*`). Tidak ada React.

## Kelompok shared/ (dipakai dua sisi)
- `shared/include/types.ts` — Tipe domain terpusat.
- `shared/drivers/storage.ts`, `shared/drivers/storageServer.ts` — `StorageService` & `StorageServer`.
- `shared/core/registry.ts` — `SystemRegistry` (auto-register global).
- `shared/core/kernel/event-bus.ts` — `eventBus` (`@shared/core/kernel/event-bus`).
- `shared/core/safeStorage.ts` — `safeLocalStorage` (guard `typeof window`).
- `shared/services/api.ts` — `APIService` (guard `localStorage` via `typeof window`).
- `shared/constants.ts` — `DEFAULT_PROVIDER_OPTIONS`, `DEFAULT_NEURAL_CORES`.

## Kelompok web/src/app/ (pecahan App.tsx)
- `state.ts` — semua `useState`/`useRef` + `loadConfig` + derived (`AppState`).
- `handlers.ts` — handler aksi (`handleThink`, `handleDream`, dll) + `useAppHandlers`.
- `effects.ts` — semua `useEffect` (sync WS/polling, cycles idle/dream/maintenance).
- `controller.ts` — `useAppController()` menyatukan state + chat + handlers + effects.
- `layout.tsx` — render JSX (`AppLayout`). `web/src/App.tsx` kini shell tipis (<30 baris).

## Alias (tsconfig.json + web/vite.config.ts)
- `@/*` → `src/*`
- `@shared/*` → `shared/*`
- `@web/*` → `web/src/*`

## Scripts
- `npm run dev` — daemon (tsx server.ts), UI via Vite dev proxy ke :3000.
- `npm run dev:web` — hanya Vite (web/).
- `npm run build` — `build:web` (vite → dist/web) + `build:server` (esbuild → dist/server.cjs).
- `npm run build:bin` — single-binary pkg (`pkg.assets`: `shared/**`, `web/dist/**`).
- `src/core/cortex/dynamicToolSynthesizer.ts` — Dynamic Tool Synthesizer (autonomous addon synthesis; now tolerant to malformed LLM JSON).
- `src/core/server/telegram.ts — Telegram bridge reaction handling (now allowlist-filtered).`
- `src/core/cortex/cortexThinkEngine.ts — Clean processedResponse boundary enforced`
- `src/drivers/tools/tensorart_generate — Generate Image (TensorArt) module`
- `src/drivers/tools/tensorart_generate — Generate Image (TensorArt) module`
- `web/src/ui/modular-settings/ProviderPlayground.tsx — removed Puter playtest sub-tab (backend routes gone).`
- `src/modules/RAGModule.ts — Grounding & RAG Retrieval Engine`
- `src/core/kernel/configNormalizer.ts — new utility`
- `src/core/kernel/ai/generateSegment.ts — search grounding`
- `web/src/ui/modular-settings/AboutTab.tsx — single source version`
- `shared/drivers/storage.ts — characterName default`
- `src/core/server/routes/sandboxRouter.ts — removed`
- `src/modules/FinancialModule.ts — removed`
- `src/core/server/routes/aiRouter.ts — removed native Imagen 3 / FLUX / Midjourney image generation endpoint`
- `src/drivers/tools/messaging_integration — removed Slack platform support`
- `web/src/ui/modular-settings/ModulesTab.tsx — removed Imagen 3 backdrop generator UI`
- `web/src/ui/modular-settings/ProvidersTab.tsx — removed FLUX model size for Replicate`
- `src/core/RegistryInitializer.ts — removed Imagen 3/FLUX/Midjourney from artistry config`
- `docs/MISSING_TOOLS_PLAN.md — created`
- `src/core/kernel/MultiChannelQueue.ts — Adjusted deduplication window logic`
- `src/drivers/tools/tensorart_generate/index.ts — Cleaned auto-send caption`
- `src/core/server/routes/toolsRouter.ts — Enhanced JavaScript code execution route`
- `src/core/PromptRegistry.ts — Enhanced autonomous profile memory prompt`
- `src/core/PromptRegistry.ts — Generalized memory extraction prompt`
- `src/modules/LiveStatusToolsModule.ts — Added non-blocking fetch timeout`
- `src/core/kernel/processor.ts — Added array model support in executeWithResilience`
- `src/core/cortex/cortexThinkEngine.ts — Added audit hook after tool execution`
- `src/core/server/onboarding.ts — Silenced non-interactive mode log`
- `tools/push_gh.py — Remote auto-detection`
- `shared/constants.ts — AUTO_CLEANUP_LIMITS`
- `src/modules/PlanningModule.ts — Auto-planning trigger activation`
- `src/modules/MemoryModule.ts — Integrated robust searchMemories query parser`
- `src/core/memorySearch.ts — FTS5 keyword hybrid query executor`
- `src/drivers/tools/ocr — Image text reader utilizing Tesseract`
- `src/core/PromptRegistry.ts — Registered cortex:dream_consolidation`
- `src/drivers/tools/manage_bgproc/manifest.json — Tool definition: spawn, list, stop, remove, logs actions`
- `src/core/cortex/cortexThinkEngine.ts — Central cognitive loop and tool executor.`
- `web/src/core/socket.ts — Real-time WebSocket communication service parsing avatar animation triggers and TTS audio streams with offline resilience.`
- `DOCS_SOCKET.md — Complete technical documentation for SocketService and server-side WebSocket broadcasting protocol.`
- `web/src/ui/modular-settings/GiftiaRelationSection.tsx — Dedicated Giftia OS Relation & Lattice Synchrony panel with AGI Soul influence analysis.`
- `src/core/kernel/processor.ts`
- `src/core/kernel/processor.ts`
- `src/core/server/settingsTUI.ts — CLI TUI Settings Editor`
- `src/core/server/settingsTUI.ts — TTY guard added to startSettingsTUI()`
- `server.ts — standalone --settings mode bypasses server bootstrap`
- `build:bin`
- `core:kernel,core:api`
- `core:kernel`
- `core:kernel,core:server`
- `src/core/database.ts — add logDbRetry for file-based DB retry logging`
- `src/core/kernel/ChatSummaryEngine.ts — Chat Summary Engine (idle-gap + daily summary; daily chat log file; 7-day retention).`
- `src/core/fileLogger.ts — Rotated & retention file logger (per-category daily rotation, 7-day retention).`
- `src/drivers/tools/chat_log/ — Chat Log tool (raw daily chat log reader).`
