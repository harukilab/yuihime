import { ToolModule } from "@shared/include/types";
import manifest from "./manifest.json";

interface GenerateArgs {
  action?: "generate" | "list_tools" | "upload_file";
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
}

/** Lazy Node builtins — never statically imported so browser eager-glob stays safe. */
async function loadNodeFs() {
  if (typeof window !== "undefined") {
    throw new Error("TensorArt filesystem helpers are only available on the server runtime.");
  }
  const fs = await import(/* @vite-ignore */ "fs");
  const path = await import(/* @vite-ignore */ "path");
  const os = await import(/* @vite-ignore */ "os");
  const fsp = await import(/* @vite-ignore */ "fs/promises");
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
      const { readFileSync, path } = await loadNodeFs();
      fromFile = readFileSync(path.join(process.env.HOME || "", ".tensor_access_key"), "utf-8").trim();
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
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
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
  if (promptForDedup) {
    const dedupKey = `${contextId}::${promptForDedup}`;
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
  }

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
          default: 512,
        },
        defaultHeight: {
          type: "number",
          label: "Default Height (px)",
          description: "Default image height when not overridden by the LLM.",
          default: 512,
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

    const apiKey = await getAccessKey(settings);
    if (!apiKey) {
      return buildEnvelope("error", null, {
        code: "MISSING_API_KEY",
        message: "TensorArt API key is required but missing. Provide it under Settings -> Modules -> TensorArt, add TENSORART_API_KEY to env, or save to ~/.tensor_access_key.",
        retryable: false,
      }, 0, toolId, 0);
    }

    const baseUrl = getBaseUrl(apiKey);
    const startTime = Date.now();

    if (action === "list_tools") {
      try {
        const data = await apiPost(baseUrl, apiKey, "tool/list", {}, { timeoutMs: cfg.requestTimeoutMs, retryLimit: cfg.retryLimit });
        return buildEnvelope("success", data, null, Date.now() - startTime, toolId, 0);
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

    const width = args.width || cfg.defaultWidth || 512;
    const height = args.height || cfg.defaultHeight || 512;
    const count = 1;
    const timeoutMs = args.timeoutMs || 120000;
    const pollIntervalMs = Math.max(1000, args.pollIntervalMs || cfg.pollIntervalMs || 3000);
    const maxAttempts = Math.max(1, Math.floor(timeoutMs / pollIntervalMs));
    const toolName = args.toolName || cfg.defaultToolName || "anime_lab_wai_illustrious";
    const requestTimeoutMs = cfg.requestTimeoutMs || 20000;
    const retryLimit = args.retryLimit ?? cfg.retryLimit ?? 0;

    const inputs = args.inputs || [
      { type: "STRING", value: prompt },
      { type: "INTEGER", value: width },
      { type: "INTEGER", value: height },
      { type: "INTEGER", value: count },
    ];

    try {
      const submitRes = await apiPost(baseUrl, apiKey, "task", { toolName, inputs }, { timeoutMs: requestTimeoutMs, retryLimit });
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
        const taskInfo = pollData.data?.tasks?.[0] || {};
        const status = taskInfo.status;

        if (status === "FINISH") {
          let imageUrl: string | undefined;
          const outputs = taskInfo.successInfo?.outputs || taskInfo.outputs;
          if (outputs && outputs.length > 0) {
            const fileOutput = outputs.find((o: any) => o.type === "FILE" || o.type === "STRING");
            if (fileOutput) {
              const val = fileOutput.value;
              imageUrl = typeof val === "string" ? val : val?.url || fileOutput.url;
            }
          }
          if (!imageUrl && taskInfo.successInfo) {
            imageUrl = taskInfo.successInfo.images?.[0]?.url || taskInfo.successInfo.imageUrl;
          }

          if (!imageUrl) {
            return buildEnvelope("error", null, { code: "MISSING_IMAGE_URL", message: "Task completed but no image URL was found in the success payload.", retryable: false }, Date.now() - startTime, toolId, attempts);
          }

          console.log(`[TENSORART_GENERATE] Generation completed successfully! URL: ${imageUrl}`);

          let localPath: string | undefined;
          try {
            const imageRes = await downloadImage(imageUrl, { timeoutMs: requestTimeoutMs, retryLimit });
            const buffer = Buffer.from(await imageRes.arrayBuffer());
            const { path, os, mkdir, writeFile } = await loadNodeFs();
            const ext = path.extname(new URL(imageUrl).pathname) || ".png";
            const outDir = path.join(os.tmpdir(), "yuihime-tensorart");
            await mkdir(outDir, { recursive: true });
            localPath = path.join(outDir, `tensorart_${jobId}${ext}`);
            await writeFile(localPath, buffer);
            console.log(`[TENSORART_GENERATE] Auto-downloaded to: ${localPath}`);
          } catch (downloadErr: any) {
            console.warn(`[TENSORART_GENERATE_WARN] Download error: ${downloadErr.message}. Local copy skipped, will use remote URL.`);
          }

          const resultData: any = {
            imageUrl,
            localPath,
            jobId,
            prompt,
            toolName,
            inputs,
            metadata: { width, height },
          };
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
