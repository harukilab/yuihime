# 👑 Yuihime AI v4.113 - Autonomous VTuber Engine (Airi OS Core v2.39)

**Yuihime** adalah engine agen AI otonom untuk VTuber dengan arsitektur *daemon + web UI*.cognitive loop, memory jangka panjang (SQLite), eksekusi tool modular, dan antarmuka web real-time untuk kontrol kepribadian.

---

## ⚡ Mulai Cepat

```bash
# Install dependensi
npm install

# Jalankan development server (daemon + Vite dev middleware)
npm run dev

# Build produksi (web + server)
npm run build

# Linting
npm run lint

# Build single binary
npm run build:bin
```

Akses UI dari browser: **`http://localhost:3000`**

---

## 🏗️ Arsitektur

```
src/
├── core/
│   ├── cortex.ts                 # Agent utama + cognitive loop
│   ├── cortex/
│   │   ├── cortexThinkEngine.ts  # Reason -> Act -> Observe loop
│   │   ├── fastTrackRunner.ts    # Background worker (mood decay/telemetry)
│   │   └── ...
│   ├── kernel/
│   │   ├── NeuralInterface.ts    # Bridge: UI/API -> Cortex
│   │   ├── processor.ts          # NeuralProcessor (perubahan pesan)
│   │   └── ...
│   ├── server/
│   │   ├── routes/
│   │   │   ├── cortexRouter.ts   # REST API + SSE streaming
│   │   │   └── ...
│   │   └── ...
│   └── database.ts               # SQLite init + queries
├── drivers/
│   ├── ai-providers/             # OpenAI, Gemini, Anthropic, OpenRouter
│   └── tools/                    # Tool modular (file, shell, web, dll)
├── modules/                      # Feature modules (auto-registered)
└── ...

shared/                            # Cross-boundary types + constants + services
web/                               # Vite React app (builds to dist/web)
```

**Prinsip inti:** `server.ts` = daemon entrypoint. `web/` = UI terpisah. `shared/` = satu-satunya lapisan bersama.

---

## 🧠 Fitur Kognitif Otonom

### Cognitive Loop (`cortexThinkEngine.ts`)
- **Loop kognitif iteratif** (maks 3 iterasi): Reason → Tool Call → Observe → Respond
- **Tool execution dengan retry & timeout**: Setiap tool dijalankan dengan batas waktu, retry otomatis, dan abort support via `AbortSignal`
- **JSON enforcement**: LLM dipaksa output JSON valid untuk memisahkan `thought` dan `final_answer`
- **Memory integration**: Hasil tool disimpan ke episodic memory + dataset synthesis

### Fast-Track Background Worker (`fastTrackRunner.ts`)
- **Singleton worker thread** untuk operasi non-kritis: mood decay calculation, telemetry write
- Fallback ke synchronous execution jika worker timeout (>200ms)
- Membebaskan thread utama agar respons tetap kilat

### Autonomous Pulse (`autonomousThought.ts`)
- Siklus *background heartbeat* yang mendorong Yuihime berinteraksi secara proaktif
- Proactive impulse: sapaan spontan nach panjang hening user
- Auto-dream cycle: konsolidasi memori + strategi komunikasi di background

### Mood & Emotion System
- `state.mood`: vektor emosi (joy, stress, curiosity, affection, dll)
- Mood decay: degradasi otomatis dari waktu ke waktu
- Inhibition mechanism: pembatasan ekstrem emosi
- Sentiment tracking dari hasil cognitive loop

---

## 🔌 Sistem Modular

### Auto-Registration
Semua module (driver, tool, addon) **otomatis terdaftar** via `RegistryInitializer.ts`:
- **Browser**: Vite glob import
- **Node**: Filesystem scan

### Tool Execution
- Setiap tool di-load dari `src/drivers/tools/*/index.ts`
- Tool calls menghasilkan `observation` yang masuk ke cognitive loop sebagai konteks berikutnya
- Spek tool pakai skema JSON OpenAI (`parameters`)

### Addon System
- Folder `addons/` untuk plugin kustom
- Support format bawaan Yuihime dan Universal Skill (`skill.json` / `manifest.json`)

---

## 📡 Integrasi & I/O

### Input Channels
- **Telegram Bot** (`src/core/server/telegram.ts`)
- **Web Chat** (`web/src/app/`)
- **REST API** (`src/core/server/routes/cortexRouter.ts`)

### Streaming
- **SSE (Server-Sent Events)**: Endpoint `/api/cortex/think?stream=true`
- Real-time chunk delivery untuk UI + overlay OBS
- Keep-alive comments untuk mencegah timeout proxy

### OBS / VTube Studio
- Overlay mode: `http://localhost:3000/?mode=stream`
- Endpoint events: `/api/stream/events`
- Endpoint chat input: `/api/stream/chat`

---

## 🛠️ Kustomisasi

File konfigurasi dan data disimpan **di luar binary**:

- `config.toml` — API keys, provider settings, model overrides
- `yuihime.db` — SQLite memori jangka panjang
- `agent/` — Berkas kepribadian (`character.md`, `lore.md`, `IDENTITY.md`, `SOUL.md`, `MEMORY.md`)
- `addons/` — Plugin kustom

### CLI Override
```bash
./yuihime-core-linux \
  --port 8080 \
  --db-path /var/data/yuihime.db \
  --config /etc/yuihime/config.toml \
  --agent /home/user/prompts/ \
  --addons /home/user/my_skills/
```

### Environment Variables
- `YUIHIME_CONFIG` — path ke `config.toml`
- `YUIHIME_DB_PATH` — path ke database
- `YUIHIME_AGENT_PATH` — folder `agent/`
- `YUIHIME_ADDONS_PATH` — folder `addons/`

---

## 🛡️ Lingkungan Terbatas

### ARM / Raspberry Pi
- `better-sqlite3` perlu rebuild native binding: jalankan `npm install` di target ARM
- Biner tunggal di-build untuk arsitektur spesifik; source install lebih fleksibel

### Read-Only Filesystem
- Gunakan `/tmp` atau volume mount untuk data persisten
- Docker example:
  ```bash
  docker run -d -p 3000:3000 \
    -v /lokasi/aman/config.toml:/app/config.toml \
    -v /lokasi/aman/yuihime.db:/app/yuihime.db \
    -v /lokasi/aman/agent:/app/agent \
    -v /lokasi/aman/addons:/app/addons \
    yuihime-vtuber
  ```

---

## 📚 Dokumentasi Lanjut

- **`UPDATE_LOG.md`** — Riwayat perubahan versi
- **`MODULES.md`** — Daftar module dan arsitektur
- **`YUI_AIRI_OS_CORE.md`** — Blueprint kognitif lengkap
- **`docs/RIGGING_GUIDE.md`** — Panduan rigging Live2D / 3D VRM

---

*Dibuat penuh cinta untuk masa depan VTubing yang otonom dan modular.* 🌌✨
