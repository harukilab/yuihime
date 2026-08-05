#!/usr/bin/env node
/*
 * YuiHime Build & Bundle Assembler
 *
 * Creates a portable bundle in `dist/` that can be moved anywhere
 * (e.g. /opt/yuihime) and run globally via the `yuihime` command.
 * Bundle contents: server.cjs, web/ (static UI), tools/*.sh, launcher
 * `yuihime`, public/ (Live2D assets), and runtime node_modules (better-sqlite3
 * native + its dependencies).
 *
 * A single binary (SEA/pkg) is NOT the default because native better-sqlite3
 * and a UI served from a folder make a reliable one-file binary difficult.
 * It is only attempted best-effort when the flag is explicitly enabled.
 *
 * Usage:
 *   node src/bin/compile-binary.cjs              -> portable bundle (default)
 *   node src/bin/compile-binary.cjs --server-only
 *   node src/bin/compile-binary.cjs --web-only
 *   node src/bin/compile-binary.cjs --pkg        -> + try pkg (this platform only)
 *   node src/bin/compile-binary.cjs --sea        -> + try Node.js SEA
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

  if (cp(path.join(ROOT, 'public'), path.join(DIST, 'public'))) ok('public/ (Live2D assets)');

  // Runtime deps externalized by esbuild (not bundled into server.cjs).
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
      ok(`native binary at dist/bin/ (target ${target})`);
      done = true;
    } catch (e) {
      warn('pkg failed — usually due to native better-sqlite3. The portable bundle remains the reliable path.');
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
        ok(`SEA binary at ${nodeBin}`);
        done = true;
      } catch (postErr) {
        warn('postject not installed / failed. SEA blob left at dist/sea-prep.blob.');
      }
    } catch (seaErr) {
      warn(`SEA generation failed: ${seaErr.message}`);
    }
  }

  if (!done) {
    console.log('ℹ️  No single binary produced — use the portable bundle (main path).');
  }
}

try {
  buildAssets();
  assembleBundle();
  if (doPkg || doSea) tryNativeBinary();

  console.log('\n=========================================');
  console.log('✓ Portable bundle ready at dist/');
  console.log('  - Move dist/ to a system location (e.g. /opt/yuihime)');
  console.log('  - tools/yuihime install  →  symlink /usr/local/bin/yuihime');
  console.log('  - Use: yuihime daemon start | yuihime status | yuihime logs');
  console.log('=========================================\n');
} catch (error) {
  console.error('\n🔴 Compilation aborted:', error.message);
  process.exit(1);
}
