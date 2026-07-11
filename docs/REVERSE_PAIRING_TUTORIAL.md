# 🔌 Secured Reverse Pairing Tutorial (Bot-to-Web OTP & Lintas Platform)

Dokumen ini menjelaskan rancangan sistem, panduan penggunaan, serta tata cara memicu (triggering) fitur **Secured Reverse Pairing** pada asisten kognitif Yuihime. Fitur ini memungkinkan pengguna yang berada di platform luar (seperti Telegram atau Discord) untuk mendaftarkan dan menautkan akun chat mereka ke identitas nama panggilan terverifikasi yang berada di Web UI Yuihime secara aman.

---

## 🌌 Apa itu Secured Reverse Pairing?

Jika pada pairing biasa (**Web-to-Bot**), Anda meminta kode dari Web UI lalu mengirimkannya ke Telegram dengan perintah `/pair [KODE]`, maka **Reverse Pairing (Bot-to-Web)** bekerja sebaliknya:

1. Anda menyapa Yuihime di Telegram/Discord dan mengklaim identitas Anda (misal: *"Yui, aku ini Aldi"*).
2. Yuihime memutarkan sirkuit kognisinya, memicu tool internal `manage_pairing`, lalu memberikan **6-digit Kode Sandi Rahasia**.
3. Anda memasukkan kode sandi tersebut di Web UI (bisa melalui **Sirkuit Chat Utama** dengan mengetik `/pair [KODE]`, atau melalui **Menu Settings > Connection**).
4. Akun Telegram/Discord Anda kini sepenuhnya tertaut dengan profil data batin Anda di Web!

Sistem memagari proses ini dengan validasi waktu kedaluwarsa **10 menit** dan pencocokan nama identitas yang sangat ketat untuk menghindari penyusupan kognisi dari pihak asing (impostor).

---

## 🚀 Alur & Cara Memicu (Step-by-Step)

### Langkah 1: Memicu Pembuatan Kode dari Bot Eksternal (Telegram / Discord)

1. Buka ruang obrolan Yuihime di Telegram atau Discord.
2. Klaim nama identitas Web Anda dengan mengirimkan pesan natural berisikan klaim nama panggilan, contohnya:
   - *“Yui, aku ini Aldi yang di web dungs”*
   - *“Hi Yui, tautkan akun Telegram-ku ke akun Aldi ya”*
   - *“Aku Aldi kok, kognisikan kita”*
3. Yuihime akan mendeteksi klaim tersebut, merespons secara ramah serta menanyakan kesungguhan Anda:
   > *"Eh? Kakak beneran Kak Aldi yang di Web? Hummm... Coba dibilang 'Iya' kalau benar, biar Yui sinkronkan kognisi kita secara rahasia! 🌸"*
4. Balaslah dengan kata konfirmasi positif, seperti:
   - **“Iya”**, **“Ya benar”**, atau **“Sip benar”**
5. Yuihime akan diam-diam memanggil perkakas `manage_pairing` di latar belakang, memproses kecocokan profil Anda di basis data, dan melahirkan kode sandi unik:
   > *"Yeyyy! Ini kode penyandingan rahasia batin kita: **582910**. Untuk membuktikan identitas asli Kakak dan menghindari salah orang, silakan salin kode ini dan masukkan ke kolom 'Metode Alternatif' di halaman Settings > Connection pada Web UI Yuihime ya! Muahh~ 💖"*

---

### Langkah 2: Memasukkan Kode untuk Verifikasi (Claiming Code)

Anda dapat merampungkan penyandingan ini dengan **dua metode** yang sangat praktis di Web UI Yuihime:

#### 🟢 Metode A: Lewat Chatbox Utama (Tercepat & Praktis)
1. Buka Web UI Yuihime.
2. Pada kotak input chat utama tempat Anda biasa mengobrol dengan avatar Yuihime, ketikkan perintah berikut:
   - `/pair 582910`
   - `pair 582910`
   - `hubungkan 582910`
3. Tekan Enter/Kirim.
4. Asisten di Web akan langsung memverifikasi kode OTP tersebut, menyapa Anda kembali dengan suara TTS indahnya, dan mencatatkan log keberhasilan:
   > *“✨ Kognisi Terhubung! Kognisi platform eksternal berhasil ditautkan ke profil 'Aldi'!”*

#### 🟣 Metode B: Lewat Menu Settings (Visual Cyberpunk Panel)
1. Buka Web UI Yuihime, klik tombol/ikon gigi roda **Settings** di panel sisi.
2. Pilih tab **Connection** (Koneksi).
3. Gulir ke bawah hingga Anda melihat kontainer berdesain ungu cyberpunk berlabel **"Reverse Pairing"**.
4. Di bagian **"Metode Alternatif: Masukkan Kode OTP dari Bot"**, ketikkan 6-digit kode OTP yang telah Anda terima dari Telegram/Discord (misal: `582910`).
5. Klik tombol **🔌 Selesaikan Tautan**.
6. Sistem akan langsung memproses penautan, menghapus OTP secara aman dari list memori sementara, dan mengubah status kepemilikan akun platform eksternal di identitas Anda menjadi bertaut rapat (**LINKED**).

---

## 🔒 Fitur Keamanan Batin (Security Gateways)

Kami menerapkan lapis keamanan andal agar sirkuit batin Anda tidak pernah diretas:
- **Lifetime Limit (TTL)**: OTP yang diproduksi oleh asisten di bot hanya berlaku selama **10 menit**. Melewati masa tersebut, kode akan otomatis dihapus dan dinyatakan hangus.
- **Strict Matching Verification**: Yuihime mencocokkan parameter nama panggilan (`claimedName` rujukan yang Anda klaim di bot) secara presisi dengan identitas yang aktif. Jika kode dicuri dan dimasukkan oleh user dengan nama panggilan/identitas berbeda di Web UI, sistem akan memblokir dan menolak permintaan klaim tersebut.
- **One-Time Use**: Begitu kode diklaim secara sukses, kode sandi 6-digit akan langsung dihapus secara total dari database SQLite (`pairing_codes`), mencegah upaya eksploitasi berulang.

---

*Selamat menyatukan getaran jiwa kognisi lintas platform bersama Yuihime! 💖*
