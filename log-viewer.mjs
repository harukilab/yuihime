#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import Database from 'better-sqlite3';

const DB_PATH = '/home/userland/.yuihime/data/yuihime.db';

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

function colorize(text, color) {
  return `${COLORS[color] || ''}${text}${COLORS.reset}`;
}

function formatTimestamp(ts) {
  if (!ts) return 'N/A';
  const date = new Date(Number(ts));
  if (isNaN(date.getTime())) return String(ts);
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function truncate(str, len = 80) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '...' : str;
}

class LogViewer {
  constructor() {
    this.db = null;
    this.rl = null;
    this.currentView = 'menu';
    this.pageSize = 20;
    this.currentPage = 0;
    this.filter = '';
  }

  connect() {
    if (!fs.existsSync(DB_PATH)) {
      console.error(colorize(`Database not found: ${DB_PATH}`, 'red'));
      process.exit(1);
    }
    this.db = new Database(DB_PATH, { timeout: 10000 });
    this.db.pragma('journal_mode = WAL');
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  clear() {
    console.clear();
  }

  prompt(question) {
    return new Promise(resolve => {
      this.rl.question(question, answer => {
        resolve(answer.trim());
      });
    });
  }

  showMenu() {
    this.clear();
    console.log(colorize('=== YuiHime Log Viewer ===\n', 'cyan'));
    console.log('Available logs:');
    console.log(`  1. Performance Metrics (${this.getTableCount('performance_metrics')} rows)`);
    console.log(`  2. Recent Memories / Dialogues (${this.getTableCount('memories')} rows)`);
    console.log(`  3. Pending Messages (${this.getTableCount('pending_messages')} rows)`);
    console.log(`  4. Cron Tasks (${this.getTableCount('cron_tasks')} rows)`);
    console.log(`  5. Agent State History`);
    console.log(`  6. Telegram Users (${this.getTableCount('telegram_users')} rows)`);
    console.log(`  7. Identities (${this.getTableCount('identities')} rows)`);
    console.log('  8. Exit');
    console.log(colorize('\nTip: Select a number to view logs', 'gray'));
  }

  getTableCount(table) {
    try {
      const row = this.db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
      return row ? row.count : 0;
    } catch {
      return '?';
    }
  }

  async run() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    this.connect();

    while (true) {
      this.showMenu();
      const choice = await this.prompt('\nSelect log type: ');

      if (choice === '8' || choice.toLowerCase() === 'q' || choice.toLowerCase() === 'exit') {
        break;
      }

      switch (choice) {
        case '1':
          await this.viewPerformanceMetrics();
          break;
        case '2':
          await this.viewMemories();
          break;
        case '3':
          await this.viewPendingMessages();
          break;
        case '4':
          await this.viewCronTasks();
          break;
        case '5':
          await this.viewAgentState();
          break;
        case '6':
          await this.viewTelegramUsers();
          break;
        case '7':
          await this.viewIdentities();
          break;
        default:
          await this.prompt(colorize('Invalid selection. Press Enter to continue...', 'yellow'));
      }
    }

    this.close();
    this.rl.close();
    console.log(colorize('Goodbye!', 'green'));
  }

  async viewPerformanceMetrics() {
    this.currentPage = 0;
    this.filter = '';

    while (true) {
      this.clear();
      console.log(colorize('=== Performance Metrics ===\n', 'cyan'));
      console.log(colorize('Columns: timestamp | operation | latency(ms) | success | context', 'gray'));

      const offset = this.currentPage * this.pageSize;
      let rows;
      try {
        let query = `SELECT timestamp, operation, latency, success, context FROM performance_metrics ORDER BY timestamp DESC LIMIT ${this.pageSize} OFFSET ${offset}`;
        if (this.filter) {
          query = `SELECT timestamp, operation, latency, success, context FROM performance_metrics WHERE operation LIKE '%${this.filter}%' OR context LIKE '%${this.filter}%' ORDER BY timestamp DESC LIMIT ${this.pageSize} OFFSET ${offset}`;
        }
        rows = this.db.prepare(query).all();
      } catch (e) {
        console.error(colorize(`Query error: ${e.message}`, 'red'));
        await this.prompt('Press Enter to continue...');
        return;
      }

      if (rows.length === 0) {
        console.log(colorize('No metrics found.', 'yellow'));
      } else {
        rows.forEach((row, idx) => {
          const successColor = row.success ? 'green' : 'red';
          const successText = row.success ? 'OK' : 'FAIL';
          console.log(
            `${colorize(formatTimestamp(row.timestamp), 'gray')} | ` +
            `${colorize(row.operation.padEnd(20), 'blue')} | ` +
            `${colorize(String(row.latency).padStart(8), 'yellow')}ms | ` +
            `${colorize(successText, successColor)} | ` +
            `${colorize(truncate(row.context || '', 40), 'white')}`
          );
        });
      }

      console.log(colorize(`\nPage ${this.currentPage + 1} | Filter: "${this.filter || 'none'}"`, 'gray'));
      console.log(colorize('Commands: [n]ext [p]rev [f]ilter [c]lear [b]ack', 'gray'));
      const cmd = await this.prompt('\nAction: ');

      if (cmd === 'b') break;
      if (cmd === 'n') this.currentPage++;
      if (cmd === 'p' && this.currentPage > 0) this.currentPage--;
      if (cmd === 'f') {
        this.filter = await this.prompt('Enter filter text: ');
        this.currentPage = 0;
      }
      if (cmd === 'c') {
        this.filter = '';
        this.currentPage = 0;
      }
    }
  }

  async viewMemories() {
    this.currentPage = 0;
    this.filter = '';

    while (true) {
      this.clear();
      console.log(colorize('=== Recent Memories / Dialogues ===\n', 'cyan'));
      console.log(colorize('Columns: timestamp | speaker | type | content', 'gray'));

      const offset = this.currentPage * this.pageSize;
      let rows;
      try {
        let query = `SELECT timestamp, speaker, type, content FROM memories ORDER BY timestamp DESC LIMIT ${this.pageSize} OFFSET ${offset}`;
        if (this.filter) {
          query = `SELECT timestamp, speaker, type, content FROM memories WHERE content LIKE '%${this.filter}%' OR speaker LIKE '%${this.filter}%' ORDER BY timestamp DESC LIMIT ${this.pageSize} OFFSET ${offset}`;
        }
        rows = this.db.prepare(query).all();
      } catch (e) {
        console.error(colorize(`Query error: ${e.message}`, 'red'));
        await this.prompt('Press Enter to continue...');
        return;
      }

      if (rows.length === 0) {
        console.log(colorize('No memories found.', 'yellow'));
      } else {
        rows.forEach((row) => {
          const speakerColor = row.speaker === 'Yui' ? 'magenta' : (row.speaker === 'System' ? 'yellow' : 'white');
          console.log(
            `${colorize(formatTimestamp(row.timestamp), 'gray')} | ` +
            `${colorize((row.speaker || 'unknown').padEnd(12), speakerColor)} | ` +
            `${colorize((row.type || 'unknown').padEnd(12), 'blue')} | ` +
            `${colorize(truncate(row.content || '', 60), 'white')}`
          );
        });
      }

      console.log(colorize(`\nPage ${this.currentPage + 1} | Filter: "${this.filter || 'none'}"`, 'gray'));
      console.log(colorize('Commands: [n]ext [p]rev [f]ilter [c]lear [b]ack', 'gray'));
      const cmd = await this.prompt('\nAction: ');

      if (cmd === 'b') break;
      if (cmd === 'n') this.currentPage++;
      if (cmd === 'p' && this.currentPage > 0) this.currentPage--;
      if (cmd === 'f') {
        this.filter = await this.prompt('Enter filter text: ');
        this.currentPage = 0;
      }
      if (cmd === 'c') {
        this.filter = '';
        this.currentPage = 0;
      }
    }
  }

  async viewPendingMessages() {
    this.currentPage = 0;
    this.filter = '';

    while (true) {
      this.clear();
      console.log(colorize('=== Pending Messages ===\n', 'cyan'));
      console.log(colorize('Columns: id | sender | chat_type | status | attempts | timestamp', 'gray'));

      const offset = this.currentPage * this.pageSize;
      let rows;
      try {
        let query = `SELECT id, sender_name, chat_type, status, attempts, timestamp FROM pending_messages ORDER BY timestamp DESC LIMIT ${this.pageSize} OFFSET ${offset}`;
        if (this.filter) {
          query = `SELECT id, sender_name, chat_type, status, attempts, timestamp FROM pending_messages WHERE sender_name LIKE '%${this.filter}%' OR status LIKE '%${this.filter}%' ORDER BY timestamp DESC LIMIT ${this.pageSize} OFFSET ${offset}`;
        }
        rows = this.db.prepare(query).all();
      } catch (e) {
        console.error(colorize(`Query error: ${e.message}`, 'red'));
        await this.prompt('Press Enter to continue...');
        return;
      }

      if (rows.length === 0) {
        console.log(colorize('No pending messages.', 'yellow'));
      } else {
        rows.forEach((row) => {
          const statusColor = row.status === 'pending' ? 'yellow' : (row.status === 'completed' ? 'green' : 'red');
          console.log(
            `${colorize(row.id.slice(0, 8), 'gray')} | ` +
            `${colorize((row.sender_name || 'unknown').padEnd(12), 'white')} | ` +
            `${colorize((row.chat_type || 'unknown').padEnd(10), 'blue')} | ` +
            `${colorize(row.status, statusColor)} | ` +
            `${colorize(String(row.attempts).padStart(2), 'yellow')}x | ` +
            `${colorize(formatTimestamp(row.timestamp), 'gray')}`
          );
        });
      }

      console.log(colorize(`\nPage ${this.currentPage + 1} | Filter: "${this.filter || 'none'}"`, 'gray'));
      console.log(colorize('Commands: [n]ext [p]rev [f]ilter [c]lear [b]ack', 'gray'));
      const cmd = await this.prompt('\nAction: ');

      if (cmd === 'b') break;
      if (cmd === 'n') this.currentPage++;
      if (cmd === 'p' && this.currentPage > 0) this.currentPage--;
      if (cmd === 'f') {
        this.filter = await this.prompt('Enter filter text: ');
        this.currentPage = 0;
      }
      if (cmd === 'c') {
        this.filter = '';
        this.currentPage = 0;
      }
    }
  }

  async viewCronTasks() {
    this.currentPage = 0;

    while (true) {
      this.clear();
      console.log(colorize('=== Cron Tasks ===\n', 'cyan'));
      console.log(colorize('Columns: id | name | schedule | enabled | lastRun | nextRun', 'gray'));

      const offset = this.currentPage * this.pageSize;
      let rows;
      try {
        rows = this.db.prepare(`SELECT id, name, schedule, enabled, lastRun, nextRun FROM cron_tasks ORDER BY nextRun ASC LIMIT ${this.pageSize} OFFSET ${offset}`).all();
      } catch (e) {
        console.error(colorize(`Query error: ${e.message}`, 'red'));
        await this.prompt('Press Enter to continue...');
        return;
      }

      if (rows.length === 0) {
        console.log(colorize('No cron tasks found.', 'yellow'));
      } else {
        rows.forEach((row) => {
          const enabledColor = row.enabled ? 'green' : 'red';
          const enabledText = row.enabled ? 'ON' : 'OFF';
          console.log(
            `${colorize(row.id.slice(0, 8), 'gray')} | ` +
            `${colorize((row.name || 'unnamed').padEnd(20), 'white')} | ` +
            `${colorize(row.schedule, 'blue')} | ` +
            `${colorize(enabledText, enabledColor)} | ` +
            `${colorize(formatTimestamp(row.lastRun), 'gray')} | ` +
            `${colorize(formatTimestamp(row.nextRun), 'cyan')}`
          );
        });
      }

      console.log(colorize(`\nPage ${this.currentPage + 1}`, 'gray'));
      console.log(colorize('Commands: [n]ext [p]rev [b]ack', 'gray'));
      const cmd = await this.prompt('\nAction: ');

      if (cmd === 'b') break;
      if (cmd === 'n') this.currentPage++;
      if (cmd === 'p' && this.currentPage > 0) this.currentPage--;
    }
  }

  async viewAgentState() {
    this.clear();
    console.log(colorize('=== Agent State ===\n', 'cyan'));

    try {
      const rows = this.db.prepare('SELECT * FROM agent_state').all();
      if (rows.length === 0) {
        console.log(colorize('No agent state found.', 'yellow'));
      } else {
        rows.forEach((row) => {
          console.log(JSON.stringify(row, null, 2));
        });
      }
    } catch (e) {
      console.error(colorize(`Query error: ${e.message}`, 'red'));
    }

    await this.prompt('\nPress Enter to continue...');
  }

  async viewTelegramUsers() {
    this.currentPage = 0;

    while (true) {
      this.clear();
      console.log(colorize('=== Telegram Users ===\n', 'cyan'));
      console.log(colorize('Columns: tg_id | username | context | last_seen', 'gray'));

      const offset = this.currentPage * this.pageSize;
      let rows;
      try {
        rows = this.db.prepare(`SELECT tg_id, username, context, last_seen FROM telegram_users ORDER BY last_seen DESC LIMIT ${this.pageSize} OFFSET ${offset}`).all();
      } catch (e) {
        console.error(colorize(`Query error: ${e.message}`, 'red'));
        await this.prompt('Press Enter to continue...');
        return;
      }

      if (rows.length === 0) {
        console.log(colorize('No telegram users found.', 'yellow'));
      } else {
        rows.forEach((row) => {
          console.log(
            `${colorize(String(row.tg_id), 'white')} | ` +
            `${colorize((row.username || 'unknown').padEnd(15), 'blue')} | ` +
            `${colorize(truncate(row.context || '', 30), 'gray')} | ` +
            `${colorize(formatTimestamp(row.last_seen), 'cyan')}`
          );
        });
      }

      console.log(colorize(`\nPage ${this.currentPage + 1}`, 'gray'));
      console.log(colorize('Commands: [n]ext [p]rev [b]ack', 'gray'));
      const cmd = await this.prompt('\nAction: ');

      if (cmd === 'b') break;
      if (cmd === 'n') this.currentPage++;
      if (cmd === 'p' && this.currentPage > 0) this.currentPage--;
    }
  }

  async viewIdentities() {
    this.currentPage = 0;

    while (true) {
      this.clear();
      console.log(colorize('=== Identities ===\n', 'cyan'));
      console.log(colorize('Columns: id | perceivedName | realName | lastInteraction', 'gray'));

      const offset = this.currentPage * this.pageSize;
      let rows;
      try {
        rows = this.db.prepare(`SELECT id, perceivedName, realName, lastInteraction FROM identities ORDER BY lastInteraction DESC LIMIT ${this.pageSize} OFFSET ${offset}`).all();
      } catch (e) {
        console.error(colorize(`Query error: ${e.message}`, 'red'));
        await this.prompt('Press Enter to continue...');
        return;
      }

      if (rows.length === 0) {
        console.log(colorize('No identities found.', 'yellow'));
      } else {
        rows.forEach((row) => {
          console.log(
            `${colorize(row.id.slice(0, 12), 'gray')} | ` +
            `${colorize((row.perceivedName || 'unknown').padEnd(15), 'white')} | ` +
            `${colorize((row.realName || 'unknown').padEnd(15), 'blue')} | ` +
            `${colorize(formatTimestamp(row.lastInteraction), 'cyan')}`
          );
        });
      }

      console.log(colorize(`\nPage ${this.currentPage + 1}`, 'gray'));
      console.log(colorize('Commands: [n]ext [p]rev [b]ack', 'gray'));
      const cmd = await this.prompt('\nAction: ');

      if (cmd === 'b') break;
      if (cmd === 'n') this.currentPage++;
      if (cmd === 'p' && this.currentPage > 0) this.currentPage--;
    }
  }
}

const viewer = new LogViewer();
viewer.run().catch(err => {
  console.error(colorize(`Fatal error: ${err.message}`, 'red'));
  viewer.close();
  process.exit(1);
});
