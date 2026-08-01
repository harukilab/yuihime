#!/usr/bin/env node
/*
 * YuiHime Build & Bundle Assembler
 *
 * Membuat bundle portabel di `dist/` yang bisa dipindah ke mana saja
 * (mis. /opt/yuihime) dan dijalankan global via perintah `yuihime`.
 * Bundle berisi: server.cjs, web/ (UI statis), tools/*.sh, launcher
 * `yuihime`, public/ (aset Live2D), dan node_modules runtime (better-sqlite3
 * native + pendukungnya).
 *
 * Binary tunggal (SEA/pkg) TIDAK default karena native better-sqlite3 dan UI
 * yang di-serve dari folder menyulitkan biner satu file yang andal. Dicoba
 * best-effort hanya bila flag diaktifkan eksplisit.
 *
 * Usage:
 *   node src/bin/compile-binary.cjs              -> bundle portabel (default)
 *   node src/bin/compile-binary.cjs --server-only
 *   node src/bin/compile-binary.cjs --web-only
 *   node src/bin/compile-binary.cjs --pkg        -> + coba pkg (platform ini saja)
 *   node src/bin/compile-binary.cjs --sea        -> + coba Node.js SEA
 *   node src/bin/compile-binary.cjs --all        -> bundle + pkg + sea
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DIST = path.join(ROOT, 'dist');
const TOOLS_SRC = path.join(ROOT, 'tools');

const args = process.argv.slice(2);
const isServerOnly = args.includes('--server-only') || args.includes('--mode=server');
const isWebOnly = args.includes('--web-only') || args.includes('--mode=web');
const doPkg = args.includes('--pkg') || args.includes('--all');
const doSea = args.includes('--sea') || args.includes('--all');

function sh(cmd) { execSync(cmd, { stdio: 'inherit' }); }
function cp(src, dest) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true });
  return true;
}
function ok(msg) { console.log(`✓ ${msg}`); }
function warn(msg) { console.warn(`⚠️  ${msg}`); }
function step(n, msg) { console.log(`\n[${n}] ${msg}`); }

function readmeText() {
  return `YuiHime Portable Bundle
========================

Bundle ini siap dipindah ke lokasi sistem mana pun (mis. /opt/yuihime).
Semua path di-resolve relatif terhadap lokasi folder, jadi bebas dipindah.

INSTALL GLOBAL (symlink /usr/local/bin/yuihime):
  tools/yuihime install

PAKAI:
  yuihime daemon start             jalankan daemon (background + watchdog)
  yuihime daemon stop / status     hentikan / cek status
  yuihime logs [N|-live]           lihat log
  yuihime start [--port N]         daemon foreground
  yuihime settings                 Settings TUI
  yuihime terminal                 Terminal sandbox
  yuihime version                  versi build

OVERRIDE:
  YUIHIME_DAEMON_PORT=4000 yuihime daemon start
  YUIHIME_CWD=/srv/yui  yuihime daemon start

CATATAN:
  - Butuh Node.js terinstall (node di PATH).
  - Native better-sqlite3 dibuild untuk arsitektur ini; pindah ke mesin
    dengan versi Node berbeda mungkin perlu rebuild (npm install).
  - UI di-serve statis dari web/ (tanpa sumber Vite).
`;
}

function buildAssets() {
  if (isWebOnly) {
    step('1/2', 'Compiling Web UI assets (dist/web)...');
    sh('npm run build:web');
    process.exit(0);
  }
  if (isServerOnly) {
    step('1/3', 'Compiling Server daemon (dist/server.cjs)...');
    sh('npm run build:server');
  } else {
    step('1/3', 'Compiling Web UI + Server daemon...');
    sh('npm run build');
  }
}

function assembleBundle() {
  step('2/3', 'Assembling portable bundle in dist/ ...');

  fs.mkdirSync(path.join(DIST, 'tools'), { recursive: true });
  const toolsFiles = ['yui-daemon.sh', 'yui-debug.sh', 'yui-watchdog.sh', 'yui-pm2.sh', 'yuihime'];
  for (const f of toolsFiles) {
    if (cp(path.join(TOOLS_SRC, f), path.join(DIST, 'tools', f))) ok(`tools/${f}`);
  }
  const launcher = path.join(DIST, 'tools', 'yuihime');
  if (fs.existsSync(launcher)) fs.chmodSync(launcher, 0o755);

  if (cp(path.join(ROOT, 'public'), path.join(DIST, 'public'))) ok('public/ (aset Live2D)');

  // Runtime deps yang di-external oleh esbuild (tidak di-bundle ke server.cjs).
  const runtimePkgs = ['better-sqlite3', 'bindings', 'file-uri-to-path', 'abort-controller', 'event-target-shim'];
  for (const p of runtimePkgs) {
    if (cp(path.join(ROOT, 'node_modules', p), path.join(DIST, 'node_modules', p))) ok(`node_modules/${p}`);
  }

  fs.writeFileSync(path.join(DIST, 'README.txt'), readmeText());
  ok('README.txt');
}

function tryNativeBinary() {
  let done = false;

  if (doPkg) {
    step('3/4', 'Packaging native binary via @yao-pkg/pkg (current platform only)...');
    try {
      const target = `node20-${process.platform}-${process.arch}`;
      sh(`npx @yao-pkg/pkg . --targets ${target} --out-path ${path.join(DIST, 'bin')}`);
      ok(`native binary di dist/bin/ (target ${target})`);
      done = true;
    } catch (e) {
      warn('pkg gagal — biasanya karena native better-sqlite3. Bundle portabel tetap jadi jalur andal.');
    }
  }

  if (doSea) {
    step('3/4', 'Node.js SEA preparation (best-effort)...');
    try {
      sh('node --experimental-sea-config sea-config.json');
      const nodeBin = path.join(DIST, 'bin', process.platform === 'win32' ? 'yuihime-sea.exe' : 'yuihime-sea');
      fs.mkdirSync(path.dirname(nodeBin), { recursive: true });
      fs.copyFileSync(process.execPath, nodeBin);
      try {
        const fuse = 'NODE_SEA_FUSE_fce680e432b4d0609bfac08d6163a3d0';
        sh(`npx postject "${nodeBin}" NODE_SEA_BLOB dist/sea-prep.blob --sentinel-fuse ${fuse}`);
        ok(`SEA binary di ${nodeBin}`);
        done = true;
      } catch (postErr) {
        warn('postject tidak terpasang / gagal. SEA blob tersisa di dist/sea-prep.blob.');
      }
    } catch (seaErr) {
      warn(`SEA generation gagal: ${seaErr.message}`);
    }
  }

  if (!done) {
    console.log('ℹ️  Binary tunggal tidak diproduksi — gunakan bundle portabel (jalur utama).');
  }
}

try {
  buildAssets();
  assembleBundle();
  if (doPkg || doSea) tryNativeBinary();

  console.log('\n=========================================');
  console.log('✓ Bundle portabel siap di dist/');
  console.log('  - Pindahkan dist/ ke lokasi sistem (mis. /opt/yuihime)');
  console.log('  - tools/yuihime install  →  symlink /usr/local/bin/yuihime');
  console.log('  - Pakai: yuihime daemon start | yuihime status | yuihime logs');
  console.log('=========================================\n');
} catch (error) {
  console.error('\n🔴 Compilation aborted:', error.message);
  process.exit(1);
}
