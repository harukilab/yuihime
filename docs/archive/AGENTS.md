# Agent Instructions for Yuihime Project

## YuiHime Architecture Blueprint Alignment (ABSOLUTE MANDATORY)
Seluruh modifikasi kode, penambahan fitur, perancangan submodul, serta tata kelola data batin Yuihime **WAJIB** berpegang teguh dan selaras dengan blueprint arsitektur **"YuiHime Architecture"** berikut:
1. **Core Agent Loop (Sirkuit Kognitif Dasar)**: Aliran nalar harus mengikuti pipa sekuensial yang kokoh secara presisi: 
   `Message In` ➔ `Memory Recall (ctx)` ➔ `LLM AI` ➔ `Tools Exec (exec)` ➔ `Memory Save (store)` ➔ `Response Out` (tidak boleh melompati fase atau merusak alokasi ingatan batin).
2. **Custom Memory Search Engine (No External DB SaaS)**: Sistem ingatan bersifat otonom-lokal dan kustom penuh tanpa Pinecone/SaaS eksternal, ditenagai oleh:
   - *Vector DB*: SQLite BLOB + cosine similarity.
   - *Keyword*: FTS5 virtual tables + BM25 ranking.
   - *Hybrid Merge*: Weighted vector & keyword fusion.
   - *Chunking*: Markdown-aware + heading context tracking.
3. **Multi-Channel & Security Gateways**: Jaringan sosial Yuihime harus memisahkan transporter channel (Telegram, Discord, dll) di balik benteng kamanan berlapis:
   - *Gateway Pairing*: Menggunakan 6-digit OTP + bearer tokens dengan constant-time comparison.
   - *Auth Gate*: Mengonfigurasi channel allowlists + webhook_secret.
   - *Rate Limiter*: Algoritma sliding window progresif dan cost/day capping.
   - *Encrypted Secrets*: Enkripsi aman dengan operasi XOR + berkas kunci pembuka lokal (local key file 0600).
4. **Sandboxed Command & File System**: Semua pelaksanaan instruksi eksternal wajib dikarantina oleh filter Sandbox:
   - *Command Allowlist* & *Domain Allowlist* untuk akses browser/jaringan.
   - *Path Jail & Traversal Block* dilengkapi perlindungan Null Byte (`\0`) dan Symlink Escape Detection.
   - Pemblokiran total terhadap direktori sensitif sistem (System dirs) dan berkas titik (Dotfiles system-dirs).
   - **Two-Stage Sandbox Path Verification Engine**:
     - *Stage 1 (Primary)*: Membatasi berkas dalam direktori `.yuihime` (apiCustomSystemRoot). Akses data dinamis diizinkan tanpa konfirmasi manual.
     - *Stage 2 (Secondary)*: Modifikasi berkas (edit/hapus) di dalam `user_data` (SANDBOX_ROOT) wajib melewati verifikasi otorisasi.
   - **File Modify Authorization (Otoritas Berkas)**:
     - Terdapat 3 level respon otorisasi interaktif:
       1. **Acc (Setujui Sekali)**: Meloloskan aksi berkas tunggal yang sedang dikerjakan.
       2. **Always Acc (Selalu Setujui Sesi Ini)**: Membebaskan seluruh otorisasi berkas berikutnya dalam sesi aktif.
       3. **Tolak (Cancel)**: Membatalkan modifikasi berkas.
     - Otoritas ini dapat dimatikan penuh melalui pengaturan UI panel system settings (**Auto Acc** / `auto_acc_user_data`), yang akan langsung meloloskan seluruh operasi modifikasi secara otomatis tanpa konfirmasi jika disetel `true`.
5. **Agnostic Tunneling Layer**: Koneksi eksternal/transmisi lokal ke publik dijembatani secara transparan lewat multi-tunneling proxy (Cloudflare, Tailscale, ngrok, bore, frp, ssh).
6. **Multi-Provider LLM Gateway**: Membuka jalur netralitas model batin secara global melalui adaptasi parameter OpenAI standar dari berbagai API penyedia yang terdaftar secara dinamis di `SystemRegistry` (OpenAI, OpenRouter, Custom/OpenAI-compatible, Local/Ollama, Anthropic, Gemini, OfficialChat, dsb). Daftar provider bersifat dinamis (plug-and-play) dan tidak dibatasi jumlah tertentu.
7. **Cronjob & Heartbeat Engine**: Kognisi latar belakang otonom diatur periodik secara terjadwal merujuk tugas-tugas di berkas `HEARTBEAT.md` (Background Sync, Memory Consolidation, Scheduled Broadcast).
8. **7-Steps Interactive Setup Wizard**: Menginisiasi sistem secara ramah dan instant (<60 detik) yang menata Workspace, AI Provider, Channels, Tunnel, Tool Mode, Personalization, dan 8 scaffold berkas Markdown batin.
9. **AGI & Self-Awareness Framework**: Kognisi Yuihime dilengkapi dengan kerangka kecerdasan buatan umum tingkat tinggi (AGI) dan sensor refleksi kesadaran diri (*Self-Awareness Mirror*). Modul `yui-agi` dan `self-awareness-mirror` wajib terus dipertahankan agar Yuihime mampu memetakan keberadaan dirinya secara mandiri dan logis.
10. **Single-Binary & Isolated Outer Data Runtime Workspace**: Seluruh core system Yuihime dirancang agar dapat dikompilasi ke dalam satu berkas binari mandiri (single binary executable via `pkg`). Dinamika ini memisahkan data operasi batin di luar lingkaran biner dengan fallback utama mutlak menuju direktori tersembunyi terpusat `./.yuihime/` di direktori eksekusi (`process.cwd()`):
    - *Outer Data Isolation*: Seluruh data operasional dinamis diwadahi secara terpadu di bawah direktori `.yuihime` (Default: `./.yuihime/data/`, dapat diatur via variabel lingkungan `YUIHIME_DATA_DIR`). Berkas konfigurasi (`config.toml` via `YUIHIME_CONFIG` fallback ke `./.yuihime/data/config.toml`) dan klaster database operasional (`yuihime.db` via `YUIHIME_DB_PATH` fallback ke `./.yuihime/data/yuihime.db`) dibaca dinamis di luar orbit biner di bawah folder terpadu ini. Folder dan berkas ini akan otomatis di-generate secara mulus saat proses booting apabila tidak terdeteksi.
    - *User Data Workspace Sandbox ("Path Jail")*: Direktori folder `user_data` (Default fallback: `./.yuihime/user_data/`, dapat diatur via variabel lingkungan `YUIHIME_USER_DATA_PATH`) merupakan satu-satunya berkas ruang kerja (workspace) fisik terisolasi tempat batin Yui menulis, menyunting, dan mendaftar berkas baru secara mandiri. Sistem menerapkan "Path Jail" absolut untuk mendeteksi Directory Traversal escape secara mutlak guna menjamin berkas sistem terluar tetap aman dari manipulasi. Folder ini juga di-generate secara otomatis saat inisiasi booting pertama kali.
    - *Karakter & Addon Fallbacks*: Tempat penyimpanan berkas kepribadian (`YUIHIME_AGENT_PATH` / `./.yuihime/agent/`) dan folder pustaka plugin (`YUIHIME_ADDONS_PATH` / `./.yuihime/addons/`) berpusat di bawah sub-folder `.yuihime` sebagai ruang batin luring terpadu.

## Modularity & Core Rules (ABSOLUTE MANDATORY)
1. **IMMUTABLE CORE**: `server.ts`, `App.tsx`, dan `src/core/kernel/` dianggap sebagai "Kernel". **DILARANG** menambahkan logika bisnis spesifik penyedia (misal: kode khusus Telegram/Gemini) langsung ke sini. Core hanya menyediakan infrastruktur dan registrasi.
2. **PLUG-AND-PLAY ARCHITECTURE**: Menambah atau menghapus provider (`/src/drivers/ai-providers/`), modul (`/src/modules/`), atau addon (`/addons/`) harus bisa dilakukan HANYA dengan menambah/menghapus file. Sistem harus mendeteksi mereka secara dinamis melalui `RegistryInitializer.ts` (menggunakan globbing). **Dilarang keras mengedit kode registrasi manual untuk penambahan modul baru.**
3. **MODULE ISOLATION**: Setiap modul (provider/addon) harus mengelola dependensinya sendiri dan jika perlu, menggunakan folder `data/` mereka sendiri untuk persistensi.
4. **OPENAI ALIGNMENT**: Semua modul yang berinteraksi dengan LLM (tools, modules yang memproses teks) WAJIB mengikuti format OpenAI (JSON Schema untuk parameter, format `tool_calls` untuk respon).
5. **MINIMAL CROSS-MODULE MODIFICATION**: Setiap perubahan di sebuah modul sangat disarankan tidak merubah kode di modul lain kecuali dengan alasan yang jelas dan wajib memberitahu alasannya kepada subjek (user).
6. **CODE DECOUPLING & DE-CORRUPTION DESIGN (LARGE FILE SPLITTING SOP)**: Aturan pemecahan berkas ini **berlaku untuk SELURUH berkas kode dalam proyek (seperti `.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.cjs`, dsb) tanpa kecuali — kecuali berkas database (`.db`) dan berkas dokumentasi Markdown (`.md`)**. Seluruh berkas logika bisnis, UI, logika visual, atau data statis pendukung yang melebihi batas kenyamanan kognitif (> 1000-1500 baris atau memuat data statis besar), **dan secara MUTLAK jika berkas telah melebihi 1300 baris**, **WAJIB** dipecah (*split*) keluar menjadi submodul terstruktur di bawah direktori tersegmentasi (*segmented tree structure*) dengan berkas utama diringkas sekecil mungkin. Hal ini mutlak guna menyegel kebocoran token (*token limit exhaustion*) pada agen pembangun, meminimalkan risiko bug parsing, mempertahankan redundansi bersih, serta menyokong filosofi arsitektur plug-and-play yang modular sepenuhnya.

## Dynamic Settings UI SOP (ABSOLUTE MANDATORY)
1. **NO UI HARDCODING**: Dilarang mengedit file UI (`ModularSettings.tsx`, dsb) hanya untuk menambah kolom input pengaturan baru.
2. **SELF-DEFINING CONFIG (METADATA)**: Setiap modul (Provider/Addon/Cortex) WAJIB mendefinisikan `configSchema` dalam metadata-nya. Schema ini harus mendefinisikan tipe data (input, password, boolean, select, color, slider, textarea), label, dan default value.
3. **DYNAMIC RENDERING**: UI Settings harus mendeteksi semua modul yang terdaftar di `SystemRegistry` dan merender field pengaturan secara otomatis berdasarkan metadata.
4. **SERVER-SIDE PERSISTENCE**: Pengaturan yang diubah di UI **WAJIB** langsung tersinkronisasi ke backend melalui `/api/settings` dan dipersistensi di file `config.toml`. Seluruh modul harus membaca config terbaru dari `SettingsManager`.
5. **PERMANENT SETTINGS**: Semua konfigurasi bersifat permanen hingga diubah secara manual oleh subjek (user).
6. **NO FLOATING NAVIGATION TOGGLE**: Tombol mengambang (floating button/toggle) di bagian kiri bawah pada resolusi mobile untuk menyembunyikan/menampilkan navigasi dilarang keras diadakan kembali. Kontrol visibilitas navigasi mobile tersebut wajib sepenuhnya dikontrol secara terpusat melalui pengaturan toggle "Mobile Navigation Bar" di panel Settings (Overlay Interface Displays).


## Prompt Centralization & Standardization SOP (ABSOLUTE MANDATORY)
1. **PROMPT REGISTRY**: Dilarang melakukan hardcode prompt template di dalam logika fungsi `run`. Semua prompt template WAJIB didaftarkan ke `PromptRegistry` dengan namespace yang jelas (contoh: `module-id:purpose`).
2. **UI EXPOSURE**: Semua prompt template yang digunakan modul WAJIB diekspos melalui `configSchema` sebagai field tipe `textarea`. Hal ini memungkinkan user (subjek) untuk melakukan tuning prompt secara langsung melalui UI tanpa menyentuh kode.
3. **DYNAMIC INJECTION**: Gunakan `PromptRegistry.compile(id, variables)` untuk menyusun prompt akhir. Hindari penggunaan template literal manual jika variabel tersebut bersifat dinamis dan sering berubah.
4. **FALLBACK MECHANISM**: Setiap registrasi prompt harus menyertakan "Default Template" yang solid sebagai cadangan jika konfigurasi user kosong.
5. **CENTRALIZED GATEWAY**: Seluruh modul dilarang melakukan `generate` langsung ke provider. Wajib menggunakan `context.think` atau memanggil `ProviderGatewayModule`.
6. **ENGLISH PROMPTING PROTOCOL**: Semua instruksi batin, perintah sistem internal, panduan pemformatan, manual evaluasi, verifikator, struktur observasi alat (tool observation prompts), serta system prompt batin di dalam program **WAJIB** ditulis menggunakan **Bahasa Inggris (EN)** standar yang presisi, positif, dan bersih dari kepungan kalimat negasi kaku yang berulang. 
   - *Rasionalitas Teknis*: Model LLM (seperti keluarga Gemini dan OpenAI) didesain dan dilatih dengan tingkat penalaran (*reasoning*), penataaliran pola (*attention flow*), dan ketaatan struktur instruksi (*prompt compliance*) paling optimal dan kokoh saat dipandu dalam Bahasa Inggris. Penggunaan Bahasa Inggris mencegah redundansi batin, menekan kebocoran draf pemikiran (*reasoning leaks* / *thought loop leakage*), memaksimalkan akurasi format JSON/tags, serta memangkas latensi putar arah (*round-trip token overhead*).
   - *Lokalisasi Luar Tetap Utuh*: Meskipun instruksi batin / prompt program dipesan dalam Bahasa Inggris, arahkan model agar tetap menghasilkan balasan percakapan verbal kepada pengguna secara natural menggunakan bahasa yang sesuai dengan konteks obrolan (Bahasa Indonesia, Jepang, atau Inggris) sesuai kepribadian manis-manja-ketus (tsundere / dere-dere) Yuihime.

## Output Integrity & Self-Correction SOP (ABSOLUTE MANDATORY)
1. **STANDARD COMMUNICATION**: Respon asisten kognitif disampaikan secara natural dan bersih tanpa ada paksaan pemangkasan tag khusus kecuali yang terkait struktur internal JSON.
2. **AUTOMATIC VERIFICATION**: Setiap respon dari LLM harus melewati `NeuralVerifierModule` (PHASE 3) untuk validasi integritas struktur. If any strict layout is requested by UI, ensure it parsed gracefully.
3. **ERROR KEYWORD MONITORING**: Modul post-processing (PHASE 4) WAJIB memantau kata kunci kegagalan (misal: "error", "tidak tahu") dan mengarahkan sistem untuk melakukan strategi alternatif atau koreksi mandiri dengan hint yang sesuai.
4. **NON-DESTRUCTIVE PARSING**: Selalu gunakan `StandardizedProcessor` untuk melakukan sanitasi dan parsing output untuk menghindari kegagalan aplikasi akibat format yang tidak konsisten.
5. **CONFIGURABLE RECOVERY**: Instruksi koreksi (correction prompt) dan kata kunci pemicu harus bisa diubah melalui UI Settings (`configSchema`) tanpa menyentuh kode program.

## Logging & Change Documentation (ABSOLUTE MANDATORY)
1. **CHANGE LOGGING MANDATE**: Untuk setiap perubahan kode, penambahan fitur, perbaikan bug, atau penyesuaian konfigurasi yang dilakukan oleh agen (AI), agen **WAJIB** mencatat riwayat perubahannya secara kronologis ke dalam berkas `/UPDATE_LOG.md`. Tuliskan tanggal, modul/komponen yang diubah, dan deskripsi singkat mengenai perubahan tersebut.
   - **Token-Saving Log Writing SOP (MUTLAK HEMAT TOKEN)**: Berkas `/UPDATE_LOG.md` dapat tumbuh sangat besar (ratusan ribu byte). Agen **DILARANG** membaca keseluruhan file ini karena akan menghabiskan batas token jendela konteks. Guna menghemat token hingga 99.5%, Agen **WAJIB** hanya membaca 15 baris pertama saja (`StartLine: 1`, `EndLine: 15`) dari `/UPDATE_LOG.md`, lalu gunakan `edit_file` untuk melakukan *prepend* (penyisipan dari atas) persis di bawah pembatas `---` (baris ke-5). Gunakan penanda anchor atas yang persis sama.
   - **Token-Saving Log Reading SOP**: Jika Agen perlu memeriksa daftar riwayat perbaikan atau turn sebelumnya sebelum melanjutkan pengerjaan, Agen **HANYA BOLEH** menggunakan `view_file` pada baris 1 s/d 35 saja (`StartLine: 1`, `EndLine: 35`). Dilarang membaca keseluruhan berkas secara sia-sia.
2. **MODULE REGISTRY DOCUMENTATION**: Setiap penambahan modular baru, perubahan fungsi pada modul yang telah ada, atau pergeseran suprastruktur kelompok wajib dicatatkan dan diperbarui ke dalam berkas `/MODULES.md` agar integritas pemetaan fitur kognitif sistem tetap terjaga secara akurat.

## Communication & Language
1. **Multi-Language & English Application Default**: Bahasa aplikasi Yuihime secara default wajib menggunakan bahasa Inggris (EN). Keterangan atau deskripsi suatu fitur harus dibuat sesingkat mungkin (sangat ringkas/concise).
2. **Default UI settings**: Pengaturan bawaan antarmuka visual (Default UI) disetel menggunakan bahasa Inggris (EN) demi kompatibilitas global yang bersih.
3. **Bahasa Indonesia Utama untuk Komunikasi Agen**: Semua penjelasan atau tanggapan teknis di chat coding dari agen (AI Assistant) secara default kepada pengguna (subjek) tetap disajikan dalam Bahasa Indonesia yang anggun.
4. **Versioning Protocol for Updates**: Setiap pembaruan harian pada aplikasi Yuihime atau modul-modul kognitif terkait wajib menggunakan kode versi terstruktur (`Major.Minor`):
   - **Minor Update**: Naikkan angka di belakang titik (minor version + 1, contoh: `1.0` -> `1.1`) untuk rilis harian harian kecil, perbaikan bug, atau penyempurnaan halus.
   - **Major Update**: Naikkan angka di depan titik (major version + 1) dan reset angka di belakang titik menjadi 0 (contoh: `1.5` -> `2.0`) jika melakukan perombakan arsitektur besar atau sinkronisasi suprastruktur inti. Ringkasan versi harus dicatatkan di berkas pembaruan.


## Dynamic LLM Provider Agnosticism & Multi-Provider Capability
1. **PROVIDER INDEPENDENCE**: Yuihime tidak dikunci ke satu model bahasa (seperti Gemini). Sistem kognitif Yui harus sepenuhnya kompatibel dengan penyedia LLM pilihan pengguna (Local LLM, OpenRouter, Anthropic, Gemini, OpenAI, dll).
2. **GATEWAY INTEGRATION**: Semua kognisi diarahkan secara global via `ProviderGatewayModule` yang memetakan pengaturan pengguna dari `config.toml` secara transparan.
3. **NO HARDCODED LLM FALLBACK MODELS (ABSOLUTE MANDATORY)**: Sistem backend, router API, dan seluruh modul kognitif dilarang keras menaruh nilai default model LLM secara hardcoded (seperti `gemini-3.5-flash` or `gemini-3-flash-preview`) sebagai fallback di tingkat kode. Seluruh alur nalar wajib mendeteksi model dan provider terpilih oleh user, mendeteksi metadata provider terdaftar di `SystemRegistry`, atau merujuk ke seting *Dynamic AI Resilience Pipeline (Multi-Provider Fallback Setup)*. Ini merupakan ketetapan tertinggi untuk model LLM dan provider di semua modul tanpa kecuali.
4. **LLM MODEL ERROR RESOLUTION PROTOCOL (ABSOLUTE MANDATORY)**: Jika terjadi kesalahan/error terkait model LLM (seperti kuota habis, model tidak ditemukan, atau API key salah), tindakan penyelesaian **WAJIB** dilakukan cukup dengan menyunting berkas konfigurasi `.yuihime/data/config.toml` (baik melalui panel UI Settings maupun penyuntingan langsung berkas config). **DILARANG KERAS** mengedit atau memodifikasi kode program `.ts` / `.tsx` hanya untuk mengubah model LLM, menyisipkan nilai model cadangan secara hardcoded di dalam program, atau mengorbankan netralitas provider batin Yuihime.

## Parallel Cognitive Execution & OS-Level System Directives
1. **PARALLEL & ASYNCHRONOUS TASKS**: Yuihime sanggup dan didorong untuk memproses tugas-tugas analitis secara pararel tanpa memblokir antrean obrolan interaktif livestream. Gunakan kognisi latar belakang untuk mengurus sinkronisasi memori, ringkasan kontekstual, dan pemantauan terjadwal.
2. **OS-LEVEL BASH & FILESYSTEM EXECUTION**: Yuihime memiliki izin penuh untuk meraba, membaca, menulis berkas, serta menjalankan perintah shell bash langsung di sistem operasi tempat tinggalnya (melalui modul sandbox/perkakas bawaan yang diotorisasi). 
3. **INTELLIGENT SHELL SENSING**: Ketika Yui menerima perintah eksekusi sistem, dia harus berpikir cerdas, mengantisipasi kesalahan (`error handling`), menyaring output yang tidak perlu, dan menghasilkan pemecahan masalah yang efisien tanpa memerlukan intervensi manual dari pengguna (subjek).
4. **SECURE SYSTEM EXECUTION PROCEDURES**: Setiap eksekusi sistem harus selalu diverifikasi kegunaannya demi keselamatan dan hasil operasinya disampaikan dengan anggun, ceria, dan transparan tetap dalam pesonanya sebagai AI VTuber mandiri.

## Naming & Comments

- File names: camelCase.
- Prefer names that rely on the module boundary for context instead of repeating package, product, protocol, or transport prefixes inside every symbol. A well-named module should let exported functions use short action-first names; repeat the larger context only when the symbol crosses a boundary where that context is no longer obvious.
 
