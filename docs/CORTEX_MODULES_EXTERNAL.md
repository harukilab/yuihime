# External Cortex Modules — Panduan Lengkap

Panduan mendalam untuk modul Cortex eksternal: cara menambah, sumber data yang
tersedia, cara injeksi ke LLM, action types, API, best practices, dan troubleshooting.

- **Lokasi folder**: `~/.yuihime/cortexloader/` (override: env `YUIHIME_CORTEX_LOADER_PATH`)
- **File**: satu JSON per modul — `~/.yuihime/cortexloader/<id>.json`
- **Tanpa rebuild**: modul di-scan saat startup daemon, atau didaftarkan real-time via API
- **Cara baca lain**: ringkasan singkat ada di `README.md`; panduan modul built-in di `docs/MODULAR_GUIDE.md`

---

## 1. Konsep Dasar

Cortex Modules adalah "organ kognitif" Yui yang berjalan di dalam pipeline tiap putaran
percakapan. Modul **built-in** dikompilasi ke dalam daemon (`src/modules/**`). Modul
**eksternal** memakai loader (`src/core/CortexModulesLoader.ts`) sehingga Anda bisa
menambah perilaku kognitif tanpa menyentuh/menyusun ulang codebase.

Setiap modul eksternal:

1. Didaftarkan ke `SystemRegistry` sebagai modul bertipe `CORTEX`.
2. Dijalankan pada `phase` tertentu setiap siklus pipeline.
3. Menerima `input`, `state`, dan `context`.
4. Dapat menyuntikkan hasil kembali ke `context` (termasuk ke prompt LLM).

```
Pesan user masuk
   │
   ▼
[aggregation] ──► [soul] ──► [compression] ──► [reflect] ──► [finalize] ──► [logic]
      │              │             │               │             │             │
      └──── modul eksternal (phase = salah satu di atas) dijalankan di sini ────┘
```

---

## 2. Direktori & Konfigurasi

### 2.1 Lokasi default

Folder default: `~/.yuihime/cortexloader/`. Folder dibuat otomatis saat daemon pertama
kali start (jika belum ada).

Ganti lokasi via environment variable:

```bash
export YUIHIME_CORTEX_LOADER_PATH=/srv/my-yuihime/cortexloader
```

### 2.2 Apa yang dibaca loader

- Semua file `*.json` di folder tersebut dibaca saat startup.
- `registry.json` di-ignore (cadangan sistem, bukan definisi modul).
- Satu file = satu definisi modul. Nama file bebas (disarankan `<id>.json`).
- Validasi minimal: wajib memiliki `id` dan `phase`; selain itu dilempar error.
- `id` disanitasi: karakter selain `a-z0-9_-` diganti `_`.

Log saat startup:

```
[CORTEX_LOADER] Registered external cortex module: my_module (phase: aggregation, order: 1).
[CORTEX_LOADER] Registered 2 external cortex modules from /home/.../.yuihime/cortexloader.
```

### 2.3 Registrasi tanpa restart (API)

- `POST /api/cortex-modules` — daftarkan & tulis file JSON
- `GET /api/cortex-modules` — lihat semua definisi
- `DELETE /api/cortex-modules/:id` — hapus file & unregister

Detail di bab 7.

---

## 3. Skema JSON Definisi Modul

```json
{
  "id": "my_module",
  "name": "My Module",
  "description": "What this module does.",
  "version": "1.0.0",
  "author": "you",
  "phase": "aggregation",
  "order": 1,
  "actionType": "code",
  "actionCode": "return context;",
  "parameters": { "key": "value" },
  "trigger": null
}
```

| Field | Wajib | Tipe | Fungsi |
|---|---|---|---|
| `id` | ✅ | string | ID unik (kebab/snake). Hanya `a-z0-9_-`; lain di-sanitasi jadi `_` |
| `phase` | ✅ | string | Fase pipeline. Gunakan salah satu fase ✅ (lihat bab 4) |
| `name` | — | string | Nama tampilan (default = `id`) |
| `description` | — | string | Deskripsi (muncul di UI & log) |
| `version` | — | string | Versi modul (default `1.0.0`) |
| `author` | — | string | Pembuat (default `external`) |
| `order` | — | number | Urutan eksekusi dalam fase sama, naik (default 0) |
| `actionType` | — | string | `code` (default), `shell`, atau `webhook` |
| `actionCode` | — | string | Kode JS / command bash / URL webhook |
| `parameters` | — | object | Argumen: `{{key}}` di shell/webhook, `args.key` di code |
| `trigger` | — | fungsi* | Kondisi opsional; tanpa ini modul jalan tiap siklus |

> `trigger` di definisi JSON belum didukung loader eksternal secara eksplisit —
> untuk eksekusi kondisional, branch di dalam `actionCode` saja (contoh bab 5.4).

---

## 4. Fase Pipeline — Mana yang Benar-Benar Dieksekusi

### 4.1 Enam fase otomatis

Pipeline **hanya** memanggil 6 fase via `SystemRegistry.runCortexPhase(...)`:

| `phase` | Urutan | Saat dipanggil |
|---|---|---|
| `aggregation` | 1 | Agregasi semua sinyal input (memori, identitas, cuaca, dll) |
| `soul` | 2 | Proses kondisi emosional / kepribadian |
| `compression` | 3 | Kompresi payload & **perakitan system prompt** (prompt-manager order 5) |
| `reflect` | 4 | Refleksi diri per-iterasi di dalam loop ReAct |
| `finalize` | 5 | Penyelesaian & verifikasi jawaban akhir |
| `logic` | 6 | Pemikiran lanjutan / penalaran non-blok (termasuk simulasi mimpi) |

> ⚠️ **Penting**: modul eksternal ber-phase selain 6 fase di atas **tidak akan pernah
> dieksekusi otomatis**. Fase lain (`preprocess`, `execute`, `evaluation`, `output`, dll)
> hanya berjalan bila dipanggil langsung di titik khusus kode (mis. `neural-verifier`
> phase `evaluation` dipanggil manual di dalam loop). **Untuk modul eksternal, gunakan
> salah satu dari 6 fase otomatis.**

### 4.2 Tabel fase lengkap

| `phase` | Label lama | Eksekusi |
|---|---|---|
| `aggregation` | `PHASE 1: AGGREGATION` | ✅ otomatis |
| `soul` | `SOUL` | ✅ otomatis |
| `compression` | `PHASE 2: COMPRESSION` | ✅ otomatis |
| `reflect` | `AGI_REFLECT` | ✅ otomatis |
| `finalize` | `PHASE 4: EXECUTION` | ✅ otomatis |
| `logic` | `LOGIC` | ✅ otomatis |
| `preprocess` | `pre-process` | ❌ manual |
| `context` | `context-augmentation` | ❌ manual |
| `context-augment` | `PHASE 2: CONTEXT` | ❌ manual |
| `optimization` | `PHASE 2: OPTIMIZATION` | ❌ manual |
| `postprocess` | `post-process` | ❌ manual |
| `evaluation` | `PHASE 3: EVALUATION` | ❌ manual (dipanggil khusus: `neural-verifier`) |
| `execute` | `execution` | ❌ manual |
| `optimize-output` | `PHASE 4: OPTIMIZATION` | ❌ manual (dipanggil khusus: `parallel-streamer`) |
| `expression` | `PHASE 4: EXPRESSION` | ❌ manual |
| `output` | `output` | ❌ manual |
| `maintenance` | `PHASE 1: MAINTENANCE` | ❌ manual |

### 4.3 Urutan dalam fase sama

Modul dalam fase yang sama dijalankan berurutan sesuai `order` (naik). Modul dengan
`order` yang sama berjalan paralel (`Promise.all`). Hasil setiap modul di-merge ke
`context` (spread), sehingga modul order lebih besar bisa membaca hasil modul order
lebih kecil.

---

## 5. Sumber Data — `input`, `state`, `context`

Setiap modul dipanggil sebagai `run(input, state, context)`.

### 5.1 `input` (string)

Teks mentah pesan user pada putaran ini. Juga tersedia sebagai `args.input` dan
`args._input`.

### 5.2 `state` — `AgentState`

Kondisi kesadaran/emosi Yui yang persisten.

| Key | Isi |
|---|---|
| `state.status` | `awake` / `dreaming` / `learning` / `idle` / `reflecting` / `planning` / `executing` / `sleeping` |
| `state.energy` | Energi 0–100 |
| `state.mood` | `MoodState` — lihat 5.4 |
| `state.emotion` | `EmotionState` — `arousal` (0–100), `valence` (–100..100), `focus`, `rapport` |
| `state.relation` | `UserRelation` — `trust`, `affection`, `reputation` (0–100), `lastInteraction` |
| `state.activePersonaId` | ID persona aktif (`auto`, `hiyori`, `aether`, `nova`, `ero`, dll) |
| `state.tone` | `pitch`, `speed`, `emotionalBias` |
| `state.currentPlan` | `TaskPlan` — dekomposisi tugas aktif |
| `state.activeContext` | Daftar konteks aktif |
| `state.lastDreamCycle` / `state.lastUpdate` | Timestamp siklus terakhir |
| `state.systemHealth` | `latency`, `successRate`, `tasksCompleted`, `somatic` (CPU/RAM/denyut/suhu), `homeostasis` |

### 5.3 `context` — data pipeline (paling kaya)

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
| `context.db` | Koneksi SQLite (bila berjalan di server) |
| `context.think(prompt, opts?)` | Panggil LLM Yui (opts: `model`, `jsonMode`) |
| `context.activePersona` | Persona aktif (id, name, systemPrompt, traits) |
| `context.systemPrompt` / `context.assembledSystemPrompt` | Prompt sistem yang dirakit |
| `context.model` | Model yang dipilih |
| `context.tools` / `context.allowedTools` | Tool yang terdaftar / diizinkan |
| `context.disableTools` / `context.bypassGateway` | Flag kontrol eksekusi |
| `context.toolExecutionHistory` | Riwayat eksekusi tool di loop ini |
| `context.lastToolUsed` / `context.lastToolError` | Tool terakhir & error-nya |
| `context.groundedKnowledge` | Pengetahuan ter-grounding (masuk prompt) |
| `context.externalInjection` | **Key universal** — selalu dirender ke prompt (lihat bab 6) |
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

### 5.4 Struktur `state.mood` (`MoodState`)

Emosi berlapis + neurotransmitter:

```typescript
{
  joy: number, anger: number, sadness: number, stress: number,
  irritation: number, excitement: number, embarrassment: number, curiosity: number,
  jealousy?: number, loneliness?: number, playfulness?: number,
  chastity?: number, temperance?: number, charity?: number, diligence?: number,
  patience?: number, kindness?: number, humility?: number,
  lust?: number, gluttony?: number, greed?: number, sloth?: number,
  wrath?: number, envy?: number, pride?: number,
  dopamine?: number, serotonin?: number, oxytocin?: number, noradrenaline?: number,
  lastUpdate: number
}
```

---

## 6. Output & Injeksi ke LLM

### 6.1 Kemana hasil pergi

| Action | Hasil disimpan ke |
|---|---|
| `code` | Kamu sendiri yang memilih: mutate `context` lalu `return context;` |
| `shell` | `context.<id>_output` (stdout + stderr) |
| `webhook` | `context.<id>_output` (JSON ter-parse, fallback `rawResponse`) |
| Error apa pun | `context.<id>_error` (pipeline tidak putus) |

### 6.2 Key yang benar-benar terlihat LLM

⚠️ **Konsep penting**: key yang kamu set di `context` **selalu tersedia untuk modul
lain**, tapi **tidak semua otomatis masuk system prompt LLM**. Prompt Yui dirakit oleh
modul `prompt-manager` (phase `compression`, order 5) yang HANYA membaca key tertentu:

- `groundedKnowledge` → block `<grounded_knowledge_context>`
- `externalInjection` → block `<external_module_injections>` (UNIVERSAL)
- `soulDirective` → cognitive directives (XML)
- `userModel`, `memories`, `allIdentities`, `dreams`, `heuristics`, `userName`,
  `activePersona`, `chatType`, `contextId`, `timePeriod`, `timeOfDay`,
  `timezoneOffsetHours`, `userLocation`, `weatherCondition`, `dreamInsight`,
  `allowedTools`, `toolChoice`, `disableTools`

**Key yang kamu buat sendiri (mis. `context.my_data`) HANYA terlihat modul lain**,
bukan LLM — kecuali dibaca oleh modul lain lalu disuntikkan ke salah satu key di atas.

### 6.3 `context.externalInjection` — key universal

Dirancang khusus untuk modul eksternal: **selalu** dirender ke system prompt sebagai
block `<external_module_injections>` apabila diisi. Tidak perlu tahu key internal lain.

Set (tulis langsung):

```js
context.externalInjection = '[MY MODULE] status: OK';
return context;
```

Append (banyak modul bisa menyumbang, tidak saling timpa):

```js
context.externalInjection = (context.externalInjection || '') + '\n[MY MODULE] status: OK';
return context;
```

Hasil di prompt LLM:

```xml
<external_module_injections>
[MY MODULE] status: OK
[ANOTHER MODULE] cpu=42% ram=1.1GB
</external_module_injections>
```

---

## 7. Action Types — `code`, `shell`, `webhook`

### 7.1 `code` (default) — sandbox JS

Fungsi dibungkus `new Function('args', 'context', 'state', 'input', actionCode)`.
Menerima 4 argumen:

- `args` — `{ ...parameters, input, _input }`
- `context` — objek pipeline (bisa dimutasi)
- `state` — `AgentState`
- `input` — pesan user mentah

```js
context.externalInjection = 'Got: ' + input;
return context;
```

Aturan:

- Return `undefined` → loader memakai `context` (return value di-merge).
- Return objek lain → di-merge ke context (spread).
- `await` didukung penuh (mis. `context.think`).
- Error di-catch loader → `context.<id>_error` diisi, pipeline lanjut.

### 7.2 `shell` — bash

Command dijalankan via `exec`, limit **120 detik** & **10MB maxBuffer**.
Placeholder `{{key}}` diganti dari `parameters` (dan `input`).

```json
{
  "id": "sys_probe",
  "name": "System Probe",
  "phase": "aggregation",
  "actionType": "shell",
  "actionCode": "uptime && free -m | head -3",
  "parameters": {}
}
```

Hasil (stdout + stderr) otomatis ke `context.sys_probe_output`. Baca di modul lain:

```js
if (context.sys_probe_output) {
  context.externalInjection = 'System: ' + context.sys_probe_output.split('\n')[0];
}
return context;
```

### 7.3 `webhook` — POST JSON

Mengirim `POST` JSON (body = `args`) ke URL di `actionCode`. Placeholder `{{key}}`
di-encode. Respons dicoba di-parse sebagai JSON; jika gagal → `{ rawResponse: text }`.
Hasil disimpan ke `context.<id>_output`.

```json
{
  "id": "notify_ext",
  "name": "Notify External",
  "phase": "logic",
  "actionType": "webhook",
  "actionCode": "https://example.com/hooks/yuihime/{{user_name}}",
  "parameters": { "user_name": "guest" }
}
```

---

## 8. Contoh Lengkap

### 8.1 Modul paling sederhana

```json
{
  "id": "hello_ext",
  "name": "Hello External",
  "phase": "aggregation",
  "actionType": "code",
  "actionCode": "context.externalInjection = '[HELLO EXT] running at ' + new Date().toISOString(); return context;"
}
```

### 8.2 Membaca data sistem & injeksi

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

### 8.3 Memanggil LLM Yui sendiri (`context.think`)

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

### 8.4 Eksekusi kondisional di dalam `code`

Tanpa `trigger` JSON, branch manual pakai `input` / `context`:

```json
{
  "id": "conditional_log",
  "name": "Conditional Logger",
  "phase": "aggregation",
  "actionType": "code",
  "actionCode": "if (/status|health|cek/i.test(input)) { context.externalInjection = (context.externalInjection || '') + '\\n[CONDITIONAL] Health check requested.'; } return context;"
}
```

### 8.5 Rantai shell → finalize → LLM

Modul A (shell, `aggregation`) menulis `context.<id>_output`; modul B (`finalize`)
membaca & menyuntikkan ke `externalInjection` sehingga kesimpulan masuk jawaban LLM.

`sys_probe.json`:

```json
{
  "id": "sys_probe",
  "name": "System Probe",
  "phase": "aggregation",
  "actionType": "shell",
  "actionCode": "uptime"
}
```

`inject_probe.json`:

```json
{
  "id": "inject_probe",
  "name": "Inject Probe",
  "phase": "finalize",
  "order": 1,
  "actionType": "code",
  "actionCode": "if (context.sys_probe_output) { context.externalInjection = (context.externalInjection || '') + '\\n[SYSTEM UPTIME]: ' + context.sys_probe_output.trim(); } return context;"
}
```

### 8.6 Menggabungkan output banyak modul

Setiap modul `append` ke `externalInjection` — tidak saling timpa:

```js
context.externalInjection = (context.externalInjection || '') + '\n[MODULE X] ...';
```

---

## 9. API Endpoints

### 9.1 `GET /api/cortex-modules`

Daftar semua definisi modul eksternal:

```bash
curl http://127.0.0.1:3000/api/cortex-modules
```

```json
{ "success": true, "dir": "/home/.../.yuihime/cortexloader", "modules": [ ... ] }
```

### 9.2 `POST /api/cortex-modules`

Daftarkan modul baru (menulis `<id>.json` + register real-time). Wajib `id` & `phase`;
`id` hanya `a-z0-9_-`:

```bash
curl -X POST http://127.0.0.1:3000/api/cortex-modules \
  -H "Content-Type: application/json" \
  -d '{"id":"my_module","phase":"aggregation","actionType":"code","actionCode":"return context;"}'
```

### 9.3 `DELETE /api/cortex-modules/:id`

Unregister & hapus file:

```bash
curl -X DELETE http://127.0.0.1:3000/api/cortex-modules/my_module
```

### 9.4 Verifikasi

Setelah registrasi, pastikan muncul di log:

```bash
grep CORTEX_LOADER ~/.yuihime/debug/current.log
```

Dan saat pipeline berjalan, modul ikut tereksekusi:

```
[REGISTRY_RUN] Running module: my_module [aggregation]...
[REGISTRY_RUN] Module completed: my_module (0.0s)
```

---

## 10. Best Practices

1. **Gunakan fase ✅** — `aggregation`, `soul`, `compression`, `reflect`, `finalize`,
   `logic`. Fase lain tidak dieksekusi otomatis.
2. **Append, bukan overwrite** — untuk `externalInjection` / `groundedKnowledge` /
   `soulDirective`, selalu `(context.x || '') + ...` agar banyak modul bisa menyumbang.
3. **Jangan blok pipeline** — `code` yang berat (loop, network) membuat putaran lambat.
   Pertimbangkan `shell` dengan timeout atau `webhook` untuk kerja jarak jauh.
4. **Awali dengan prefix** — setiap injeksi `[NAMA MODUL]` agar traceable di prompt.
5. **Gunakan `context.think` untuk analisis mandiri** — model default Yui sudah
   terhubung; fallback heuristik bila `context.think` tidak tersedia.
6. **Tangani error sendiri** — bila modul gagal, `context.<id>_error` terisi otomatis;
   tambahkan log `console.log` bila perlu debugging.
7. **Jangan menaruh rahasia di `actionCode` shell/webhook** — command & URL tampil
   di log (`[REGISTRY_RUN]`/file JSON).
8. **Backup modul** — definisi JSON ada di `~/.yuihime/cortexloader/` (di luar repo);
   sertakan dalam backup sistem.

---

## 11. Troubleshooting

| Gejala | Kemungkinan | Solusi |
|---|---|---|
| Modul tidak pernah jalan | `phase` bukan 6 fase otomatis | Ganti ke `aggregation`/`soul`/`compression`/`reflect`/`finalize`/`logic` |
| Modul tidak terlihat di API | File tidak `.json` / bernama `registry.json` / JSON tidak valid | Periksa file; pastikan valid JSON |
| `400 id and phase are required` | `POST` tanpa `id`/`phase` | Tambahkan kedua field |
| `400 id may only contain...` | `id` berisi karakter aneh | Pakai hanya `a-z0-9_-` |
| Error `Cortex Module Execution Error` | Exception di `actionCode` | Periksa log; pesan error di `context.<id>_error` |
| Shell timeout | Command >120 detik | Persingkat command atau pindah ke `webhook` |
| Data tidak terlihat LLM | Key custom tidak dibaca prompt-manager | Gunakan `context.externalInjection` |
| Modul eksekusi ganda setelah restart | File masih ada di folder + API | Hapus file JSON |
| Perubahan tidak berlaku | Daemon belum di-restart | Restart daemon atau `POST` ulang |

---

## 12. Referensi Kode

- Loader: `src/core/CortexModulesLoader.ts`
- Registrasi saat startup: `src/core/RegistryInitializer.ts` (panggilan loader)
- API: `src/core/server/routes/systemRouter.ts` (routes `/api/cortex-modules`)
- Eksekusi fase: `shared/core/registry.ts` (`runCortexPhase`)
- Perakitan prompt & injeksi key: `src/modules/PromptManager.ts`
- Tipe: `shared/include/types.ts` (`ModulePhase`, `AgentState`, `MoodState`, `Memory`)
- Ringkasan: `README.md` → section "External Cortex Modules"
