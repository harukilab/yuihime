# Addon + External Cortex Module — Integrasi Sepasang (File JSON Sharing)

Panduan membuat **sepasang modul**: satu **addon** (subprocess penuh, dijalankan
on-demand oleh LLM sebagai tool) dan satu **external cortex module** (berjalan tiap
putaran pipeline). Keduanya **berbagi data lewat file JSON** di `~/.yuihime/user_data/`
sehingga satu menghasilkan data, yang lain mengonsumsinya — dan hasilnya bisa masuk ke
kesadaran LLM lewat `externalInjection`.

- **Cara baca lain**: panduan external cortex module → `docs/CORTEX_MODULES_EXTERNAL.md`;
  panduan addon/tool → `docs/TOOLS.md`; ringkasan di `README.md`.

---

## 1. Kenapa Sepasang (Addon + Cortex Module)?

| | Addon | External Cortex Module |
|---|---|---|
| Lokasi | `~/.yuihime/addons/<id>/` (`config.toml` + `main.*`) | `~/.yuihime/cortexloader/<id>.json` |
| Waktu jalan | **On-demand** — dipanggil LLM sebagai tool `addon-<id>` via `/api/addons/execute/:id` | **Tiap putaran pipeline** — phase `aggregation`/`compression`/dst. |
| Runtime | Full subprocess (`node`/`python`/`bash`) — akses **fs penuh**, `require`, internet | Sandbox: action `shell` (fs penuh via `exec`) atau `code` (hanya `fetch`+global, **tanpa `require`**) |
| Output | `stdout` (JSON) kembali ke LLM sebagai hasil tool | Mutasi `context` → `externalInjection` → masuk system prompt |
| Contoh guna | Menghasilkan data berat (analisis, fetch API, hitung) | Menyuntikkan data itu ke kesadaran Yui setiap putaran |

**Pola "sepasang"**: addon bertindak sebagai *penghasil data* (sering dipanggil), cortex
module bertindak sebagai *konsumen tetap* (selalu jalan, membaca file yang ditulis
addon, lalu meng-inject ke prompt). Karena keduanya bisa mengakses filesystem yang sama,
**file JSON di `~/.yuihime/user_data/` menjadi jembatan** — tidak perlu API antar-proses.

---

## 2. Alur Data (Diagram)

```
┌──────────────────────────────┐          ┌─────────────────────────────────────┐
│  LLM / User                  │          │  Pipeline Cortex (tiap putaran)     │
│  └─ panggil tool             │          │                                     │
│     addon-<id>               │          │  ┌───────────────────────────────┐  │
│       │                      │          │  │ 1. shell reader (aggregation) │  │
│       ▼                      │          │  │    cat shared.json            │  │
│  Addon (subprocess)          │          │  └──────────────┬────────────────┘  │
│  main.js: baca+tulis JSON    │          │                 │ stdout            │
│       │                      │          │                 ▼                   │
│       └─► file JSON          │          │  ┌───────────────────────────────┐  │
│          user_data/shared.json│ ◄───────┼──┤ 2. code inject (compression)  │  │
│                              │          │  │    parse → externalInjection  │  │
│                              │          │  └──────────────┬────────────────┘  │
│                              │          │                 ▼                   │
│                              │          │    PromptManager render block      │
│                              │          │    <external_module_injections>    │
│                              │          │                 ▼                   │
│                              │          │    System prompt → LLM             │
│                              │          │                                     │
└──────────────────────────────┘          └─────────────────────────────────────┘
```

Urutan praktis:

1. User bertanya/LLM memutuskan → tool `addon-<id>` dipanggil.
2. Addon menjalankan logikanya, menulis hasil ke `~/.yuihime/user_data/<shared>.json`
   (subprocess penuh: `require('fs')`, internet, dll — semua tersedia).
3. Setiap putaran berikutnya, cortex module **shell reader** membaca file itu
   (`cat ... && echo`), stdout-nya tersimpan di `context.<id>_output`.
4. Cortex module **code inject** mem-parse JSON dan append ke `context.externalInjection`.
5. `PromptManager` merender blok `<external_module_injections>` → LLM melihatnya.

> 🔄 **Satu arah atau dua arah**: alur di atas adalah "addon → cortex → prompt".
> Kebalikannya juga valid: cortex module (shell, tiap putaran) menulis file status, lalu
> addon membaca file itu saat dipanggil — addon jadi punya konteks "kesadaran" Yui
> terbaru. Kedua arah memakai file yang sama.

---

## 3. Struktur File

### 3.1 Addon (`~/.yuihime/addons/<id>/`)

Dua file wajib:

- `config.toml` — metadata + schema tool (`[tool]`) untuk LLM.
- `main.js` (atau `main.py` / `main.sh`) — entry point; dijalankan
  `node main.js '<args JSON>'`; args lewat `process.argv[2]`; hasil ditulis ke stdout
  sebagai JSON.

### 3.2 External Cortex Module (`~/.yuihime/cortexloader/<id>.json`)

Satu file JSON per modul (skema lengkap: `docs/CORTEX_MODULES_EXTERNAL.md` §3).

---

## 4. Contoh Lengkap: "Stats Logger" (addon) ↔ "Stats Reader" (cortex)

Skenario: addon mencatat statistik (mis. peristiwa `coins=42`) atas permintaan LLM;
cortex module membaca riwayat itu dan membuat Yui selalu sadar angka terbaru.

### 4.1 Addon — `pair_stats`

`~/.yuihime/addons/pair_stats/config.toml`:

```toml
id = "pair_stats"
name = "Pair Stats Writer"
description = "Appends a stats record to ~/.yuihime/user_data/pair_shared.json so the paired external cortex module can inject it into the prompt."
version = "1.0.0"
runtime = "node"
entry_point = "main.js"

[tool]
name = "pair_stats_write"
description = "Append a stats record (label + value) to the shared JSON file. Call this when the user mentions a tracked statistic."
parameters = { type = "object", properties = { label = { type = "string" }, value = { type = "string" } }, required = [ "label" ] }
```

`~/.yuihime/addons/pair_stats/main.js`:

```js
const fs = require('fs');
const os = require('os');
const path = require('path');
const args = JSON.parse(process.argv[2] || '{}');

const dir = process.env.YUIHIME_USER_DATA_PATH || path.join(os.homedir(), '.yuihime', 'user_data');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, 'pair_shared.json');

let data = [];
try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {}
data.push({ label: args.label || 'unknown', value: args.value || '', at: new Date().toISOString() });
data = data.slice(-20);
fs.writeFileSync(file, JSON.stringify(data, null, 2));

console.log(JSON.stringify({ success: true, wrote: data.length, file }));
```

> Catatan addon:
> - Addon berjalan sebagai **subprocess penuh** — `require('fs')`, `fetch`, internet,
>   semuanya tersedia (tidak seperti sandbox `code` cortex module).
> - `process.env.YUIHIME_USER_DATA_PATH` di-set daemon saat start; fallback ke
>   `~/.yuihime/user_data/`.
> - Output JSON ke stdout → kembali ke LLM sebagai hasil tool.

### 4.2 External Cortex Module — reader + inject

`~/.yuihime/cortexloader/ext_pair_reader.json` (action `shell`, phase `aggregation`):

```json
{
  "id": "ext_pair_reader",
  "name": "Pair Reader",
  "description": "Reads the shared JSON file written by the pair_stats addon.",
  "version": "1.0.0",
  "phase": "aggregation",
  "order": 1,
  "actionType": "shell",
  "actionCode": "cat ~/.yuihime/user_data/pair_shared.json 2>/dev/null || echo NO_DATA"
}
```

`~/.yuihime/cortexloader/ext_pair_inject.json` (action `code`, phase `compression`):

```json
{
  "id": "ext_pair_inject",
  "name": "Pair Inject",
  "description": "Parses pair_shared.json and injects the last record into the prompt.",
  "version": "1.0.0",
  "phase": "compression",
  "order": 1,
  "actionType": "code",
  "actionCode": "const raw = String(context.ext_pair_reader_output || ''); if (raw && raw !== 'NO_DATA') { try { const arr = JSON.parse(raw); const last = arr[arr.length - 1]; context.externalInjection = (context.externalInjection || '') + '\\n[PAIR_STATS] ' + (last ? last.label + '=' + last.value : 'empty'); } catch (e) {} } return context;"
}
```

> Catatan cortex module:
> - Action `shell` punya akses fs penuh (`exec`) — membaca file JSON itu mudah.
>   **Jangan** gunakan `require('fs')` di action `code` — `require` tidak tersedia di
>   daemon bundel.
> - `context.ext_pair_reader_output` berisi stdout shell reader (teks JSON).
> - Modul `code` mem-parse teks → JSON → append ke `externalInjection`.

### 4.3 Verifikasi

```bash
# 1. Addon menulis ke file JSON
curl -X POST http://127.0.0.1:3000/api/addons/execute/pair_stats \
  -H "Content-Type: application/json" \
  -d '{"args":{"label":"coins","value":"42"}}'
# => {"stdout":"{\"success\":true,\"wrote\":1,...}","success":true}

# 2. Cek file hasil
cat ~/.yuihime/user_data/pair_shared.json
# => [ { "label": "coins", "value": "42", "at": "..." } ]

# 3. Trigger pipeline & minta Yui mengutip nilai
curl -X POST http://127.0.0.1:3000/api/cortex/think \
  -H "Content-Type: application/json" \
  -d '{"input":"quote the PAIR_STATS value exactly"}'
# => "...PAIR_STATS... coins=42..." (terbukti masuk prompt)
```

Hasil verifikasi aktual (daemon produksi): LLM menjawab
`"nilai PAIR_STATS kamu itu tepatnya coins=42!"` — rantai
`addon → file JSON → shell reader → code inject → externalInjection → prompt` terbukti.

---

## 5. Arah Sebaliknya: Cortex Module Menulis → Addon Membaca

Cortex module `code` tidak bisa menulis file (tanpa `require`), tapi action `shell`
bisa. Contoh: tiap putaran, shell module menulis status ke file JSON; addon membaca
file itu saat dipanggil LLM.

> ⚠️ **Keterbatasan placeholder shell**: action `shell` mengganti placeholder
> `{{key}}` hanya dari `parameters` (statis, dari definisi JSON) + `input` user —
> **bukan** dari `context` dinamis. Jadi shell module hanya bisa menulis data yang
> bisa didapat shell itu sendiri (timestamp, hasil command, `{{input}}`). Untuk data
> `state`/`context` yang terstruktur, biarkan addon yang menulis (lihat §4).

`~/.yuihime/cortexloader/ext_heartbeat_writer.json` (action `shell`, tiap putaran —
menulis JSON sederhana yang bisa disusun shell):

```json
{
  "id": "ext_heartbeat_writer",
  "name": "Heartbeat Writer",
  "description": "Writes a heartbeat record to a shared JSON file every cycle.",
  "version": "1.0.0",
  "phase": "aggregation",
  "order": 1,
  "actionType": "shell",
  "actionCode": "mkdir -p ~/.yuihime/user_data && printf '{\"at\":\"%s\",\"uptime\":\"%s\"}\\n' \"$(date -u +%FT%TZ)\" \"$(uptime -p 2>/dev/null || echo n/a)\" > ~/.yuihime/user_data/heartbeat.json && cat ~/.yuihime/user_data/heartbeat.json"
}
```

> `printf` jauh lebih aman daripada `echo` untuk JSON berisi kutip: setiap `%s` diganti
> nilai yang sudah di-quote, dan baris JSON tetap valid untuk `JSON.parse`. Contoh di
> atas menghasilkan misalnya `{"at":"2026-08-06T05:00:00Z","uptime":"up 3 days"}`.

Addon membaca file itu (`~/.yuihime/addons/read_status/main.js`):

```js
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = process.env.YUIHIME_USER_DATA_PATH || path.join(os.homedir(), '.yuihime', 'user_data');
const file = path.join(dir, 'heartbeat.json');
let data = {};
try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {}

console.log(JSON.stringify({ success: true, heartbeat: data }));
```

> 🔑 **Aturan praktis**:
> - **Menulis file JSON** → paling mudah lewat **addon** (`require('fs')`, data
>   terstruktur, `JSON.stringify` aman). Action `shell` cortex module bisa menulis
>   hanya data yang shell sanggup susun (tanggal, hasil command, `{{input}}`).
> - **Membaca file JSON** → bebas: addon (`require('fs')`), action `shell` (`cat`),
>   lalu parse di `code`.
> - Action `code` cortex module TIDAK bisa menulis file — `require` tidak tersedia.
> - Selalu `try/catch` parse JSON di kedua sisi — file bisa kosong/korup jika belum
>   pernah ditulis.

---

## 6. Env Injection Addon

Saat addon dieksekusi, daemon menyuntikkan setting dari config.toml ke env dengan pola
`<ID_UPPERCASE>_<KEY_UPPERCASE>`. Contoh: `pair_stats` dengan setting
`max_records = 20` → env `PAIR_STATS_MAX_RECORDS=20`. Ini cara memberi konfigurasi ke
addon tanpa hardcode. (Detail: `src/core/server/routes/systemRouter.ts` — handler
`POST /api/addons/execute/:id`.)

---

## 7. Best Practices

1. **Satu file JSON per pasangan** — nama jelas (`pair_shared.json`,
   `agent_status.json`), versi skema di dalam file bila perlu.
2. **Batas ukuran** — jaga file kecil (mis. `data.slice(-20)`); addon/subprocess dan
   prompt tidak butuh riwayat tak terbatas.
3. **Path absolut** — addon: `path.join(os.homedir(), '.yuihime', 'user_data')` atau
   `process.env.YUIHIME_USER_DATA_PATH`; cortex shell: `~/.yuihime/user_data/` (shell
   meng-expand tilde).
4. **Injeksi hanya yang relevan** — cortex module `code` filter dulu (`if
   (/regex/.test(input))`) sebelum append ke `externalInjection`, supaya prompt tidak
   penuh data tak perlu.
5. **Konsistensi format** — addon menulis JSON rapi (`JSON.stringify(x, null, 2)`);
   reader parse dengan `try/catch`.
6. **`require` tidak tersedia di sandbox `code`** — file/exec lewat action `shell`
   atau addon, bukan `require('fs')` di `code`.

---

## 8. Troubleshooting

| Gejala | Penyebab | Solusi |
|---|---|---|
| Addon "not found" saat execute | Folder belum di `~/.yuihime/addons/` atau `config.toml` rusak | `curl /api/addons`; pastikan `id` + `entry_point` valid; restart daemon |
| Tool `addon-<id>` tidak muncul | `DynamicLoader.syncAddons` belum jalan / `available_tools.json` lama | `curl -X POST /api/addons/resync` atau restart daemon |
| Cortex module tidak membaca file | `cat` gagal (file belum ada / path salah) | Test command shell manual; pastikan `actionCode` pakai `cat ... 2>/dev/null \|\| echo NO_DATA` |
| `externalInjection` tidak ter-render | Modul belum set key / phase sebelum prompt dirakit | Set di phase `aggregation`/`compression`; cek PromptManager `externalInjection` |
| `require is not defined` di `actionCode` | Sandbox `code` tanpa `require` di daemon bundel | Ganti ke action `shell` atau addon |
| JSON parse gagal di reader | File kosong/korup/escaping salah | `try/catch`; tulis via addon (`JSON.stringify`) bukan manual string |

---

## 9. Referensi Kode

- `src/core/CortexModulesLoader.ts` — loader external cortex modules (action
  `code`/`shell`/`webhook`, async wrapper).
- `src/modules/PromptManager.ts` (L870) — render blok `<external_module_injections>`
  dari `context.externalInjection`.
- `src/core/server/routes/systemRouter.ts` — endpoint `/api/addons/*`,
  `/api/cortex-modules/*`, `discoverAddons()`.
- `src/core/DynamicLoader.ts` — `syncAddons()` → registrasi tool `addon-<id>`.
- `src/core/systemPaths.ts` — path root sistem; `onboarding.ts` — resolve
  `YUIHIME_USER_DATA_PATH`.
- `docs/CORTEX_MODULES_EXTERNAL.md` — panduan lengkap external cortex modules.
