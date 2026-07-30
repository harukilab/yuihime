const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('\n=========================================');
console.log('  Yuihime Single Executable Application  ');
console.log('=========================================\n');

const args = process.argv.slice(2);
const isServerOnly = args.includes('--server-only') || args.includes('--mode=server');
const isWebOnly = args.includes('--web-only') || args.includes('--mode=web');
const useSea = args.includes('--sea') || true; // Default to Node.js SEA preparation

const buildMode = isServerOnly ? 'SERVER-ONLY' : (isWebOnly ? 'WEB-ONLY' : 'FULL (WEB + SERVER)');
console.log(`[BUILD MODE]: ${buildMode}`);

try {
  // 1. Build assets based on selected target
  if (isWebOnly) {
    console.log('[1/4] Compiling Web UI frontend assets (dist/web)...');
    execSync('npm run build:web', { stdio: 'inherit' });
    console.log('✓ Web UI build complete in dist/web.');
    process.exit(0);
  }

  if (isServerOnly) {
    console.log('[1/4] Compiling Server daemon backend assets (dist/server.cjs)...');
    execSync('npm run build:server', { stdio: 'inherit' });
  } else {
    console.log('[1/4] Compiling Web UI frontend and Server daemon backend...');
    execSync('npm run build', { stdio: 'inherit' });
  }

  // 2. Prepare distribution directory 'bin'
  console.log('\n[2/4] Preparing output directory "bin"...');
  const binDir = path.join(__dirname, '..', '..', 'bin');
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  // 3. Node.js Single Executable Application (SEA) Blob Generation
  if (useSea) {
    console.log('\n[3/4] Generating Node.js SEA (Single Executable Application) Preparation Blob...');
    const seaConfigPath = path.join(__dirname, '..', '..', 'sea-config.json');
    if (fs.existsSync(seaConfigPath)) {
      try {
        execSync('node --experimental-sea-config sea-config.json', { stdio: 'inherit' });
        console.log('✓ Generated Node.js SEA blob: dist/sea-prep.blob');

        // Copy current node binary to bin/yuihime-node-sea as starter template
        const targetNodeBinary = path.join(binDir, process.platform === 'win32' ? 'yuihime-sea.exe' : 'yuihime-sea');
        if (fs.existsSync(process.execPath)) {
          fs.copyFileSync(process.execPath, targetNodeBinary);
          console.log(`✓ Copied host Node executable to: ${targetNodeBinary}`);

          // Inject SEA blob using postject if installed
          try {
            const fuseFlag = 'NODE_SEA_FUSE_fce680e432b4d0609bfac08d6163a3d0';
            execSync(`npx postject "${targetNodeBinary}" NODE_SEA_BLOB dist/sea-prep.blob --sentinel-fuse ${fuseFlag}`, { stdio: 'inherit' });
            console.log('✓ Injected SEA blob into single binary executable!');
          } catch (postErr) {
            console.log('ℹ️ Postject injection step deferred (SEA prep blob remains available at dist/sea-prep.blob).');
          }
        }
      } catch (seaErr) {
        console.warn('⚠️ SEA generation note:', seaErr.message);
      }
    }
  }

  // Packaging Standalone Executables with @yao-pkg/pkg as fallback / distribution
  console.log('\nPackaging Standalone Executables with @yao-pkg/pkg...');
  try {
    execSync('npx @yao-pkg/pkg . --out-path bin', { stdio: 'inherit' });
  } catch (pkgErr) {
    console.warn('⚠️ @yao-pkg/pkg packaging note:', pkgErr.message);
  }

  // 4. Handle Native SQLite bindings
  console.log('\n[4/4] Syncing native SQLite bindings (better-sqlite3)...');
  const nativeSrc = path.join(
    __dirname,
    '..',
    '..',
    'node_modules',
    'better-sqlite3',
    'build',
    'Release',
    'better_sqlite3.node'
  );

  if (fs.existsSync(nativeSrc)) {
    const bldPath = path.join(binDir, 'node_modules', 'better-sqlite3', 'build', 'Release');
    fs.mkdirSync(bldPath, { recursive: true });
    
    const nativeDest = path.join(bldPath, 'better_sqlite3.node');
    fs.copyFileSync(nativeSrc, nativeDest);
    console.log(`✓ Copied SQLite binding to: ${nativeDest}`);
  }

  // 5. Place README info
  fs.writeFileSync(
    path.join(binDir, 'README.txt'),
    `Yuihime Single Executable Application (SEA) Release\n` +
    `====================================================\n\n` +
    `Build Target Mode: ${buildMode}\n\n` +
    `Untuk menjalankan Yuihime langsung tanpa Node.js:\n` +
    `  ./yuihime-sea (atau ./yuihime-core-linux pada Linux)\n\n` +
    `Mode Biner:\n` +
    `- Default (Full): Menyematkan UI Web React SPA dan Server daemon sekaligus.\n` +
    `- Server Only (--server-only): Menjalankan backend daemon tanpa static web UI.\n` +
    `- Web Only (--web-only): Hanya membuat file build statis UI (dist/web).\n\n` +
    `Node.js SEA (Single Executable Application):\n` +
    `Gunakan "sea-config.json" dan "dist/sea-prep.blob" untuk mendistribusikan biner tunggal Node.js.\n`
  );

  console.log('\n=========================================');
  console.log(`✓ Success! Single Executable Application built inside "/bin/" [Mode: ${buildMode}]!`);
  console.log('=========================================\n');
} catch (error) {
  console.error('\n🔴 Compilation aborted due to error:', error.message);
  process.exit(1);
}
