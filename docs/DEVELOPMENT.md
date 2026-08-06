# Framework Development & Architecture

Yuihime AI v4 mengikuti desain **Event-Driven Micro-Kernel**. Arsitektur ini memastikan agen tetap responsif meskipun sedang melakukan tugas berat (asinkron non-blocking).

## 🏙️ Citra Arsitektur (Lattice)

Yuihime is a single npm package (`yuihime`) laid out as `src/` (daemon), `shared/` (cross-boundary layer), and `web/` (Vite React UI).

### 1. Kernel (`src/core/kernel/` · The Core Engine)
Pusat kendali yang mengelola status dan aliran data sistem.
- **Event Bus**: Hub komunikasi asinkron (`@shared/core/kernel/event-bus`).
- **State Machine**: Pengelola status agen (`IDLE`, `THINKING`, `EXECUTING`).
- **Logger**: Pencatatan terpusat dengan level log (`@shared/core/kernel/logger.ts`).
- **Validator**: `ValidationMiddleware` (regex/JSON dengan `jsonRepairer`; **tidak memakai Zod**, nonaktif secara default).

### 2. Cognition (`src/core/cortex/` · The Mind)
Lapisan kognitif tempat "penalaran" terjadi.
- **Cortex**: `cortexThinkEngine.ts` — engine berpikir ReAct 6 fase (`aggregation → soul → compression → reflect → finalize → logic`).
- **Soul**: Engine emosi dan mood di `shared/core/soul.ts` yang memengaruhi gaya bicara.
- **Memory**: Jembatan ke SQLite untuk LTM dan STM.
- **Dynamic Loader**: `src/core/DynamicLoader.ts` — penanggung jawab pemuatan plugin/addons secara runtime.

### 3. Tools (`src/drivers/tools/` · The Arms)
Antarmuka untuk melakukan aksi ke dunia luar.
- **Tool Registry**: `src/core/toolRegistryFile.ts` — manifes alat tersedia untuk LLM (dihasilkan ke `~/.yuihime/data/available_tools.json`).
- **Executor**: Komponen yang menjalankan kode bash, python, atau javascript.

## 🔄 Alur Berpikir (Reasoning Cycle)

1.  **Ingesti**: Input diterima via Event Bus -> Status jadi `THINKING`.
2.  **Context Assembly**: Cortex menarik memori, lore, dan manifes alat.
3.  **Neural Sync**: LLM menganalisis konteks dan menghasilkan JSON terstruktur (`thought` / `speech` / `tool_calls`).
4.  **Validation**: Validator memastikan output aman dan lengkap.
5.  **Action**: Jika butuh alat -> Status jadi `EXECUTING`.
6.  **Observation**: Hasil eksekusi dikembalikan ke Cortex (Loop kembali ke langkah 3).
7.  **Output**: Final answer dikirim -> Status jadi `IDLE`.

## 🛠️ Menambah Modul Internal

Jika ingin menambah modul yang berjalan di dalam Cortex:
1. Buat file di `src/modules/` (atau `src/drivers/ai-providers/`, `src/drivers/tools/` untuk jenis lain).
2. Export objek `metadata` (id, type, name, description, phase, configSchema) + implementasi `run()` / driver.
3. Tidak perlu registrasi manual — modul auto-register via `RegistryInitializer.ts` (Vite glob di browser, filesystem scan di Node). **Jangan pernah mengedit registrasi manual.**

## 📦 Menambah Plugin Eksternal (Addons)

Addons lebih fleksibel karena bisa ditulis di berbagai bahasa dan diinstal saat aplikasi berjalan.
1. Gunakan folder addons runtime (default `~/.yuihime/addons/`, override via `--addons` / `YUIHIME_ADDONS_PATH`).
2. Wajib ada `config.toml` dan entry point (`main.js`, `main.py`, atau `main.sh`).
3. LLM bisa menginstalnya secara otomatis menggunakan `PluginInstallerTool` (`plugin_installer.js`), dikelola oleh `PluginManager`.
