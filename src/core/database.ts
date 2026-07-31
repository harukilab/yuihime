import Database from "better-sqlite3";
import path from "path";
import { appendFileSync, existsSync, renameSync, mkdirSync, unlinkSync } from "fs";
import os from "os";
import { AUTO_CLEANUP_LIMITS } from "../../shared/constants.js";

function resolveHomePath(inputPath: string): string {
  if (!inputPath) return "";
  if (inputPath === "~") return os.homedir();
  if (inputPath.startsWith("~/") || inputPath.startsWith("~\\")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}

const rootEnvVal = resolveHomePath(process.env.YUIHIME_SYSTEM_ROOT || process.env.YUIHIME_ROOT || "~/.yuihime");
const defaultSystemRoot = path.isAbsolute(rootEnvVal) ? rootEnvVal : path.join(process.cwd(), rootEnvVal);
const defaultDataDir = process.env.YUIHIME_DATA_DIR ? resolveHomePath(process.env.YUIHIME_DATA_DIR) : path.join(defaultSystemRoot, "data");
export let dbPath = process.env.YUIHIME_DB_PATH ? resolveHomePath(process.env.YUIHIME_DB_PATH) : path.join(defaultDataDir, "yuihime.db");

const dbLogPath = path.join(defaultDataDir, "db-retry.log");

export function logDbRetry(label: string, message: string): void {
  try {
    const logDir = path.dirname(dbLogPath);
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${label}] ${message}\n`;
    appendFileSync(dbLogPath, line, "utf-8");
  } catch {}
}

let cachedDb: any = null;

export function closeDatabase() {
  if (cachedDb) {
    try {
      cachedDb.pragma('busy_timeout = 5000');
      cachedDb.close();
      console.log('[DATABASE] SQLite connection closed successfully.');
    } catch (err) {
      console.error('[DATABASE] Error closing SQLite connection:', err);
    }
    cachedDb = null;
  }
}

export function getDb() {
  return initializeDatabase();
}

export function initializeDatabase() {
  if (cachedDb) return cachedDb;
  const dbDir = path.dirname(dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  // Bersihin stale WAL/SHM dari crash sebelumnya agar SQLite start fresh
  try { if (existsSync(dbPath + '-wal')) unlinkSync(dbPath + '-wal'); } catch {}
  try { if (existsSync(dbPath + '-shm')) unlinkSync(dbPath + '-shm'); } catch {}

  try {
    const db = new Database(dbPath, { timeout: 60000 });
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 60000');
    db.pragma('synchronous = NORMAL');
    db.pragma('wal_autocheckpoint = 100000');
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
    } catch (checkpointErr: any) {
      console.warn('[DATABASE] Initial WAL checkpoint failed:', checkpointErr.message);
    }
    cachedDb = db;
    return db;
  } catch (error) {
    console.error("CRITICAL: Database initialization failed. Attempting recovery...", error);
    
    try {
      if (existsSync(dbPath)) {
        const backupPath = `${dbPath}.backup.${Date.now()}`;
        renameSync(dbPath, backupPath);
        console.log(`Successfully backed up corrupted database to ${backupPath}`);
      }
      
      const db = new Database(dbPath, { timeout: 30000 });
      db.pragma('journal_mode = WAL');
      db.pragma('busy_timeout = 30000');
      cachedDb = db;
      return db;
    } catch (recoveryError) {
      console.error("FATAL: Database recovery failed.", recoveryError);
      throw recoveryError;
    }
  }
}

export async function retryDbOperation<T>(operation: () => T, label = 'DB operation', maxRetries = 5): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return operation();
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('database is locked') || msg.includes('SQLITE_BUSY')) {
        attempt++;
        if (attempt > maxRetries) {
          logDbRetry(label, `FAILED after ${maxRetries} retries: ${msg}`);
          throw err;
        }
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
        console.warn(`[DB_RETRY] ${label} locked (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
        logDbRetry(label, `locked (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Synchronous wrapper untuk retryDbOperation
 * Gunakan untuk db.prepare().run() calls yang perlu retry
 */
export function withDbRetry<T>(
  operation: () => T,
  label: string = 'DB operation'
): T {
  return retryDbOperation(() => Promise.resolve(operation()), label, 5) as any;
}

export async function setupSchema(db: any) {
  const tables = {
    memories: `
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        type TEXT,
        content TEXT,
        importance REAL,
        tags TEXT,
        context TEXT,
        sentiment REAL,
        timestamp INTEGER,
        speaker TEXT,
        chat_type TEXT,
        meta TEXT
      );
    `,
    dreams: `
      CREATE TABLE IF NOT EXISTS dreams (
        id TEXT PRIMARY KEY,
        concept TEXT,
        abstractions TEXT,
        strength REAL,
        lastReinforced INTEGER,
        underlyingMemories TEXT
      );
    `,
    agent_state: `
      CREATE TABLE IF NOT EXISTS agent_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        status TEXT DEFAULT 'idle',
        mood TEXT,
        emotion TEXT,
        relation TEXT,
        systemHealth TEXT,
        lastDreamCycle INTEGER,
        lastRefreshed INTEGER,
        activePersonaId TEXT,
        currentPlan TEXT,
        aiConfig TEXT,
        avatarConfig TEXT
      );
    `,
    knowledge: `
      CREATE TABLE IF NOT EXISTS knowledge (
        id TEXT PRIMARY KEY,
        topic TEXT,
        content TEXT,
        tags TEXT,
        confidence REAL,
        updatedAt INTEGER
      );
    `,
    knowledge_files: `
      CREATE TABLE IF NOT EXISTS knowledge_files (
        name TEXT PRIMARY KEY,
        content TEXT,
        updatedAt INTEGER
      );
    `,
    history: `
      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry TEXT,
        cursor INTEGER,
        processed INTEGER DEFAULT 0,
        timestamp INTEGER
      );
    `,
    capabilities: `
      CREATE TABLE IF NOT EXISTS capabilities (
        id TEXT PRIMARY KEY,
        name TEXT,
        description TEXT,
        type TEXT,
        enabled INTEGER,
        config TEXT
      );
    `,
    custom_storage: `
      CREATE TABLE IF NOT EXISTS custom_storage (
        key TEXT PRIMARY KEY,
        value TEXT,
        updatedAt INTEGER
      );
    `,
    learned_strategies: `
      CREATE TABLE IF NOT EXISTS learned_strategies (
        id TEXT PRIMARY KEY,
        topic TEXT,
        instruction TEXT,
        confidence REAL,
        successCount INTEGER,
        failureCount INTEGER,
        lastOptimized INTEGER
      );
    `,
    performance_metrics: `
      CREATE TABLE IF NOT EXISTS performance_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER,
        operation TEXT,
        latency REAL,
        success INTEGER,
        context TEXT
      );
    `,
    telegram_users: `
      CREATE TABLE IF NOT EXISTS telegram_users (
        tg_id INTEGER PRIMARY KEY,
        username TEXT,
        context TEXT,
        last_seen INTEGER
      );
    `,
    identities: `
      CREATE TABLE IF NOT EXISTS identities (
        id TEXT PRIMARY KEY,
        perceivedName TEXT,
        realName TEXT,
        habits TEXT,
        importantFacts TEXT,
        linkedAccounts TEXT,
        lastInteraction INTEGER,
        ownerId TEXT,
        trust INTEGER DEFAULT 50,
        affection INTEGER DEFAULT 50,
        reputation INTEGER DEFAULT 50,
        yuiPerspective TEXT DEFAULT ''
      );
    `,
    cron_tasks: `
      CREATE TABLE IF NOT EXISTS cron_tasks (
        id TEXT PRIMARY KEY,
        name TEXT,
        schedule TEXT,
        action TEXT,
        prompt TEXT,
        enabled INTEGER,
        repeating INTEGER DEFAULT 0,
        lastRun INTEGER,
        nextRun INTEGER,
        context_id TEXT,
        chat_type TEXT,
        sender_name TEXT
      );
    `,
    pending_messages: `
      CREATE TABLE IF NOT EXISTS pending_messages (
        id TEXT PRIMARY KEY,
        input TEXT,
        sender_name TEXT,
        context_id TEXT,
        chat_type TEXT,
        timestamp INTEGER,
        attempts INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending'
      );
    `,
    pairing_codes: `
      CREATE TABLE IF NOT EXISTS pairing_codes (
        code TEXT PRIMARY KEY,
        identity_id TEXT,
        expires_at INTEGER,
        pending_account TEXT
      );
    `,
    telegram_update_ids: `
      CREATE TABLE IF NOT EXISTS telegram_update_ids (
        update_id INTEGER PRIMARY KEY,
        processed_at INTEGER,
        chat_id INTEGER,
        message_id INTEGER
      );
    `,
    telegram_reaction_feedback: `
      CREATE TABLE IF NOT EXISTS telegram_reaction_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL,
        tg_id INTEGER NOT NULL,
        sentiment_class TEXT NOT NULL,
        emoji_used TEXT NOT NULL,
        user_replied INTEGER DEFAULT 0,
        timestamp INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `,
    custom_personas: `
      CREATE TABLE IF NOT EXISTS custom_personas (
        id TEXT PRIMARY KEY,
        name TEXT,
        nickname TEXT,
        description TEXT,
        creatorNotes TEXT,
        version TEXT DEFAULT '1.0.0',
        behavior TEXT,
        modules TEXT,
        artistry TEXT,
        settings TEXT,
        color TEXT,
        traits TEXT,
        archetype TEXT,
        systemPrompt TEXT,
        createdAt INTEGER DEFAULT (strftime('%s', 'now')),
        updatedAt INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `
  };

  for (const [tableName, ddl] of Object.entries(tables)) {
    try {
      db.exec(ddl);
    } catch (e: any) {
      console.error(`ERROR: Failed to create table "${tableName}":`, e.message);
    }
  }

  // Optimized Secondary Indexes for instant database retrieval and query acceleration
  const indexes = {
    idx_memories_timestamp: "CREATE INDEX IF NOT EXISTS idx_memories_timestamp ON memories(timestamp);",
    idx_memories_speaker: "CREATE INDEX IF NOT EXISTS idx_memories_speaker ON memories(speaker);",
    idx_memories_type: "CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);",
    idx_memories_context: "CREATE INDEX IF NOT EXISTS idx_memories_context ON memories(context);",
    // Composite indexes for forgetfulness protocol — eliminates full-table scans on decay/purge queries
    idx_memories_context_ts: "CREATE INDEX IF NOT EXISTS idx_memories_context_ts ON memories(context, timestamp);",
    idx_memories_context_imp_ts: "CREATE INDEX IF NOT EXISTS idx_memories_context_imp_ts ON memories(context, importance, timestamp);",
    idx_memories_context_speaker_ts: "CREATE INDEX IF NOT EXISTS idx_memories_context_speaker_ts ON memories(context, speaker, timestamp);",
    // Pending messages index for fast status+attempts filter
    idx_pending_status_attempts: "CREATE INDEX IF NOT EXISTS idx_pending_status_attempts ON pending_messages(status, attempts, timestamp);",
    idx_identities_perceived: "CREATE INDEX IF NOT EXISTS idx_identities_perceived ON identities(perceivedName);",
    idx_history_timestamp: "CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(timestamp);",
    idx_cron_tasks_next: "CREATE INDEX IF NOT EXISTS idx_cron_tasks_next ON cron_tasks(nextRun);",
    idx_tg_users_last_seen: "CREATE INDEX IF NOT EXISTS idx_tg_users_last_seen ON telegram_users(last_seen);",
    idx_tg_update_ids_chat: "CREATE INDEX IF NOT EXISTS idx_tg_update_ids_chat ON telegram_update_ids(chat_id, processed_at);",
    idx_tg_reaction_feedback: "CREATE INDEX IF NOT EXISTS idx_tg_reaction_feedback ON telegram_reaction_feedback(chat_id, tg_id, sentiment_class, emoji_used);"
  };

  for (const [indexName, ddl] of Object.entries(indexes)) {
    try {
      db.exec(ddl);
    } catch (e: any) {
      console.error(`ERROR: Failed to create index "${indexName}":`, e.message);
    }
  }

  // --- Initialize FTS5 Search Index & Sync Triggers ---
  try {
    // Create virtual table using FTS5 for content indexing
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        id UNINDEXED,
        content,
        tags
      );
    `);

    // Sync triggers for INSERT
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(id, content, tags) VALUES (new.id, new.content, new.tags);
      END;
    `);

    // Sync triggers for UPDATE
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_memories_au AFTER UPDATE ON memories BEGIN
        UPDATE memories_fts SET content = new.content, tags = new.tags WHERE id = old.id;
      END;
    `);

    // Sync triggers for DELETE
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_memories_ad AFTER DELETE ON memories BEGIN
        DELETE FROM memories_fts WHERE id = old.id;
      END;
    `);

    // Backfill existing data if FTS5 is empty but memories has rows
    const ftsEmpty = db.prepare("SELECT COUNT(*) as count FROM memories_fts").get() as { count: number };
    if (ftsEmpty.count === 0) {
      const memoriesCount = db.prepare("SELECT COUNT(*) as count FROM memories").get() as { count: number };
      if (memoriesCount.count > 0) {
        db.exec(`
          INSERT INTO memories_fts(id, content, tags)
          SELECT id, content, tags FROM memories;
        `);
        console.log(`[DATABASE] Backfilled ${memoriesCount.count} existing memories into FTS5 index.`);
      }
    }
  } catch (ftsErr: any) {
    console.error("ERROR: Failed to initialize FTS5 memory index or triggers:", ftsErr.message);
  }

  // Schema Migration
  const migrationTables = ['agent_state', 'knowledge', 'cron_tasks', 'identities', 'pairing_codes', 'memories'];
  for (const table of migrationTables) {
    try {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
      const columnNames = columns.map(c => c.name);
      
      if (table === 'memories') {
        const alterCols = [
          { name: 'chat_type', type: 'TEXT' },
          { name: 'meta', type: 'TEXT' }
        ];
        for (const col of alterCols) {
          if (!columnNames.includes(col.name)) {
            try {
              db.prepare(`ALTER TABLE memories ADD COLUMN ${col.name} ${col.type}`).run();
            } catch (alterError: any) {
              console.warn(`Migration warn: failed to alter memories and add ${col.name}:`, alterError.message);
            }
          }
        }
      }
      if (table === 'agent_state') {
        const alterCols = [
          { name: 'status', type: "TEXT DEFAULT 'idle'" },
          { name: 'emotion', type: 'TEXT' },
          { name: 'activePersonaId', type: 'TEXT' },
          { name: 'currentPlan', type: 'TEXT' },
          { name: 'aiConfig', type: 'TEXT' },
          { name: 'avatarConfig', type: 'TEXT' }
        ];
        for (const col of alterCols) {
          if (!columnNames.includes(col.name)) {
            try {
              db.prepare(`ALTER TABLE agent_state ADD COLUMN ${col.name} ${col.type}`).run();
            } catch (alterError: any) {
              console.warn(`Migration warn: failed to alter agent_state and add ${col.name}:`, alterError.message);
            }
          }
        }
      }
      if (table === 'identities') {
        const alterCols = [
          { name: 'trust', type: 'INTEGER DEFAULT 50' },
          { name: 'affection', type: 'INTEGER DEFAULT 50' },
          { name: 'reputation', type: 'INTEGER DEFAULT 50' },
          { name: 'yuiPerspective', type: "TEXT DEFAULT ''" }
        ];
        for (const col of alterCols) {
          if (!columnNames.includes(col.name)) {
            try {
              db.prepare(`ALTER TABLE identities ADD COLUMN ${col.name} ${col.type}`).run();
            } catch (alterError: any) {
              console.warn(`Migration warn: failed to alter identities and add ${col.name}:`, alterError.message);
            }
          }
        }
      }
      if (table === 'knowledge') {
        const alterCols = [
          { name: 'confidence', type: 'REAL' },
          { name: 'updatedAt', type: 'INTEGER' }
        ];
        for (const col of alterCols) {
          if (!columnNames.includes(col.name)) {
            try {
              db.prepare(`ALTER TABLE knowledge ADD COLUMN ${col.name} ${col.type}`).run();
            } catch (alterError: any) {
              console.warn(`Migration warn: failed to alter knowledge and add ${col.name}:`, alterError.message);
            }
          }
        }
      }
      if (table === 'cron_tasks') {
        const alterCols = [
          { name: 'repeating', type: 'INTEGER DEFAULT 0' },
          { name: 'context_id', type: 'TEXT' },
          { name: 'chat_type', type: 'TEXT' },
          { name: 'sender_name', type: 'TEXT' },
          { name: 'prompt', type: 'TEXT' }
        ];
        for (const col of alterCols) {
          if (!columnNames.includes(col.name)) {
            try {
              db.prepare(`ALTER TABLE cron_tasks ADD COLUMN ${col.name} ${col.type}`).run();
            } catch (alterError: any) {
              console.warn(`Migration warn: failed to alter cron_tasks and add ${col.name}:`, alterError.message);
            }
          }
        }

        // Backfill empty prompts for cognitive jobs so schedule+command is never incomplete
        // (classic cron always stores a command; agents often only set a descriptive name).
        try {
          const refreshed = db.prepare(`PRAGMA table_info(cron_tasks)`).all() as any[];
          const names = refreshed.map((c: any) => c.name);
          if (names.includes('prompt')) {
            db.prepare(`
              UPDATE cron_tasks
              SET prompt = name
              WHERE (prompt IS NULL OR trim(prompt) = '')
                AND name IS NOT NULL AND trim(name) != ''
                AND id NOT IN ('memory-consolidation')
                AND id NOT LIKE 'file_auto_%'
                AND id NOT LIKE 'fa_%'
            `).run();
          }
        } catch (backfillErr: any) {
          console.warn('Migration warn: cron prompt backfill skipped:', backfillErr.message);
        }
      }
      if (table === 'pairing_codes') {
        const alterCols = [
          { name: 'pending_account', type: 'TEXT' }
        ];
        for (const col of alterCols) {
          if (!columnNames.includes(col.name)) {
            try {
              db.prepare(`ALTER TABLE pairing_codes ADD COLUMN ${col.name} ${col.type}`).run();
            } catch (alterError: any) {
              console.warn(`Migration warn: failed to alter pairing_codes and add ${col.name}:`, alterError.message);
            }
          }
        }
      }
    } catch (tableInfoError: any) {
      console.error(`ERROR: Migration checks failed for table "${table}":`, tableInfoError.message);
    }
  }
  
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch (checkpointErr: any) {
    console.warn('[DATABASE] WAL checkpoint failed:', checkpointErr.message);
  }
}

/**
 * Menggali seluruh pengenal platform unik dari sebuah identitas kognitif
 * guna membandingkan kedekatan identitas multiplatform secara presisi.
 */
function getStandardizedIdentifiers(iden: any): Set<string> {
  const ids = new Set<string>();
  
  // 1. Ekstrak dari id fisik
  if (iden.id) {
    const cleanId = iden.id.trim().toLowerCase();
    ids.add(cleanId);
    
    if (cleanId.startsWith("telegram_")) {
      const num = cleanId.replace("telegram_", "");
      ids.add(`telegram:id:${num}`);
      ids.add(`telegram:${num}`);
    }
  }

  // 2. Ekstrak dari source dan sourceId
  if (iden.sourceId) {
    const rawSrcId = iden.sourceId.trim().toLowerCase();
    ids.add(rawSrcId);
    
    const src = (iden.source || "").trim().toLowerCase();
    if (src) {
      ids.add(`${src}:${rawSrcId}`);
      if (src.includes("telegram")) {
        ids.add(`telegram:id:${rawSrcId}`);
        ids.add(`telegram:${rawSrcId}`);
      }
    }
  }

  // 3. Ekstrak dari daftar linkedAccounts
  let accounts: string[] = [];
  try {
    accounts = iden.linkedAccounts ? JSON.parse(iden.linkedAccounts) : [];
    if (!Array.isArray(accounts)) accounts = [];
  } catch {
    accounts = [];
  }

  for (const acc of accounts) {
    if (acc) {
      const cleanAcc = acc.trim().toLowerCase();
      ids.add(cleanAcc);
      
      if (cleanAcc.startsWith("telegram:id:")) {
        const num = cleanAcc.replace("telegram:id:", "");
        ids.add(`telegram_${num}`);
      } else if (cleanAcc.startsWith("telegram:")) {
        const handle = cleanAcc.replace("telegram:", "");
        ids.add(`telegram_${handle}`);
      }
    }
  }

  return ids;
}

/**
 * Menggabungkan identitas duplikat di database agar Yui tidak menganggap
 * akun Telegram dan sesi Web sebagai dua orang berbeda, melainkan satu kesatuan.
 */
export function deduplicateAndMergeIdentities(db: any, targetIdentityId: string) {
  try {
    const main = db.prepare("SELECT * FROM identities WHERE id = ?").get(targetIdentityId) as any;
    if (!main) return;

    let mainAccounts: string[] = [];
    try {
      mainAccounts = main.linkedAccounts ? JSON.parse(main.linkedAccounts) : [];
      if (!Array.isArray(mainAccounts)) mainAccounts = [];
    } catch {
      mainAccounts = [];
    }

    let mainImportantFacts: string[] = [];
    try {
      mainImportantFacts = main.importantFacts ? JSON.parse(main.importantFacts) : [];
      if (!Array.isArray(mainImportantFacts)) mainImportantFacts = [];
    } catch {
      mainImportantFacts = [];
    }

    let mainHabits: string[] = [];
    try {
      mainHabits = main.habits ? JSON.parse(main.habits) : [];
      if (!Array.isArray(mainHabits)) mainHabits = [];
    } catch {
      mainHabits = [];
    }

    // Set pengecualian pencocokan untuk pengenal generik/lokal agar tidak memicu salah gabung
    const genericIdentifiers = new Set([
      "", "local", "web", "web_local", "anonymous", "local_user", "localuser", 
      "anonymous_user", "local:local", "web:local", "web_local:local", "api"
    ]);

    // Ekstrak token pengenal unik terstandarisasi untuk identitas target utama
    const mainTokens = getStandardizedIdentifiers(main);

    // Cari seluruh identitas lain selain id ini
    const allIdentities = db.prepare("SELECT * FROM identities WHERE id != ?").all(targetIdentityId) as any[];
    const duplicatesToMerge: any[] = [];

    for (const iden of allIdentities) {
      // Ekstrak token pengenal unik terstandarisasi untuk identitas pembanding
      const idenTokens = getStandardizedIdentifiers(iden);
      let hasOverlappingAccount = false;

      // Periksa apakah terdapat pengenal tepercaya milik kedua akun yang saling beririsan
      for (const token of idenTokens) {
        if (!genericIdentifiers.has(token) && mainTokens.has(token)) {
          hasOverlappingAccount = true;
          break;
        }
      }

      const isCaseInsensitiveNameMatch = 
        main.perceivedName && 
        iden.perceivedName && 
        main.perceivedName.trim().toLowerCase() === iden.perceivedName.trim().toLowerCase();

      if (hasOverlappingAccount || isCaseInsensitiveNameMatch) {
        let idenAccounts: string[] = [];
        try {
          idenAccounts = iden.linkedAccounts ? JSON.parse(iden.linkedAccounts) : [];
          if (!Array.isArray(idenAccounts)) idenAccounts = [];
        } catch {
          idenAccounts = [];
        }
        duplicatesToMerge.push({ iden, accounts: idenAccounts });
      }
    }

    if (duplicatesToMerge.length === 0) {
      console.log(`[MERGE_IDENTITIES] No duplicate identities found with matching linked accounts for '${main.perceivedName}'.`);
      return;
    }

    console.log(`[MERGE_IDENTITIES] Detected ${duplicatesToMerge.length} duplicate identities. Starting cognitive merge to target profile '${main.perceivedName}' (ID: ${targetIdentityId})...`);

    let mergedAccounts = [...mainAccounts];
    let mergedFacts = [...mainImportantFacts];
    let mergedHabits = [...mainHabits];
    let maxTrust = main.trust !== undefined ? main.trust : 50;
    let maxAffection = main.affection !== undefined ? main.affection : 50;
    let maxReputation = main.reputation !== undefined ? main.reputation : 50;
    let lastInteraction = main.lastInteraction || Date.now();

    for (const dup of duplicatesToMerge) {
      const { iden, accounts } = dup;

      // Gabung akun tertaut
      mergedAccounts = [...mergedAccounts, ...accounts];

      // Gabung fakta penting batin
      try {
        const dupFacts = iden.importantFacts ? JSON.parse(iden.importantFacts) : [];
        if (Array.isArray(dupFacts)) {
          mergedFacts = [...mergedFacts, ...dupFacts];
        }
      } catch {}

      // Gabung rutinitas/habits
      try {
        const dupHabits = iden.habits ? JSON.parse(iden.habits) : [];
        if (Array.isArray(dupHabits)) {
          mergedHabits = [...mergedHabits, ...dupHabits];
        }
      } catch {}

      // Ambil level status relasi tertinggi/maksimum
      if (iden.trust !== undefined && iden.trust > maxTrust) maxTrust = iden.trust;
      if (iden.affection !== undefined && iden.affection > maxAffection) maxAffection = iden.affection;
      if (iden.reputation !== undefined && iden.reputation > maxReputation) maxReputation = iden.reputation;
      if (iden.lastInteraction && iden.lastInteraction > lastInteraction) lastInteraction = iden.lastInteraction;
    }

    // Sanitasi dan hilangkan duplikasi pada nilai array pengenal
    mergedAccounts = Array.from(new Set(mergedAccounts.map(a => a.trim()))).filter(Boolean);
    mergedFacts = Array.from(new Set(mergedFacts.map(f => f.trim()))).filter(Boolean);
    mergedHabits = Array.from(new Set(mergedHabits.map(h => h.trim()))).filter(Boolean);

    // Update profil utama dengan batin yang tergabung
    db.prepare(`
      UPDATE identities 
      SET linkedAccounts = ?, importantFacts = ?, habits = ?, trust = ?, affection = ?, reputation = ?, lastInteraction = ?
      WHERE id = ?
    `).run(
      JSON.stringify(mergedAccounts),
      JSON.stringify(mergedFacts),
      JSON.stringify(mergedHabits),
      maxTrust,
      maxAffection,
      maxReputation,
      lastInteraction,
      targetIdentityId
    );

    // Hapus entri identitas asal yang telah dilebur agar UI tetap ramping
    const deleteStmt = db.prepare(`DELETE FROM identities WHERE id = ?`);
    for (const dup of duplicatesToMerge) {
      deleteStmt.run(dup.iden.id);
      console.log(`[MERGE_IDENTITIES] Successfully integrated and liquidated duplicate identity ID: ${dup.iden.id}`);
    }

    // Hubungkan ulang context_id di telegram_users milik identitas lama ke identitas utama
    const updateTgStmt = db.prepare("UPDATE telegram_users SET context = ? WHERE context = ?");
    for (const dup of duplicatesToMerge) {
      updateTgStmt.run(`linked_identity:${targetIdentityId}`, `linked_identity:${dup.iden.id}`);
    }

    console.log(`[MERGE_IDENTITIES] Cross-platform cognitive merge completed for '${main.perceivedName}'!`);
  } catch (err: any) {
    console.error("[MERGE_IDENTITIES_ERROR] Failed to merge duplicate identities:", err.message || err);
  }
}

/**
 * Repositories segmenting SQL queries according to functional domains (Cognitive Memories, Platform Identities, Scheduling, System States).
 * This significantly organizes the codebase and optimizes transaction execution.
 */
export class MemoriesRepository {
  static getRecentByContext(db: any, context: string, limit = 50): any[] {
    return db.prepare(`
      SELECT * FROM memories 
      WHERE context = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `).all(context, limit).reverse();
  }

  static getRecentBySpeaker(db: any, speaker: string, limit = 50): any[] {
    return db.prepare(`
      SELECT * FROM memories 
      WHERE speaker = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `).all(speaker, limit).reverse();
  }

  static save(db: any, memory: any) {
    return db.prepare(`
      INSERT INTO memories (id, type, content, importance, tags, context, sentiment, timestamp, speaker, chat_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      memory.id,
      memory.type,
      memory.content,
      memory.importance || 0.5,
      memory.tags || '[]',
      memory.context,
      memory.sentiment || 0.0,
      memory.timestamp || Date.now(),
      memory.speaker,
      memory.chat_type
    );
  }

  static deleteByContext(db: any, context: string) {
    return db.prepare("DELETE FROM memories WHERE context = ?").run(context);
  }
}

export class IdentitiesRepository {
  static getById(db: any, id: string): any {
    return db.prepare("SELECT * FROM identities WHERE id = ?").get(id);
  }

  static getByPerceivedName(db: any, perceivedName: string): any {
    return db.prepare("SELECT * FROM identities WHERE LOWER(perceivedName) = ?").get(perceivedName.toLowerCase());
  }

  static save(db: any, identity: any) {
    return db.prepare(`
      INSERT INTO identities (id, perceivedName, realName, habits, importantFacts, linkedAccounts, lastInteraction, ownerId, trust, affection, reputation, yuiPerspective)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        perceivedName = excluded.perceivedName,
        realName = excluded.realName,
        habits = excluded.habits,
        importantFacts = excluded.importantFacts,
        linkedAccounts = excluded.linkedAccounts,
        lastInteraction = excluded.lastInteraction,
        trust = excluded.trust,
        affection = excluded.affection,
        reputation = excluded.reputation,
        yuiPerspective = excluded.yuiPerspective
    `).run(
      identity.id,
      identity.perceivedName,
      identity.realName || '',
      identity.habits || '[]',
      identity.importantFacts || '[]',
      identity.linkedAccounts || '[]',
      identity.lastInteraction || Date.now(),
      identity.ownerId || 'local_user',
      identity.trust !== undefined ? identity.trust : 50,
      identity.affection !== undefined ? identity.affection : 50,
      identity.reputation !== undefined ? identity.reputation : 50,
      identity.yuiPerspective || ''
    );
  }

  static updateMetrics(db: any, id: string, metrics: { trust: number; affection: number; reputation: number }) {
    return db.prepare(`
      UPDATE identities 
      SET trust = ?, affection = ?, reputation = ?, lastInteraction = ? 
      WHERE id = ?
    `).run(metrics.trust, metrics.affection, metrics.reputation, Date.now(), id);
  }
}

export class CronRepository {
  static getActiveTasks(db: any): any[] {
    return db.prepare("SELECT * FROM cron_tasks WHERE enabled = 1").all();
  }

  static saveTask(db: any, task: any) {
    return db.prepare(`
      INSERT INTO cron_tasks (id, name, schedule, action, prompt, enabled, repeating, lastRun, nextRun, context_id, chat_type, sender_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        schedule = excluded.schedule,
        action = excluded.action,
        prompt = excluded.prompt,
        enabled = excluded.enabled,
        repeating = excluded.repeating,
        lastRun = excluded.lastRun,
        nextRun = excluded.nextRun,
        context_id = excluded.context_id,
        chat_type = excluded.chat_type,
        sender_name = excluded.sender_name
    `).run(
      task.id,
      task.name,
      task.schedule,
      task.action,
      task.prompt || '',
      task.enabled ? 1 : 0,
      task.repeating ? 1 : 0,
      task.lastRun || 0,
      task.nextRun || 0,
      task.context_id || '',
      task.chat_type || '',
      task.sender_name || ''
    );
  }

  static deleteTask(db: any, id: string) {
    return db.prepare("DELETE FROM cron_tasks WHERE id = ?").run(id);
  }
}

export class StateRepository {
  static getAgentState(db: any): any {
    return db.prepare("SELECT * FROM agent_state WHERE id = 1").get();
  }

  static saveAgentState(db: any, state: any) {
    return db.prepare(`
      INSERT INTO agent_state (id, status, mood, emotion, relation, systemHealth, lastDreamCycle, lastRefreshed, activePersonaId, currentPlan, aiConfig, avatarConfig)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        mood = excluded.mood,
        emotion = excluded.emotion,
        relation = excluded.relation,
        systemHealth = excluded.systemHealth,
        lastDreamCycle = excluded.lastDreamCycle,
        lastRefreshed = excluded.lastRefreshed,
        activePersonaId = excluded.activePersonaId,
        currentPlan = excluded.currentPlan,
        aiConfig = excluded.aiConfig,
        avatarConfig = excluded.avatarConfig
    `).run(
      state.status || 'idle',
      state.mood || '{}',
      state.emotion || '{}',
      state.relation || '{}',
      state.systemHealth || '{}',
      state.lastDreamCycle || 0,
      state.lastRefreshed || Date.now(),
      state.activePersonaId || 'auto',
      state.currentPlan || '',
      state.aiConfig || '{}',
      state.avatarConfig || '{}'
    );
  }

  static getDreams(db: any): any[] {
    return db.prepare("SELECT * FROM dreams").all();
  }

  static getLearnedStrategies(db: any): any[] {
    return db.prepare("SELECT * FROM learned_strategies").all();
  }

  static recordMetric(db: any, operation: string, latency: number, success: number, context = '') {
    return db.prepare(`
      INSERT INTO performance_metrics (timestamp, operation, latency, success, context)
      VALUES (?, ?, ?, ?, ?)
    `).run(Date.now(), operation, latency, success, context);
  }
}

export class PersonasRepository {
  static getAll(db: any): any[] {
    const rows = db.prepare("SELECT * FROM custom_personas ORDER BY updatedAt DESC").all();
    return rows.map((r: any) => ({
      ...r,
      behavior: r.behavior ? JSON.parse(r.behavior) : null,
      modules: r.modules ? JSON.parse(r.modules) : null,
      artistry: r.artistry ? JSON.parse(r.artistry) : null,
      settings: r.settings ? JSON.parse(r.settings) : null,
      traits: r.traits ? JSON.parse(r.traits) : [],
    }));
  }

  static getById(db: any, id: string): any {
    const row = db.prepare("SELECT * FROM custom_personas WHERE id = ?").get(id);
    if (!row) return null;
    return {
      ...row,
      behavior: row.behavior ? JSON.parse(row.behavior) : null,
      modules: row.modules ? JSON.parse(row.modules) : null,
      artistry: row.artistry ? JSON.parse(row.artistry) : null,
      settings: row.settings ? JSON.parse(row.settings) : null,
      traits: row.traits ? JSON.parse(row.traits) : [],
    };
  }

  static save(db: any, persona: any) {
    return db.prepare(`
      INSERT INTO custom_personas (id, name, nickname, description, creatorNotes, version, behavior, modules, artistry, settings, color, traits, archetype, systemPrompt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        nickname = excluded.nickname,
        description = excluded.description,
        creatorNotes = excluded.creatorNotes,
        version = excluded.version,
        behavior = excluded.behavior,
        modules = excluded.modules,
        artistry = excluded.artistry,
        settings = excluded.settings,
        color = excluded.color,
        traits = excluded.traits,
        archetype = excluded.archetype,
        systemPrompt = excluded.systemPrompt,
        updatedAt = excluded.updatedAt
    `).run(
      persona.id,
      persona.name,
      persona.nickname || null,
      persona.description,
      persona.creatorNotes || null,
      persona.version || '1.0.0',
      persona.behavior ? JSON.stringify(persona.behavior) : null,
      persona.modules ? JSON.stringify(persona.modules) : null,
      persona.artistry ? JSON.stringify(persona.artistry) : null,
      persona.settings ? JSON.stringify(persona.settings) : null,
      persona.color || null,
      JSON.stringify(persona.traits || []),
      persona.archetype || null,
      persona.systemPrompt || null,
      Date.now()
    );
  }

  static delete(db: any, id: string) {
    return db.prepare("DELETE FROM custom_personas WHERE id = ?").run(id);
  }
}

// ---------------------------------------------------------------------------
// Auto-Cleanup: purge stale rows from append-only tables to prevent unbounded growth.
// All limits are sourced from shared/constants.ts AUTO_CLEANUP_LIMITS — no hardcodes here.
// ---------------------------------------------------------------------------

export interface CleanupResult {
  performance_metrics: number;
  history: number;
  telegram_update_ids: number;
  pending_messages: number;
  pairing_codes: number;
}

/**
 * Purges excess/stale rows from the four high-churn tables.
 * Safe to call at startup and periodically (e.g. every 6 h).
 * Returns the number of rows deleted per table.
 */
export function runAutoCleanup(db: any): CleanupResult {
  const result: CleanupResult = {
    performance_metrics: 0,
    history: 0,
    telegram_update_ids: 0,
    pending_messages: 0,
    pairing_codes: 0,
  };

  // 1. performance_metrics — keep the N most recent rows.
  try {
    const limit = AUTO_CLEANUP_LIMITS.performance_metrics_max_rows;
    const { total } = db.prepare(`SELECT COUNT(*) AS total FROM performance_metrics`).get() as { total: number };
    if (total > limit) {
      const cutoff = db.prepare(
        `SELECT timestamp FROM performance_metrics ORDER BY timestamp DESC LIMIT 1 OFFSET ?`
      ).get(limit - 1) as { timestamp: number } | undefined;
      if (cutoff) {
        const r = db.prepare(`DELETE FROM performance_metrics WHERE timestamp < ?`).run(cutoff.timestamp);
        result.performance_metrics = r.changes;
      }
    }
  } catch (e: any) {
    console.warn('[AUTO_CLEANUP] performance_metrics:', e.message);
  }

  // 2. history — keep the N most recent rows.
  try {
    const limit = AUTO_CLEANUP_LIMITS.history_max_rows;
    const { total } = db.prepare(`SELECT COUNT(*) AS total FROM history`).get() as { total: number };
    if (total > limit) {
      const cutoff = db.prepare(
        `SELECT id FROM history ORDER BY id DESC LIMIT 1 OFFSET ?`
      ).get(limit - 1) as { id: number } | undefined;
      if (cutoff) {
        const r = db.prepare(`DELETE FROM history WHERE id < ?`).run(cutoff.id);
        result.history = r.changes;
      }
    }
  } catch (e: any) {
    console.warn('[AUTO_CLEANUP] history:', e.message);
  }

  // 3. telegram_update_ids — delete entries older than retain_days.
  try {
    const retainMs = AUTO_CLEANUP_LIMITS.telegram_update_ids_retain_days * 24 * 60 * 60 * 1000;
    const cutoffTs = Date.now() - retainMs;
    const r = db.prepare(`DELETE FROM telegram_update_ids WHERE processed_at < ?`).run(cutoffTs);
    result.telegram_update_ids = r.changes;
  } catch (e: any) {
    console.warn('[AUTO_CLEANUP] telegram_update_ids:', e.message);
  }

  // 4. pending_messages — delete terminal-status rows older than ttl_minutes.
  try {
    const ttlMs = AUTO_CLEANUP_LIMITS.pending_messages_ttl_minutes * 60 * 1000;
    const cutoffTs = Date.now() - ttlMs;
    const r = db.prepare(
      `DELETE FROM pending_messages WHERE status IN ('done', 'failed', 'delivered') AND timestamp < ?`
    ).run(cutoffTs);
    result.pending_messages = r.changes;
  } catch (e: any) {
    console.warn('[AUTO_CLEANUP] pending_messages:', e.message);
  }

  // 5. pairing_codes — delete expired codes (column expires_at already encodes expiry).
  try {
    const r = db.prepare(`DELETE FROM pairing_codes WHERE expires_at < ?`).run(Date.now());
    result.pairing_codes = r.changes;
  } catch (e: any) {
    console.warn('[AUTO_CLEANUP] pairing_codes:', e.message);
  }

  const total = Object.values(result).reduce((s, v) => s + v, 0);
  if (total > 0) {
    console.log(`[AUTO_CLEANUP] Purged ${total} stale rows:`, result);
  }
  return result;
}

/**
 * Schedules runAutoCleanup() to run at startup and then every cleanup_interval_ms.
 * Returns the interval handle so the caller can clearInterval if needed.
 */
export function startAutoCleanupScheduler(db: any): ReturnType<typeof setInterval> {
  // Run once immediately on startup
  try { runAutoCleanup(db); } catch (e: any) {
    console.warn('[AUTO_CLEANUP] Initial run failed:', e.message);
  }

  const interval = AUTO_CLEANUP_LIMITS.cleanup_interval_ms;
  return setInterval(() => {
    try { runAutoCleanup(db); } catch (e: any) {
      console.warn('[AUTO_CLEANUP] Scheduled run failed:', e.message);
    }
  }, interval);
}
