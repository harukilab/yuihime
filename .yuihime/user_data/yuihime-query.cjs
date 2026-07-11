// Yuihime Interactive Sandbox Workspace Script
// Run: node yuihime-query.cjs
const Database = require('better-sqlite3');
const path = require('path');

// Dynamically locate the SQLite database
const dbPath = process.env.YUIHIME_DB_PATH || path.join(__dirname, '..', 'data', 'yuihime.db');
console.log(`\x1b[36m[System] Connecting to database at: ${dbPath}\x1b[0m\n`);

try {
  const db = new Database(dbPath, { readonly: true });
  
  // Query Agent State
  const stateRow = db.prepare("SELECT mood, emotion, systemHealth, activePersonaId FROM agent_state LIMIT 1").get();
  if (stateRow) {
    console.log("\x1b[32m=== YUIHIME STATUS REPORT ===\x1b[0m");
    console.log(`Active Persona : ${stateRow.activePersonaId}`);
    try {
      const mood = JSON.parse(stateRow.mood);
      console.log(`Current Mood   : ${mood.mood || 'calm'} (Energy: ${mood.energy ?? 100})`);
    } catch {}
    try {
      const emotion = JSON.parse(stateRow.emotion);
      console.log(`Emotions       : joy: ${emotion.joy ?? 0}%, affection: ${emotion.affection ?? 0}%`);
    } catch {}
    try {
      const health = JSON.parse(stateRow.systemHealth);
      console.log(`Neural Status  : CPU Load: ${health.cpuLoad ?? 'Ok'}, RAM: ${health.ramUsage ?? 'Ok'}`);
    } catch {}
  } else {
    console.log("No agent state found.");
  }

  // Query Recent Message Logs
  console.log("\n\x1b[35m=== RECENT CONVERSATIONS ===\x1b[0m");
  const messages = db.prepare("SELECT sender, text, timestamp FROM logs ORDER BY id DESC LIMIT 3").all();
  if (messages.length > 0) {
    messages.reverse().forEach(m => {
      const time = new Date(m.timestamp).toLocaleTimeString();
      console.log(`[${time}] ${m.sender}: ${m.text}`);
    });
  } else {
    console.log("No message logs found.");
  }
  
  db.close();
} catch (error) {
  console.error("\x1b[31m[Error] Failed to read Yuihime database:\x1b[0m", error.message);
  console.log("\nMake sure the system database has been initialized!");
}
