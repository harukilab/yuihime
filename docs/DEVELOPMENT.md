# Framework Development & Architecture

Yuihime AI v4 mengikuti desain **Event-Driven Micro-Kernel**. Arsitektur ini memastikan agen tetap responsif meskipun sedang melakukan tugas berat (asinkron non-blocking).

## 🏙️ Citra Arsitektur (Lattice)

### 1. @yui/kernel (The Core Engine)
Pusat kendali yang mengelola status dan aliran data sistem.
- **Event Bus**: Hub komunikasi asinkron (`USER_INPUT_RECEIVED`, `PLUGIN_INSTALLED`).
- **State Machine**: Pengelola status agen (`IDLE`, `THINKING`, `EXECUTING`).
- **Logger**: Pencatatan terpusat dengan level log (NEURAL, TOOL, INFO).
- **Validator**: Penjaga pintu neural menggunakan Zod untuk validasi IO.

### 2. @yui/cognition (The Mind)
Lapisan kognitif tempat "penalaran" terjadi.
- **Cortex**: ReAct engine yang menjalankan loop berpikir.
- **Soul**: Engine emosi dan mood yang memengaruhi gaya bicara.
- **Memory**: Jembatan ke SQLite untuk LTM dan STM.
- **Dynamic Loader**: Penanggung jawab pemuatan plugin/addons secara runtime.

### 3. @yui/tools (The Arms)
Antarmuka untuk melakukan aksi ke dunia luar.
- **Tool Registry**: Daftar manifes alat yang tersedia untuk LLM.
- **Executor**: Komponen yang menjalankan kode bash, python, atau javascript.

## 🔄 Alur Berpikir (Reasoning Cycle)

1.  **Ingesti**: Input diterima via Event Bus -> Status jadi `THINKING`.
2.  **Context Assembly**: Cortex menarik memori, lore, dan manifes alat.
3.  **Neural Sync**: LLM menganalisis konteks dan menghasilkan JSON terstruktur.
4.  **Validation**: Validator memastikan output aman dan lengkap.
5.  **Action**: Jika butuh alat -> Status jadi `EXECUTING`.
6.  **Observation**: Hasil eksekusi dikembalikan ke Cortex (Loop kembali ke langkah 3).
7.  **Output**: Final answer dikirim -> Status jadi `IDLE`.

## 🛠️ Menambah Modul Internal

Jika ingin menambah modul yang berjalan di dalam Cortex:
1. Buat file di `src/lib/agent/modules/`.
2. Gunakan interface `CortexModule`.
3. Registrasikan di `RegistryInitializer.ts`.

## 📦 Menambah Plugin Eksternal (Addons)

Addons lebih fleksibel karena bisa ditulis di berbagai bahasa dan diinstal saat aplikasi berjalan.
1. Gunakan folder `/addons/<nama-plugin>`.
2. Wajib ada `config.toml` dan entry point (`main.js`, `main.py`, atau `main.sh`).
3. LLM bisa menginstalnya secara otomatis menggunakan `PluginInstaller`.
