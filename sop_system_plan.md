# Rencana Implementasi Sistem SOP Dinamis

Rencana ini merinci desain dan langkah-langkah untuk membangun sistem SOP (Standard Operating Procedure) terpusat, di mana pengguna dan Yui dapat dengan mudah membaca, menulis, dan memperbarui aturan operasional spesifik yang akan diprioritaskan oleh Yui saat memproses permintaan.

---

## 1. Arsitektur Folder SOP
Kita akan membuat direktori khusus `sops/` di dalam direktori `user_data/` (workspace sandbox) di bawah root sistem YuiHime (`~/.yuihime/`):
```text
/home/userland/.yuihime/
├── user_data/
│   └── sops/
│       ├── foto.md       <-- SOP untuk pembuatan foto/gambar
│       ├── coding.md     <-- SOP untuk penulisan kode/pemrograman
│       └── default.md    <-- SOP umum jika tidak ada kecocokan spesifik
```

Setiap file bertindak sebagai dokumen panduan independen untuk topik/tugas tertentu. Lokasi ini dipilih karena:
- **User Data Scope**: Folder `user_data/` adalah area sandbox operasional pengguna yang aman untuk diubah
- **Path Consistency**: Seluruh tools file YuiHime menggunakan prefix `user_data/` sebagai standar akses sandbox
- **Persistence**: File di `user_data/` otomatis tersimpan dan tidak terpengaruh oleh build/update sistem

---

## 2. Implementasi `SOPModule.ts` (Core Module)
Kita akan membuat modul baru bernama `src/modules/SOPModule.ts`. Modul ini akan berjalan secara otomatis di fase agregasi awal (`PHASE 1: AGGREGATION` atau awal `SOUL` phase) untuk:
1. Membaca daftar file `.md` di dalam direktori `user_data/sops/`.
2. Mencocokkan nama file (kata kunci) dengan input dari user (misalnya, input *"buatkan foto..."* mencocokkan `foto.md`).
3. Membaca isi file SOP yang cocok secara asinkron.
4. Menyuntikkan isi SOP tersebut ke dalam `soulDirective` atau `groundedKnowledge` dengan header prioritas tinggi:
   ```markdown
   # PRIORITAS UTAMA OPERASIONAL (SOP)
   [Aturan dari SOP yang cocok]
   ```

---

## 3. Langkah Implementasi

### Langkah 1: Pembuatan Direktori & SOP Contoh
* Membuat direktori `/home/userland/.yuihime/user_data/sops/` (atau sesuai konfigurasi `YUIHIME_USER_DATA_PATH`).
* Membuat berkas template pertama: `user_data/sops/foto.md` dan `user_data/sops/default.md`.

### Langkah 2: Pembuatan `src/modules/SOPModule.ts`
* Membuat modul `SOPModule` yang menangani pembacaan dinamis berkas `.md` berdasarkan pencocokan nama file dengan kata kunci input.
* Menyuntikkan teks SOP ke dalam `context.soulDirective` agar instruksi tersebut menjadi panduan berpikir utama Yui.
* Modul ini harus mengakses path SOP melalui mekanisme sandbox yang konsisten (menggunakan prefix `user_data/` atau path absolut terkonfigurasi).

### Langkah 3: Pengujian Interaksi
* **Pengujian User**: Menguji apakah Yui mematuhi aturan baru di `user_data/sops/foto.md` saat diminta membuat foto.
* **Pengujian Edit Mandiri**: Meminta Yui mengubah file `user_data/sops/foto.md` lewat chat untuk melihat apakah Yui berhasil mengedit SOP tersebut.

---

## 5. Aturan Pengoperasian SOP (WAJIB DIIKUTI)

### 5.1 Pemeriksaan SOP Pra-Respons
Sebelum merespons atau memanggil alat (tools) apa pun, Yui wajib memeriksa folder `sops/` menggunakan `list_files` atau `read_file`. Jika ada berkas SOP yang namanya relevan dengan permintaan user (misalnya permintaan foto akan mencocokkan `sops/foto.md`), Yui wajib membaca SOP tersebut dan menjadikannya sebagai instruksi dengan prioritas tertinggi untuk memandu jawaban atau eksekusi tool.

### 5.2 Prioritas Instruksi
SOP yang relevan memiliki prioritas lebih tinggi daripada:
- Instruksi umum sistem
- Persona default
- Konteks memori jangka panjang

Yui tidak boleh mengabaikan atau menahan SOP yang relevan kecuali terdapat konflik langsung dengan prinsip integritas personality.

---

## 6. Catatan Teknis

### 6.1 Path Resolution
- Sistem menggunakan prefix `user_data/` sebagai contract path yang selalu dipetakan ke `dynamicSandboxRoot` (default: `.yuihime/user_data/`).
- Container/Puter deployments menggunakan `/app/user_data/` sebagai absolute path.
- Modul SOP harus menggunakan path relatif `user_data/sops/` atau absolute path sesuai konfigurasi aktif.

### 6.2 Auto-Registration
Karena Yui memuat modul secara otomatis melalui pemindaian filesystem di `RegistryInitializer.ts`, pembuatan berkas `src/modules/SOPModule.ts` akan langsung terintegrasi secara otomatis tanpa perlu mengubah kode registrasi inti.

### 6.3 Konfigurasi
- Path SOP dapat dioverride via `YUIHIME_USER_DATA_PATH` environment variable atau `sandbox_paths.user_data_path` di `config.toml`.
- Jika diperlukan, modul dapat membaca konfigurasi ini dari `Kernel.getSettings()` untuk menentukan lokasi folder `sops/` yang tepat.

---

> [!IMPORTANT]
> Lokasi `sops/` **TIDAK BOLEH** diletakkan di root proyek (`/home/userland/YuiHime/sops/`) karena:
> 1. Project root adalah kode sumber yang di-version control — file SOP adalah data operasional pengguna
> 2. Path jail mechanism hanya mengizinkan akses aman ke `user_data/` dan `.yuihime/`
> 3. Konsistensi dengan seluruh ecosystem tools YuiHime yang menggunakan sandbox `user_data/`
