import { ToolModule } from "@shared/include/types";
import manifest from "./manifest.json";
import fs from "fs";
import path from "path";
import os from "os";
import fsp from "fs/promises";
import { appendLog, readLogLines } from "@/core/fileLogger";
import { resolveSystemRoot } from "@/core/systemPaths";

interface GenerateArgs {
  action?: "generate" | "list_tools" | "upload_file" | "list_history";
  prompt?: string;
  toolName?: string;
  width?: number;
  height?: number;
  inputs?: any[];
  filePath?: string;
  sendToChat?: boolean;
  timeoutMs?: number;
  pollIntervalMs?: number;
  retryLimit?: number;
  limit?: number;
  count?: number;
}

/** Lazy Node builtins — never statically imported so browser eager-glob stays safe. */
function loadNodeFs() {
  if (typeof window !== "undefined") {
    throw new Error("TensorArt filesystem helpers are only available on the server runtime.");
  }
  return {
    readFileSync: fs.readFileSync,
    createReadStream: fs.createReadStream,
    path,
    os,
    mkdir: fsp.mkdir,
    writeFile: fsp.writeFile,
  };
}

async function getAccessKey(settings: any): Promise<string> {
  const fromSettings = settings?.['generate_image']?.apiKey || settings?.tensorart?.apiKey;
  const fromEnv = typeof process !== "undefined" ? process.env.TENSORART_API_KEY : undefined;
  let fromFile = "";
  if (typeof window === "undefined") {
    try {
      const { readFileSync } = await loadNodeFs();
      const candidates = [
        path.join(getSystemRoot(), "tensor_access_key"),
        path.join(os.homedir(), ".tensor_access_key")
      ];
      for (const candidate of candidates) {
        try {
          fromFile = readFileSync(candidate, "utf-8").trim();
          if (fromFile) break;
        } catch {
          // try next candidate
        }
      }
    } catch {
      fromFile = "";
    }
  }
  return fromSettings || fromEnv || fromFile || "";
}

function getBaseUrl(accessKey: string): string {
  if (accessKey.startsWith("ak_tusi")) {
    return "https://openapi.tusiart.cn/openworks/v1";
  }
  return "https://openapi.tensor.art/openworks/v1";
}

function getSystemRoot(): string {
  return resolveSystemRoot();
}

function getUserDataDir(settings: any): string {
  const systemRoot = getSystemRoot();
  let rawPath = settings?.sandbox_paths?.user_data_path || process.env.YUIHIME_USER_DATA_PATH;
  if (rawPath) {
    if (rawPath.startsWith("~")) {
      rawPath = path.join(os.homedir(), rawPath.substring(1));
    } else if (rawPath.includes("$HOME")) {
      rawPath = rawPath.replace(/\$HOME/g, os.homedir());
    } else if (rawPath.includes("$home")) {
      rawPath = rawPath.replace(/\$home/g, os.homedir());
    } else if (rawPath.includes("%USERPROFILE%")) {
      rawPath = rawPath.replace(/%USERPROFILE%/g, os.homedir());
    }
    rawPath = rawPath.replace(/^['"]|['"]$/g, "");
    if (path.isAbsolute(rawPath)) {
      return path.resolve(rawPath);
    }
    let cleanRelative = rawPath;
    if (cleanRelative.startsWith("./")) {
      cleanRelative = cleanRelative.substring(2);
    }
    return path.resolve(path.join(systemRoot, cleanRelative));
  }
  return path.resolve(path.join(systemRoot, "user_data"));
}

function isRetryable(e: any): boolean {
  const msg = (e?.message || "").toLowerCase();
  if (e?.cause?.code === "ETIMEDOUT" || e?.cause?.code === "ECONNRESET" || e?.cause?.code === "ENOTFOUND") return true;
  return msg.includes("fetch failed") || msg.includes("timeout") || msg.includes("econnreset") || msg.includes("etimedout");
}

async function apiPost(baseUrl: string, accessKey: string, endpoint: string, body: any, opts: { timeoutMs?: number; retryLimit?: number } = {}) {
  const timeoutMs = opts.timeoutMs || 20000;
  const retryLimit = opts.retryLimit ?? 0;
  let lastErr: any;
  for (let attempt = 0; attempt <= retryLimit; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Echo-Access-Key": accessKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const text = await res.text();
        if (attempt < retryLimit && res.status >= 500) {
          lastErr = new Error(`TensorArt API HTTP ${res.status}: ${text}`);
          continue;
        }
        throw new Error(`TensorArt API HTTP ${res.status}: ${text}`);
      }
      return res.json();
    } catch (e: any) {
      lastErr = e;
      if (attempt < retryLimit && isRetryable(e)) {
        const backoff = Math.min(1000 * Math.pow(2, attempt), 8000);
        console.warn(`[TENSORART_GENERATE] Transient error (attempt ${attempt + 1}/${retryLimit + 1}), retrying in ${backoff}ms: ${e.message}`);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

function assertApiOk(resp: any, what: string): void {
  if (resp && resp.code !== undefined && resp.code !== "0") {
    throw new Error(`TensorArt API ${what} failed (code=${resp.code}): ${resp.message || JSON.stringify(resp).slice(0, 300)}`);
  }
}

async function uploadFile(baseUrl: string, accessKey: string, filePath: string, timeoutMs = 20000): Promise<{ displayUrl: string; accessUrl: string }> {
  const { readFileSync, path } = await loadNodeFs();
  const data = readFileSync(filePath);
  const filename = path.basename(filePath);

  const init = await apiPost(baseUrl, accessKey, "file/upload", { filename });
  if (init.code !== "0") {
    throw new Error(`Failed to get upload URL: ${init.message || JSON.stringify(init)}`);
  }

  const uploadUrl = init.data.uploadUrl;
  const displayUrl = init.data.displayUrl || "";
  const accessUrl = init.data.accessUrl || "";

  const contentType = filename.endsWith(".png") ? "image/png"
    : filename.endsWith(".jpg") || filename.endsWith(".jpeg") ? "image/jpeg"
    : filename.endsWith(".webp") ? "image/webp"
    : "application/octet-stream";

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: data,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!putRes.ok) {
    throw new Error(`File upload failed: HTTP ${putRes.status}`);
  }

  return { displayUrl, accessUrl };
}

async function downloadImage(url: string, opts: { timeoutMs?: number; retryLimit?: number } = {}): Promise<any> {
  const timeoutMs = opts.timeoutMs || 20000;
  const retryLimit = opts.retryLimit ?? 0;
  let lastErr: any;
  for (let attempt = 0; attempt <= retryLimit; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) {
        if (attempt < retryLimit && res.status >= 500) {
          lastErr = new Error(`Image download HTTP ${res.status}`);
          continue;
        }
        throw new Error(`Image download HTTP ${res.status}`);
      }
      return res;
    } catch (e: any) {
      lastErr = e;
      if (attempt < retryLimit && isRetryable(e)) {
        const backoff = Math.min(1000 * Math.pow(2, attempt), 8000);
        console.warn(`[TENSORART_GENERATE] Image download transient error (attempt ${attempt + 1}/${retryLimit + 1}), retrying in ${backoff}ms: ${e.message}`);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

const recentAutoSends = new Map<string, number>();

async function sendTextToChat(text: string, contextId?: string): Promise<boolean> {
  if (!contextId || !text) return false;

  const promptForDedup = text.replace(/^Generated:\s*/i, '').trim();
  const dedupKey = `${contextId}::${promptForDedup}`;
  const lastSent = recentAutoSends.get(dedupKey);
  if (lastSent && Date.now() - lastSent < 60000) {
    console.warn(`[TENSORART_GENERATE] Skipping duplicate auto-send text for prompt "${promptForDedup}" to ${contextId}.`);
    return true;
  }
  if (recentAutoSends.size > 100) {
    const cutoff = Date.now() - 120000;
    for (const [k, v] of recentAutoSends) {
      if (v < cutoff) recentAutoSends.delete(k);
    }
  }
  recentAutoSends.set(dedupKey, Date.now());

  try {
    if (contextId.startsWith("tg_")) {
      const chatId = contextId.substring(3);
      const bot = (globalThis as any).activeTelegramBot;
      if (bot && bot.telegram) {
        await bot.telegram.sendMessage(chatId, text);
        return true;
      }
    } else if (contextId.startsWith("dc_")) {
      const channelId = contextId.substring(3);
      const client = (globalThis as any).activeDiscordClient;
      if (client && client.channels) {
        const channel = await client.channels.fetch(channelId);
        if (channel && typeof channel.send === "function") {
          await channel.send(text);
          return true;
        }
      }
    }
  } catch (e: any) {
    console.warn("[TENSORART_GENERATE] Failed to send text to chat:", e.message || e);
  }
  return false;
}

async function sendImageToChat(imagePath: string, contextId?: string, caption?: string): Promise<boolean> {
  if (!contextId) return false;

  const promptForDedup = caption?.replace(/^Generated:\s*/i, '')?.trim() || '';
  const dedupKey = `${contextId}::${promptForDedup || imagePath}`;
  const lastSent = recentAutoSends.get(dedupKey);
  if (lastSent && Date.now() - lastSent < 60000) {
    console.warn(`[TENSORART_GENERATE] Skipping duplicate auto-send for prompt "${promptForDedup}" to ${contextId} (sent ${Date.now() - lastSent}ms ago).`);
    return true;
  }
  if (recentAutoSends.size > 100) {
    const cutoff = Date.now() - 120000;
    for (const [k, v] of recentAutoSends) {
      if (v < cutoff) recentAutoSends.delete(k);
    }
  }
  recentAutoSends.set(dedupKey, Date.now());

  const isUrl = /^https?:\/\//i.test(imagePath);

  try {
    if (contextId.startsWith("tg_")) {
      const chatId = contextId.substring(3);
      const bot = (globalThis as any).activeTelegramBot;
      if (bot && bot.telegram) {
        if (isUrl) {
          await bot.telegram.sendPhoto(chatId, { url: imagePath }, { caption: caption || "" });
        } else {
          const { createReadStream } = await loadNodeFs();
          await bot.telegram.sendPhoto(chatId, { source: createReadStream(imagePath) }, { caption: caption || "" });
        }
        return true;
      }
    } else if (contextId.startsWith("dc_")) {
      const channelId = contextId.substring(3);
      const client = (globalThis as any).activeDiscordClient;
      if (client && client.channels) {
        const channel = await client.channels.fetch(channelId);
        if (channel && typeof channel.send === "function") {
          if (isUrl) {
            await channel.send({ content: caption || undefined, embeds: [{ image: { url: imagePath } }] });
          } else {
            await channel.send({ content: caption || undefined, files: [imagePath] });
          }
          return true;
        }
      }
    }
  } catch (e: any) {
    console.warn("[TENSORART_GENERATE] Failed to send image to chat:", e.message || e);
  }
  return false;
}

const TOOL_SCHEMA_CACHE_TTL = 10 * 60 * 1000;
let toolSchemaCache: { ts: number; tools: any[] } | null = null;

async function fetchToolSchemas(baseUrl: string, apiKey: string, timeoutMs = 12000): Promise<any[]> {
  if (toolSchemaCache && Date.now() - toolSchemaCache.ts < TOOL_SCHEMA_CACHE_TTL) {
    return toolSchemaCache.tools;
  }
  try {
    const data = await apiPost(baseUrl, apiKey, "tool/list", {}, { timeoutMs, retryLimit: 1 });
    const list = (Array.isArray(data) ? data : data?.tools || data?.tool_list || data?.list) || [];
    toolSchemaCache = { ts: Date.now(), tools: list };
    return list;
  } catch {
    return toolSchemaCache?.tools || [];
  }
}

function simplifyRatio(w: number, h: number): string {
  if (!w || !h) return "1:1";
  let a = Math.round(w);
  let b = Math.round(h);
  let x = a;
  let y = b;
  while (y) { const t = x % y; x = y; y = t; }
  a /= x;
  b /= x;
  if (a > 24 || b > 24) return "auto";
  return `${a}:${b}`;
}

function pickImageSize(width: number, height: number): string {
  const maxDim = Math.max(width || 1024, height || 1024);
  if (maxDim > 2048) return "4K";
  if (maxDim > 1024) return "2K";
  return "1K";
}

function buildToolInputs(tools: any[], toolName: string, prompt: string, width: number, height: number, count: number): any[] | null {
  const tool = (tools || []).find((t: any) => String(t?.name || t?.tool_id || t?.toolId) === toolName);
  if (!tool || !Array.isArray(tool.inputs) || tool.inputs.length === 0) return null;
  const inputs: any[] = [];
  for (const field of tool.inputs) {
    const desc = String(field?.description || "").toLowerCase();
    const type = String(field?.type || "").toUpperCase();
    if (type === "STRING" && /prompt/.test(desc)) {
      inputs.push({ type: "STRING", value: prompt });
    } else if (type === "INTEGER" && /width/.test(desc)) {
      inputs.push({ type: "INTEGER", value: width });
    } else if (type === "INTEGER" && /height/.test(desc)) {
      inputs.push({ type: "INTEGER", value: height });
    } else if (type === "INTEGER" && /count/.test(desc)) {
      inputs.push({ type: "INTEGER", value: count });
    } else if (type === "STRING" && /image size/.test(desc)) {
      inputs.push({ type: "STRING", value: pickImageSize(width, height) });
    } else if (type === "STRING" && /aspect ratio/.test(desc)) {
      inputs.push({ type: "STRING", value: simplifyRatio(width, height) });
    }
  }
  return inputs.length > 0 ? inputs : null;
}

function buildEnvelope(status: string, data: any, error: any, durationMs: number, toolId: string, attempt: number) {
  return {
    status,
    data,
    error,
    metadata: {
      durationMs,
      toolId,
      attempt,
    },
  };
}

export const TensorArtGenerateTool: ToolModule = {
  metadata: {
    ...(manifest as any),
    configSchema: {
      fields: {
        apiKey: {
          type: "password",
          label: "TensorArt API Key",
          description: "Echo-Access-Key for TensorArt. Also readable from TENSORART_API_KEY env or ~/.tensor_access_key.",
          default: "",
        },
        defaultToolName: {
          type: "string",
          label: "Default Model / Tool Name",
          description: "Default TensorArt tool/model used for generation when the LLM does not specify one (use list_tools to discover available models).",
          default: "anime_lab_wai_illustrious",
        },
        defaultWidth: {
          type: "number",
          label: "Default Width (px)",
          description: "Default image width when not overridden by the LLM.",
          default: 1024,
        },
        defaultHeight: {
          type: "number",
          label: "Default Height (px)",
          description: "Default image height when not overridden by the LLM.",
          default: 1024,
        },
        requestTimeoutMs: {
          type: "number",
          label: "Request Timeout (ms)",
          description: "HTTP timeout per TensorArt API call. Increase if your network has high latency.",
          default: 20000,
        },
        retryLimit: {
          type: "number",
          label: "Retry Limit",
          description: "Number of automatic retries on transient network errors (ETIMEDOUT/5xx).",
          default: 2,
        },
        pollIntervalMs: {
          type: "number",
          label: "Poll Interval (ms)",
          description: "Interval between task status polling checks.",
          default: 3000,
        },
      },
    },
  },

  execute: async (args: GenerateArgs, context: any) => {
    const { settings = {} } = context;
    const cfg = settings?.['generate_image'] || settings?.tensorart || {};
    const toolId = "generate_image";
    const action = args.action || "generate";

    const startTime = Date.now();

    if (action === "list_history") {
      try {
        const limit = args.limit || 20;
        const lines = readLogLines('tensorart', { includeArchives: true, tail: true, limit: 500 });
        const items: any[] = [];
        const seen = new Set<string>();
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const entry = JSON.parse(lines[i]);
            if (entry?.event !== 'generate') continue;
            const key = entry.jobId || `${entry.downloadUrl || ''}${entry.ts || ''}`;
            if (seen.has(key)) continue;
            seen.add(key);
            items.push({
              ts: entry.ts || null,
              prompt: entry.prompt || '',
              model: entry.model || '',
              width: entry.width || null,
              height: entry.height || null,
              localPath: entry.localPath || null,
              downloadUrl: entry.downloadUrl || null,
            });
            if (items.length >= limit) break;
          } catch {
            // skip malformed lines
          }
        }
        return buildEnvelope("success", { count: items.length, items }, null, Date.now() - startTime, toolId, 0);
      } catch (err: any) {
        return buildEnvelope("error", null, { code: "LIST_HISTORY_FAILED", message: err.message, retryable: false }, Date.now() - startTime, toolId, 0);
      }
    }

    const apiKey = await getAccessKey(settings);
    if (!apiKey) {
      return buildEnvelope("error", null, {
        code: "MISSING_API_KEY",
        message: "TensorArt API key is required but missing. Yui must politely ask the user to provide their TensorArt API key through chat so Yui can save it and try generating the image again. Tell the user: 'Yui butuh API key TensorArt nih, tolong kirim key-nya ya!'. Once the user provides it, save it to ~/.tensor_access_key and retry.",
        retryable: false,
      }, 0, toolId, 0);
    }

    const baseUrl = getBaseUrl(apiKey);

    if (action === "list_tools") {
      try {
        const listTimeout = args.timeoutMs || Math.min(cfg.requestTimeoutMs || 20000, 12000);
        const raw = await apiPost(baseUrl, apiKey, "tool/list", {}, { timeoutMs: listTimeout, retryLimit: cfg.retryLimit });
        const payload = raw?.data || raw;
        const tools = (Array.isArray(payload) ? payload : payload?.tools || payload?.tool_list || payload?.list) || [];
        toolSchemaCache = { ts: Date.now(), tools };
        return buildEnvelope("success", payload, null, Date.now() - startTime, toolId, 0);
      } catch (err: any) {
        return buildEnvelope("error", null, { code: "LIST_TOOLS_FAILED", message: err.message, retryable: isRetryable(err) }, Date.now() - startTime, toolId, 0);
      }
    }

    if (action === "upload_file") {
      if (!args.filePath) {
        return buildEnvelope("error", null, { code: "MISSING_FILE_PATH", message: "filePath is required for upload_file action.", retryable: false }, Date.now() - startTime, toolId, 0);
      }
      try {
        const result = await uploadFile(baseUrl, apiKey, args.filePath, cfg.requestTimeoutMs);
        return buildEnvelope("success", result, null, Date.now() - startTime, toolId, 0);
      } catch (err: any) {
        return buildEnvelope("error", null, { code: "UPLOAD_FAILED", message: err.message, retryable: isRetryable(err) }, Date.now() - startTime, toolId, 0);
      }
    }

    const prompt = args.prompt;
    if (!prompt) {
      return buildEnvelope("error", null, { code: "MISSING_PROMPT", message: "prompt is required for generate action.", retryable: false }, Date.now() - startTime, toolId, 0);
    }

    const width = args.width || cfg.defaultWidth || 1024;
    const height = args.height || cfg.defaultHeight || 1024;
    const count = Math.max(1, Math.min(Math.round(Number(args.count) || 1), 4));
    const timeoutMs = args.timeoutMs || 120000;
    const pollIntervalMs = Math.max(1000, args.pollIntervalMs || cfg.pollIntervalMs || 3000);
    const maxAttempts = Math.max(1, Math.floor(timeoutMs / pollIntervalMs));
    const toolName = args.toolName || cfg.defaultToolName || "anime_lab_wai_illustrious";
    const requestTimeoutMs = cfg.requestTimeoutMs || 20000;
    const retryLimit = args.retryLimit ?? cfg.retryLimit ?? 2;

    const inputs = args.inputs || buildToolInputs(toolSchemaCache?.tools || [], toolName, prompt, width, height, count) || [
      { type: "STRING", value: prompt },
      { type: "INTEGER", value: width },
      { type: "INTEGER", value: height },
      { type: "INTEGER", value: count },
    ];

    try {
      const submitRes = await apiPost(baseUrl, apiKey, "task", { toolName, inputs }, { timeoutMs: requestTimeoutMs, retryLimit });
      assertApiOk(submitRes, "task create");
      const task = submitRes.data?.task;
      const jobId = task?.id;
      if (!jobId) {
        return buildEnvelope("error", null, { code: "INVALID_RESPONSE", message: "Invalid response format from TensorArt API: No task ID returned.", retryable: false }, Date.now() - startTime, toolId, 0);
      }

      console.log(`[TENSORART_GENERATE] Task queued with ID: ${jobId}`);

      let attempts = 0;

      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        attempts++;

        console.log(`[TENSORART_GENERATE] Polling task state (Attempt ${attempts}/${maxAttempts})...`);

        const pollData = await apiPost(baseUrl, apiKey, "task/query", { taskIds: [jobId] }, { timeoutMs: requestTimeoutMs, retryLimit });
        assertApiOk(pollData, "task query");
        const taskInfo = pollData.data?.tasks?.[0] || {};
        const status = taskInfo.status;

        if (status === "FINISH") {
          const imageUrls: string[] = [];
          const outputs = taskInfo.successInfo?.outputs || taskInfo.outputs;
          if (outputs && outputs.length > 0) {
            for (const o of outputs) {
              if (!o) continue;
              if (o.type === "FILE" || o.type === "STRING") {
                const val = o.value;
                const url = typeof val === "string" ? val : val?.url || o.url;
                if (typeof url === "string" && /^https?:\/\//i.test(url)) imageUrls.push(url);
              }
            }
          }
          if (imageUrls.length === 0 && taskInfo.successInfo) {
            const imgs = taskInfo.successInfo.images;
            if (Array.isArray(imgs)) {
              for (const img of imgs) {
                const url = typeof img === "string" ? img : img?.url || img?.imageUrl;
                if (typeof url === "string" && /^https?:\/\//i.test(url)) imageUrls.push(url);
              }
            } else if (typeof taskInfo.successInfo.imageUrl === "string") {
              imageUrls.push(taskInfo.successInfo.imageUrl);
            }
          }

          if (imageUrls.length === 0) {
            return buildEnvelope("error", null, { code: "MISSING_IMAGE_URL", message: "Task completed but no image URL was found in the success payload.", retryable: false }, Date.now() - startTime, toolId, attempts);
          }

          console.log(`[TENSORART_GENERATE] Generation completed successfully! ${imageUrls.length} image(s). URL: ${imageUrls[0]}`);

          const localPaths: (string | null)[] = [];
          const ctxId = context?.contextId;
          for (let i = 0; i < imageUrls.length; i++) {
            const imageUrl = imageUrls[i];
            let localPath: string | undefined;
            const maxDownloadRetries = 3;
            for (let dlAttempt = 0; dlAttempt < maxDownloadRetries; dlAttempt++) {
              try {
                const imageRes = await downloadImage(imageUrl, { timeoutMs: 120000, retryLimit: 1 });
                const buffer = Buffer.from(await imageRes.arrayBuffer());
                const { path, os, mkdir, writeFile } = await loadNodeFs();
                const ext = path.extname(new URL(imageUrl).pathname) || ".png";
                const outDir = path.join(getUserDataDir(settings), "images");
                await mkdir(outDir, { recursive: true });
                localPath = path.join(outDir, `tensorart_${jobId}_${i + 1}${ext}`);
                await writeFile(localPath, buffer);
                console.log(`[TENSORART_GENERATE] Auto-downloaded to: ${localPath}`);
                break;
              } catch (downloadErr: any) {
                const remaining = maxDownloadRetries - dlAttempt - 1;
                console.warn(`[TENSORART_GENERATE_WARN] Download attempt ${dlAttempt + 1}/${maxDownloadRetries} failed: ${downloadErr.message}${remaining > 0 ? `, retrying...` : ''}`);
                if (remaining > 0) {
                  await new Promise(r => setTimeout(r, 2000 * (dlAttempt + 1)));
                }
              }
            }
            localPaths.push(localPath || null);
            if (ctxId && args.sendToChat !== false) {
              const caption = imageUrls.length > 1 ? `Foto ${i + 1}/${imageUrls.length} dari Yui~ 💖` : "Ini dia fotonya, sayang~ 💖";
              const target = localPath || imageUrl;
              const sent = await sendImageToChat(target, ctxId, caption);
              if (sent) {
                if (localPath) console.log(`[TENSORART_GENERATE] Auto-sent to chat: ${target}`);
              }
            }
          }

          const firstLocalPath = localPaths.find((p) => p) || null;
          const resultData: any = {
            status: "success",
            imageUrl: imageUrls[0],
            imageUrls,
            localPath: firstLocalPath,
            localPaths,
            jobId,
            prompt,
            toolName,
            inputs,
            metadata: { width, height, count: imageUrls.length },
            downloadSucceeded: !!firstLocalPath,
            autoSent: !!ctxId && args.sendToChat !== false,
          };

          try {
            appendLog('tensorart', {
              event: 'generate',
              prompt,
              model: toolName,
              jobId,
              downloadUrl: imageUrls[0],
              localPath: firstLocalPath,
              width,
              height,
              count: imageUrls.length,
            });
            console.log(`[TENSORART_GENERATE] Logged to tensorart log (jobId=${jobId}).`);
          } catch (logErr: any) {
            console.warn("[TENSORART_GENERATE] Failed to write tensorart log:", logErr.message || logErr);
          }

          if (!firstLocalPath) {
            resultData.fallback = "link_only";
            resultData._yuiInstruction = `Gambar berhasil dibuat! Tapi Yui gagal mendownloadnya. Beri tahu user gambar sudah siap dan kirimkan link ini: ${imageUrls.join('\n')}`;
            if (ctxId) {
              const sent = await sendImageToChat(imageUrls[0], ctxId, "Gambar berhasil dibuat! Tapi Yui gagal menyimpannya di folder, jadi ini link-nya ya:");
              if (!sent) {
                await sendTextToChat(`Gambar berhasil dibuat! Tapi Yui gagal mendownloadnya. Lihat di sini ya: ${imageUrls.join('\n')}`, ctxId);
              }
            }
          } else {
            resultData._yuiInstruction = "The photo(s) have already been auto-sent to the user's chat. Do NOT send them again via send_file or any other file-sending tool.";
          }

          return buildEnvelope("success", resultData, null, Date.now() - startTime, toolId, attempts);
        } else if (status === "EXCEPTION" || status === "FAILED") {
          return buildEnvelope("error", null, { code: "TASK_FAILED", message: `TensorArt generation task failed: ${taskInfo.error || taskInfo.message || "Unknown Error"}`, retryable: false }, Date.now() - startTime, toolId, attempts);
        } else if (status === "CANCELED") {
          return buildEnvelope("error", null, { code: "TASK_CANCELED", message: "TensorArt generation task was canceled.", retryable: false }, Date.now() - startTime, toolId, attempts);
        }
      }

      return buildEnvelope("timeout", null, { code: "TIMEOUT", message: `TensorArt generation timed out after ${maxAttempts * (pollIntervalMs / 1000)} seconds.`, retryable: true }, Date.now() - startTime, toolId, maxAttempts);
    } catch (err: any) {
      console.error("[TENSORART_GENERATE_ERROR] Execution failure:", err);
      return buildEnvelope("error", null, { code: "EXECUTION_ERROR", message: err.message || "Unknown error occurred during real-time TensorArt generation.", retryable: isRetryable(err) }, Date.now() - startTime, toolId, 0);
    }
  }
};
