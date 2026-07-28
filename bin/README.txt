Yuihime Single Executable Application (SEA) Release
====================================================

Build Target Mode: FULL (WEB + SERVER)

Untuk menjalankan Yuihime langsung tanpa Node.js:
  ./yuihime-sea (atau ./yuihime-core-linux pada Linux)

Mode Biner:
- Default (Full): Menyematkan UI Web React SPA dan Server daemon sekaligus.
- Server Only (--server-only): Menjalankan backend daemon tanpa static web UI.
- Web Only (--web-only): Hanya membuat file build statis UI (dist/web).

Node.js SEA (Single Executable Application):
Gunakan "sea-config.json" dan "dist/sea-prep.blob" untuk mendistribusikan biner tunggal Node.js.
