# 👑 Yuihime AI v4.268 - Autonomous VTuber Engine (Airi OS Core v2.39)

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
- Folder `addons/` (default `~/.yuihime/addons`) untuk plugin kustom
- Support format bawaan Yuihime dan Universal Skill (`skill.json` / `manifest.json`)
- Entry point dideteksi otomatis: `main.js` / `main.cjs` / `index.js` / `index.cjs` / `main.py` / `main.sh` — atau dideklarasikan via `entry_point` + `runtime` di `config.toml`
- Support **Claude Skills** (`SKILL.md` + `scripts/`, format seperti `Tensor-Art/tensorart-skills`): frontmatter YAML dibaca, eksekusi via API
- Instal dari repo git: `POST /api/addons/install` dengan `{ repoUrl, skill }` (auto-clone + deteksi folder SKILL.md/config.toml)
- Uninstall: `DELETE /api/addons/:id`
- Eksekusi: `POST /api/addons/execute/:id` (addon biasa = run entry point; skill = `action:"instructions"` atau `action:"run_script"`)
- Tool addon otomatis didaftarkan ke `available_tools.json` dan terlihat oleh agent via prompt builder

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
  --addons /home/user/my_skills/ \
  --settings
```

### Environment Variables
- `YUIHIME_CONFIG` — path ke `config.toml`
- `YUIHIME_DB_PATH` — path ke database
- `YUIHIME_AGENT_PATH` — folder `agent/`
- `YUIHIME_ADDONS_PATH` — folder `addons/`

---

## 🚀 Deployment & Auto-Start (Daemon + Boot Hook)

All supervision scripts are fully portable: data paths resolve from `$HOME`
(default `~/.yuihime`, override `YUIHIME_SYSTEM_ROOT`) and the script's own
location — **no hardcoded absolute paths**, so it works on any server/PC/user
(each user gets their own data instance under their home).

### One-shot installer: `scripts/install.sh`

Installs dependencies and wires up the global `yuihime` command, handling both
scenarios automatically (fresh clone → `npm install`; already installed → skip):

```bash
bash scripts/install.sh                 # auto: global if root, user otherwise
bash scripts/install.sh --global        # symlink to /usr/local/bin (root/sudo)
bash scripts/install.sh --user          # ~/.local/bin + inject PATH to shell rc
bash scripts/install.sh --build         # also run `npm run build`
bash scripts/install.sh --no-deps       # skip dependency handling (already set up)
```

- **User mode** injects an idempotent PATH block into `~/.bashrc`, `~/.profile`,
  and/or `~/.zshrc` (re-running never duplicates).
- After install: `yuihime daemon start | yuihime status | yuihime help`.
- Manual alternative: `tools/yuihime install|uninstall`.

### npm-style install: `--copy`

Installs the whole app into a safe, self-contained folder — like
`npm install -g`. The source clone becomes unused at runtime and can be
deleted/moved freely (runtime data always stays in `~/.yuihime`).

```bash
yuihime install --copy                # global: /opt/yuihime (sudo)
                                      # user:   ~/.local/share/yuihime
yuihime install --copy --prefix /opt/yuihime   # explicit folder
bash scripts/install.sh --copy --prefix /opt/yuihime

# update the copy after changes (re-runs npm install + build in place)
bash scripts/install.sh --copy --prefix /opt/yuihime

# remove it (folder + symlink; user data in ~/.yuihime is kept)
yuihime uninstall --copy --prefix /opt/yuihime
```

- `--copy` copies the source (excluding `node_modules`/`.git`/`dist`), then runs
  `npm install` + `npm run build` inside the target folder and symlinks
  `<target>/tools/yuihime` into the bindir. Works with `sudo` (root install to
  `/opt/yuihime`); use `sudo env "PATH=$PATH" bash scripts/install.sh --copy`
  if `node` isn't in root's PATH.
- It writes the boot marker `~/.yuihime/bin/project-root` + copies the
  location-independent boot launcher, so `autoboot` keeps working after the
  original clone is deleted. If you later move the installed folder manually,
  re-run `yuihime daemon autoboot` to refresh the marker.

### Deployment modes

- **Non-PM2 (default)** — single local process supervised by `yui-watchdog.sh`
  (probes `/api/health`, auto-restarts on hang/crash):
  ```bash
  tools/yui-daemon.sh start prod
  ```
- **PM2 (optional)** — PM2 manages the process (auto-restart on exit);
  `yui-watchdog.sh --pm2` adds hang detection (health probe → `pm2 restart yuihime`):
  ```bash
  tools/yui-daemon.sh --pm2 start prod
  ```

### Boot hook: `scripts/boot.sh`

Auto-starts the daemon + supervisor after a reboot. Works on Termux:Boot,
UserLAnd, cron `@reboot`, or init.d.

```bash
# One-shot: detect the platform and install the right auto-start
# (systemd unit | ~/.termux/boot | UserLAnd startup | cron @reboot)
tools/yui-daemon.sh autoboot            # or: yuihime daemon autoboot
tools/yui-daemon.sh autoboot prod       # explicit mode
YUIHIME_PM2=1 tools/yui-daemon.sh autoboot   # PM2-aware wiring

# Remove whatever autoboot installed (systemd unit | termux boot | cron line)
tools/yui-daemon.sh autoboot off        # or: yuihime daemon autoboot off
```

**Location-independent:** auto-start hooks point to a stable launcher at
`~/.yuihime/bin/yui-boot.sh` (copied by `autoboot`), which re-resolves the
project folder at boot time — via the global `yuihime` command, the
`~/.yuihime/bin/project-root` marker, or common locations. Clone/save the
project anywhere, even move it after install; auto-start keeps working
(re-run `yuihime daemon autoboot` to refresh the marker).

# Defaults: non-PM2 + prod (dev if no dist/server.cjs), 10s boot delay,
# data in ~/.yuihime, port 3000
bash scripts/boot.sh

# Explicit modes
bash scripts/boot.sh prod            # non-PM2, prod
bash scripts/boot.sh --pm2           # PM2, auto mode
bash scripts/boot.sh --pm2 prod      # PM2 + prod

# With environment overrides
YUIHIME_BOOT_DELAY=5 YUIHIME_DAEMON_PORT=8080 bash scripts/boot.sh
YUIHIME_PM2=1 bash scripts/boot.sh   # same as --pm2
```

Where to install it:
- **Termux:Boot** — create `~/.termux/boot/yuihime.sh` containing:
  ```bash
  bash /home/<user>/YuiHime/scripts/boot.sh
  ```
- **UserLAnd** — set it as the login startup command.
- **cron `@reboot`** — in `crontab -e`:
  ```
  @reboot /bin/bash /home/<user>/YuiHime/scripts/boot.sh
  ```
- **systemd server + PM2** — prefer `pm2 startup` + `pm2 save`
  (see `docs/DEPLOYMENT_INFO.md`); `boot.sh` is the no-systemd alternative.

Boot result logs land in `~/.yuihime/debug/boot.log`.

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
