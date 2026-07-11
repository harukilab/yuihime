# Services & Infrastructure

Layanan pendukung untuk komunikasi luar, penyimpanan data, dan utilitas sistem.

## Isi Direktori

### 1. `api.ts`
Berfungsi sebagai jembatan komunikasi antara frontend dan backend Express. Mengandung fungsi-fungsi wrapper untuk fetch API.

### 2. `storage.ts`
Mengelola persistensi data di browser (LocalStorage/IndexedDB) dan integrasi dengan database server jika diperlukan.

### 3. `tools.ts` & `/tools`
Daftar alat fungsional yang bisa digunakan oleh Agent. Dokumentasi spesifik mengenai pembuatan tool ada di `src/services/tools/README.md`.

## Aturan Pengembangan
- **Zero Raw Fetch**: Hindari menggunakan `fetch()` langsung di komponen UI. Gunakan service yang sudah ada atau buat wrapper baru di sini.
- **Error Handling**: Semua call API harus dibungkus dengan try-catch yang memberikan feedback bermakna ke UI.
- **Cache Management**: Gunakan strategi caching untuk data yang jarang berubah (seperti settings) untuk mengurangi traffic ke server.
