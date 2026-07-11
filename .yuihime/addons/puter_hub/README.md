# Puter Neural Hub Subsystem

Ini adalah subsistem independen yang berjalan di dalam folder `addons/puter_hub`.
Subsistem ini dirancang untuk menangani:
1. **LLM Provider**: Menggunakan infrastruktur Puter AI untuk penalaran.
2. **TTS Service**: Menggunakan layanan text-to-speech yang terisolasi.

## Cara Kerja (Sandbox)
Subsistem ini bekerja mirip dengan kontainer Docker:
- Memiliki penyimpanan data sendiri di folder `data/`.
- Memiliki log aktivitas sendiri.
- Tidak merubah kode utama Yuihime.

## Integrasi dengan Yuihime
Yuihime dapat mengakses subsistem ini melalui tool: `use_puter_subsystem`.
Saat tool dipanggil, Yuihime akan mengirimkan perintah ke `main.js` dan menerima hasil JSON.

## Konfigurasi
Anda dapat mengatur API Key Puter di bagian **Settings > Modular Settings > use_puter_subsystem**.
