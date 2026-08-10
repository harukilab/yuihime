# 👑 Yuihime AI v4.369 - Autonomous VTuber Engine (Airi OS Core v2.39)

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
│   ├── ai-providers/             # OpenAI, Gemini, Anthropic, OpenRouter, Custom, Local, OfficialChat
│   └── tools/                    # Tool modular datar (file, shell, web, dll)
├── modules/                      # Feature modules (auto-registered)
└── ...

shared/                            # Cross-boundary types + constants + services
web/                               # Vite React app (builds to dist/web)
```

**Prinsip inti:** `server.ts` = daemon entrypoint. `web/` = UI terpisah. `shared/` = satu-satunya lapisan bersama.

---

## 🧠 Fitur Kognitif Otonom

### Cognitive Loop (`cortexThinkEngine.ts`)
- **Loop kognitif iteratif (Reason → Tool Call → Observe → Respond)**: berulang selama tool dipanggil, dibatasi `tool-executor.maxIterations` (default 50; ceil override `tool-executor.maxIterationsCeiling`, default +5)
- **Tool execution dengan retry & timeout**: Setiap tool dijalankan dengan batas waktu, retry otomatis, dan abort support via `AbortSignal`
- **JSON enforcement**: LLM dipaksa output JSON valid (`thought` / `speech` / `tool_calls` / `animations` / `mood_impact`)
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
- Setiap tool di-load dari `src/drivers/tools/<id>.ts` (file datar, manifest tertanam)
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
- Tool addon otomatis didaftarkan ke `~/.yuihime/data/available_tools.json` (di-generate `src/core/toolRegistryFile.ts`) dan terlihat oleh agent via prompt builder

### External Cortex Modules (`~/.yuihime/cortexloader/`)
Modul Cortex eksternal yang **selalu dijalankan setiap putaran** pipeline — tanpa perlu
menyentuh/build ulang codebase. Cukup taruh file JSON di `~/.yuihime/cortexloader/`
(mulai ulang daemon, atau `POST /api/cortex-modules` untuk registrasi langsung).

- Format: satu file JSON per modul: `~/.yuihime/cortexloader/<id>.json`
- **Hanya 6 fase yang benar-benar dieksekusi otomatis tiap siklus**: `aggregation`,
  `soul`, `compression`, `reflect`, `finalize`, `logic` (lihat tabel fase di bawah).
  Fase lain (mis. `preprocess`, `execute`, `evaluation`) **tidak akan dipanggil** untuk
  external module — gunakan salah satu dari 6 fase di atas.
- Modul **tanpa `trigger` selalu jalan tiap siklus**; hasilnya bisa disuntikkan ke `context`
  sehingga terlihat LLM di putaran tersebut.
- Action type: `code` (JS sandbox), `shell` (bash, `{{arg}}`), `webhook` (POST JSON).
- API: `GET /api/cortex-modules`, `POST /api/cortex-modules`, `DELETE /api/cortex-modules/:id`.
- `registry.json` di dalam folder di-ignore (bukan definisi modul).

#### Darimana data diambil (input) & ke mana hasil pergi (output)

Setiap modul dipanggil sebagai `run(input, state, context)` dan menerima **3 sumber data**:

1. **`input` (string)** — teks mentah pesan user pada putaran ini.
2. **`state`** — `AgentState` Yui (kondisi kesadaran/emosi persisten).
3. **`context`** — kumpulan data pipeline fase-fase sebelumnya (data paling kaya).

Hasil modul **dikirim ke `context`** dan langsung tersedia untuk modul berikutnya di
fase yang sama maupun fase-fase lanjutan:

- **`code`**: mutate `context` lalu `return context;` (atau return objek yang di-merge).
- **`shell` / `webhook`**: hasil otomatis masuk `context.<id>_output` (contoh:
  `context.service_status_output`), jadi cukup baca key itu di `code` lain / pakai di
  prompt.
- **Error**: pipeline **tidak putus**. Error disimpan di `context.<id>_error` dan
  modul lanjut ke putaran berikutnya.

> ⚠️ **Penting — key mana yang benar-benar terlihat LLM:** Key yang kamu set di
> `context` **selalu tersedia untuk modul lain** (bisa dibaca `code` modul berikutnya).
> Namun **tidak semua key otomatis masuk system prompt LLM**. Prompt Yui dirakit oleh
> modul `prompt-manager` (phase `compression`) yang HANYA membaca key tertentu. Key yang
> disuntikkan otomatis ke prompt: `groundedKnowledge`, `soulDirective`, `userModel`,
> `memories`, `allIdentities`, `dreams`, `heuristics`, `userName`, `activePersona`,
> `chatType`, `contextId`, `timePeriod`, `timeOfDay`, `timezoneOffsetHours`,
> `userLocation`, `weatherCondition`, `dreamInsight`, `allowedTools`, `toolChoice`,
> `disableTools`. **Key lain yang kamu buat sendiri HANYA terlihat modul lain**, bukan LLM.
> Untuk menyuntikkan data kustom ke LLM, set salah satu key di atas (mis. append ke
> `context.groundedKnowledge` atau `context.soulDirective`).
>
> 💡 **Key universal**: gunakan `context.externalInjection` — key khusus yang SELALU
> dirender ke system prompt (block `<external_module_injections>`) apa pun isinya.
> Cocok untuk data kustom dari external cortex module yang harus sampai ke LLM
> tanpa perlu tahu key internal lain.

##### Key `context` yang tersedia

| Key | Isi |
|---|---|
| `context.userName` | Nama yang dipersepsikan user |
| `context.memories` | `Memory[]` — riwayat/ingatan (content, type, importance, sentiment, dll) |
| `context.allIdentities` | Daftar identitas/relasi yang dikenal Yui |
| `context.identityContext` | Konteks identitas ter-resolve untuk LLM |
| `context.userModel` | Profil persisten user (preferensi, kepribadian) |
| `context.viewerIdentity` | Identitas viewer/kanal stream |
| `context.contextId` / `context.chatType` | Kanal pesan (tg_..., live_stream, dll) & tipe (private/group) |
| `context.config` | Konfigurasi/settings YuiHime (`provider`, `providers`, `subAgentDelegation`, dll) |
| `context.think(prompt, opts?)` | Panggil LLM Yui (opts: `model`, `jsonMode`) |
| `context.activePersona` | Persona aktif (id, name, systemPrompt, traits) |
| `context.systemPrompt` / `context.assembledSystemPrompt` | Prompt sistem yang dirakit |
| `context.model` | Model yang dipilih |
| `context.tools` / `context.allowedTools` | Tool yang terdaftar / diizinkan |
| `context.disableTools` / `context.bypassGateway` | Flag kontrol eksekusi |
| `context.toolExecutionHistory` | Riwayat eksekusi tool di loop ini |
| `context.lastToolUsed` / `context.lastToolError` | Tool terakhir & error-nya |
| `context.groundedKnowledge` | Pengetahuan ter-grounding (disuntikkan ke prompt) |
| `context.externalInjection` | **Key universal** — selalu dirender ke prompt (block `<external_module_injections>`) |
| `context.knowledge` / `context.heuristics` | Knowledge core & strategi belajar |
| `context.goals` / `context.activeGoal` / `context.goalPersistencePct` | Sistem goal aktif |
| `context.soulDirective` | Direktif emosi dari fase soul |
| `context.dreamInsight` / `context.dreams` / `context.dreamReward` | Hasil simulasi mimpi |
| `context.timePeriod` / `context.timeOfDay` / `context.localHour` | Waktu lokal Yui |
| `context.timezoneOffsetHours` / `context.userLocation` | Zona waktu & lokasi user |
| `context.weatherCondition` / `context.weatherSeverityIndex` | Kondisi cuaca (modul weather) |
| `context.logs` | Log pipeline putaran ini |
| `context.processedResponse` / `context.rawResult` | Hasil olahan/mentah dari gateway |
| `context.moodImpact` / `context.animations` | Dampak mood & animasi (untuk L2D/UI) |
| `context.<id>_output` / `context.<id>_error` | Hasil/error modul eksternal lain |

##### Key `state` yang tersedia

| Key | Isi |
|---|---|
| `state.status` | `awake` / `dreaming` / `learning` / `idle` / `reflecting` / `planning` / `executing` / `sleeping` |
| `state.energy` | Energi 0–100 |
| `state.mood` | `MoodState` — emosi berlapis: `joy`, `anger`, `sadness`, `stress`, `irritation`, `excitement`, `curiosity`, `jealousy`, `loneliness`, `playfulness`, neurotransmitter (`dopamine`, `serotonin`, `oxytocin`, `noradrenaline`, dst) |
| `state.emotion` | `EmotionState` — `arousal` (0–100), `valence` (–100..100), `focus`, `rapport` |
| `state.relation` | `UserRelation` — `trust`, `affection`, `reputation` (0–100), `lastInteraction` |
| `state.activePersonaId` | ID persona aktif (`auto`, `hiyori`, `aether`, `nova`, `ero`, dll) |
| `state.tone` | `pitch`, `speed`, `emotionalBias` |
| `state.currentPlan` | `TaskPlan` — dekomposisi tugas aktif |
| `state.activeContext` | Daftar konteks aktif |
| `state.lastDreamCycle` / `state.lastUpdate` | Timestamp siklus terakhir |
| `state.systemHealth` | `latency`, `successRate`, `tasksCompleted`, `somatic` (CPU/RAM/denyut/suhu), `homeostasis` |

#### Mengambil data sistem Yui

Semua key `context` bisa dibaca langsung di `actionCode`. Contoh membaca memori,
identitas, state emosi, dan konfigurasi — hasilnya di-set ke `externalInjection`
(key universal yang SELALU dirender ke prompt LLM):

```json
{
  "id": "brain_probe",
  "name": "Brain Probe",
  "description": "Reads Yui's internal data and injects a summary.",
  "phase": "aggregation",
  "order": 5,
  "actionType": "code",
  "actionCode": "const report = 'User: ' + context.userName + ' | Joy: ' + (state.mood?.joy || 0) + ' | Stress: ' + (state.mood?.stress || 0) + ' | Energy: ' + state.energy + '% | Memories: ' + (context.memories?.length || 0) + ' | Chat: ' + context.chatType; context.externalInjection = (context.externalInjection || '') + '\\n[BRAIN PROBE]: ' + report; return context;"
}
```

Untuk panggil LLM Yui sendiri (analisis mandiri, fallback heuristik), gunakan
`context.think` — hasilnya di-injeksi ke `externalInjection` agar dibaca LLM utama:

```json
{
  "id": "mood_reader",
  "name": "Mood Reader",
  "description": "Analyzes user tone via Yui's own LLM.",
  "phase": "aggregation",
  "actionType": "code",
  "actionCode": "const r = await context.think('Rate the tone of this message as one word (happy/sad/angry/neutral): ' + input); context.externalInjection = (context.externalInjection || '') + '\\n[MOOD READER]: ' + (r || 'neutral').trim(); return context;"
}
```

#### Contoh shell & webhook

Contoh shell (cek status layanan, argumen di-inject via `{{...}}`):

```json
{
  "id": "service_status",
  "name": "Service Status",
  "description": "Check service health every turn.",
  "phase": "aggregation",
  "order": 2,
  "actionType": "shell",
  "actionCode": "systemctl status {{service_name}} --no-pager | head -20",
  "parameters": { "service_name": "yuihime" }
}
```

Contoh webhook (kirim data ke service luar, respons disimpan ke output):

```json
{
  "id": "webhook_ping",
  "name": "Webhook Ping",
  "description": "POST current state to an external service.",
  "phase": "logic",
  "actionType": "webhook",
  "actionCode": "https://example.com/hooks/yuihime/{{user_name}}",
  "parameters": { "user_name": "guest" }
}
```

#### Field lengkap

| Field | Wajib | Fungsi |
|---|---|---|
| `id` | ✅ | ID unik; hanya `a-z0-9_-` (lainnya diganti `_`) |
| `phase` | ✅ | Fase pipeline (lihat tabel fase) |
| `name` / `description` | — | Metadata (ditampilkan di UI & log) |
| `order` | — | Urutan eksekusi dalam fase yang sama (naik) |
| `actionType` | — | `code` (default), `shell`, atau `webhook` |
| `actionCode` | — | Kode JS / command bash / URL webhook |
| `parameters` | — | Argumen: `{{key}}` di shell/webhook, `args.key` di code |
| `trigger` | — | Kondisi opsional; tanpa ini modul jalan tiap siklus |

> Catatan: `code`/`shell` dieksekusi penuh di daemon — sama seperti custom tools.
> Shell di-limit 120 detik (timeout) & 10MB (maxBuffer). Webhook selalu `POST`
> JSON (body = `args`); respons dicoba di-parse sebagai JSON, fallback `rawResponse`.

#### Pola injeksi hasil agar terlihat LLM

| Tujuan | Cara |
|---|---|
| **Data kustom (paling simpel)** | Set `context.externalInjection` — **selalu** dirender ke prompt (block `<external_module_injections>`) |
| Data kustom terlihat LLM | Append ke `context.groundedKnowledge` (block `<grounded_knowledge_context>` di prompt) |
| Arahan emosi/nada terlihat LLM | Append ke `context.soulDirective` (dirender jadi cognitive directives) |
| Hasil hanya untuk modul lain | Set key sendiri, mis. `context.<id>_result` — baca di modul `code` lain via `context.<id>_result` |
| Output shell/webhook | Otomatis ke `context.<id>_output` — baca di `code` lain |
| Menjalankan logika & menyimpan | `context.<id>_output` bisa dibaca oleh modul `code` fase berikutnya (mis. `finalize`) dan di-append ke `externalInjection` di sana |

> Contoh rantai: modul `service_status` (shell, `aggregation`) menulis
> `context.service_status_output`; modul `code` di fase `finalize` membaca
> `context.service_status_output` lalu meng-append-nya ke `context.groundedKnowledge`
> sehingga kesimpulan status layanan masuk jawaban LLM.

> 📖 **Panduan lengkap & detail**: `docs/CORTEX_MODULES_EXTERNAL.md` — konsep, skema
> JSON, tabel fase, semua key `context`/`state`, action types, contoh lengkap, API,
> best practices, dan troubleshooting.
>
> 🧩 **Integrasi addon ↔ external cortex module** (sepasang, berbagi file JSON di
> `~/.yuihime/user_data/`): `docs/ADDON_CORTEX_INTEGRATION.md` — alur data, contoh
> addon penulis + cortex reader/inject, arah sebaliknya, env injection, & troubleshooting.

### Tabel Fase Cortex

Setiap modul Cortex (termasuk external cortex module) mendeklarasikan `phase` untuk
menentukan kapan dijalankan dalam pipeline. Nama fase kini seragam & mudah dibaca
(rename dari label lama):

| Fase (`phase`) | Label lama | Eksekusi | Penjelasan |
|---|---|---|---|
| `aggregation` | `PHASE 1: AGGREGATION` | ✅ pipeline | Kumpulkan & agregasi semua sinyal input |
| `soul` | `SOUL` | ✅ pipeline | Proses kondisi emosional / kepribadian |
| `compression` | `PHASE 2: COMPRESSION` | ✅ pipeline | Kompresi payload sebelum gateway |
| `reflect` | `AGI_REFLECT` | ✅ pipeline | Refleksi diri per-iterasi di loop ReAct |
| `finalize` | `PHASE 4: EXECUTION` | ✅ pipeline | Penyelesaian jawaban akhir |
| `logic` | `LOGIC` | ✅ pipeline | Pemikiran lanjutan / penalaran non-blok |
| `preprocess` | `pre-process` | ❌ manual | Persiapan/penyaringan sinyal (tidak dieksekusi otomatis) |
| `context` | `context-augmentation` | ❌ manual | Augmentasi konteks percakapan |
| `context-augment` | `PHASE 2: CONTEXT` | ❌ manual | Fase augmentasi konteks terarah |
| `optimization` | `PHASE 2: OPTIMIZATION` | ❌ manual | Optimasi payload |
| `postprocess` | `post-process` | ❌ manual | Pasca-proses setelah fase inti |
| `evaluation` | `PHASE 3: EVALUATION` | ❌ manual | Verifikasi & evaluasi hasil (dipanggil khusus: `neural-verifier`) |
| `execute` | `execution` | ❌ manual | Eksekusi aksi/tool |
| `optimize-output` | `PHASE 4: OPTIMIZATION` | ❌ manual | Optimasi output akhir (dipanggil khusus: `parallel-streamer`) |
| `expression` | `PHASE 4: EXPRESSION` | ❌ manual | Ekspresi/penyajian output |
| `output` | `output` | ❌ manual | Kirim hasil ke kanal output |
| `maintenance` | `PHASE 1: MAINTENANCE` | ❌ manual | Perawatan sistem |

> Pipeline utama mengeksekusi otomatis 6 fase: `aggregation` → `soul` → `compression` →
> `reflect` → `finalize` → `logic`. Fase lain hanya berjalan bila dipanggil langsung
> (`SystemRegistry.runCortexPhase(...)` atau `getModule(...).run()` di titik khusus).
> **Untuk external cortex modules gunakan salah satu dari 6 fase ber-tanda ✅**.

---

## 📡 Integrasi & I/O

### Input Channels
- **Telegram Bot** (`src/core/server/telegram.ts`)
- **Discord Bot** (`src/core/server/discord.ts`)
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
- `cortexloader/` — Modul Cortex eksternal yang selalu jalan tiap putaran (JSON)

### Custom Providers (OpenAI-compatible)

Driver `custom` adalah templat untuk **menambah provider** (DeepSeek, Groq, lokal
Ollama/LM Studio, Kilo, vLLM, dst.) tanpa menulis kode. Sejak v4.355 mendukung
**banyak instance** via section `[custom.<nama>]` — tiap instance punya
`baseUrl`/`apiKey`/`model`/`customHeaders` sendiri dan otomatis jadi kandidat
system pool failover (`custom:<nama>`):

```toml
[custom.deepseek]
baseUrl = "https://api.deepseek.com/v1"
apiKey = "sk-..."
model = "deepseek-chat"

[custom.ollama]
baseUrl = "http://localhost:11434/v1"
apiKey = ""
model = "llama3.2"
```

Docs lengkap: [`docs/CUSTOM_PROVIDERS.md`](docs/CUSTOM_PROVIDERS.md).

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
