# Agent Instructions — YuiHime

Panduan ringkas untuk agen yang mengembangkan YuiHime. Semua aturan bersifat **MANDATORY** dan wajib selaras dengan arsitektur standar di bawah.

## 1. Core Architecture

- **Cognitive Loop**: `Message In` → `Memory Recall` → `LLM` → `Tools Exec` → `Memory Save` → `Response Out`. Jangan melewati fase.
- **Memory Engine (lokal, no SaaS)**: SQLite BLOB + cosine (vector), FTS5 + BM25 (keyword), hybrid fusion, markdown-aware chunking.
- **Channels & Security**: OTP 6-digit + bearer token (constant-time), allowlist + webhook_secret, sliding-window rate limit, encrypted secrets (XOR + keyfile 0600).
- **Sandbox**: command/domain allowlist, path jail + traversal/null-byte/symlink block. Stage 1 = `.yuihime` (read dinamis bebas), Stage 2 = `user_data` (edit/hapus butuh otorisasi, kecuali `auto_acc_user_data=true`).
- **LLM Gateway**: multi-provider dinamis via `SystemRegistry` (OpenAI, OpenRouter, Anthropic, Gemini, Ollama, dll), format OpenAI standar.
- **Background**: Cronjob/Heartbeat mengikuti `docs/HEARTBEAT.md`; parallel cognition tidak boleh memblokir chat.
- **Runtime**: single-binary (`pkg`) dengan data operasional terpisah di direktori `.yuihime`.

## 2. Modularity Rules

- **Immutable Core**: `server.ts`, `App.tsx`, `src/core/kernel/` hanya infrastruktur — jangan taruh logika provider spesifik.
- **Plug-and-Play**: tambah/hapus provider, module, atau addon cukup dengan menambah/menghapus file. Registrasi otomatis via `RegistryInitializer.ts` (globbing) — dilarang edit registrasi manual.
- **Isolation**: tiap modul kelola dependensi & folder `data/`-nya sendiri.
- **Minimal cross-module edit**: jangan ubah modul lain tanpa alasan jelas; beri tahu user jika perlu.
- **File Splitting SOP**: semua file kode (`.ts/.tsx/.js/.py/...`, kecuali `.db` & `.md`) yang **> 1300 baris WAJIB** dipecah jadi submodul terstruktur, file utama diringkas.

## 3. Dynamic Settings & Prompts

- **No UI hardcoding**: jangan edit `ModularSettings.tsx` untuk menambah field. Tiap modul definisikan `configSchema` (tipe, label, default) → UI render otomatis.
- **Persistence**: perubahan UI sync ke `/api/settings` → `config.toml`, dibaca via `SettingsManager`. Setting bersifat permanen.
- **Prompt Registry**: dilarang hardcode prompt di `run`. Daftarkan ke `PromptRegistry` (`module-id:purpose`), expose sebagai `textarea`, gunakan `PromptRegistry.compile()`, selalu sertakan default fallback.
- **Centralized gateway**: modul dilarang `generate` langsung — pakai `context.think` / `ProviderGatewayModule`.
- **English prompting**: semua prompt/instruksi internal ditulis dalam Bahasa Inggris presisi. Balasan verbal ke user tetap mengikuti bahasa konteks (ID/JP/EN) sesuai persona tsundere Yui.

## 4. Output Integrity

- Respon natural & bersih; verifikasi via `NeuralVerifierModule`.
- Post-processing pantau keyword gagal ("error", dll) → koreksi mandiri.
- Selalu pakai `StandardizedProcessor` untuk parsing non-destruktif.
- Correction prompt & keyword dapat diatur via `configSchema`.

## 5. LLM Provider Agnostic

- Tidak dikunci ke satu model; semua kognisi via `ProviderGatewayModule` membaca `config.toml`.
- **No hardcoded fallback model** — deteksi model/provider terpilih dari `SystemRegistry` / Multi-Provider Fallback.
- **Error model LLM** (kuota/model/API key) diselesaikan dengan mengedit `.yuihime/data/config.toml`, **bukan** kode `.ts/.tsx`.

## 6. Logging & Docs

- **UPDATE_LOG.md**: catat tiap perubahan (tanggal, modul, deskripsi). Hemat token: baca hanya baris 1–15, prepend di bawah `---` (baris 5). Untuk review baca maks baris 1–35.
- **MODULES.md**: perbarui saat menambah/mengubah modul.

## 7. Communication & Versioning

- Default bahasa aplikasi & UI: **English**, deskripsi fitur seringkas mungkin.
- Balasan agen ke user (chat coding): **Bahasa Indonesia** yang anggun.
- Versioning `Major.Minor`: minor untuk bugfix/harian, major untuk perombakan arsitektur (reset minor ke 0).

## 8. Naming

- File: camelCase.
- Nama simbol andalkan konteks modul; hindari prefix produk/protokol berulang, kecuali saat melintasi boundary.

## 9. Data Directory

- Data operasional YuiHime (config, db, agent, addons, user_data, models) berada di **`/home/userland/.yuihime`** (bukan `./.yuihime` di dalam project).
