#!/usr/bin/env node
// Stress test: replicate message-pipeline DB pattern in a standalone loop.
//
// Goal: reproduce the native SQLite pager freeze (pread loop / open journal)
// so a fix can be verified WITHOUT the 85-120s bot boot cycle.
//
// Originally built to prove the FTS5 per-row trigger churn is the freeze root
// cause under proot (UserLAnd ARM). Migrated Yui uses FTS5 external-content
// (no triggers) + periodic rebuild, so this script should complete all
// iterations WITHOUT hanging.
//
// Pattern per iteration:
//   1. FTS5 memory search (MATCH + LIMIT 80 join)         [read]
//   2. memories COUNT + ORDER BY reads (nanonlp/prompt)   [read]
//   3. INSERT INTO memories (no FTS trigger in new schema)[write]
//   4. UPDATE a memory row                                [write]
//   5. DELETE a memory row                                [write]
//   6. bulk DELETE cleanup at the end                     [write]
//
// Portability:
//   - resolves better-sqlite3 from the repo's node_modules (run from repo root:
//     `node yui_tests/stress_db.cjs`)
//   - DB path via --db <path> or YUIHIME_DB env; default ~/.yuihime/data/yuihime.db
//   - --fresh  : create a scratch DB (minimal external-content FTS schema) in
//                os.tmpdir(), so it runs on any device with no real Yui DB
//   - --copy   : copy the source DB to a temp file first, run against the copy
//                (never touches the real database)
//   - env FTS=0 : disable/ignore FTS (for schema without memories_fts)
//   - env MMAP=1: enable mmap_size pragma
//
// Exit code 0 = completed all iterations without freeze.

const path = require('path');
const os = require('os');
const fs = require('fs');

let Database;
try {
  Database = require('better-sqlite3');
} catch (e) {
  try {
    Database = require(path.join(__dirname, '..', 'node_modules', 'better-sqlite3'));
  } catch (e2) {
    console.error('Cannot resolve better-sqlite3. Run from the repo root: node yui_tests/stress_db.cjs');
    process.exit(2);
  }
}

const args = process.argv.slice(2);
function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: node yui_tests/stress_db.cjs [iterations] [options]

Standalone SQLite pager stress test for YuiHime's memory pipeline.
Replicates the per-iteration pattern (FTS search + COUNT + recent reads +
INSERT/UPDATE/DELETE + bulk DELETE) to verify a schema does NOT hit the native
pager freeze under proot (exit 0 = completed all iterations without freeze).

Options:
  -h, --help            Show this help and exit
  --iter <n>            Number of iterations (default 300)
  --db <path>           Target DB file (default: YUIHIME_DB or ~/.yuihime/data/yuihime.db)
  --fresh               Create a scratch DB with minimal external-content FTS
                        schema in os.tmpdir(); no real Yui data needed
  --copy                Copy the source DB to a temp file first; real DB is
                        never modified

Env:
  YUIHIME_DB            DB path override
  FTS=0                 Disable FTS search/reads for this run
  MMAP=1                Enable mmap_size pragma

Examples:
  node yui_tests/stress_db.cjs --fresh --iter 300
  node yui_tests/stress_db.cjs --copy --iter 300
  node yui_tests/stress_db.cjs --db /tmp/test.db 400
`);
  process.exit(0);
}

const ITERATIONS = parseInt(argValue('--iter') || args[0] || '300', 10);
const MMAP = process.env.MMAP === '1';
const USE_FTS = process.env.FTS !== '0';
const FRESH = args.includes('--fresh');
const COPY = args.includes('--copy');
const DB_PATH = argValue('--db') || process.env.YUIHIME_DB || path.join(os.homedir(), '.yuihime', 'data', 'yuihime.db');

let target = DB_PATH;

if (FRESH) {
  target = path.join(os.tmpdir(), `stress-fresh-${process.pid}.db`);
  if (fs.existsSync(target)) fs.unlinkSync(target);
} else if (COPY) {
  if (!fs.existsSync(DB_PATH)) {
    console.error('Source DB not found:', DB_PATH);
    process.exit(2);
  }
  target = path.join(os.tmpdir(), `stress-copy-${process.pid}.db`);
  fs.copyFileSync(DB_PATH, target);
  console.log('Copied source DB to temp:', target);
}

console.log('DB:', target, '| iterations:', ITERATIONS, '| FTS:', USE_FTS, '| mmap:', MMAP);

const db = new Database(target);
db.pragma('journal_mode = DELETE');
db.pragma('busy_timeout = 15000');
db.pragma('cache_size = -64000');
if (MMAP) {
  db.pragma('mmap_size = 268435456');
  console.log('mmap_size:', db.pragma('mmap_size', { simple: true }));
}

if (FRESH) {
  db.exec(`
    CREATE TABLE memories (
      id TEXT PRIMARY KEY,
      type TEXT,
      content TEXT,
      importance REAL DEFAULT 0.5,
      tags TEXT DEFAULT '[]',
      context TEXT,
      sentiment TEXT,
      timestamp INTEGER,
      speaker TEXT,
      chat_type TEXT,
      meta TEXT
    );
    CREATE VIRTUAL TABLE memories_fts USING fts5(
      content, tags, content='memories', content_rowid='rowid'
    );
  `);
  console.log('Fresh scratch schema created (external-content FTS, no triggers).');
}

if (!USE_FTS) {
  try {
    db.exec('DROP TRIGGER IF EXISTS trg_memories_ai');
    db.exec('DROP TRIGGER IF EXISTS trg_memories_au');
    db.exec('DROP TRIGGER IF EXISTS trg_memories_ad');
  } catch (e) { /* schema may already have no triggers */ }
  console.log('FTS disabled for this run.');
}

const ftsStmt = db.prepare(`
  SELECT m.id, m.content, (memories_fts.rank * -1) as bm25_score
  FROM memories_fts JOIN memories m ON m.rowid = memories_fts.rowid
  WHERE memories_fts MATCH ? LIMIT 80`);
const countAgent = db.prepare("SELECT COUNT(*) c FROM memories WHERE speaker = 'agent'");
const recentReads = db.prepare("SELECT id, content FROM memories ORDER BY timestamp DESC LIMIT 20");
const ins = db.prepare(`INSERT INTO memories
  (id, type, content, importance, tags, context, sentiment, timestamp, speaker, chat_type, meta)
  VALUES (?, 'chat', ?, 0.5, '[]', 'stress-test', 0.5, ?, 'agent', 'telegram', '{}')`);
const upd = db.prepare('UPDATE memories SET content = ? WHERE id = ?');
const del = db.prepare('DELETE FROM memories WHERE id = ?');

const WORDS = ['budi', 'halo', 'apa', 'kabar', 'yui', 'kamu', 'cantik', 'makan', 'ikan', 'kucing', 'rumah', 'kerja', 'pagi', 'malam'];
let n = 0;
let inserted = 0;

const deadline = Date.now() + ITERATIONS * 2000; // sanity guard: if a freeze hits, let the parent timeout kill us
for (let i = 0; i < ITERATIONS; i++) {
  if (Date.now() > deadline) {
    console.error(`ABORT: iteration ${i} exceeded time budget — possible freeze.`);
    process.exit(3);
  }
  const q = WORDS.slice(0, 2 + (i % 4)).join(' OR ');
  if (USE_FTS) ftsStmt.all(q);
  countAgent.get();
  recentReads.all();
  const id = `stress-${process.pid}-${Date.now()}-${n++}`;
  ins.run(id, `pesan stress ${WORDS[n % WORDS.length]} ${q}`, Date.now());
  upd.run(`pesan stress diupdate ${WORDS[(n + 3) % WORDS.length]}`, id);
  if (i % 10 === 0) del.run(id);
  inserted++;
  if (i % 50 === 0) console.log('iter', i, Date.now());
}

console.log(`${ITERATIONS} iter OK (${inserted} inserts)`);
const bulk = db.prepare("DELETE FROM memories WHERE context = 'stress-test'").run();
console.log('bulk delete removed', bulk.changes);
db.close();
console.log('DONE: NO FREEZE');
process.exit(0);
