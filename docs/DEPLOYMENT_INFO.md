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
