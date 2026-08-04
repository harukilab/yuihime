import { ModuleType } from '@shared/include/types';
import { SystemRegistry } from '@shared/core/registry';
import { spawn, spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { extractJsonObject } from '../../core/cortex/jsonExtract.js';
import { getTzOffsetHours, formatLocalFullEn, formatLocalDateKey, tzLabel } from '../../core/utils/dualClock.js';
import { createGoal } from '../../core/goalDecomposition.js';
import { SettingsManager } from '../../core/kernel/settings.js';

const manifest = {
  "id": "telegram_quick_tools",
  "name": "Telegram Quick Toolkit",
  "description": "Direct Telegram commands (starting with '/') handled without the LLM: inline keyboard menu, quick info, daemon management (yui-watchdog.sh + yui-debug.sh + PM2), tool rebuild, and Yui internal tool access for admins (/bash, /img, /ls, /cat, /get).",
  "version": "1.3.0",
  "type": "gateway",
  "order": 202,
  "configSchema": {
    "fields": {
      "enabled": {
        "type": "boolean",
        "label": "Enable Toolkit",
        "description": "Enable quick Telegram commands handled directly without the LLM.",
        "default": true
      },
      "showMenuHint": {
        "type": "boolean",
        "label": "Show /menu hint",
        "description": "When an unknown '/' command is received, show the command list and inline keyboard menu.",
        "default": true
      },
      "usePm2": {
        "type": "boolean",
        "label": "Use PM2 (optional)",
        "description": "DEFAULT is no PM2 (watchdog + yui-debug.sh, single-process daemon). When enabled, YuiHime runs as a PM2 daemon via tools/yui-pm2.sh — the local watchdog is skipped.",
        "default": false
      }
    }
  },
  "parameters": {
    "type": "object",
    "properties": {}
  }
} as const;

export interface TgReply {
  text: string;
  keyboard?: any;
}

export interface TgToolContext {
  ctx: any;
  db: any;
  settings: Record<string, any>;
  bot: any;
  startedAt?: number;
}

export interface TgCommandDef {
  name: string;
  aliases?: string[];
  description: string;
  adminOnly?: boolean;
  usage?: string;
  handler: (tc: TgToolContext, args: string) => Promise<TgReply>;
}

// ───────────────────────── Daemon management ─────────────────────────
const DEBUG_SCRIPT = 'tools/yui-debug.sh';
const WATCHDOG_SCRIPT = 'tools/yui-watchdog.sh';
const PM2_SCRIPT = 'tools/yui-pm2.sh';
const PM2_APP = 'yuihime';

function debugDir(): string {
  return path.join(os.homedir(), '.yuihime', 'debug');
}

function projectDir(): string {
  const cwd = process.cwd();
  const candidates = [
    cwd,
    path.resolve(cwd, '..')
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(path.join(c, 'tools', 'yui-debug.sh'))) return c;
    } catch {}
  }
  return cwd;
}

function hasDist(p: string): boolean {
  try { return fs.existsSync(path.join(p, 'dist', 'server.cjs')); } catch { return false; }
}

function daemonMode(p: string): string {
  return hasDist(p) ? 'prod' : 'dev';
}

function processAlive(pid: number): boolean {
  if (!pid || !Number.isInteger(pid)) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function daemonRunning(): boolean {
  try {
    const meta = path.join(debugDir(), 'current.meta');
    if (!fs.existsSync(meta)) return false;
    const pid = parseInt(String(fs.readFileSync(meta, 'utf8').split('\n')[0]).trim(), 10);
    return processAlive(pid);
  } catch { return false; }
}

function watchdogRunning(): boolean {
  try {
    const pidfile = path.join(debugDir(), 'watchdog.pid');
    if (!fs.existsSync(pidfile)) return false;
    const pid = parseInt(fs.readFileSync(pidfile, 'utf8').trim(), 10);
    return processAlive(pid);
  } catch { return false; }
}

function pm2Available(): boolean {
  try {
    spawnSync('bash', ['-c', 'command -v pm2 >/dev/null 2>&1'], { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

function usePm2Setting(tc: TgToolContext): boolean {
  return tc.settings?.['telegram_quick_tools']?.usePm2 === true;
}

interface ShellResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

function runShell(cmd: string, opts: { cwd: string; timeoutMs?: number; maxBuffer?: number }): Promise<ShellResult> {
  return new Promise((resolve) => {
    let settled = false;
    const cap = opts.maxBuffer || 1024 * 1024;
    let stdout = '';
    let stderr = '';
    let child: any;
    try {
      child = spawn('bash', ['-c', cmd], {
        cwd: opts.cwd,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (e: any) {
      resolve({ ok: false, code: -1, stdout: '', stderr: e?.message || String(e) });
      return;
    }
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
    }, opts.timeoutMs || 60000);
    child.stdout?.on('data', (d: Buffer) => { stdout = (stdout + d.toString()).slice(-cap); });
    child.stderr?.on('data', (d: Buffer) => { stderr = (stderr + d.toString()).slice(-cap); });
    child.on('error', (e: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, code: -1, stdout, stderr: e.message });
    });
    child.on('close', (code: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: code === 0, code: code ?? -1, stdout, stderr });
    });
  });
}

async function pm2Info(cwd: string): Promise<string> {
  if (!pm2Available()) return 'Not installed';
  const r = await runShell('pm2 jlist', { cwd, timeoutMs: 8000, maxBuffer: 512 * 1024 });
  if (!r.ok) return 'Installed (query failed)';
  try {
    const m = r.stdout.match(/\[[\s\S]*\]/);
    if (!m) return 'Installed (no apps)';
    const list = JSON.parse(m[0]);
    const app = (list || []).find((p: any) => String(p?.name || '').toLowerCase() === PM2_APP);
    if (!app) return 'Installed (no "yuihime" app)';
    return `Installed — ${app.name}: ${app?.pm2_env?.status || '?'}`;
  } catch {
    return 'Installed (parse failed)';
  }
}

const DAEMON_HELP =
  '🛠️ DAEMON COMMANDS (admin only)\n\n' +
  '/daemon status — daemon, watchdog & PM2 status\n' +
  '/daemon start — start daemon (DEFAULT: watchdog + yui-debug.sh)\n' +
  '/daemon stop — stop daemon safely\n' +
  '/daemon restart — restart daemon\n' +
  '/daemon logs [N] — show last N log lines (default 40; live only in terminal)\n' +
  '/daemon help — this help\n\n' +
  '🐘 PM2 MODE (optional):\n' +
  '  Enable the "usePm2" setting in Modules → Telegram Quick Tools.\n' +
  '  When on, /daemon start/restart runs YuiHime under a PM2 daemon\n' +
  '  via tools/yui-pm2.sh (local watchdog skipped). Default = no PM2.\n\n' +
  '🔨 TOOL REBUILD\n' +
  '/rebuild — rebuild project (npm run build: web + server)\n' +
  '/rebuild help — rebuild help\n' +
  '  Runs in the background; result is sent to this chat when done (~30-60s).';

const REBUILD_HELP =
  '🔨 TOOL REBUILD\n\n' +
  'Usage:\n' +
  '  /rebuild — run npm run build in the background\n' +
  '  /rebuild help — this help\n\n' +
  'What it does:\n' +
  '  - web: Vite build (dist/web)\n' +
  '  - server: esbuild bundle (dist/server.cjs)\n\n' +
  'Result is sent to this chat when finished.\n' +
  'Requires: npm available + write access to the project. Time: ~30-60 seconds.';

function sendDaemonNote(tc: TgToolContext, text: string) {
  const chatId = tc.ctx?.chat?.id;
  if (chatId == null) return;
  try {
    tc.ctx?.telegram?.sendMessage(chatId, text).catch((e: any) => {
      console.warn('[TG_DAEMON] Failed to send notification:', e?.message || e);
    });
  } catch (e: any) {
    console.warn('[TG_DAEMON] Failed to send notification:', e?.message || e);
  }
}

function startRebuild(tc: TgToolContext, proj: string) {
  let out = '';
  const cap = 256 * 1024;
  let child: any;
  try {
    child = spawn('npm', ['run', 'build'], {
      cwd: proj,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (e: any) {
    sendDaemonNote(tc, `❌ Failed to run npm: ${e?.message || e}`);
    return;
  }
  child.stdout?.on('data', (d: Buffer) => { out = (out + d.toString()).slice(-cap); });
  child.stderr?.on('data', (d: Buffer) => { out = (out + d.toString()).slice(-cap); });
  child.on('error', (e: Error) => {
    sendDaemonNote(tc, `❌ Failed to run npm: ${e?.message || e}`);
  });
  child.on('close', (code: number) => {
    const tail = out.trim().split('\n').slice(-18).join('\n') || '(no output)';
    const head = code === 0 ? '✅ Rebuild SUCCESS' : `❌ Rebuild FAILED (exit ${code ?? '?'})`;
    sendDaemonNote(tc, `${head}\n\n${tail}`);
  });
}

async function ensureWatchdogPath(lines: string[], proj: string, mode: string) {
  if (watchdogRunning()) {
    lines.push('🛡️ Watchdog: already active (supervising daemon)');
  } else {
    const w = await runShell(`${WATCHDOG_SCRIPT} start ${mode}`, { cwd: proj, timeoutMs: 30000 });
    lines.push('🛡️ Watchdog: ' + (w.ok ? 'active (supervising daemon)' : `failed — ${w.stderr.trim().slice(0, 200) || w.stdout.trim().slice(0, 200) || 'check logs'}`));
  }
}

async function daemonSub(sub: string, tc: TgToolContext, args?: string): Promise<TgReply> {
  const proj = projectDir();
  const mode = daemonMode(proj);
  const extra = args || '';

  switch (sub) {
    case 'help':
      return { text: DAEMON_HELP };

    case 'status': {
      const s = await runShell(`${DEBUG_SCRIPT} status`, { cwd: proj, timeoutMs: 20000 });
      const debugOut = s.ok
        ? s.stdout.trim().split('\n').slice(0, 12).join('\n')
        : `(yui-debug.sh failed: ${s.stderr.trim().slice(0, 300) || 'no output'})`;
      const wd = watchdogRunning() ? '🟢 ACTIVE' : '🔴 DOWN';
      const pm = await pm2Info(proj);
      const pmMode = usePm2Setting(tc) ? 'ACTIVE (usePm2 setting)' : 'INACTIVE (default)';
      return { text: `⚙️ Daemon Status\n\n${debugOut}\n\n🛡️ Watchdog: ${wd}\n🐘 PM2 mode: ${pmMode}\n🐘 PM2 app: ${pm}` };
    }

    case 'start': {
      const lines: string[] = ['🟢 Start Daemon'];
      const usePm2 = usePm2Setting(tc);
      if (usePm2 && pm2Available()) {
        if (daemonRunning()) {
          lines.push('🐘 PM2: local daemon is still running — stop it first (avoid port conflict): /daemon stop');
        } else {
          const r = await runShell(`${PM2_SCRIPT} start ${mode}`, { cwd: proj, timeoutMs: 60000 });
          lines.push('🐘 PM2: ' + (r.ok
            ? 'started via tools/yui-pm2.sh OK'
            : `failed — ${r.stderr.trim().slice(0, 200) || r.stdout.trim().slice(0, 200) || 'see /daemon logs'}`));
        }
      } else if (usePm2 && !pm2Available()) {
        lines.push('🐘 PM2: enabled but PM2 is not installed — falling back to watchdog + yui-debug.sh');
        await ensureWatchdogPath(lines, proj, mode);
      } else {
        lines.push('🐘 PM2: INACTIVE (default) — using watchdog + yui-debug.sh (single-process daemon)');
        await ensureWatchdogPath(lines, proj, mode);
      }
      lines.push(`📁 Mode: ${mode} | Project: ${proj}`);
      return { text: lines.join('\n') };
    }

    case 'stop': {
      const usePm2 = usePm2Setting(tc);
      const body = usePm2 && pm2Available()
        ? '⏹️ Stopping daemon...\n\n- PM2: tools/yui-pm2.sh stop\n- Local daemon: graceful SIGINT (if any)'
        : '⏹️ Stopping daemon...\n\n- Watchdog: stopped\n- Daemon: graceful SIGINT (SIGKILL fallback)';
      setTimeout(() => {
        const cmd = usePm2 && pm2Available()
          ? `${PM2_SCRIPT} stop; ${DEBUG_SCRIPT} stop`
          : `${WATCHDOG_SCRIPT} stop; ${DEBUG_SCRIPT} stop`;
        void runShell(cmd, { cwd: proj, timeoutMs: 60000 });
      }, 2500);
      return { text: body };
    }

    case 'restart': {
      const usePm2 = usePm2Setting(tc);
      if (usePm2 && pm2Available()) {
        setTimeout(() => {
          void runShell(`${PM2_SCRIPT} restart ${mode}`, { cwd: proj, timeoutMs: 120000 });
        }, 2500);
        return { text: `🔄 Restarting daemon via PM2 (mode ${mode})...\n\nReply is sent first, then the PM2 app '${PM2_APP}' is restarted.` };
      }
      setTimeout(() => {
        void runShell(`${WATCHDOG_SCRIPT} stop; ${DEBUG_SCRIPT} restart ${mode}; ${WATCHDOG_SCRIPT} start ${mode}`, { cwd: proj, timeoutMs: 120000 });
      }, 2500);
      return { text: `🔄 Restarting daemon (mode ${mode})...\n\nReply is sent first, then the daemon is restarted (watchdog + yui-debug.sh).` };
    }

    case 'logs': {
      if (/live|^-f$|^-live$/i.test(extra.trim())) {
        return { text: '📡 LIVE logs are terminal-only:\n\n  tools/yui-daemon.sh logs -live   (watchdog)\n  tools/yui-pm2.sh logs -live      (PM2)\n\nIn Telegram, use: /daemon logs [N] — last N lines (max 300).' };
      }
      const num = /^\d+$/.test(extra.trim()) ? Math.min(parseInt(extra.trim(), 10), 300) : 40;
      const r = await runShell(`${DEBUG_SCRIPT} show ${num}`, { cwd: proj, timeoutMs: 10000, maxBuffer: 512 * 1024 });
      const body = r.ok
        ? r.stdout.trim().slice(-3000)
        : (r.stderr.trim().slice(0, 500) || '(failed to fetch logs)');
      return { text: `📜 Daemon logs (last ${num} lines)\n\n${body}` };
    }

    case 'rebuild':
      return startRebuildReply(tc, proj);

    default:
      return { text: DAEMON_HELP };
  }
}

function startRebuildReply(tc: TgToolContext, proj: string): TgReply {
  startRebuild(tc, proj);
  return { text: '🔨 Rebuild started (npm run build)...\n\nRuns in the background. Result will be sent to this chat when done (~30-60s).' };
}

// ───────────────────────── Internal tools (admin) ─────────────────────────
const TOOLS_MAX_REPLY = 3000;

const IMG_DEFAULT_WIDTH = 1024;
const IMG_DEFAULT_HEIGHT = 1024;
const IMG_FALLBACK_MODEL = 'anime_lab_wai_illustrious';
const IMG_MODEL_LIMIT = 97;

const pendingImgJobs = new Map<string, { prompt: string; width: number; height: number; count: number }>();

function imgChatKey(tc: TgToolContext): string {
  const chatId = tc.ctx?.chat?.id;
  return chatId != null ? `tg_${chatId}` : '';
}

function imgModelKeyboard(models: string[]): any {
  const rows: any[][] = [];
  const unique = Array.from(new Set(models.map(m => String(m).trim()).filter(Boolean)));
  for (let i = 0; i < unique.length; i += 2) {
    const row = unique.slice(i, i + 2).map(m => ({
      text: m.length > 24 ? m.slice(0, 24) + '…' : m,
      callback_data: `qt:img:model:${m.slice(0, 45)}`
    }));
    rows.push(row);
  }
  rows.push([
    { text: '🧠 Yui Mode', callback_data: 'qt:img:yui' },
    { text: '🎲 Default', callback_data: 'qt:img:default' }
  ]);
  rows.push([
    { text: '🔄 Refresh', callback_data: 'qt:img:refresh' },
    { text: '✖️ Cancel', callback_data: 'qt:img:cancel' }
  ]);
  return { inline_keyboard: rows };
}

interface TensorArtToolInfo {
  name?: string;
  tool_id?: string;
  toolId?: string;
  taskType?: string;
  description?: string;
  inputs?: { type?: string; description?: string }[];
}

function isTextToImageTool(t: TensorArtToolInfo): boolean {
  const inputs = Array.isArray(t.inputs) ? t.inputs : [];
  const hasPrompt = inputs.some(i => i?.type === 'STRING' && /prompt/i.test(String(i?.description || '')));
  const hasWidth = inputs.some(i => i?.type === 'INTEGER' && /width/i.test(String(i?.description || '')));
  const hasSize = inputs.some(i => i?.type === 'STRING' && /image size|aspect ratio|width|height/i.test(String(i?.description || '')));
  const isVideo = /video/i.test(String(t.description || ''));
  const isEdit = /edit/i.test(String(t.description || '')) || /editing prompt/i.test(String(inputs.map(i => i?.description || '').join(' ')));
  const needsFile = inputs.some(i => i?.type === 'FILE');
  return !isVideo && !isEdit && !needsFile && hasPrompt && (hasWidth || hasSize);
}

/**
 * Fetch the real TensorArt model list (POST /openworks/v1/tool/list).
 * Returns text-to-image tool ids (field `name` from the API) so they can be
 * passed straight to the generate action as `toolName`.
 */
async function fetchTensorArtModels(tc: TgToolContext, limit = IMG_MODEL_LIMIT): Promise<string[]> {
  const tool = SystemRegistry.getTool('generate_image');
  if (!tool) return [];
  try {
    const envelope: any = await tool.execute(
      { action: 'list_tools', timeoutMs: 8000 },
      { settings: tc.settings || {} }
    );
    if (envelope?.status !== 'success') return [];
    const data = envelope?.data;
    const list: any[] = (Array.isArray(data) ? data : data?.tools || data?.tool_list || data?.list) || [];

    const models = new Set<string>();
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const name = String(item.name || item.tool_id || item.toolId || '').trim();
      if (!name || name.length < 2 || name.length > 60 || !/^[a-zA-Z0-9_.:-]+$/.test(name)) continue;
      if (item.taskType && String(item.taskType).toUpperCase() !== 'TENSOR_ART_V1') continue;
      if (!isTextToImageTool(item)) continue;
      models.add(name);
    }
    if (models.size > 0) return Array.from(models).slice(0, limit);

    // Fallback walker: robust to unknown response shapes
    const ids = new Set<string>();
    const walk = (node: any): void => {
      if (Array.isArray(node)) { for (const item of node) walk(item); return; }
      if (node && typeof node === 'object') {
        const id = node.id || node.tool_id || node.toolId || node.name;
        if (typeof id === 'string' && id.length > 1 && id.length < 60 && /^[a-zA-Z0-9_.:-]+$/.test(id)) {
          ids.add(id);
        }
        for (const v of Object.values(node)) {
          if (v && typeof v === 'object') walk(v);
        }
      }
    };
    walk(data);
    return Array.from(ids).slice(0, limit);
  } catch {
    return [];
  }
}

async function runImgGenerate(prompt: string, model: string, width: number, height: number, tc: TgToolContext, count = 1): Promise<TgReply> {
  const tool = SystemRegistry.getTool('generate_image');
  if (!tool) return { text: '⚠️ The generate_image tool is not registered in the registry.' };
  const chatId = tc.ctx?.chat?.id;
  try {
    const envelope: any = await tool.execute(
      {
        action: 'generate',
        prompt,
        toolName: model,
        width,
        height,
        count,
        sendToChat: true
      },
      { contextId: chatId != null ? `tg_${chatId}` : undefined, settings: tc.settings || {} }
    );
    if (!envelope) return { text: '⚠️ Tool returned an empty response.' };
    if (envelope.status === 'success') {
      const d = envelope.data || {};
      const n = d.imageUrls?.length || d.metadata?.count || 1;
      return {
        text: `✅ Image generated!\n\n📝 Prompt: ${prompt}\n🖼️ ${d.localPaths?.length ? `${d.localPaths.filter(Boolean).length} foto disimpan` : (d.localPath ? `Saved: ${d.localPath}` : 'Not saved — link already sent')}${n > 1 ? ` (${n} total)` : ''}\n🛠️ Model: ${d.toolName || model} | 📐 ${d.metadata?.width || width}x${d.metadata?.height || height}`
      };
    }
    const err = envelope.error || {};
    return { text: `⚠️ Generation failed: ${err?.message || JSON.stringify(err) || 'unknown error'}` };
  } catch (e: any) {
    return { text: `⚠️ Generation failed: ${e?.message || e}` };
  }
}

async function runImgYuiMode(
  prompt: string,
  fallbackWidth: number,
  fallbackHeight: number,
  tc: TgToolContext,
  availableModels: string[] = [],
  fallbackCount = 1
): Promise<TgReply> {
  const cfg = tc.settings?.['generate_image'] || tc.settings?.tensorart || {};
  const fallbackModel = cfg.defaultToolName || IMG_FALLBACK_MODEL;
  let model = fallbackModel;
  let width = fallbackWidth;
  let height = fallbackHeight;
  let count = fallbackCount;
  let usedPrompt = prompt;
  try {
    const providerId = tc.settings?.provider || 'gemini';
    const provider = SystemRegistry.getProvider(providerId);
    if (provider) {
      const modelHint = availableModels.length
        ? `Available TensorArt models: ${availableModels.join(', ')}.\nPick the best one from this list.`
        : `Preferred fallback model: ${fallbackModel}.`;
      const instruction =
        'You are Yui, an expert anime illustration director. Choose the best TensorArt diffusion model, width and height for the user request, and polish the prompt into a highly detailed TensorArt prompt. ' +
        `Also determine the image count: 1 by default, but 2-4 if the user explicitly asks for multiple photos (e.g. "3 foto", "2 photos"). ` +
        'Return ONLY valid JSON with keys: "toolName" (a TensorArt model id string), "width" (int), "height" (int), "count" (int, 1-4), "prompt" (detailed english prompt). ' +
        `${modelHint}\nUser request: ${prompt}`;
      const raw: any = await provider.generate(instruction, {
        config: tc.settings || {},
        systemPrompt: 'You are Yui, image director. Output JSON only.'
      });
      const text = String(raw?.text ?? raw?.response ?? raw ?? '');
      const m = extractJsonObject(String(text));
      if (m) {
        const parsed = JSON.parse(m);
        if (typeof parsed.toolName === 'string' && parsed.toolName.trim()) model = parsed.toolName.trim();
        if (typeof parsed.width === 'number' && parsed.width > 0) width = Math.min(Math.round(parsed.width), 2048);
        if (typeof parsed.height === 'number' && parsed.height > 0) height = Math.min(Math.round(parsed.height), 2048);
        if (typeof parsed.count === 'number' && parsed.count > 0) count = Math.min(Math.round(parsed.count), 4);
        if (typeof parsed.prompt === 'string' && parsed.prompt.trim()) usedPrompt = parsed.prompt.trim();
      }
    }
  } catch (e: any) {
    console.warn('[TG_IMG] Yui mode LLM routing failed, using defaults:', e?.message || e);
  }
  return runImgGenerate(usedPrompt, model, width, height, tc, count);
}

function tgBaseUrl(): string {
  return `http://127.0.0.1:${process.env.PORT || '3000'}`;
}

/**
 * /new — start a fresh clean chat for the current Telegram chat.
 * The old conversation is summarized via the LLM and the summary is archived
 * in the memories table (so Yui keeps the gist as durable data), then the raw
 * interaction memories for this context are cleared so the next turn starts
 * with an empty conversation history.
 */
async function runNewChat(tc: TgToolContext): Promise<TgReply> {
  const chatId = tc.ctx?.chat?.id;
  if (chatId == null) return { text: '⚠️ Cannot determine this chat.' };
  if (!tc.db) return { text: 'Database unavailable.' };
  const context = `tg_${chatId}`;

  try {
    const rows = tc.db.prepare(
      "SELECT content, speaker, timestamp FROM memories WHERE context = ? AND speaker != 'system' ORDER BY timestamp ASC LIMIT 200"
    ).all(context) as { content: string; speaker: string; timestamp: number }[] | undefined;

    const msgs = (rows || []).filter(r => r && typeof r.content === 'string' && r.content.trim());
    if (msgs.length < 2) {
      return { text: '✨ This chat is already clean and fresh — nothing to summarize.' };
    }

    const transcript = msgs
      .map(r => `${r.speaker === 'agent' ? 'Yui' : 'User'}: ${r.content.trim()}`)
      .join('\n')
      .slice(-16000);

    let summary = '';
    try {
      const providerId = tc.settings?.provider || 'gemini';
      const provider = SystemRegistry.getProvider(providerId);
      if (provider) {
        const instruction =
          'You are Yui. Summarize the past conversation below into a concise recap (in Indonesian), ' +
          'keeping the key topics, facts about the user, promises, preferences and emotional moments. ' +
          'Plain text only, 3-8 sentences, no markdown, no JSON.\n\nConversation:\n' + transcript;
        const raw: any = await provider.generate(instruction, {
          config: tc.settings || {},
          systemPrompt: 'You are Yui, writing a memory recap. Output plain text only.'
        });
        summary = String(raw?.text ?? raw?.response ?? raw ?? '').trim().replace(/^["']|["']$/g, '');
      }
    } catch (e: any) {
      console.warn('[TG_NEW_CHAT] Summary LLM failed:', e?.message || e);
    }
    const finalSummary = summary || `[Auto recap] ${msgs.length} previous messages.`;

    const tx = tc.db.transaction(() => {
      tc.db.prepare(`
        INSERT INTO memories (id, type, content, importance, speaker, context, timestamp, tags, sentiment)
        VALUES (?, 'chat_reset', ?, 0.85, 'system', ?, ?, '["summary", "chat_reset"]', 0.6)
      `).run(`chat_reset_${Date.now()}`, `[RINGKASAN CHAT SEBELUMNYA]: ${finalSummary}`, context, Date.now());

      const cleared = tc.db.prepare("DELETE FROM memories WHERE context = ? AND speaker != 'system'").run(context);
      return cleared?.changes || 0;
    });
    const cleared = tx();

    return {
      text: `🧹 Chat baru dimulai!\n\nDari ${msgs.length} pesan sebelumnya yang diringkas (${cleared} pesan diarsipkan), Yui tetap mengingat intinya:\n\n📝 ${finalSummary}\n\nYuk mulai topik baru~ 💖`
    };
  } catch (e: any) {
    console.warn('[TG_NEW_CHAT] Failed:', e?.message || e);
    return { text: `⚠️ Failed to reset chat: ${e?.message || e}` };
  }
}

async function shellViaApi(command: string): Promise<string> {
  const res = await fetch(`${tgBaseUrl()}/api/tools/shell`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return `⚠️ HTTP ${res.status}: ${data?.error || data?.stderr || 'failed'}`;
  const stdout = String(data?.stdout || '').trim();
  const stderr = String(data?.stderr || '').trim();
  if (!stdout && !stderr) return '✅ Done (no output).';
  return stdout + (stderr ? (stdout ? '\n\n[stderr]\n' : '[stderr]\n') + stderr : '');
}

const SYSTEM_ROOT = path.join(os.homedir(), '.yuihime');

function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function resolveAllowedPath(raw: string): string | null {
  const roots = [path.resolve(SYSTEM_ROOT), path.resolve(projectDir())];
  const expanded = expandHome(String(raw || '').trim() || '.');
  let abs: string;
  if (path.isAbsolute(expanded)) {
    abs = path.resolve(expanded);
  } else {
    abs = path.resolve(roots[1], expanded);
    for (const r of roots) {
      const cand = path.resolve(r, expanded);
      if (fs.existsSync(cand)) { abs = cand; break; }
    }
  }
  for (const r of roots) {
    if (abs === r || abs.startsWith(r + path.sep)) return abs;
  }
  return null;
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function dirEntries(dir: string, max: number): string {
  let entries: { name: string; dir: boolean; size: number }[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true }).map(e => {
      let size = 0;
      try { if (e.isFile()) size = fs.statSync(path.join(dir, e.name)).size; } catch {}
      return { name: e.name, dir: e.isDirectory(), size };
    });
  } catch (e: any) {
    return `⚠️ Failed to read directory: ${e?.message || e}`;
  }
  entries.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
  const total = entries.length;
  const shown = entries.slice(0, max);
  const lines = shown.map(e => `${e.dir ? '📁' : '📄'} ${e.name}${e.dir ? '/' : ` (${fmtSize(e.size)})`}`);
  return lines.join('\n') + (total > max ? `\n… and ${total - max} more (${total} entries total)` : `\nTotal: ${total} entries`);
}

function readFileSnippet(abs: string, mode: string, n: number, maxChars: number): string {
  let content: string;
  try {
    content = fs.readFileSync(abs, 'utf8');
  } catch (e: any) {
    return `⚠️ Failed to read file: ${e?.message || e}`;
  }
  const lines = content.split(/\r?\n/);
  if (mode === 'tail') {
    content = lines.slice(-Math.max(1, n)).join('\n');
  } else if (mode === 'head') {
    content = lines.slice(0, Math.max(1, n)).join('\n');
  }
  if (content.length > maxChars) {
    content = content.slice(0, maxChars) + `\n… (truncated, ${content.length}+ chars total)`;
  }
  return content || '(empty file)';
}

async function sendDocumentToChat(tc: TgToolContext, abs: string): Promise<string> {
  const chatId = tc.ctx?.chat?.id;
  if (chatId == null) return '⚠️ Chat ID unavailable.';
  const bot = tc.ctx?.telegram || (globalThis as any).activeTelegramBot?.telegram;
  if (!bot) return '⚠️ Telegram bot is not active.';
  try {
    await bot.sendDocument(chatId, { source: fs.createReadStream(abs), filename: path.basename(abs) });
    return `✅ File sent: ${path.basename(abs)} (${fmtSize(fs.statSync(abs).size)})`;
  } catch (e: any) {
    return `⚠️ Failed to send file: ${e?.message || e}`;
  }
}

const TOOLS_HELP =
  '🧰 YUI INTERNAL TOOLS (admin only)\n\n' +
  '💻 BASH — run shell commands (sandbox + blacklist):\n' +
  '  /bash <command>\n' +
  '  /bash ls -lah\n' +
  '  /bash cat ~/.yuihime/debug/watchdog.log | tail -20\n\n' +
  '🎨 IMAGE GENERATE — TensorArt (auto-sent to chat):\n' +
  '  /img <description> — show model picker + Yui Mode (inline)\n' +
  '  /img 512x768 anime girl, sunset — set dimensions\n' +
  '  /img model:anime_lab_wai_illustrious <description> — force model\n\n' +
  '📂 FILE — inspect & fetch (limited to ~/.yuihime + project):\n' +
  '  /ls [path] — list directory contents\n' +
  '  /cat <file> [head|tail] [N] — view file contents\n' +
  '  /get <file> — send file to this chat\n\n' +
  'Yui Mode (🧠) = Yui picks model & dimensions automatically via LLM.\n' +
  'Without Yui Mode, everything is processed directly by the daemon (no LLM).';

const TOOLS_BASH_HELP =
  '💻 BASH — run shell commands on the Yui server (sandbox + blacklist, admin)\n\n' +
  'Usage:\n' +
  '  /bash <command>\n\n' +
  'Examples:\n' +
  '  /bash ls -lah\n' +
  '  /bash df -h\n' +
  '  /bash cat ~/.yuihime/debug/current.meta\n' +
  '  /bash grep ERROR ~/.yuihime/debug/current.log | tail -20\n\n' +
  'stdout + stderr are sent to the chat (truncated to 3000 chars).';

const TOOLS_IMG_HELP =
  '🎨 IMAGE GENERATE — TensorArt, auto-sent to chat (admin)\n\n' +
  'Usage:\n' +
  '  /img <description>\n\n' +
  'Inline options:\n' +
  '  /img 512x768 <description> — set dimensions (default 1024x1024)\n' +
  '  /img model:<name> <description> — force a model directly\n\n' +
  'Without a model, Yui shows the model picker keyboard (live list from TensorArt):\n' +
  '  • model button → generate immediately with that model\n' +
  '  • 🧠 Yui Mode → Yui picks model & dimensions automatically via LLM\n' +
  '  • 🎲 Default → use the default model from settings\n\n' +
  'The result is auto-sent to this chat (~30-90s).';

const TOOLS_FILES_HELP =
  '📂 FILE — inspect & fetch files (admin, limited to ~/.yuihime + project)\n\n' +
  'Usage:\n' +
  '  /ls [path] — list directory contents\n' +
  '  /cat <file> [head|tail] [N] — view file contents\n' +
  '  /get <file> — send file as a document to this chat\n\n' +
  'Examples:\n' +
  '  /ls ~/.yuihime/debug\n' +
  '  /cat config.toml head 30\n' +
  '  /cat current.log tail 50\n' +
  '  /get ~/.yuihime/debug/current.log\n\n' +
  'Paths outside ~/.yuihime and the project are rejected.';

// ───────────────────────── UI helpers ─────────────────────────
function fmtUptime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d} day${d > 1 ? 's' : ''}`);
  if (h > 0) parts.push(`${h} hr`);
  if (m > 0) parts.push(`${m} min`);
  parts.push(`${s} sec`);
  return parts.join(' ');
}

function fmtTimestamp(ts?: number | null): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('en-US', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return '—';
  }
}

function isAdmin(tc: TgToolContext): boolean {
  const adminId = String(tc.settings?.['telegram_bridge']?.adminId || '').trim();
  if (!adminId) return false;
  const fromId = tc.ctx?.from?.id;
  if (fromId == null) return false;
  return adminId.split(',').map(s => s.trim()).includes(String(fromId));
}

function menuKeyboard(tc?: TgToolContext) {
  const rows: any[][] = [
    [{ text: '🕒 Time', callback_data: 'qt:time' }, { text: '📌 My ID', callback_data: 'qt:id' }],
    [{ text: '🪪 Identity', callback_data: 'qt:me' }, { text: '⚙️ Status', callback_data: 'qt:status' }],
    [{ text: '🏓 Ping', callback_data: 'qt:ping' }, { text: '💖 About', callback_data: 'qt:about' }]
  ];
  rows.push([{ text: '🧬 Care', callback_data: 'qt:care' }]);
  rows.push([{ text: '🎯 Goals', callback_data: 'qt:goals' }, { text: '🧹 New Chat', callback_data: 'qt:new' }]);
  if (tc && isAdmin(tc)) {
    rows.push([{ text: '🛠️ Daemon', callback_data: 'qt:daemon' }]);
    rows.push([{ text: '🧰 Tools', callback_data: 'qt:tools' }]);
  }
  rows.push([{ text: '✖️ Close Menu', callback_data: 'qt:close' }]);
  return { inline_keyboard: rows };
}

function daemonMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🛠️ Status', callback_data: 'qt:daemon:status' }, { text: '🟢 Start', callback_data: 'qt:daemon:start' }],
      [{ text: '⏹️ Stop', callback_data: 'qt:daemon:stop' }, { text: '🔄 Restart', callback_data: 'qt:daemon:restart' }],
      [{ text: '🔨 Rebuild', callback_data: 'qt:daemon:rebuild' }, { text: '📜 Logs', callback_data: 'qt:daemon:logs' }],
      [{ text: '🧰 Tools', callback_data: 'qt:tools' }, { text: '❓ Help', callback_data: 'qt:daemon:help' }],
      [{ text: '« Back', callback_data: 'qt:menu' }]
    ]
  };
}

function toolsMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '💻 Bash', callback_data: 'qt:tools:bash' }, { text: '🎨 Image', callback_data: 'qt:tools:img' }],
      [{ text: '📂 File', callback_data: 'qt:tools:files' }, { text: '❓ Help', callback_data: 'qt:tools' }],
      [{ text: '« Menu', callback_data: 'qt:menu' }]
    ]
  };
}

function backToMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '« Back to Menu', callback_data: 'qt:menu' }]
    ]
  };
}

function commandListText(): string {
  return tgQuickCommands
    .map(c => `/${c.name}${c.adminOnly ? ' (admin)' : ''} — ${c.description}`)
    .join('\n');
}

function yuiStatusText(tc?: TgToolContext): string {
  const s = tc?.settings || {};
  const db = tc?.db;
  const botActive = !!tc?.bot;
  const uptimeSec = (typeof process !== 'undefined' && process.uptime ? process.uptime() : 0);

  let state = { status: 'idle' } as any;
  let relation = {} as any;
  let life = {} as any;
  let goals = 0;

  try {
    if (db) {
      const row = db.prepare('SELECT status, relation, mood, systemHealth FROM agent_state LIMIT 1').get() as any;
      if (row) {
        state = { ...state, ...row };
        if (row.relation) { try { relation = JSON.parse(row.relation); } catch {} }
        if (row.systemHealth) {
          try { life = JSON.parse(row.systemHealth).lifeVitals || {}; } catch {}
        }
      }
      goals = Number((db.prepare("SELECT COUNT(*) AS n FROM goals WHERE status IN ('active','in_progress')").get() as any)?.n || 0);
    }
  } catch (err: any) {
    console.warn('[TG_QUICK_TOOLS] status text fallback:', err?.message || err);
  }

  const bar = (v: number) => {
    const n = Math.max(0, Math.min(10, Math.round((v ?? 0) / 10)));
    return '█'.repeat(n) + '░'.repeat(10 - n);
  };
  const val = (v: any) => (v === undefined || v === null ? '—' : String(v));

  const statusIcon =
    state.status === 'sleeping' ? '😴'
    : state.status === 'talking' ? '💬'
    : state.status === 'thinking' ? '🧠'
    : '🟢';

  const lines: string[] = [
    `✦ YUI STATUS ✦`,
    ``
  ];

  // ── Core state ──
  lines.push(
    `State    ${statusIcon} ${String(state.status || 'idle').toUpperCase()}`,
    `Bot      ${botActive ? '🟢 ACTIVE' : '🔴 INACTIVE'}`,
    `Uptime   ⏱️ ${fmtUptime(uptimeSec * 1000)}`
  );

  // ── Life simulation ──
  if (life && (life.hunger !== undefined || life.energy !== undefined || life.thirst !== undefined)) {
    lines.push(
      ``,
      `🧬 LIFE SIMULATION`,
      `🍽️  Hunger       ${val(life.hunger)}%  ${bar(life.hunger)}`,
      `💧  Thirst       ${val(life.thirst)}%  ${bar(life.thirst)}`,
      `🚿  Cleanliness  ${val(life.cleanliness)}%  ${bar(life.cleanliness)}`,
      `😴  Sleepiness   ${val(life.sleepiness)}%  ${bar(life.sleepiness)}`,
      `🔋  Energy       ${val(life.energy)}%  ${bar(life.energy)}`,
      `🛏️  Sleep        ${life.sleepState === 'asleep' ? '😴 Asleep' : '🙂 Awake'} (${val(life.effectiveBedtime)}–${val(life.effectiveWake)})`
    );
  }

  // ── Relation ──
  lines.push(
    ``,
    `💗 RELATION`,
    `❤️  Affection   ${val(relation.affection)}`,
    `🤝  Trust       ${val(relation.trust)}`
  );

  if (goals > 0) {
    lines.push(``, `🎯 Active goals: ${goals}`);
  }

  lines.push(``, `Use the buttons below for quick actions.`);
  return lines.join('\n');
}

export function menuText(tc?: TgToolContext): string {
  return yuiStatusText(tc);
}

function careMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🍽️ Feed', callback_data: 'qt:care:eat' }, { text: '💧 Drink', callback_data: 'qt:care:drink' }, { text: '🚿 Bath', callback_data: 'qt:care:bath' }],
      [{ text: '🚽 Toilet', callback_data: 'qt:care:toilet' }, { text: '😴 Sleep', callback_data: 'qt:care:sleep' }, { text: '🎾 Play', callback_data: 'qt:care:play' }],
      [{ text: '🐟 Fish', callback_data: 'qt:care:fish' }, { text: '📊 Status', callback_data: 'qt:care:status' }],
      [{ text: '« Menu', callback_data: 'qt:menu' }]
    ]
  };
}

function runCareAction(action: string, tc: TgToolContext): TgReply {
  const db = tc?.db;
  if (!db) return { text: 'Database unavailable.' };
  const row = db.prepare('SELECT systemHealth FROM agent_state LIMIT 1').get() as any;
  const sh = (row && row.systemHealth) ? JSON.parse(row.systemHealth) : {};
  const v: any = sh.lifeVitals || {};
  const inv: any = sh.lifeInventory || { foods: [], drinks: [], items: [] };
  const a = String(action || '').toLowerCase();
  const now = Date.now();
  let text = '';
  switch (a) {
    case 'eat':
    case 'feed': {
      const food = (inv.foods || []).find((f: any) => f.qty > 0);
      if (food) {
        food.qty -= 1;
        v.lastMeal = now;
        text = `🍽️ Yui eats "${food.name}" — full now! (${food.qty} left)`;
      } else {
        text = '🍽️ Food inventory is empty — nothing to feed Yui.';
      }
      break;
    }
    case 'drink': {
      const drink = (inv.drinks || []).find((d: any) => d.qty > 0);
      if (drink) {
        drink.qty -= 1;
        v.lastDrink = now;
        text = `💧 Yui drinks "${drink.name}" — refreshed! (${drink.qty} left)`;
      } else {
        text = '💧 Drink inventory is empty — nothing for Yui to drink.';
      }
      break;
    }
    case 'bath':
      v.lastBath = now;
      text = '🚿 Yui takes a bath — clean & fresh again! Nyaaa~';
      break;
    case 'toilet':
      v.lastToilet = now;
      text = '🚽 Yui uses the bathroom — relieved.';
      break;
    case 'sleep':
      v.sleepState = 'asleep';
      v.asleepSince = now;
      text = '😴 Yui goes to sleep now. Good night~';
      break;
    case 'play':
      v.lastPlay = now;
      text = '🎾 Yui plays chase — hunting instinct satisfied!';
      break;
    case 'fish':
      v.lastFish = now;
      text = '🐟 Yui is given fish — craving for さかな satisfied!';
      break;
    case 'status':
    case '':
      return { text: yuiStatusText(tc) };
    default:
      return { text: `⚠️ Unknown action: "${action}".\n\nUsage: /care <eat|drink|bath|toilet|sleep|play|fish>` };
  }
  sh.lifeVitals = v;
  sh.lifeInventory = inv;
  db.prepare('UPDATE agent_state SET systemHealth = ? WHERE id = 1').run(JSON.stringify(sh));
  return { text: `${text}\n\nUse the 🧬 Care buttons below for more actions.` };
}

function splitArgsQuoted(input: string): string[] {
  const tokens: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) tokens.push(m[1] ?? m[2] ?? m[3]);
  return tokens;
}

// ───────────────────────── Config editor (/config) ─────────────────────────
const CONFIG_SECRET_KEYS = new Set([
  'apikey', 'api_key', 'apikeys', 'api_keys', 'token', 'bot_token', 'oauth',
  'password', 'secret', 'passphrase', 'client_secret', 'access_token', 'webhook_secret'
]);

function isSecretConfigKey(key: string): boolean {
  return CONFIG_SECRET_KEYS.has(String(key || '').toLowerCase());
}

function fmtConfigValueInline(key: string, value: any, maxLen = 120): string {
  let text: string;
  if (Array.isArray(value)) {
    text = value.map(v => JSON.stringify(v)).join(', ');
  } else if (value !== null && typeof value === 'object') {
    text = JSON.stringify(value);
  } else {
    text = String(value);
  }
  if (isSecretConfigKey(key)) text = '••••••••';
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
}

function getDeepSetting(obj: any, parts: string[]): { found: boolean; value?: any } {
  let cur = obj;
  for (let i = 0; i < parts.length; i++) {
    if (cur === null || typeof cur !== 'object') return { found: false };
    cur = cur[parts[i]];
    if (cur === undefined) return { found: false };
  }
  return { found: true, value: cur };
}

function setDeepSetting(obj: any, parts: string[], value: any): void {
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] === null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function parseConfigScalar(raw: string): any {
  const t = String(raw || '').trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^[+-]?\d+$/.test(t)) return parseInt(t, 10);
  if (/^[+-]?\d*\.\d+$/.test(t)) return parseFloat(t);
  if (t === 'null' || t === 'nil') return null;
  if ((t.startsWith('[') && t.endsWith(']')) || (t.startsWith('{') && t.endsWith('}'))) {
    try { return JSON.parse(t); } catch {}
  }
  return t;
}

function flattenConfigSection(obj: any, prefix: string, out: string[], depth: number): void {
  if (depth > 4 || obj === null || typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj)) {
    const dotted = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      out.push(`📁 ${dotted}`);
      flattenConfigSection(v, dotted, out, depth + 1);
    } else {
      out.push(`  ${dotted} = ${fmtConfigValueInline(k, v)}`);
    }
  }
}

function configFilePath(): string {
  return process.env.YUIHIME_CONFIG || path.join(SYSTEM_ROOT, 'data', 'config.toml');
}

const CONFIG_HELP =
  '⚙️ CONFIG EDITOR (admin) — edit config.toml live from Telegram\n\n' +
  'Usage:\n' +
  '  /config                    — list config sections\n' +
  '  /config list [section]     — list keys (e.g. /config list gemini)\n' +
  '  /config get <key>          — view a value (e.g. /config get gemini.model)\n' +
  '  /config set <key> <value>  — set & save a value\n\n' +
  'Examples:\n' +
  '  /config set gemini.enabled false\n' +
  '  /config set gemini.model ["gemini-2.5-flash","gemini-3.5-flash"]\n' +
  '  /config set characterName "Yui Airi"\n' +
  '  /config set provider anthropic\n\n' +
  'Notes:\n' +
  '  • Secrets (apiKey/token/oauth) are always masked.\n' +
  '  • Changes persist to config.toml immediately.\n' +
  '  • Some keys need a daemon restart (/daemon restart) to fully apply.';

async function ensureSettingsLoaded(): Promise<SettingsManager> {
  const sm = SettingsManager.getInstance();
  if (!sm.getAll() || Object.keys(sm.getAll()).length === 0) {
    try { await sm.load(); } catch {}
  }
  return sm;
}

async function runConfigCommand(args: string, tc: TgToolContext): Promise<TgReply> {
  const toks = splitArgsQuoted(String(args || '').trim());
  const sub = (toks[0] || '').toLowerCase();
  const keyParts = (toks[1] || '').split('.').map(s => s.trim()).filter(Boolean);

  if (!sub || sub === 'help' || sub === '-h' || sub === '--help') {
    return { text: CONFIG_HELP };
  }

  if (sub === 'list') {
    const sm = await ensureSettingsLoaded();
    const section = (toks[1] || '').trim();
    const root = section ? getDeepSetting(sm.getAll(), section.split('.')) : { found: true, value: sm.getAll() };
    if (!root.found || root.value === null || typeof root.value !== 'object') {
      return { text: `⚠️ Section not found: ${section || '(root)'}` };
    }
    const lines: string[] = [];
    if (section) lines.push(`⚙️ CONFIG · ${section}`, '');
    else lines.push('⚙️ CONFIG TREE', '');
    flattenConfigSection(root.value, '', lines, 0);
    const capped = lines.length > 45 ? lines.slice(0, 45).concat([`… ${lines.length - 45} more (use /config get <key> to view)`]) : lines;
    return { text: `Config file: ${configFilePath()}\n\n${capped.join('\n')}`.slice(0, 3500) };
  }

  if (sub === 'get') {
    if (!keyParts.length) return { text: '⚠️ Usage: /config get <dotted.key>\nExample: /config get gemini.model' };
    const sm = await ensureSettingsLoaded();
    const res = getDeepSetting(sm.getAll(), keyParts);
    if (!res.found) return { text: `⚠️ Key not found: ${keyParts.join('.')}` };
    const lastKey = keyParts[keyParts.length - 1];
    if (res.value !== null && typeof res.value === 'object' && !Array.isArray(res.value)) {
      const lines = [`⚙️ ${keyParts.join('.')}`, ''];
      flattenConfigSection(res.value, '', lines, 0);
      return { text: lines.join('\n').slice(0, 3000) };
    }
    return { text: `⚙️ ${keyParts.join('.')}\n\n${isSecretConfigKey(lastKey) ? '••••••••' : JSON.stringify(res.value, null, 2)}` };
  }

  if (sub === 'set') {
    if (keyParts.length < 1 || !toks[2]) {
      return { text: '⚠️ Usage: /config set <dotted.key> <value>\n\nExamples:\n  /config set gemini.enabled false\n  /config set characterName "Yui Airi"\n  /config set gemini.model ["gemini-2.5-flash","gemini-3.5-flash"]\n  /config set gemini.apiKey "KEY1,KEY2"' };
    }
    const sm = await ensureSettingsLoaded();
    const value = parseConfigScalar(toks.slice(2).join(' '));
    setDeepSetting(sm.getAll(), keyParts, value);
    try {
      await sm.save(sm.getAll());
    } catch (e: any) {
      return { text: `⚠️ Failed to save config.toml: ${e?.message || e}` };
    }
    const lastKey = keyParts[keyParts.length - 1];
    return { text: `✅ Config updated\n\n  ${keyParts.join('.')} = ${isSecretConfigKey(lastKey) ? '••••••••' : fmtConfigValueInline(lastKey, value)}` };
  }

  return { text: `⚠️ Unknown subcommand: ${sub}\n\n${CONFIG_HELP}` };
}

// ───────────────────────── DB stats (/dbstat) ─────────────────────────
function dbFileInfo(): { path: string; size: number; exists: boolean } {
  const env = process.env.YUIHIME_DB_PATH;
  const p = env ? expandHome(env) : path.join(SYSTEM_ROOT, 'data', 'yuihime.db');
  try {
    if (fs.existsSync(p)) return { path: p, size: fs.statSync(p).size, exists: true };
  } catch {}
  return { path: p, size: 0, exists: false };
}

function runDbStat(tc: TgToolContext): TgReply {
  if (!tc.db) return { text: 'Database unavailable.' };
  const info = dbFileInfo();
  const counters: [string, string][] = [
    ['🎯 Goals', 'goals'],
    ['🧠 Memories', 'memories'],
    ['💬 Chat history', 'history'],
    ['📮 Outbound msgs', 'outbound_messages'],
    ['📥 Pending msgs', 'pending_messages'],
    ['🪪 Identities', 'identities'],
    ['👥 TG users', 'telegram_users'],
    ['🗓️ Cron tasks', 'cron_tasks'],
    ['📔 Diary entries', 'diary'],
    ['💭 Dreams', 'dreams'],
    ['📚 Knowledge', 'knowledge'],
    ['🎭 Personas', 'custom_personas'],
    ['✅ Feedback events', 'feedback_events'],
  ];
  let totalRows = 0;
  const lines: string[] = [];
  for (const [label, table] of counters) {
    try {
      const n = Number((tc.db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as any)?.c ?? 0);
      totalRows += n;
      lines.push(`  ${label}: ${n.toLocaleString()}`);
    } catch {
      lines.push(`  ${label}: —`);
    }
  }
  let pageNote = '';
  try {
    const pages = Number(tc.db.pragma('page_count', { simple: true }));
    if (pages > 0) pageNote = ` 📄 ${pages.toLocaleString()} pages`;
  } catch {}
  let diskNote = '';
  try {
    const st = fs.statfsSync(path.dirname(info.path));
    const free = (st.bavail || 0) * (st.bsize || 0);
    if (free > 0) diskNote = `\n💾 Free disk: ${fmtSize(free)}`;
  } catch {}
  const cfgPath = configFilePath();
  let cfgSize = '—';
  try { if (fs.existsSync(cfgPath)) cfgSize = fmtSize(fs.statSync(cfgPath).size); } catch {}
  const uptimeSec = (typeof process !== 'undefined' && process.uptime ? process.uptime() : 0);
  return {
    text: `🗄️ DATABASE STATS\n\n📦 File: ${info.exists ? fmtSize(info.size) : 'NOT FOUND'}\n🗂️ ${info.path}${pageNote}\n\n📊 Row counts:\n${lines.join('\n')}\n\nΣ Total: ${totalRows.toLocaleString()} rows${diskNote}\n\n⚙️ config.toml: ${cfgSize}\n⏱️ Daemon uptime: ${fmtUptime(uptimeSec * 1000)}`
  };
}

// ───────────────────────── Cron manager (/cron) ─────────────────────────
const CRON_HELP =
  '🗓️ CRON MANAGER (admin) — schedule autonomous tasks\n\n' +
  'Usage:\n' +
  '  /cron                        — list all tasks\n' +
  '  /cron add <name> <sched> <prompt…>\n' +
  '  /cron toggle <id|name>       — enable / disable\n' +
  '  /cron run <id|name>          — trigger now\n' +
  '  /cron del <id|name>          — delete a task\n\n' +
  'Schedules:\n' +
  '  30m, 5s, 2h, 1d              — interval\n' +
  '  0 8 * * *                    — cron (min hour dom mon dow)\n\n' +
  'Examples:\n' +
  '  /cron add "Morning Check" 30m "Check the system and report"\n' +
  '  /cron add Daily 0 8 * * * "Good morning check-in"\n' +
  '  /cron toggle Morning\n';

async function cronApiFetch(pathSuffix: string, options?: RequestInit): Promise<{ ok: boolean; status: number; data: any }> {
  const base = `http://127.0.0.1:${process.env.PORT || '3000'}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${base}${pathSuffix}`, { ...options, signal: controller.signal });
    clearTimeout(timer);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err: any) {
    clearTimeout(timer);
    return { ok: false, status: 0, data: { error: err?.message || String(err) } };
  }
}

function resolveCronTask(db: any, query: string): any | null {
  const q = String(query || '').trim();
  if (!q || !db) return null;
  const rows = db.prepare('SELECT * FROM cron_tasks').all() as any[];
  return rows.find(t => t.id === q)
    || rows.find(t => String(t.name).toLowerCase() === q.toLowerCase())
    || rows.find(t => String(t.name).toLowerCase().includes(q.toLowerCase()))
    || null;
}

async function runCronCommand(args: string, tc: TgToolContext): Promise<TgReply> {
  const toks = splitArgsQuoted(String(args || '').trim());
  const sub = (toks[0] || 'list').toLowerCase();

  if (sub === 'help' || sub === '-h' || sub === '--help') return { text: CRON_HELP };

  if (sub === 'list' || sub === 'ls') {
    if (!tc.db) return { text: 'Database unavailable.' };
    const rows = tc.db.prepare('SELECT * FROM cron_tasks ORDER BY enabled DESC, name ASC').all() as any[];
    if (!rows.length) return { text: '🗓️ No cron tasks yet.\n\nAdd one: /cron add <name> <schedule> <prompt…>' };
    const lines = ['🗓️ CRON TASKS', ''];
    for (const t of rows) {
      const last = t.lastRun ? fmtTimestamp(t.lastRun) : 'never';
      const prompt = String(t.prompt || '').replace(/\s*\n+/g, ' ').slice(0, 70);
      lines.push(
        `${t.enabled === 1 ? '🟢' : '⚪'} ${t.name}`,
        `   🆔 ${t.id}`,
        `   ⏱ ${t.schedule}${t.repeating === 1 ? ' (repeat)' : ' (once)'} · Last run: ${last}`,
        `   📝 ${prompt || '(no prompt)'}`
      );
    }
    return { text: lines.join('\n').slice(0, 3000) };
  }

  if (sub === 'add') {
    const name = toks[1];
    let schedule = toks[2];
    if (!name || !schedule) {
      return { text: '⚠️ Usage: /cron add <name> <schedule> <prompt…>\nExample: /cron add "Morning Check" 30m "Check system and report"' };
    }
    let promptStart = 3;
    const rest = toks.slice(3);
    if (!/^\d+[smhd]$/i.test(schedule) && rest.length >= 4 && /^[0-9*/,\-]+$/.test(rest[0]) && /^[0-9*/,\-]+$/.test(rest[1]) && /^[0-9*/,\-]+$/.test(rest[2]) && /^[0-9*/,\-]+$/.test(rest[3])) {
      schedule = [schedule, rest[0], rest[1], rest[2], rest[3]].join(' ');
      promptStart = 7;
    }
    const prompt = toks.slice(promptStart).join(' ');
    const schedOk = /^\d+[smhd]$/i.test(schedule) || /^[0-9*/,\-]+( [0-9*/,\-]+){4}$/.test(schedule);
    if (!schedOk) {
      return { text: `⚠️ Invalid schedule: "${schedule}".\nUse interval (30m, 5s, 2h, 1d) or cron format (0 8 * * *).` };
    }
    if (!tc.db) return { text: 'Database unavailable.' };
    const chatId = tc.ctx?.chat?.id;
    const res = await cronApiFetch('/api/cron', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        schedule,
        enabled: true,
        repeating: true,
        prompt,
        context_id: chatId != null ? `tg_${chatId}` : 'live_stream',
        chat_type: 'Telegram (Private)',
        sender_name: tc.ctx?.from?.first_name || 'System'
      })
    });
    if (!res.ok) return { text: `⚠️ Failed to add cron: ${res.data?.error || res.status}` };
    return { text: `✅ Cron added: ${name}\n   ⏱ ${schedule}\n   📝 ${prompt || '(name used as prompt)'}\n\nUse /cron list to view.` };
  }

  const target = toks[1];
  if (!target) return { text: `⚠️ Usage: /cron ${sub} <id or name>` };
  if (!tc.db) return { text: 'Database unavailable.' };
  const task = resolveCronTask(tc.db, target);
  if (!task) return { text: `⚠️ Task not found: ${target}` };

  if (sub === 'toggle') {
    const res = await cronApiFetch('/api/cron', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...task, enabled: task.enabled === 1 ? false : true })
    });
    if (!res.ok) return { text: `⚠️ Toggle failed: ${res.data?.error || res.status}` };
    return { text: `${task.enabled === 1 ? '⏹️ Disabled' : '✅ Enabled'} cron: ${task.name}\n   ${task.schedule}` };
  }

  if (sub === 'run' || sub === 'trigger' || sub === 'fire') {
    const res = await cronApiFetch(`/api/cron/${encodeURIComponent(task.id)}/trigger`, { method: 'POST' });
    if (!res.ok) return { text: `⚠️ Trigger failed: ${res.data?.error || res.status}\n\nMake sure the task is enabled (/cron toggle ${task.id}).` };
    return { text: `⏩ Triggered: ${task.name}\n\nYui will process the task now and report to this chat.` };
  }

  if (sub === 'del' || sub === 'delete' || sub === 'rm' || sub === 'remove') {
    const res = await cronApiFetch(`/api/cron/${encodeURIComponent(task.id)}`, { method: 'DELETE' });
    if (!res.ok) return { text: `⚠️ Delete failed: ${res.data?.error || res.status}` };
    return { text: `🗑️ Deleted cron: ${task.name}` };
  }

  return { text: `⚠️ Unknown subcommand: ${sub}\n\n${CRON_HELP}` };
}

// ───────────────────────── Command registry ─────────────────────────
export const tgQuickCommands: TgCommandDef[] = [
  {
    name: 'menu',
    aliases: ['help', 'bantuan', 'perintah'],
    description: 'Open the inline keyboard menu',
    handler: async (tc) => ({ text: menuText(tc), keyboard: menuKeyboard(tc) })
  },
  {
    name: 'ping',
    description: 'Check bot connection & latency',
    handler: async (tc) => {
      const latency = tc.startedAt ? Date.now() - tc.startedAt : null;
      const uptimeSec = (typeof process !== 'undefined' && process.uptime ? process.uptime() : 0);
      return {
        text: `🏓 Pong!\n\n⚡ Latency: ${latency != null ? `${latency} ms` : 'n/a'}\n⏱️ Daemon uptime: ${fmtUptime(uptimeSec * 1000)}`
      };
    }
  },
  {
    name: 'time',
    description: 'Current date & time (local + UTC)',
    handler: async (tc) => {
      const offset = getTzOffsetHours(tc.settings);
      const localFull = formatLocalFullEn(offset);
      const utcTime = new Date().toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const utcDate = new Date().toLocaleDateString('en-US', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
      return {
        text: `🕒 Current time:\n\n📍 Local (${tzLabel(offset)}):\n${localFull}\n\n🌐 UTC:\n📅 ${utcDate}\n⏰ ${utcTime}\n\nℹ️ Change local zone: Settings → Circadian Rhythm → "Timezone Offset (GMT+X)".`
      };
    }
  },
  {
    name: 'id',
    description: 'Show your Telegram ID info',
    handler: async (tc) => {
      const from = tc.ctx?.from || {};
      const chat = tc.ctx?.chat || {};
      return {
        text: `📌 Telegram Identity Info\n\n👤 Name: ${from.first_name || '—'}${from.last_name ? ' ' + from.last_name : ''}\n🆔 User ID: ${from.id ?? '—'}\n🧑‍💻 Username: @${from.username || '—'}\n\n💬 Chat ID: ${chat.id ?? '—'}\n🏷️ Chat Type: ${chat.type || '—'}`
      };
    }
  },
  {
    name: 'me',
    description: 'Your identity as Yuihime sees it',
    handler: async (tc) => {
      const from = tc.ctx?.from || {};
      const tgId = from.id;
      if (!tc.db) return { text: 'Database unavailable.' };
      let identity: any = null;
      try {
        const tgUser = tc.db.prepare('SELECT * FROM telegram_users WHERE tg_id = ?').get(tgId);
        if (tgUser?.context && String(tgUser.context).startsWith('linked_identity:')) {
          identity = tc.db.prepare('SELECT * FROM identities WHERE id = ?').get(String(tgUser.context).split(':')[1]);
        }
        if (!identity) {
          const all = tc.db.prepare('SELECT * FROM identities').all();
          for (const iden of all || []) {
            try {
              const accs = JSON.parse(iden.linkedAccounts || '[]');
              if (Array.isArray(accs) && accs.some(a => String(a).toLowerCase() === `telegram:id:${tgId}`)) {
                identity = iden;
                break;
              }
            } catch {}
          }
        }
      } catch (err: any) {
        console.warn('[TG_QUICK_TOOLS] /me lookup failed:', err?.message || err);
      }
      if (!identity) {
        return {
          text: `🪪 No stored identity for this Telegram account (@${from.username || from.id}).\n\nYou can link a Web identity using the OTP code via /pair <code>.`
        };
      }
      return {
        text: `🪪 Stored Identity\n\n👤 Name: ${identity.perceivedName || identity.realName || '—'}\n🤝 Trust: ${identity.trust ?? 50} | ❤️ Affection: ${identity.affection ?? 50} | ⭐ Reputation: ${identity.reputation ?? 50}\n🗓️ Last interaction: ${fmtTimestamp(identity.lastInteraction)}\n📝 Yuihime perspective: ${identity.yuiPerspective || 'None yet'}`
      };
    }
  },
  {
    name: 'status',
    description: 'Bot & system status',
    handler: async (tc) => {
      const s = tc.settings || {};
      const geminiKey = s.providers?.gemini?.apiKey || s.gemini?.apiKey || process.env.GEMINI_API_KEY;
      const anthropicKey = s.providers?.anthropic?.apiKey || s.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY;
      const openrouterKey = s.providers?.openrouter?.apiKey || s.openrouter?.apiKey || process.env.OPENROUTER_API_KEY;
      const llmEngine = geminiKey || anthropicKey || openrouterKey ? 'CONFIGURED' : 'NOT CONFIGURED';
      const botActive = !!tc.bot;
      const dbActive = !!tc.db;
      const uptimeSec = (typeof process !== 'undefined' && process.uptime ? process.uptime() : 0);
      const pending = Array.isArray((globalThis as any).pendingConfirmations)
        ? (globalThis as any).pendingConfirmations.filter((i: any) => i?.status === 'pending').length
        : 0;

      // ── Life simulation vitals from persisted agent_state ──
      let lifeSection = '';
      try {
        const row = tc.db ? tc.db.prepare('SELECT status, systemHealth FROM agent_state LIMIT 1').get() : null;
        const systemHealth = row && row.systemHealth ? JSON.parse(row.systemHealth) : {};
        const lv = systemHealth.lifeVitals || {};
        const inv = systemHealth.lifeInventory;
        if (lv && (lv.hunger !== undefined || lv.thirst !== undefined || lv.sleepiness !== undefined)) {
          const bar = (v: number) => {
            const n = Math.max(0, Math.min(10, Math.round((v ?? 0) / 10)));
            return '█'.repeat(n) + '░'.repeat(10 - n);
          };
          const sleepDot = lv.sleepState === 'asleep' ? '😴' : '🙂';
          const foodQty = Array.isArray(inv?.foods) ? inv.foods.reduce((a: number, i: any) => a + (i.qty || 0), 0) : 0;
          const drinkQty = Array.isArray(inv?.drinks) ? inv.drinks.reduce((a: number, i: any) => a + (i.qty || 0), 0) : 0;
          const energyText = row?.status === 'sleeping' ? 'Sleeping 💤' : (lv.energy !== undefined ? `${lv.energy}%` : 'Active');
          lifeSection = `\n\n🧬 Life Simulation\n🍽️ Hunger: ${lv.hunger ?? '—'}% ${bar(lv.hunger)}\n💧 Thirst: ${lv.thirst ?? '—'}% ${bar(lv.thirst)}\n🚿 Cleanliness: ${lv.cleanliness ?? '—'}% ${bar(lv.cleanliness)}\n🚽 Bladder: ${lv.bladder ?? '—'}% ${bar(lv.bladder)}\n😴 Sleepiness: ${lv.sleepiness ?? '—'}% ${bar(lv.sleepiness)}\n🛏️ Sleep: ${sleepDot} ${lv.sleepState === 'asleep' ? 'Asleep' : 'Awake'} | Schedule ${lv.effectiveBedtime || '—'}-${lv.effectiveWake || '—'}\n🐟 Fish craving: ${lv.fishCraving ?? '—'}% | Play urge: ${lv.playUrge ?? '—'}%\n🎒 Inventory: ${foodQty} food | ${drinkQty} drinks\n🔋 Status: ${energyText}`;
        }
      } catch (e: any) {
        lifeSection = `\n\n🧬 Life Simulation: (not active yet — ${e?.message || 'error'})`;
      }

      return {
        text: `⚙️ System Status\n\n🤖 Telegram Bot: ${botActive ? '🟢 ACTIVE' : '🔴 INACTIVE'}\n🧠 LLM Engine: ${llmEngine}\n🗄️ Database: ${dbActive ? '🟢 CONNECTED' : '🔴 DISCONNECTED'}\n⏱️ Daemon uptime: ${fmtUptime(uptimeSec * 1000)}\n⏳ Pending confirmations: ${pending}${lifeSection}`
      };
    }
  },
  {
    name: 'about',
    description: 'About Yuihime',
    handler: async () => {
      return {
        text: `💖 Yuihime\n\nA neural AI assistant connected across platforms.\n\nThis command is processed directly by the daemon without involving the LLM.\n\nType /menu to open the quick menu.`
      };
    }
  },
  {
    name: 'new',
    aliases: ['reset', 'newchat', 'bersih'],
    description: 'Start a fresh clean chat — summarize & archive the old conversation as Yui\u2019s memory',
    usage: '/new',
    handler: async (tc) => runNewChat(tc)
  },
  {
    name: 'care',
    aliases: ['rawat', 'pelihara'],
    description: 'Take care of Yuihime (feed/drink/bath/sleep/play) — or open the care menu',
    usage: '/care [eat|drink|bath|toilet|sleep|play|fish]',
    handler: async (tc, args) => {
      const a = args.trim();
      if (!a) {
        return { text: `${yuiStatusText(tc)}\n\n🧬 CARE MENU\nPick an action:`, keyboard: careMenuKeyboard() };
      }
      return runCareAction(a, tc);
    }
  },
  {
    name: 'goals',
    aliases: ['goal', 'target'],
    description: 'Show Yuihime\u2019s active goals & progress, or add a new one',
    usage: '/goals [add <title>]',
    handler: async (tc, args) => {
      const raw = args.trim();
      if (/^add\s+/i.test(raw)) {
        const title = raw.replace(/^add\s+/i, '').trim();
        if (!title) return { text: '⚠️ Usage: /goals add <title>\n\nExample: /goals add Belajar AI' };
        const created = createGoal({ title, category: 'user-request' });
        if (!created) return { text: '⚠️ Failed to create goal.' };
        return {
          text: `🎯 Goal created!\n\n${created.status === 'in_progress' ? '🔄' : '📌'} ${created.title}\n   ${Math.round((created.progress || 0) * 100)}%\n\nUse /goals to see it in the list.`
        };
      }
      if (!tc.db) return { text: 'Database unavailable.' };
      const rows = tc.db
        .prepare(`SELECT * FROM goals WHERE status IN ('active','in_progress') ORDER BY created_at DESC LIMIT 30`)
        .all() as any[];
      if (!rows.length) return { text: '🎯 No active goals yet.\n\nAdd one: /goals add <title>' };
      const childrenOf = new Map<string, any[]>();
      for (const g of rows) {
        if (g.parent_id) {
          const arr = childrenOf.get(g.parent_id) || [];
          arr.push(g);
          childrenOf.set(g.parent_id, arr);
        }
      }
      const bar = (p: number) => {
        const n = Math.max(0, Math.min(10, Math.round((p || 0) * 10)));
        return '█'.repeat(n) + '░'.repeat(10 - n);
      };
      const lines: string[] = ['🎯 ACTIVE GOALS'];
      for (const g of rows) {
        if (g.parent_id) continue;
        lines.push(
          ``,
          `${g.status === 'in_progress' ? '🔄' : '📌'} ${g.title}`,
          `   ${Math.round((g.progress || 0) * 100)}% ${bar(g.progress)}${g.category && g.category !== 'general' ? `  ·  ${g.category}` : ''}`
        );
        const subs = childrenOf.get(g.id) || [];
        for (const s of subs) {
          lines.push(
            `   ${s.status === 'completed' ? '✅' : '▪️'} ${s.title} — ${Math.round((s.progress || 0) * 100)}%`
          );
        }
      }
      return { text: lines.join('\n').slice(0, 3000) };
    }
  },
  {
    name: 'daemon',
    aliases: ['server', 'process'],
    description: 'Manage the YuiHime daemon (start/stop/restart/status/logs)',
    adminOnly: true,
    usage: '/daemon <help|status|start|stop|restart|logs [N]|rebuild>',
    handler: async (tc, args) => {
      const parts = args.trim().split(/\s+/);
      const sub = (parts[0] || 'help').toLowerCase();
      const rest = parts.slice(1).join(' ');
      return daemonSub(sub, tc, rest);
    }
  },
  {
    name: 'rebuild',
    description: 'Rebuild the project (npm run build). See /daemon help',
    adminOnly: true,
    usage: '/rebuild [help]',
    handler: async (tc, args) => {
      const a = args.trim().toLowerCase();
      if (a === 'help' || a === '-h' || a === '--help') {
        return { text: REBUILD_HELP };
      }
      return startRebuildReply(tc, projectDir());
    }
  },
  {
    name: 'broadcast',
    aliases: ['siarkan'],
    description: 'Send a message to all Telegram users (admin)',
    adminOnly: true,
    usage: '/broadcast <message>',
    handler: async (tc, args) => {
      if (!args || !args.trim()) {
        return { text: `⚠️ Usage: /broadcast <message>\nExample: /broadcast Hello everyone, Yuihime is online!` };
      }
      if (!tc.db) return { text: 'Database unavailable.' };
      const botApi = tc.ctx?.telegram;
      if (!botApi) return { text: 'Telegram bot is not active.' };
      const users = tc.db.prepare('SELECT tg_id FROM telegram_users').all();
      let sent = 0;
      let failed = 0;
      for (const row of users || []) {
        try {
          await botApi.sendMessage(row.tg_id, args.trim());
          sent++;
        } catch {
          failed++;
        }
      }
      return {
        text: `📢 Broadcast done.\n\n✅ Sent: ${sent}\n❌ Failed/blocked: ${failed}`
      };
    }
  },
  {
    name: 'tools',
    aliases: ['internal', 'tool'],
    description: 'Access Yui internal tools: bash, image generate, files (admin)',
    adminOnly: true,
    usage: '/tools',
    handler: async () => ({ text: TOOLS_HELP })
  },
  {
    name: 'bash',
    description: 'Run a shell command (sandbox, admin)',
    adminOnly: true,
    usage: '/bash <command>',
    handler: async (tc, args) => {
      if (!args || !args.trim()) {
        return { text: `⚠️ Usage: /bash <command>\nExample: /bash ls -lah` };
      }
      const body = await shellViaApi(args.trim());
      return { text: `💻 $ bash ${args.trim()}\n\n${body.slice(-TOOLS_MAX_REPLY)}` };
    }
  },
  {
    name: 'img',
    aliases: ['gambar', 'image', 'draw'],
    description: 'Generate an image via TensorArt; pick a model via inline keyboard or Yui Mode (admin)',
    adminOnly: true,
    usage: '/img [WxH] [model:<name>] <description>',
    handler: async (tc, args) => {
      let prompt = String(args || '').trim();
      let width: number | null = null;
      let height: number | null = null;
      let model: string | null = null;
      const dimMatch = prompt.match(/^(\d{2,4})x(\d{2,4})\s*/);
      if (dimMatch) {
        width = parseInt(dimMatch[1], 10);
        height = parseInt(dimMatch[2], 10);
        prompt = prompt.slice(dimMatch[0].length);
      }
      const modelMatch = prompt.match(/^model:([^\s]+)\s*/i);
      if (modelMatch) {
        model = modelMatch[1];
        prompt = prompt.slice(modelMatch[0].length);
      }
      const countMatch = prompt.match(/^count:(\d{1,2})\s*/i);
      let count = 1;
      if (countMatch) {
        count = Math.max(1, Math.min(parseInt(countMatch[1], 10), 4));
        prompt = prompt.slice(countMatch[0].length);
      }
      if (!prompt) {
        return {
          text: `⚠️ Usage: /img [WxH] [model:<name>] [count:N] <description>\n\nExamples:\n  /img anime girl, sunset\n  /img 512x768 anime girl, sunset\n  /img model:anime_lab_wai_illustrious anime girl\n  /img count:3 anime girl — generate 3 photos\n\nWithout a model, Yui shows a model picker below.`
        };
      }
      const cfg = tc.settings?.['generate_image'] || tc.settings?.tensorart || {};
      const finalWidth = width || cfg.defaultWidth || IMG_DEFAULT_WIDTH;
      const finalHeight = height || cfg.defaultHeight || IMG_DEFAULT_HEIGHT;
      if (model) {
        return runImgGenerate(prompt, model, finalWidth, finalHeight, tc, count);
      }
      const key = imgChatKey(tc);
      if (key) pendingImgJobs.set(key, { prompt, width: finalWidth, height: finalHeight, count });
      const models = await fetchTensorArtModels(tc);
      const list = models.length ? models : [cfg.defaultToolName || IMG_FALLBACK_MODEL];
      return {
        text: `🎨 Prompt ready:\n\n"${prompt}"\n\n📐 ${finalWidth}x${finalHeight}${count > 1 ? `\n\n🖼️ Jumlah: ${count} foto` : ''}\n\nPick a model below to generate (result auto-sent to chat):`,
        keyboard: imgModelKeyboard(list)
      };
    }
  },
  {
    name: 'ls',
    description: 'List directory contents (admin)',
    adminOnly: true,
    usage: '/ls [path]',
    handler: async (_tc, args) => {
      const target = resolveAllowedPath(args.trim() || projectDir());
      if (!target) return { text: `⚠️ Path outside the allowed area.\n\nAllowed: ~/.yuihime and the project (${projectDir()}).` };
      const body = dirEntries(target, 40);
      return { text: `📂 ${target}\n\n${body}` };
    }
  },
  {
    name: 'cat',
    description: 'View a file (admin)',
    adminOnly: true,
    usage: '/cat <file> [head|tail] [N]',
    handler: async (_tc, args) => {
      const parts = String(args || '').trim().split(/\s+/);
      if (parts.length === 0 || !parts[0]) {
        return { text: `⚠️ Usage: /cat <file> [head|tail] [N]\nExample: /cat ~/.yuihime/debug/current.meta\n  /cat config.toml head 30\n  /cat current.log tail 50` };
      }
      const fileArg = parts[0];
      const modeArg = parts[1]?.toLowerCase() === 'head' || parts[1]?.toLowerCase() === 'tail' ? parts[1].toLowerCase() : 'all';
      const nArg = parts[1] && (parts[1].toLowerCase() === 'head' || parts[1].toLowerCase() === 'tail') ? parts[2] : parts[1];
      const n = /^\d+$/.test(nArg || '') ? parseInt(nArg!, 10) : (modeArg === 'tail' ? 40 : 100);
      const abs = resolveAllowedPath(fileArg);
      if (!abs) return { text: `⚠️ Path outside the allowed area.\n\nAllowed: ~/.yuihime and the project (${projectDir()}).` };
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return { text: `⚠️ File not found: ${fileArg}` };
      const body = readFileSnippet(abs, modeArg, n, TOOLS_MAX_REPLY);
      return { text: `📄 ${abs}\n\n${body}` };
    }
  },
  {
    name: 'get',
    aliases: ['ambil', 'download'],
    description: 'Send a file to this Telegram chat (admin)',
    adminOnly: true,
    usage: '/get <file>',
    handler: async (tc, args) => {
      const fileArg = String(args || '').trim();
      if (!fileArg) return { text: `⚠️ Usage: /get <file>\nExample: /get ~/.yuihime/debug/current.log` };
      const abs = resolveAllowedPath(fileArg);
      if (!abs) return { text: `⚠️ Path outside the allowed area.\n\nAllowed: ~/.yuihime and the project (${projectDir()}).` };
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return { text: `⚠️ File not found: ${fileArg}` };
      const msg = await sendDocumentToChat(tc, abs);
      return { text: msg };
    }
  },
  {
    name: 'config',
    aliases: ['setting', 'pengaturan'],
    description: 'Edit config.toml live from Telegram (admin): list/get/set',
    adminOnly: true,
    usage: '/config [list|get <key>|set <key> <value>]',
    handler: async (tc, args) => runConfigCommand(args, tc)
  },
  {
    name: 'dbstat',
    aliases: ['db', 'database', 'stat'],
    description: 'Database & disk statistics (admin)',
    adminOnly: true,
    usage: '/dbstat',
    handler: async (tc) => runDbStat(tc)
  },
  {
    name: 'cron',
    aliases: ['jadwal', 'schedule', 'task'],
    description: 'Schedule autonomous tasks: list/add/toggle/run/delete (admin)',
    adminOnly: true,
    usage: '/cron [list|add <name> <sched> <prompt>|toggle <id>|run <id>|del <id>]',
    handler: async (tc, args) => runCronCommand(args, tc)
  }
];

const tgQuickCommandMap = new Map<string, TgCommandDef>();
for (const def of tgQuickCommands) {
  tgQuickCommandMap.set(def.name, def);
  for (const alias of def.aliases || []) tgQuickCommandMap.set(alias, def);
}

function unknownCommandReply(showHint: boolean): TgReply {
  if (!showHint) return { text: '❓ Unknown command. Type /menu to see the list of commands.' };
  return {
    text: `❓ Unknown command. Here are the available commands:\n\n${commandListText()}`,
    keyboard: menuKeyboard()
  };
}

export interface TgQuickCommandResult {
  handled: boolean;
  reply?: TgReply;
}

export async function handleTgQuickCommand(rawText: string, tc: TgToolContext): Promise<TgQuickCommandResult> {
  const trimmed = String(rawText || '').trim();
  if (!trimmed.startsWith('/')) return { handled: false };
  const parts = trimmed.split(/\s+/);
  const cmdName = String(parts[0]).replace(/^\/+/, '').toLowerCase().split('@')[0];
  const args = parts.slice(1).join(' ');
  const def = tgQuickCommandMap.get(cmdName);
  if (!def) {
    return { handled: true, reply: unknownCommandReply(tc.settings?.['telegram_quick_tools']?.showMenuHint !== false) };
  }
  if (def.adminOnly && !isAdmin(tc)) {
    return { handled: true, reply: { text: '⛔ This command is for the bot admin only.' } };
  }
  try {
    const reply = await def.handler(tc, args);
    return { handled: true, reply };
  } catch (err: any) {
    console.warn('[TG_QUICK_TOOLS] Command failed:', cmdName, err?.message || err);
    return { handled: true, reply: { text: `⚠️ Failed to process command /${cmdName}: ${err?.message || err}` } };
  }
}

export interface TgCallbackResult {
  action: 'edit' | 'close';
  text?: string;
  keyboard?: any;
}

export async function handleTgCallback(data: string, tc: TgToolContext): Promise<TgCallbackResult | null> {
  if (!String(data).startsWith('qt:')) return null;
  const cmd = String(data).slice(3).toLowerCase();
  if (cmd === 'close') return { action: 'close' };
  if (cmd === 'menu') return { action: 'edit', text: menuText(tc), keyboard: menuKeyboard(tc) };

  if (cmd === 'care') {
    return { action: 'edit', text: `${yuiStatusText(tc)}\n\n🧬 CARE MENU\nPick an action:`, keyboard: careMenuKeyboard() };
  }
  if (cmd.startsWith('care:')) {
    const sub = cmd.slice(5);
    const reply = runCareAction(sub, tc);
    return { action: 'edit', text: reply.text, keyboard: careMenuKeyboard() };
  }

  if (cmd === 'daemon') {
    if (!isAdmin(tc)) return { action: 'edit', text: '⛔ This command is for the bot admin only.', keyboard: backToMenuKeyboard() };
    return { action: 'edit', text: '🛠️ Daemon Menu\n\nPick an action:', keyboard: daemonMenuKeyboard() };
  }
  if (cmd.startsWith('daemon:')) {
    if (!isAdmin(tc)) return { action: 'edit', text: '⛔ This command is for the bot admin only.', keyboard: backToMenuKeyboard() };
    const sub = cmd.slice(7);
    if (sub === 'tools') {
      return { action: 'edit', text: TOOLS_HELP, keyboard: daemonMenuKeyboard() };
    }
    const reply = await daemonSub(sub, tc);
    return { action: 'edit', text: reply.text, keyboard: daemonMenuKeyboard() };
  }

  if (cmd === 'tools') {
    if (!isAdmin(tc)) return { action: 'edit', text: '⛔ This command is for the bot admin only.', keyboard: backToMenuKeyboard() };
    return { action: 'edit', text: TOOLS_HELP, keyboard: toolsMenuKeyboard() };
  }
  if (cmd.startsWith('tools:')) {
    if (!isAdmin(tc)) return { action: 'edit', text: '⛔ This command is for the bot admin only.', keyboard: backToMenuKeyboard() };
    const sub = cmd.slice(6);
    if (sub === 'bash') return { action: 'edit', text: TOOLS_BASH_HELP, keyboard: toolsMenuKeyboard() };
    if (sub === 'img') return { action: 'edit', text: TOOLS_IMG_HELP, keyboard: toolsMenuKeyboard() };
    if (sub === 'files') return { action: 'edit', text: TOOLS_FILES_HELP, keyboard: toolsMenuKeyboard() };
    return { action: 'edit', text: TOOLS_HELP, keyboard: toolsMenuKeyboard() };
  }

  if (cmd === 'img:yui' || cmd === 'img:default' || cmd === 'img:cancel' || cmd === 'img:refresh' || cmd.startsWith('img:model:')) {
    if (!isAdmin(tc)) return { action: 'edit', text: '⛔ This command is for the bot admin only.', keyboard: backToMenuKeyboard() };
    const key = imgChatKey(tc);
    if (cmd === 'img:cancel') {
      if (key) pendingImgJobs.delete(key);
      return { action: 'edit', text: '✖️ Generation cancelled.', keyboard: backToMenuKeyboard() };
    }
    const job = key ? pendingImgJobs.get(key) : undefined;
    if (!job) {
      return { action: 'edit', text: '⚠️ Prompt expired. Send a new one: /img <description>', keyboard: backToMenuKeyboard() };
    }
    if (cmd === 'img:refresh') {
      const cfg = tc.settings?.['generate_image'] || tc.settings?.tensorart || {};
      const models = await fetchTensorArtModels(tc);
      const list = models.length ? models : [cfg.defaultToolName || IMG_FALLBACK_MODEL];
      return {
        action: 'edit',
        text: `🔄 Model list refreshed (${list.length} models).\n\n🎨 Prompt ready:\n\n"${job.prompt}"\n\n📐 ${job.width}x${job.height}${job.count > 1 ? `\n\n🖼️ Jumlah: ${job.count} foto` : ''}\n\nPick a model below to generate (result auto-sent to chat):`,
        keyboard: imgModelKeyboard(list)
      };
    }
    pendingImgJobs.delete(key);
    const cfg = tc.settings?.['generate_image'] || tc.settings?.tensorart || {};
    let reply: TgReply;
    if (cmd === 'img:yui') {
      const available = await fetchTensorArtModels(tc);
      reply = await runImgYuiMode(job.prompt, job.width, job.height, tc, available, job.count);
    } else if (cmd === 'img:default') {
      reply = await runImgGenerate(job.prompt, cfg.defaultToolName || IMG_FALLBACK_MODEL, job.width, job.height, tc, job.count);
    } else {
      const model = decodeURIComponent(cmd.slice('img:model:'.length));
      reply = await runImgGenerate(job.prompt, model, job.width, job.height, tc, job.count);
    }
    return { action: 'edit', text: reply.text, keyboard: backToMenuKeyboard() };
  }

  const def = tgQuickCommandMap.get(cmd);
  if (!def) return null;
  if (def.adminOnly && !isAdmin(tc)) {
    return { action: 'edit', text: '⛔ This command is for the bot admin only.', keyboard: backToMenuKeyboard() };
  }
  try {
    const reply = await def.handler(tc, '');
    return { action: 'edit', text: reply.text, keyboard: backToMenuKeyboard() };
  } catch (err: any) {
    console.warn('[TG_QUICK_TOOLS] Callback failed:', cmd, err?.message || err);
    return { action: 'edit', text: `⚠️ Failed to process request: ${err?.message || err}`, keyboard: backToMenuKeyboard() };
  }
}

export const TelegramQuickToolkit = {
  metadata: manifest as any,
  type: ModuleType.GATEWAY,
  run: async () => ({ status: 'daemon-managed' })
};
