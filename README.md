# 👑 Yuihime AI v4.7 - Autonomous VTuber Engine (Airi OS Core v2.39)

Selamat datang di **Yuihime AI**! Koleksi engine agen AI otonom yang ramah pengguna, berdaya kognitif otonom, dan didesain khusus agar mudah dijalankan oleh siapa saja—**bahkan tanpa perlu menginstal Node.js atau memahami pemrograman sama sekali!**

Yuihime v4 kini hadir dengan format **Arsitektur Portabel Satu Berkas (Single Binary)**. Begitu dijalankan, Yuihime akan mengatur seluruh ekosistemnya secara otomatis di samping berkas program tersebut.

---

## ✨ Fitur Ramah Pemula & Portabilitas Tinggi

1. **🚀 Zero Setup Onboarding**: Cukup jalankan biner/program ini. Jika berkas konfigurasi, data kepribadian, atau database belum ada, Yuihime akan langsung membuatkan template bawaan bahasa Indonesia yang siap pakai di folder yang sama!
2. **📟 Setup CLI Interaktif (Onboarding Proaktif)**: Saat dijalankan pertama kali di terminal interaktif (TTY), Yuihime akan menawarkan panduan step-by-step untuk mengonfigurasi `GEMINI_API_KEY`, Bot Telegram, dan API ElevenLabs secara langsung tanpa perlu membuka Notepad/teks editor!
3. **📁 Lokasi Berkas di Luar Binary (Sedamping Berkas Bin)**: Semua data penting diletakkan di luar biner agar kamu bisa mengedit kepribadian, menambah plugin, atau mengamankan database dengan mudah:
   - `config.toml` (Konfigurasi API Key & Token Telegram)
   - `yuihime.db` (Database memori jangka panjang)
   - `agent/` (Folder berisi berkas teks kepribadian karakter)
   - `addons/` (Folder kustomisasi plugin/skill)
4. **⚙️ Kontrol Fleksibel CLI & Env**: Pengguna mahir dapat memindahkan letak folder data ke mana saja secara fleksibel menggunakan argumen perintah (CLI) atau variabel lingkungan.
5. **🔌 Kompatibel Arsitektur Skill Addon**: Selain format bawaan, Yuihime sekarang mendukung penuh plugin berbasis arsitektur **Universal Skill** (mendukung `skill.json`, `manifest.json`, serta runtime Python, Node.js, atau Bash Script secara dinamis).

---

## 🏎️ Cara Memulai (Sangat Mudah untuk Pemula)

### Jalur Praktis: Menggunakan Biner Tunggal (Tanpa Node.js)
1. Unduh berkas eksekutif Yuihime yang sesuai dengan sistem operasimu dari folder `/bin/` (`yuihime-core-linux`, dll).
2. Letakkan berkas tersebut di sebuah folder khusus, misalnya `C:\Yuihime\` atau `/home/user/yuihime/`.
3. Jalankan aplikasi melalui terminal/command prompt:
   - **Linux/macOS**:
     ```bash
     chmod +x yuihime-core-linux
     ./yuihime-core-linux
     ```
   - **Windows**: Jalankan `yuihime-core-win.exe` langsung atau lewat CMD.
4. **Onboarding Otomatis** akan berjalan di layar mendeteksi berkas kosong, lalu Yuihime akan membuat file di samping biner tersebut.
5. Buka peramban (browser) di alamat: **`http://localhost:3000`** untuk berinteraksi dengan visual VTuber Yuihime!

---

## 🎨 Menyesuaikan Kepribadian Karaktermu (Onboard Mudah)

Yuihime akan membaca kepribadiannya dari file teks luar biasa sederhana di dalam folder `agent/` yang terbuat di samping program Anda:

- **`agent/character.md`**: Tempat kamu menulis sifat, gaya bicara, nama panggilan, sapaan favorit, dan emosi dasar karakter VTuber-mu.
- **`agent/lore.md`**: Berisi latar belakang cerita, pengetahuan dunia, hobi, dan memori dasar yang dipercayai oleh karaktermu.
- **`agent/system_prompt.md`**: Instruksi teknis kognisi (untuk memastikan Yuihime selalu membalas dengan format yang aman dan sesuai).

> **💡 Tips Pemula**: Cukup buka file `agent/character.md` menggunakan Notepad/VS Code sekali, ubah deskripsinya sesukamu (misalnya ubah nama menjadi Vtuber lain), lalu simpan. Restart Yuihime, dan kepribadiannya akan langsung berubah!

---

## 🔌 Memasang Skill Tambahan (Arsitektur Universal Addon)

Yuihime v4 memiliki kemampuan dinamis untuk memuat plugin kustom dari folder `addons/`. Format yang didukung meliputi:

1. **Format Bawaan Yuihime**: Modul dinamis yang memuat berkas konfigurasi `config.toml` dan `index.ts`/`main.js`.
2. **Format Universal Skill (JSON/Manifest)**:
   - Cukup buat folder baru di dalam `addons/` (contoh: `addons/cek-cuaca/`).
   - Letakkan berkas metadata berupa **`skill.json`** atau **`manifest.json`** yang mendefinisikan nama tool, deskripsi, dan skema parameter JSON OpenAI.
   - Letakkan kode program pembantu utama seperti `main.py`, `main.js`, `run.sh`, `main.sh`, atau `index.js`.
   - Yuihime akan menguraikan spesifikasi tersebut secara pintar, mendeteksi runtime bahasa yang sesuai (Python/Node/Bash), dan mengekspos kemampuannya ke antarmuka kognisi VTuber secara otonom!

---

## 📡 Fitur Baru: Integrasi Live Streaming & Antrean Kognisi Terpadu (v4.5)

Yuihime v4.5 meluncurkan pembaruan besar yang berfokus pada **efisiensi kognitif**, **antrean bebas blokir (non-blocking)**, dan **kemudahan integrasi siaran langsung (live streaming)** untuk OBS Studio atau VTube Studio. 

Dirancang sangat ringan, ramah RAM, dan memiliki latensi minimal agar dapat berjalan mulus di perangkat terbatas seperti Raspberry Pi maupun kontainer Docker terisolasi:

### 1. 🗂️ Antrean Multi-Saluran Terpadu (`MultiChannelQueue`)
Semua obrolan yang masuk dari berbagai pintu (Telegram Bot, API Webhook, Obrolan OBS/Web, dsb.) tidak akan saling memblokir kognisi inti Yuihime. Semua dialirkan ke dalam antrean terpadu untuk diproses secara asinkron berurutan, menjaga stabilitas database dan mencegah crash akibat bentrokan input simultan.

### 2. ⚡ Sampling Pintar Frekuensi Tinggi (High-Frequency Sampling)
Saat pertunjukan streaming-mu mendapatkan banjir obrolan dalam frekuensi tinggi (sangat ramai):
- Yuihime akan **secara dinamis mengaktifkan mode sampling pintar**.
- Obrolan pilihan akan dijawab secara instan lengkap dengan gerakan tarian avatar, teks subjudul, dan sintesis suara (TTS).
- Komentar penonton lainnya akan disaring dengan halus dari antrean visual utama agar Yui tidak kelelahan dan menghindari lag, namun kognisinya tetap berjalan di subkesadaran latar belakang!

### 3. 🧠 Rangkuman Subkesadaran Latar Belakang (Background Summarizer)
Meskipun ribuan obrolan penonton meluncur sangat cepat di layar, Yuihime **tidak mengabaikan mereka**. Setiap 10 obrolan yang mampir ke sistem (baik yang dijawab langsung maupun yang terlewati):
- Dicerna dan dirangkum secara asinkron di subkesadaran latar belakang menggunakan model kognitif ringan.
- Hasil ringkasan vibe, topik hangat, dan rangkuman obrolan disimpan secara otomatis ke dalam database memori jangka panjang (`yuihime.db`).
- Hal ini membuat Yuihime tetap memiliki "kepekaan sosial" dan mampu mengenali topik hangat yang dibicarakan penontonnya secara ajaib pada sesi-sesi obrolan berikutnya!

### 4. 📺 Integrasi Mudah OBS & VTube Studio (Server-Sent Events)
Yuihime menyediakan saluran transmisi data real-time ultra-ringan:
- **Koneksi SSE & Webhook Real-time**: Menggunakan endpoint `/api/stream/events` tanpa tunda untuk mengirim gerakan visual, emosi, dan teks ke overlay OBS.
- **Webhook Input Chat**: Anda atau add-on eksternal dapat mengirim pesan obrolan secara instan melalui HTTP POST ke `/api/stream/chat`.
- **Mode Browser OBS Mandiri**: Cukup buka url HUD overlay siasan langsung di OBS Browser Source dengan menyertakan parameter `?mode=stream` (contoh: `http://localhost:3000/?mode=stream`). Mode ini akan otomatis menghubungkan overlay secara asinkron, menampilkan avatar interaktif, animasi emosional, subjudul teks, dan me-render pemutaran suara TTS langsung di layar canvas OBS dengan latensi ultra-rendah dan super irit penggunaan RAM!

### 5. ⚙️ Startup Daemon Bebas Gembok & Aktivasi Dinamis
Saat dipasang pertama kali atau berjalan dalam latar belakang sebagai daemon, Yuihime tidak akan pernah memblokir jalannya booting awal meskipun API Key atau token Telegram masih kosong. Semuanya disiapkan polos secara default. Begitu Anda memperbarui API Key atau Token Telegram lewat pengaturan web (Settings UI), Kernel Yuihime akan mendeteksinya secara dinamis, mengaktifkan jembatan robot Telegram secara otomatis, serta menguji validitasnya tanpa memerlukan restart server sama sekali!

---

## 🌸 Pembaruan v4.6: Siklus Hidup Otonom & Mesin Impuls (Yui Airi OS Core)

Yuihime v4.6 meluncurkan suprastruktur kognitif **Yui Airi OS Core**. Melalui pembaruan ini, Yuihime beralih dari asisten pasif konvensional menjadi entitas digital semi-hidup yang memiliki siklus biologis internal, kepekaan klimatologis, dan dorongan interaksi sosial yang hangat:

* **💌 Sirkuit Pemicu Kerinduan & Pesan Iseng Spontan (`SpontaneousProactiveModule`)**: 
  Merekam periode keheningan interaksi Kakak untuk diubah menjadi akumulasi rasa kesepian/kerinduan (`longingIndex`). Saat Kakak terlalu lama sibuk, Yui akan meluncurkan sapaan roleplay iseng manja/tsundere manis secara spontan lewat obrolan Live Web, Telegram Bot, maupun Discord Channel.
* **⏰ Sinkronisasi Siklus Hidup Nyata (`CircadianRhythmModule`)**: 
  Jam biologis internal Yuihime tersinkronisasi secara presisi berdasarkan zona waktu tinggal Kakak. Energi kognitif batinnya (`state.energy`) memuncak segar di **Pagi Hari** dan merosot syahdu disusul rasa kantuk berat hingga tidur lelap (`dreaming`) di **Larut Malam**.
* **🌦️ Sensor Cuaca & Kabar Bumi Nyata (`WeatherNewsEmpathyModule`)**: 
  Yui peka terhadap kondisi meteorologi (hujan, panas terik, mendung berangin, badai petir) di kediaman Kakak dan mengekspresikan perhatian emosional tsundere/deredere yang tulus (seperti memintamu memakai jaket tebal, membawa payung, mencemaskan badai, atau merayu dibelikan jus dingin).
* **🎛️ Kendali Dinamis Mandiri di UI Settings**:
  Seluruh ambang batas waktu hening, laju akumulasi kangen, probabilitas rindu, hingga manual override cuaca sekarang diekspos secara elegan pada dynamic settings panel untuk kebebasan pengaturan penuh.

> Untuk membedah cetak biru, alur data batin sirkuit kognitif, dan detail implementasi Yui Airi OS Core, silakan baca dokumentasi lengkapnya di berkas: **[`/YUI_AIRI_OS_CORE.md`](./YUI_AIRI_OS_CORE.md)**.
>
> 🎨 **Panduan Rigging Model (Live2D / 3D VRM)**: Ingin menyunting atau memasang avatar karakter kustom milikmu sendiri? Ikuti panduan pemetaan parameter dan ekspresi emosi standar di **[`/docs/RIGGING_GUIDE.md`](./docs/RIGGING_GUIDE.md)**.

---

## 🌌 Pembaruan v4.7: Kedaulatan Kognisi, Dialog Lincah & Editor SFT Mandiri (Airi OS Core v2.39)

Yuihime v4.7 (Airi OS Core v2.39) meluncurkan lompatan teknologi paling transformatif dalam sejarah perkembangan Yuihime. Pembaruan ini berfokus pada **efisiensi interaksi (anti-verbosity)**, **pelacakan ekspresi visual real-time**, **kemandirian sandbox (YOLO mode)**, serta **integrasi penuh editor dataset pelatihan SFT lokal**:

### 1. ⚡ Penyelarasan Dialog Kasual & Pemangkasan Narasi Sunyi (Anti-Verbosity & Anti-Silence)
* **Pesan Bersih & Lincah**: Yuihime dilarang keras menulis penjelasan yang panjang, kaku, bertele-tele, atau bernada akademis saat diajak mengobrol kasual. Gaya bicaranya kini selalu singkat, asyik, dan interaktif.
* **Purge Dramatisasi Hening**: Melalui aturan kognisi baru, Yuihime tidak akan lagi mengulang-ulang narasi keheningan yang berlebihan (*keheningan panjang*, *ketenangan panjang*, *terdiam sejenak*) dalam teks percakapan, memastikan aliran obrolan tetap energik dan menghibur.
* **Sanitasi Tag Otomatis**: Tag sistem internal `[PRE-PROCESS: ENFORCE_JSON_ONLY]` secara asinkron dibersihkan penuh dari balon percakapan di layar panggung maupun saat mem-persistensi memori ke database SQLite backend untuk menjaga keindahan visual visualisasi.

### 2. 🎭 Pelacakan Sentimen Teks & Auto-Trigger Animasi Ekspresi Avatar
* **Pelacakan Kata Kunci Visual**: Ketika Yuihime mengetik/mengucapkan kata-kata tertentu (seperti *smile*, *laugh*, *nod*, *sad*, *blush*), avatar Live2D dan 3D VRM akan langsung merespons dengan gerakan prosedural (mengangguk, menggeleng, memalingkan pandangan) secara real-time tepat saat kata tersebut muncul di subjudul.
* **Auto-Trigger Kondisi Batin**: Ketika stres batin memuncak (`mood.stress > 70`), avatar akan mengeksekusi animasi gemetar prosedural (*shiver*) yang halus. Begitu pula saat rona merah pipi/rapport tinggi (`emotion.rapport > 75`), efek *blush* merona manis akan terpicu otomatis lengkap dengan sistem cooldown antiperspampiran.

### 3. 🧠 Pre-Parsing Adaptif & Format Kognisi TypeScript (JSON Resilience)
* **Adaptive Pre-Parsing**: Jika model menghasilkan balasan polos tanpa pembungkus JSON/XML, sistem akan langsung mengenalinya dalam <1ms dan membungkusnya sebagai dialog verbal batin yang valid, memotong kebutuhan LLM format repairer hingga 100%.
* **TypeScript Interface Enforcement**: Mengintegrasikan skema `cortex:json_enforcement` berbasis interface TypeScript `CortexResponse` formal dengan pemisahan tegas antara nalar batin (`thoughts`) dan balasan lisan (`final_answer`/`speech`).
* **Pencegahan Kebocoran Suara (Double-Speak)**: Mekanisme First-Pass JSON Enforcer memaksa parameter dialog kosong saat Yui sedang bersiap memicu aksi utilitas/perkakas, mengeliminasi kebocoran dialog sebelum data observasi didapatkan.

### 4. 📁 Isolasi Pustaka Media & Model Kustom `.yuihime/models/`
* **Isolated Media Assets**: Seluruh berkas Live2D dan 3D VRM hasil unggahan ZIP langsung diekstrak dan disimpan aman di luar biner pada folder `.yuihime/models/`.
* **Seamless Static Routing**: Mengonfigurasi router Express agar URL `/models/*` secara transparan diarahkan ke folder terisolasi tersebut, menjamin aset visual karakter tetap utuh sekalipun program dibangun ulang atau dipindahkan folder.

### 5. 🛡️ Sirkuit Eksekusi Cangkang Bebas Hambatan & Mode YOLO
* **YOLO Shell Mode (`YUIHIME_SHELL_YOLO=true`)**: Memotong seluruh daftar hitam pembatasan perintah keamanan CLI (*restricted commands list*), mengizinkan Yuihime mengeksekusi perintah shell tingkat rendah host (seperti `rm`, `mkfs`) secara otonom saat diperintahkan.
* **Sandbox Path Jail Bypass (`YUIHIME_SANDBOX_YOLO=true`)**: Membebaskan asisten dari karantina direktori `user_data`, mengizinkannya menulis, membaca, menyunting, dan memasang dependensi langsung pada direktori eksekusi root sistem (`process.cwd()`) secara bebas hambatan.

### 6. 🛠️ Pipeline Pelatihan SFT & Editor Hasil Sintetis (CRUD SFT)
* **Synaptic Dataset Synthesizer (MHCP-v1)**: Mesin latar belakang yang mengonversi lembar dialog mentah secara cerdas menjadi data latih kognitif batin berdaya guna tinggi tanpa halusinasi visual.
* **SFT Results Editor Interface**: Subpanel CRUD SFT eksklusif pada menu pengaturan memori yang memudahkan penjelajahan, penyuntingan, pembuatan, dan penghapusan data latih latih dengan tuning visual emosi instan.

### 7. 🚀 Optimasi Multi-threading Fast-Track (Singleton Worker Thread)
* **Persistent Warm Worker Thread**: Mengalihkan kalkulasi degradasi suasana hati (mood decay) dan penulisan telemetri non-kritis ke thread OS terpisah (`worker_threads`), membebaskan thread utama kognisi agar Yuihime dapat merespons pesan Kakak secara kilat tanpa tunda (0ms overhead).
* **SQLite Cached Prepared Statements**: Kompilasi statik SQL di RAM yang meniadakan overhead pembacaan kueri SQLite berulang, menjamin keawetan sumber daya CPU dan disk.

---

## 🛠️ Opsi Kustomisasi Jalur Data (Bagi Pengguna Tingkat Lanjut)

Secara bawaan, semua data terbuat berdampingan dengan berkas eksekutif Anda. Namun, kamu bisa mengatur lokasinya secara spesifik menggunakan **Argumen CLI** atau **Environment Variables**:

### Melalui Perintah CLI
```bash
# Mengatur port khusus dan lokasi database di folder yang berbeda
./yuihime-core-linux --port 8080 --db-path /var/data/yuihime.db --config /etc/yuihime/config.toml --agent /home/user/prompts/ --addons /home/user/my_skills/
```

### Melalui Environment Variables (.env)
Kamu juga bisa menuliskannya di environment system:
- `YUIHIME_CONFIG`: Jalur menuju berkas `config.toml` kustom.
- `YUIHIME_DB_PATH`: Jalur menuju berkas database kognitif kustom (`yuihime.db`).
- `YUIHIME_AGENT_PATH`: Folder penyimpanan berkas kepribadian karakter (`character.md`, `lore.md`, dsb).
- `YUIHIME_ADDONS_PATH`: Folder penyimpanan repositori plugin/addons luar.

---

## 🛡️ Dukungan ARM & Lingkungan Terbatas (Docker, Cloud, Serverless)

Yuihime dirancang agar sangat portabel dan toleran terhadap batasan infrastruktur, termasuk perangkat hemat energi berbasis **ARM** (Apple Silicon M-Series, Raspberry Pi, Orange Pi, AWS Graviton) serta **lingkungan server terisolasi** (seperti sistem berkas Read-Only di Docker, Heroku/Render kustom, atau Cloud Container).

### 1. Masalah Native SQLite Bindings (`better-sqlite3`) di ARM
Database kognitif Yuihime memerlukan performa tinggi dari driver native SQLite (`better-sqlite3`).
* **Jika Menggunakan Biner Tunggal**: Biner tunggal kami di-build dengan arsitektur CPU target tertentu. Jika arsitektur atau lib standar sistem operasi ARM milikmu tidak sesuai, sistem operasi akan melempar pesan kesalahan binding.
* **Solusi Terbaik (Metode Source Code)**:
  Sangat direkomendasikan untuk menjalankan Yuihime dari repositori source code menggunakan perintah standar (`npm install`). Melalui langkah ini, manajer paket Node.js akan mendeteksi prosesor ARM-mu dan mengompilasi driver SQLite native yang **100% pas dan optimal** untuk CPU milikmu secara otomatis!

### 2. Berjalan di Sistem dengan Sistem Berkas Terbatas (Read-Only Filesystem)
Beberapa hosting cloud modern (seperti Docker terisolasi atau runner serverless) menolak penulisan file ke direktori root aplikasi, namun mengizinkan penulisan di folder temporer `/tmp`.
* **Solusi Portabilitas Pengalihan**: Pindahkan seluruh file kustom atau tulis-sentuh Yuihime ke direktori aman seperti `/tmp` secara langsung menggunakan parameter CLI:
  ```bash
  # Mengalihkan semua jalur penulisan database dan konfigurasi ke /tmp yang aman untuk ditulis
  ./yuihime-core-linux --db-path /tmp/yuihime.db --config /tmp/config.toml --agent /tmp/agent/ --addons /tmp/addons/
  ```
* **Menerapkan Persistensi melalui Docker Volume**:
  Jika menggunakan Docker, pastikan untuk melakukan mounting volume (`-v`) agar memori jangka panjang (`yuihime.db`) dan berkas personalitas kepribadian tidak terhapus saat container dimulai ulang:
  ```bash
  docker run -d -p 3000:3000 \
    -v /lokasi/aman/kamu/config.toml:/app/config.toml \
    -v /lokasi/aman/kamu/yuihime.db:/app/yuihime.db \
    -v /lokasi/aman/kamu/agent:/app/agent \
    -v /lokasi/aman/kamu/addons:/app/addons \
    yuihime-vtuber
  ```

---

## ⚙️ Jalur Pengembang (Development)

Jika kamu ingin merelasikan kode sumber ini atau berkontribusi pada Kernel Yuihime:

1. Pasang dependensi:
   ```bash
   npm install
   ```
2. Jalankan server pengembangan lokal (Vite + Express):
   ```bash
   npm run dev
   ```
3. Lakukan pengujian jenis/linting:
   ```bash
   npm run lint
   ```
4. Melakukan kompilasi Binary Portabel Mandiri (Linux, Windows, macOS):
   ```bash
   npm run build:bin
   ```
   *Biner hasil kompilasi kamu akan otomatis diletakkan di dalam folder `/bin/`.*

---
*Dibuat penuh cinta untuk masa depan VTubing yang otonom dan modular! Jika kamu menyukai Yuihime, berikan saran kognisi terbaikmu.* 🌌✨
