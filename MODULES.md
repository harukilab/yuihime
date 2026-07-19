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
