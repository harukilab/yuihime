# Plan: Pisah Folder Web UI ↔ Daemon + Pecah App.tsx

## Tujuan
Pisahkan fisik kode **Web UI (React)** dari **Daemon (Node/Express)** agar UI bisa dimatikan
(`--no-ui`) atau dijalankan terpisah, dan `App.tsx` (2901 baris) dipecah sesuai SOP AGENTS.md
(>1300 baris wajib split). Bangun tanpa mengubah perilaku runtime.

## Temuan kritis (dari penyelidikan kode)
- `src/include/types.ts` dipakai **20+ file daemon** DAN UI → **shared**.
- `src/drivers/storage.ts` (StorageService) dipakai daemon & UI → **shared**.
- `src/core/registry.ts`, `src/core/kernel/event-bus.ts`, `src/core/safeStorage.ts`,
  `src/services/api.ts` dipakai kedua sisi → **shared**.
- `src/core/speech.ts` & `src/services/tools.ts` → **web-only** (tidak ada konsumen daemon).
- `server.ts:737-776` adalah satu-satunya blok serve UI (Vite dev / `express.static(dist)` +
  fallback `index.html`). Flag `--no-ui` cukup membungkus blok ini.
- `server.ts` boot: `registerAPIRoutes` (API), bot TG/Discord/Twitter, cron, WS `/ws` — semua
  daemon, tidak butuh browser.
- `tsconfig.json` sudah punya alias `"@/*": ["./*"]` → bisa dimanfaatkan untuk `@shared/*`
  tanpa mengubah resolver (tambah path baru, `moduleResolution: bundler` sudah mendukung).

## Struktur target
```
YuiHime/
├── server.ts                 # ENTRY DAEMON (diringkas): arg parse + boot + startDaemon() + serveWebUI() guarded
├── index.html                # DIHAPUS dari root (pindah ke web/)
├── vite.config.ts            # DIHAPUS dari root (pindah ke web/)
├── shared/                   # modul dipakai daemon & web
│   ├── include/types.ts
│   ├── drivers/storage.ts
│   ├── drivers/storageServer.ts
│   ├── core/registry.ts
│   ├── core/kernel/event-bus.ts
│   ├── core/safeStorage.ts
│   └── services/api.ts
├── web/                      # React app (UI only)
│   ├── index.html
│   ├── vite.config.ts        # root:'web', build.outDir:'../dist/web', publicDir:'../public'
│   └── src/
│       ├── main.tsx
│       ├── App.tsx           # shell tipis (<300 baris)
│       ├── index.css
│       ├── constants.ts      # (web-only copy reference via @shared? lihat catatan)
│       ├── core/speech.ts    # dipindah dari src/core (web-only)
│       ├── services/tools.ts # dipindah dari src/services (web-only)
│       ├── components/       # dari src/components
│       ├── ui/               # dari src/ui (App.tsx dikeluarkan)
│       └── app/              # hasil pecahan App.tsx (lihat bawah)
│           ├── hooks.ts
│           ├── state.ts
│           ├── sync/         # (ws.ts, polling.ts)
│           ├── cycles/       # (idle.ts, dream.ts, heartbeat.ts, maintenance.ts)
│           ├── panels/       # (chat.tsx, debugPanel.tsx, settingsLauncher.tsx)
│           └── layout.tsx
├── src/                      # DAEMON (murni, no React)
│   ├── core/  modules/  drivers/  services/  server/  bin/  share/
└── public/  dist/  .yuihime (tetap)
```

## Keputusan
1. **Strategi**: Pisah fisik `web/` + `shared/`. Daemon tetap di `src/`.
2. **App.tsx**: Struktur bersarang di `web/src/app/` (shell + sub-modul).
3. **Flag `--no-ui`** (juga env `YUIHIME_NO_UI`): mem-bypass `serveWebUI()` di `server.ts`.
4. **Alias**: tambah `@shared/*` dan `@web/*` di `tsconfig.json` + `vite.config.ts` resolve.alias
   agar import tidak pakai `../../` rentan. `package.json` build script disesuaikan.

## Langkah implementasi (berurutan)
1. **Buat `shared/`** — pindah (git mv) file shared: `include/types.ts`, `drivers/storage.ts`,
   `drivers/storageServer.ts`, `core/registry.ts`, `core/kernel/event-bus.ts`, `core/safeStorage.ts`,
   `services/api.ts`. Perbaiki import internal mereka (relatif → `@shared/...` atau tetap relatif
   dalam `shared/`).
2. **Buat `web/`** — git mv: `index.html`, `vite.config.ts` → `web/`. `src/main.tsx`, `src/App.tsx`,
   `src/index.css`, `src/components`, `src/ui` → `web/src/`. Pindah `core/speech.ts` →
   `web/src/core/speech.ts`, `services/tools.ts` → `web/src/services/tools.ts` (web-only).
3. **Pecah App.tsx** → `web/src/app/`:
   - `state.ts`: semua `useState/useRef` + `loadConfig`.
   - `hooks.ts`: `useChatSessions` sudah ada di `ui/hooks`; pindahkan handler besar ke sini.
   - `sync/`: WebSocket connect (`App.tsx:847-898`), polling confirmations (`App.tsx:84`),
     stream events (`App.tsx:662-687`).
   - `cycles/`: idle (`App.tsx:1041`), dream/heartbeat (`App.tsx:988`), maintenance (`App.tsx:1015`),
     sync interval (`App.tsx:1620`).
   - `panels/`: chat feed, debug panel, settings launcher.
   - `layout.tsx` + `App.tsx` (shell): render `NeuralBackdrop`, `VTuberAvatar` (lazy), `StageTab`,
     tab routing. **App.tsx final < 300 baris.**
4. **Alias & config**:
   - `tsconfig.json`: tambah `"@shared/*": ["shared/*"]`, `"@web/*": ["web/src/*"]`.
   - `web/vite.config.ts`: `root:'web'`, `resolve.alias['@shared']='../shared'`,
     `resolve.alias['@']='../'`, `build.outDir:'../dist/web'`, `publicDir:'../public'`,
     `server.proxy` ke `http://localhost:3000` (agar `npm run dev:web` nembak daemon).
5. **server.ts**: ekstrak `startDaemon(app, db, wss)` (yang sudah ada) dan `serveWebUI(app)`
   (blok `:737-776`). Guard: `if (!process.env.YUIHIME_NO_UI && !args.noUi) serveWebUI(app);`.
   `express.static` arahkan ke `dist/web` saat `--no-ui` false.
6. **package.json scripts**:
   - `dev`: `tsx server.ts`
   - `dev:web`: `vite` (di web/) — butuh `vite` di root jalan dari `web/` via `--config web/vite.config.ts`
   - `build:web`: `vite build --config web/vite.config.ts`
   - `build:server`: `esbuild server.ts ... --outfile=dist/server.cjs`
   - `build`: `npm run build:web && npm run build:server`
7. **Perbaiki semua import** yang patah karena relokasi:
   - Di `web/`: `../core/...` → `@shared/core/...` atau `@web/core/...` (untuk speech/tools).
   - Di `src/` (daemon): `../include/types` → `@shared/include/types`; `./drivers/storage` →
     `@shared/drivers/storage`; `../services/api` → `@shared/services/api`.
   - `RegistryInitializer.ts` & globbing auto-register: pastikan tidak meng-glob `web/` (sudah
     di `src/core`, aman).
8. **UPDATE_LOG.md** + **MODULES.md**: catat pemisahan (baris 1-15 prepended, sesuai AGENTS.md §6).

## Risiko & mitigasi
- **Ratusan import patah**: selesaikan via alias `@shared/*` + sed global (`edit` replaceAll),
  lalu validasi dengan `npm run lint` (tsc --noEmit) dan `npm run build`.
- **Vite publicDir / models**: `public/models` & `public/lib/live2d` dipakai UI → arahkan
  `publicDir:'../public'` di `web/vite.config.ts`; di production `serveWebUI` serve `dist/web`
  + `express.static(public)`.
- **`core/speech.ts` web-only tapi namanya di `core/`**: pindah ke `web/src/core/speech.ts`
  (bukan `shared`) — sudah diverifikasi tidak ada konsumen daemon.
- **`constants.ts`**: ada di `src/constants.ts` (dipakai daemon) DAN diimpor `App.tsx`. Pindah
  salinan ke `web/src/constants.ts` jika hanya dipakai web; jika daemon butuh, masuk `shared/`.
  Periksa konsumen sebelum memindah.
- **Single-binary (pkg)**: `pkg.assets` harus sertakan `web/dist/**` & `shared/**` (bukan `src/**`
  semua). Update `pkg.assets` di `package.json`.

## Validasi
1. `npm run lint` (tsc --noEmit) → 0 error di `src/` maupun `web/`.
2. `npm run build` → `dist/server.cjs` + `dist/web/index.html` terbuat.
3. `YUIHIME_NO_UI=1 npm run dev` → daemon jalan, akses `GET /` → 404/json (bukan index.html),
   bot/API/cron tetap aktif, WS `/ws` tetap hidup.
4. `npm run dev` (UI on) → buka browser, avatar/tab jalan, polling 2s + WS sync normal.
5. `vite build --config web/vite.config.ts` → asset di `dist/web`, models/live2d ter-copy.

## Out of scope
- Mematikan siklus kognitif otonom (idle/dream LLM) — itu perilaku, bukan lokasi file. Tetap
  via Sleep Mode / `system.config.json`.
- Pemecahan `ModularSettings.tsx` (140KB) — SOP berlaku tapi terpisah dari task ini.
