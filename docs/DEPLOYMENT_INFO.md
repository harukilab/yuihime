# Panduan Menjalankan Yuihime 24/7 (Daemon Mode)

Agar Yuihime tetap aktif dan otomatis menyala saat server/PC booting, direkomendasikan menggunakan **PM2**.

## 1. Instalasi PM2
Jalankan perintah ini di terminal server kamu:
```bash
npm install pm2 -g
```

## 2. Menjalankan Yuihime
Gunakan PM2 untuk menjalankan server yang sudah di-build:
```bash
pm2 start dist/server.cjs --name "yuihime-core"
```

## 3. Mengatur Auto-Boot (Startup)
Agar Yui otomatis menyala saat PC baru dinyalakan:
1. Jalankan: `pm2 startup`
2. Copy-paste perintah yang muncul di terminal.
3. Jalankan: `pm2 save`

## 4. Monitoring
Untuk melihat log aktivitas Yui (misalnya chat yang masuk dari Telegram/Twitch):
```bash
pm2 logs yuihime-core
```

Yuihime sekarang akan berjalan di latar belakang (Daemon) dan tidak akan mati meskipun window terminal ditutup. 🌸

---

## 5. Portabilitas & Mode Deployment

Semua script menentukan lokasi data dari `$HOME` (default `~/.yuihime`, override `YUIHIME_SYSTEM_ROOT`)
dan lokasi script itu sendiri — **tidak ada path absolut yang di-hardcode**, jadi aman dipindah antar
user/mesin (tiap user punya instance data sendiri di home-nya).

Dua jalur deployment resmi:

**A. Tanpa PM2 (default)** — daemon 1 proses + watchdog lokal:
```bash
tools/yui-daemon.sh start prod      # start daemon + watchdog (restart saat hang/crash)
```

**B. Dengan PM2 (opsional)** — PM2 mengelola proses + watchdog PM2-aware melengkapi deteksi hang:
```bash
tools/yui-daemon.sh --pm2 start prod
```
PM2 menangani proses mati (auto-restart); watchdog PM2-aware men-probe `/api/health` dan menjalankan
`pm2 restart yuihime` saat event-loop beku (yang tak terdeteksi PM2).

### Boot Hook (auto-start setelah reboot)
`scripts/boot.sh` bisa dipasang ke Termux:Boot, UserLAnd (command saat login), cron `@reboot`, atau init.d:
```bash
bash scripts/boot.sh [--pm2|--no-pm2] [dev|prod]
```
- Non-PM2 → `tools/yui-daemon.sh start` (daemon + watchdog).
- PM2 → `pm2 resurrect` + pastikan app 'yuihime' jalan + watchdog PM2-aware.

Di server/PC dengan systemd, untuk mode PM2 tetap bisa pakai `pm2 startup` + `pm2 save` (bagian 3 di atas);
`scripts/boot.sh` menjadi alternatif yang berjalan di lingkungan tanpa systemd (Android/proot).
