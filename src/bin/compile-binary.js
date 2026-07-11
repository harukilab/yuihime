const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('\n=========================================');
console.log('  Yuihime Autonomous Single Binary Build  ');
console.log('=========================================\n');

try {
  // 1. Run Production React & Express build
  console.log('[1/4] Compiling frontend and backend assets...');
  execSync('npm run build', { stdio: 'inherit' });

  // 2. Prepare distribution directory 'bin'
  console.log('\n[2/4] Preparing output directory "bin"...');
  const binDir = path.join(__dirname, '..', '..', 'bin');
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  // 3. Compile standalone binaries with pkg
  console.log('\n[3/4] Packaging Standalone Executables with pkg...');
  execSync('npx pkg . --out-path bin', { stdio: 'inherit' });

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
    console.log(`✓ Copied Linux AMD64 SQLite binding to: ${nativeDest}`);
  } else {
    console.warn('⚠️ Warning: Native SQLite better_sqlite3.node not found in default release folder.');
  }

  // 5. Place starter info
  fs.writeFileSync(
    path.join(binDir, 'README.txt'),
    `Yuihime Single Binary Executable Release\n` +
    `========================================\n\n` +
    `Untuk menjalankan Yuihime langsung tanpa Node.js:\n` +
    `  ./yuihime-core-linux (pada Linux)\n\n` +
    `Catatan Plug-and-Play:\n` +
    `1. Pastikan folder "addons", berkas "config.toml", dan database "yuihime.db" diletakkan\n` +
    `   di dalam folder yang sama dengan tempat kamu mengeksekusi biner ini agar tetap termuat.\n` +
    `2. Biner ini menyematkan seluruh berkas antarmuka web (React SPA) di dalamnya.\n` +
    `3. Untuk sistem operasi Windows atau macOS, letakkan berkas native "better_sqlite3.node"\n` +
    `   yang sesuai dengan sistem operasi kalian di jalur:\n` +
    `   ./node_modules/better-sqlite3/build/Release/better_sqlite3.node\n` +
    `   agar driver SQLite dapat berkomunikasi dengan mesin kognitif.\n`
  );

  console.log('\n=========================================');
  console.log('✓ Success! standalone packages created inside "/bin/"!');
  console.log('=========================================\n');
} catch (error) {
  console.error('\n🔴 Compilation aborted due to error:', error.message);
  process.exit(1);
}
