# Yuihime Development Standards (STRICT ENFORCEMENT)

Dokumen ini adalah konstitusi teknis Yuihime. Standar ini bersifat universal dan berlaku untuk seluruh pengembangan sistem, baik pada Kernel, Modul, maupun Add-on. Pelanggaran terhadap standar ini akan mengakibatkan kegagalan integrasi sistem (System Integration Failure).

## 1. Arsitektur Terpisah (Layered Architecture - Linux Style)

Sistem Yuihime mengikuti standar hirarki yang terinspirasi dari **Linux FHS (Filesystem Hierarchy Standard)** untuk memisahkan **Core (Initi)** dan **Extension (Tambahan)** secara fisik:

### A. Core Architecture (The Initi Layer)
- **`/src/core/`**: Jantung sistem. Berisi Kernel, Memory Manager, dan Kognisi Dasar (Cortex).
- **`/src/bin/`**: Entry point utama aplikasi dan bootloader sequence.
- **`shared/include/types.ts`** + **`src/types.ts`**: Definisi tipe data global (Typescript Interfaces/Enums).
- **`config.toml`**: Konfigurasi sistem kanonik (dikelola `SettingsManager` via smol-toml + SQLite). `system.config.json` di root repo hanya legacy.

### B. Extension & User Layer (The Additional Layer)
- **`/src/modules/`**: Modul kognitif tambahan (Philosophy, Emotions, Dream Processing).
- **`/src/drivers/`**: Integrasi eksternal (API Clients, Social Adapters seperti Telegram/Discord).
- **`/web/src/`**: Komponen visual dan antarmuka pengguna (Vite React app).
- **`/src/share/`**: Asset statis, Prompt Templates, dan Resource kognitif (JSON models).
- **Addons runtime** (`~/.yuihime/addons/`): Add-on pihak ketiga atau modul eksperimental yang bersifat mandiri.

## 2. Aturan Emas: "Architectural Integrity"
- **CORE STABILITY**: Setiap perubahan pada `/src/core/` wajib melalui validasi ketat.
- **EXTENSION FREEDOM**: Fitur tambahan **WAJIB** diimplementasikan di `/src/modules/` atau `/src/drivers/`.
- **SYSTEM ISOLATION**: Modul di `/src/modules/` tidak boleh memanggil fungsi internal Core secara langsung; gunakan `SystemRegistry` atau `EventBus`.
- Pendaftaran modul harus terjadi secara otomatis via `RegistryInitializer.ts`.

## 2. Larangan Total Hardcoding & Kebijakan "Absolute Zero ENV"
- **ABSOLUTE ZERO ENV POLICY**: Dilarang keras menempatkan parameter apapun (Logika, Interval, Threshold, Behavior, maupun API Keys internal) di dalam file `.env`.
- **SECRET ENCAPSULATION**: `.env` hanya boleh diakses melalui API Proxy server-side dan tidak boleh direferensikan di logika bisnis modul. Seluruh API Key operasional harus bermigrasi ke `config.toml` atau Database Terenkripsi.
- **KERNEL-MANAGED CONFIG**: Semua variabel operasional **WAJIB** disimpan dalam `config.toml` (smol-toml) atau database SQLite yang dikelola oleh `Kernel.getSettings()` / `SettingsManager`.
- **Akses Konfigurasi**: Seluruh bagian sistem harus membaca konfigurasi dari `Kernel.getInstance().getSettings()`, bukan mengimport langsung file JSON atau membaca `process.env` secara liar.
- **Dynamic Updates**: Perubahan konfigurasi harus dapat di-hot-swap tanpa restart kernel jika memungkinkan (via `/api/settings`).

## 3. Penataan Folder (Linux-Style FHS)
Struktur proyek wajib mengikuti hirarki berikut:
- **`/src/core/`**: Kernel, Kognisi Utama (Cortex), Memory Manager.
- **`/src/bin/`**: Skrip eksekusi dan bootstrap.
- **`shared/include/` + `src/types.ts`**: Tipe data, interface, dan konstanta global.
- **`config.toml`**: Konfigurasi kanonik sistem.
- **`/src/modules/`**: Modul kognitif (Philosophy, Emotions).
- **`/src/drivers/`**: Integrasi eksternal (API, Social Connectors).
- **`/web/src/`**: Komponen React dan antarmuka visual.
- **`/src/share/`**: Asset, Prompt Templates, Resource JSON.
- **Addons runtime** (`~/.yuihime/addons/`): Modul tambahan atau eksperimental mandiri.

## 4. Struktur Terdistribusi (Plug-and-Play)
- Komponen dan Add-on harus bersifat *self-contained*.
- Harus bisa dihapus (delete folder/file) tanpa menyebabkan error fatal saat *runtime* (graceful degradation).
- Komunikasi dengan kernel dilakukan melalui `SystemRegistry`, `DynamicLoader`, atau `EventBus`.

## 5. Dokumentasi Perubahan
- Setiap penambahan logika baru wajib menyertakan komentar header yang menjelaskan tujuan dan keterkaitannya dengan siklus kognitif.
- Update `MODULAR_PRD.md` jika ada perubahan pada logika bisnis tingkat tinggi.
- Dokumentasikan setiap "Neural Signal" baru yang didaftarkan ke `EventBus`.
