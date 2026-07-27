#!/usr/bin/env node

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

function resolveDbPath() {
  if (process.env.YUIHIME_DB_PATH && fs.existsSync(process.env.YUIHIME_DB_PATH)) {
    return process.env.YUIHIME_DB_PATH;
  }
  const dataDir = process.env.YUIHIME_DATA_DIR;
  if (dataDir && fs.existsSync(dataDir)) {
    return path.join(dataDir, 'yuihime.db');
  }
  const root = process.env.YUIHIME_SYSTEM_ROOT || process.env.YUIHIME_ROOT || '.yuihime';
  const candidates = [
    path.join(root, 'data', 'yuihime.db'),
    path.join(process.env.HOME || '/home/userland', root, 'data', 'yuihime.db'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(root, 'data', 'yuihime.db');
}

const DB_PATH = resolveDbPath();

if (!fs.existsSync(DB_PATH)) {
  console.error(`Database not found: ${DB_PATH}`);
  console.error('Set YUIHIME_DB_PATH or YUIHIME_DATA_DIR to the correct location.');
  process.exit(1);
}

const db = new Database(DB_PATH, { timeout: 10000 });
db.pragma('journal_mode = WAL');

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
  bgWhite: '\x1b[47m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
};

const c = (color, text) => `${COLORS[color]}${text}${COLORS.reset}`;

function clear() {
  process.stdout.write('\x1b[2J\x1b[H');
}

function hideCursor() {
  process.stdout.write('\x1b[?25l');
}

function showCursor() {
  process.stdout.write('\x1b[?25h');
}

function drawBox(title, lines, footer) {
  const width = Math.min(120, process.stdout.columns || 120);
  const top = `\u250c${'\u2500'.repeat(width - 2)}\u2510`;
  const bottom = `\u2514${'\u2500'.repeat(width - 2)}\u2518`;
  const mid = (text) => `\u2502${text.padEnd(width - 2, ' ')}\u2502`;
  const titleLine = mid(c('bold', c('cyan', ` ${title} `).padStart(Math.floor((width - 2 + title.length) / 2)).padEnd(width - 2)));
  
  let output = top + '\n' + titleLine + '\n';
  for (const line of lines) {
    output += mid(line) + '\n';
  }
  if (footer) {
    output += mid(c('dim', footer)) + '\n';
  }
  output += bottom;
  return output;
}

function getTables() {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  return rows.map(r => r.name);
}

function getTableInfo(tableName) {
  const cols = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const pk = cols.filter(c => c.pk > 0).map(c => c.name);
  return { columns: cols.map(c => c.name), primaryKey: pk.length ? pk : [cols[0]?.name].filter(Boolean) };
}

function getRowCount(tableName) {
  const row = db.prepare(`SELECT COUNT(*) as cnt FROM ${tableName}`).get();
  return row.cnt;
}

function fetchRows(tableName, offset, limit, whereClause = '', params = []) {
  const { primaryKey } = getTableInfo(tableName);
  const orderBy = primaryKey.length ? `ORDER BY ${primaryKey[0]}` : '';
  const rows = db.prepare(`SELECT * FROM ${tableName} ${whereClause} ${orderBy} LIMIT ? OFFSET ?`).all(...params, limit, offset);
  return rows;
}

function deleteRow(tableName, pkCols, pkVals) {
  const where = pkCols.map((c, i) => `${c} = ?`).join(' AND ');
  const stmt = db.prepare(`DELETE FROM ${tableName} WHERE ${where}`);
  return stmt.run(...pkVals);
}

function updateRow(tableName, pkCols, pkVals, col, val) {
  const where = pkCols.map((c, i) => `${c} = ?`).join(' AND ');
  const stmt = db.prepare(`UPDATE ${tableName} SET ${col} = ? WHERE ${where}`);
  return stmt.run(val, ...pkVals);
}

function insertRow(tableName, columns, values) {
  const cols = columns.join(', ');
  const placeholders = columns.map(() => '?').join(', ');
  const stmt = db.prepare(`INSERT INTO ${tableName} (${cols}) VALUES (${placeholders})`);
  return stmt.run(...values);
}

function formatCell(val, maxLen = 40) {
  if (val === null || val === undefined) return c('dim', 'NULL');
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  if (str.length > maxLen) return str.slice(0, maxLen - 3) + '...';
  return str;
}

function renderTable(tableName, offset, limit, selectedIdx, filterText = '') {
  const { columns, primaryKey } = getTableInfo(tableName);
  const total = getRowCount(tableName);
  const rows = fetchRows(tableName, offset, limit, filterText ? `WHERE ${columns.map(c => `CAST(${c} AS TEXT) LIKE ?`).join(' OR ')}` : '', filterText ? columns.map(() => `%${filterText}%`) : []);
  
  const width = Math.min(120, process.stdout.columns || 120);
  const colWidth = Math.floor((width - 2) / (columns.length + 1)) - 1;
  const header = columns.map(c => c.padEnd(colWidth)).join(' ');
  const sep = '\u2500'.repeat(width - 2);
  
  let lines = [];
  lines.push(c('cyan', header));
  lines.push(c('dim', sep));
  
  rows.forEach((row, idx) => {
    const vals = columns.map(col => formatCell(row[col], colWidth));
    const line = vals.join(' ');
    if (idx === selectedIdx) {
      lines.push(c('bgWhite', c('black', line)));
    } else {
      lines.push(line);
    }
  });
  
  const pageInfo = c('dim', `Row ${offset + 1}-${Math.min(offset + limit, total)} of ${total} | Page ${Math.floor(offset / limit) + 1}`);
  const help = c('dim', 'Arrow: nav | PgUp/PgDn: page | /: filter | E: edit | D: delete | I: insert | Q: back | S: SQL');
  
  return { lines, pageInfo, help, total, rows, columns, primaryKey };
}

async function editCell(tableName, row, col, pkCols, pkVals) {
  const current = row[col];
  clear();
  console.log(drawBox(`EDIT: ${tableName}.${col}`, [
    c('yellow', `Current value: ${formatCell(current, 80)}`),
    '',
    c('dim', 'Type new value and press Enter. Empty = NULL.'),
  ], 'Ctrl+C to cancel'));
  
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const val = await new Promise(resolve => rl.question(c('green', '> '), ans => { rl.close(); resolve(ans); }));
  
  if (val === '') {
    updateRow(tableName, pkCols, pkVals, col, null);
  } else {
    let parsed = val;
    if (val === 'true') parsed = true;
    else if (val === 'false') parsed = false;
    else if (!isNaN(val) && val !== '') parsed = Number(val);
    updateRow(tableName, pkCols, pkVals, col, parsed);
  }
}

async function insertRowPrompt(tableName, columns) {
  clear();
  const vals = [];
  for (const col of columns) {
    console.log(drawBox(`INSERT INTO ${tableName}`, [
      c('cyan', `Column: ${col}`),
      c('dim', 'Type value (leave empty for NULL):'),
    ]));
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const val = await new Promise(resolve => rl.question(c('green', '> '), ans => { rl.close(); resolve(ans); }));
    if (val === '') vals.push(null);
    else {
      let parsed = val;
      if (val === 'true') parsed = true;
      else if (val === 'false') parsed = false;
      else if (!isNaN(val) && val !== '') parsed = Number(val);
      vals.push(parsed);
    }
    clear();
  }
  try {
    insertRow(tableName, columns, vals);
    return true;
  } catch (e) {
    console.error(c('red', `Insert failed: ${e.message}`));
    await new Promise(r => setTimeout(r, 1500));
    return false;
  }
}

async function sqlConsole() {
  clear();
  console.log(drawBox('SQL CONSOLE', [
    c('yellow', 'Enter SQL queries.'),
    c('dim', 'Tables: ' + getTables().join(', ')),
    '', c('dim', 'Examples:'),
    c('dim', '  SELECT * FROM memories LIMIT 10'),
    c('dim', '  DELETE FROM telegram_update_ids WHERE processed_at < ?'),
    '', c('dim', 'Type "exit" or Ctrl+C to return.')
  ]));
  
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  while (true) {
    const sql = await new Promise(resolve => rl.question(c('green', 'SQL> '), ans => { resolve(ans.trim()); }));
    if (!sql || sql.toLowerCase() === 'exit' || sql.toLowerCase() === 'quit') break;
    if (!sql) continue;
    try {
      const upper = sql.toUpperCase().trim();
      if (upper.startsWith('SELECT') || upper.startsWith('PRAGMA') || upper.startsWith('EXPLAIN')) {
        const rows = db.prepare(sql).all();
        clear();
        if (rows.length === 0) {
          console.log(c('dim', 'No results.'));
        } else {
          const cols = Object.keys(rows[0]);
          const width = Math.min(120, process.stdout.columns || 120);
          const colWidth = Math.floor((width - 2) / cols.length) - 1;
          console.log(c('cyan', cols.map(co => co.padEnd(colWidth)).join(' ')));
          console.log(c('dim', '\u2500'.repeat(width - 2)));
          for (const row of rows) {
            console.log(cols.map(co => formatCell(row[co], colWidth)).join(' '));
          }
          console.log(c('dim', `\n${rows.length} rows returned.`));
        }
      } else {
        const res = db.prepare(sql).run();
        clear();
        console.log(c('green', `OK. Changes: ${res.changes}, Last insert ID: ${res.lastInsertRowId}`));
      }
    } catch (e) {
      clear();
      console.log(c('red', `Error: ${e.message}`));
    }
    console.log(c('dim', '\nPress Enter for new query, or type "exit"...'));
  }
}

async function tableView(tableName) {
  const limit = 20;
  let offset = 0;
  let selectedIdx = 0;
  let filterText = '';
  
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  process.stdin.setRawMode(true);
  
  return new Promise(resolve => {
    const render = () => {
      const { lines, pageInfo, help, total, rows, columns, primaryKey } = renderTable(tableName, offset, limit, selectedIdx, filterText);
      clear();
      const footer = `${pageInfo}  ${help}`;
      console.log(drawBox(`TABLE: ${tableName}`, lines, footer));
    };
    
    const keypress = async (str, key) => {
      if (key.ctrl && key.name === 'c') {
        cleanup();
        resolve();
        return;
      }
      
      const { total, rows, columns, primaryKey } = (() => {
        const r = renderTable(tableName, offset, limit, selectedIdx, filterText);
        return r;
      })();
      
      if (filterText) {
        if (key.name === 'escape') {
          filterText = '';
          selectedIdx = 0;
          render();
          return;
        }
        if (key.name === 'return') {
          filterText = '';
          selectedIdx = 0;
          offset = 0;
          render();
          return;
        }
        if (key.length === 1) {
          filterText += key;
          selectedIdx = 0;
          offset = 0;
          render();
          return;
        }
        if (key.name === 'backspace') {
          filterText = filterText.slice(0, -1);
          selectedIdx = 0;
          offset = 0;
          render();
          return;
        }
        return;
      }
      
      switch (key.name) {
        case 'q':
          cleanup();
          resolve();
          break;
        case 'arrowup':
          if (selectedIdx > 0) selectedIdx--;
          render();
          break;
        case 'arrowdown':
          if (selectedIdx < rows.length - 1) selectedIdx++;
          render();
          break;
        case 'pageup':
          offset = Math.max(0, offset - limit);
          selectedIdx = 0;
          render();
          break;
        case 'pagedown':
          if (offset + limit < total) offset += limit;
          selectedIdx = Math.min(selectedIdx, rows.length - 1);
          render();
          break;
        case '/':
          filterText = '';
          render();
          break;
        case 'e':
          if (rows.length > 0 && selectedIdx < rows.length) {
            const row = rows[selectedIdx];
            const colIdx = await new Promise(resolve => {
              clear();
              const colLines = columns.map((co, i) => `${i + 1}. ${co}`).concat([`${columns.length + 1}. Cancel`]);
              console.log(drawBox('SELECT COLUMN TO EDIT', colLines.map(l => l), ''));
              const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
              const ans = rl2.question(c('green', '> '), a => { rl2.close(); resolve(a); });
            });
            const ci = parseInt(colIdx) - 1;
            if (ci >= 0 && ci < columns.length) {
              const col = columns[ci];
              const pkVals = primaryKey.map(pk => row[pk]);
              await editCell(tableName, row, col, primaryKey, pkVals);
            }
          }
          render();
          break;
        case 'd':
          if (rows.length > 0 && selectedIdx < rows.length) {
            const row = rows[selectedIdx];
            const pkVals = primaryKey.map(pk => row[pk]);
            const confirm = await new Promise(resolve => {
              clear();
              console.log(drawBox('CONFIRM DELETE', [
                c('red', `Delete row with PK: ${JSON.stringify(pkVals)}?`),
                c('dim', 'Type "yes" to confirm, anything else to cancel.'),
              ]));
              const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
              const ans = rl2.question(c('green', '> '), a => { rl2.close(); resolve(a.toLowerCase()); });
            });
            if (confirm === 'yes') {
              deleteRow(tableName, primaryKey, pkVals);
              if (selectedIdx >= rows.length - 1 && offset > 0) offset -= limit;
              selectedIdx = Math.min(selectedIdx, rows.length - 2);
              if (selectedIdx < 0) selectedIdx = 0;
            }
          }
          render();
          break;
        case 'i':
          const inserted = await insertRowPrompt(tableName, columns);
          if (inserted) render();
          break;
        case 's':
          cleanup();
          await sqlConsole();
          process.stdin.setRawMode(true);
          process.stdin.on('data', onData);
          hideCursor();
          render();
          break;
      }
    };
    
    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.removeListener('data', onData);
      showCursor();
      clear();
    };
    
    const onData = (data) => {
      const str = data.toString();
      const key = { name: str, ctrl: str === '\x03', length: str.length };
      if (str === '\x1b[A') key.name = 'arrowup';
      else if (str === '\x1b[B') key.name = 'arrowdown';
      else if (str === '\x1b[5~') key.name = 'pageup';
      else if (str === '\x1b[6~') key.name = 'pagedown';
      else if (str === '\x1b') key.name = 'escape';
      else if (str === '\r') key.name = 'return';
      else if (str === '\x7f') key.name = 'backspace';
      else if (str === '\x03') key.name = 'c';
      keypress(str, key);
    };
    
    process.stdin.on('data', onData);
    hideCursor();
    render();
  });
}

async function mainMenu() {
  const tables = getTables();
  let selectedIdx = 0;
  
  const render = () => {
    clear();
    const lines = tables.map((t, i) => {
      const count = getRowCount(t);
      if (i === selectedIdx) return c('bgBlue', c('white', ` ${t} `.padEnd(20)) + c('dim', ` (${count} rows)`));
      return `${t.padEnd(20)} ${c('dim', `(${count} rows)`)}`;
    });
    console.log(drawBox('YUIHIME DB TUI', lines, 'Arrow: select | Enter: open | S: SQL | Q: quit'));
  };
  
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    process.stdin.setRawMode(true);
    
    const keypress = async (str, key) => {
      if (key.ctrl && key.name === 'c') {
        cleanup();
        resolve();
        return;
      }
      
      switch (key.name) {
        case 'arrowup':
          selectedIdx = (selectedIdx - 1 + tables.length) % tables.length;
          render();
          break;
        case 'arrowdown':
          selectedIdx = (selectedIdx + 1) % tables.length;
          render();
          break;
        case 'return':
        case 'enter':
          cleanup();
          await tableView(tables[selectedIdx]);
          process.stdin.setRawMode(true);
          process.stdin.on('data', onData);
          hideCursor();
          render();
          break;
        case 's':
          cleanup();
          await sqlConsole();
          process.stdin.setRawMode(true);
          process.stdin.on('data', onData);
          hideCursor();
          render();
          break;
        case 'q':
          cleanup();
          resolve();
          break;
      }
    };
    
    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.removeListener('data', onData);
      showCursor();
      clear();
    };
    
    const onData = (data) => {
      const str = data.toString();
      const key = { name: str, ctrl: str === '\x03', length: str.length };
      if (str === '\x1b[A') key.name = 'arrowup';
      else if (str === '\x1b[B') key.name = 'arrowdown';
      else if (str === '\r') key.name = 'enter';
      else if (str === '\x03') key.name = 'c';
      keypress(str, key);
    };
    
    process.stdin.on('data', onData);
    hideCursor();
    render();
  });
}

process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding('utf8');

mainMenu().then(() => {
  showCursor();
  console.log(c('green', 'Goodbye!'));
  process.exit(0);
}).catch(err => {
  showCursor();
  console.error(c('red', `Fatal: ${err.message}`));
  process.exit(1);
});
