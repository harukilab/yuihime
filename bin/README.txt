Yuihime Single Executable Application (SEA) Release
====================================================

Build Target Mode: FULL (WEB + SERVER)

Untuk menjalankan Yuihime langsung tanpa Node.js:
  ./yuihime-sea (atau ./yuihime-core-linux pada Linux)

Mode Biner:
- Default (Full): Menyematkan UI Web React SPA dan Server daemon sekaligus.
- Server Only (--server-only): Menjalankan backend daemon tanpa static web UI.
- Web Only (--web-only): Hanya membuat file build statis UI (dist/web).

Enhanced SEA (@yao-pkg/pkg --sea):
Menggunakan Node.js Single Executable Applications API resmi dengan binary stock Node.js (tanpa patch).
Dikompres dengan GZip untuk ukuran minimal.
Pkg packaging dinonaktifkan (--no-pkg).
