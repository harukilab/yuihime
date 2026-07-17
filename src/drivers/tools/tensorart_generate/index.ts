import { ToolModule } from "../../../include/types";
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
  const fromSettings = settings?.tensorart?.apiKey;
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

async function apiPost(baseUrl: string, accessKey: string, endpoint: string, body: any) {
  const res = await fetch(`${baseUrl}/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Echo-Access-Key": accessKey,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TensorArt API HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function uploadFile(baseUrl: string, accessKey: string, filePath: string): Promise<{ displayUrl: string; accessUrl: string }> {
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
  });

  if (!putRes.ok) {
    throw new Error(`File upload failed: HTTP ${putRes.status}`);
  }

  return { displayUrl, accessUrl };
}

async function sendImageToChat(imagePath: string, contextId?: string, caption?: string): Promise<boolean> {
  if (!contextId) return false;

  try {
    if (contextId.startsWith("tg_")) {
      const chatId = contextId.substring(3);
      const bot = (globalThis as any).activeTelegramBot;
      if (bot && bot.telegram) {
        const { createReadStream } = await loadNodeFs();
        await bot.telegram.sendPhoto(chatId, { source: createReadStream(imagePath) }, { caption: caption || "" });
        return true;
      }
    } else if (contextId.startsWith("dc_")) {
      const channelId = contextId.substring(3);
      const client = (globalThis as any).activeDiscordClient;
      if (client && client.channels) {
        const channel = await client.channels.fetch(channelId);
        if (channel && typeof channel.send === "function") {
          await channel.send({ content: caption || undefined, files: [imagePath] });
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
  metadata: manifest as any,

  execute: async (args: GenerateArgs, context: any) => {
    const { settings = {} } = context;
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
        const data = await apiPost(baseUrl, apiKey, "tool/list", {});
        return buildEnvelope("success", data, null, Date.now() - startTime, toolId, 0);
      } catch (err: any) {
        return buildEnvelope("error", null, { code: "LIST_TOOLS_FAILED", message: err.message, retryable: false }, Date.now() - startTime, toolId, 0);
      }
    }

    if (action === "upload_file") {
      if (!args.filePath) {
        return buildEnvelope("error", null, { code: "MISSING_FILE_PATH", message: "filePath is required for upload_file action.", retryable: false }, Date.now() - startTime, toolId, 0);
      }
      try {
        const result = await uploadFile(baseUrl, apiKey, args.filePath);
        return buildEnvelope("success", result, null, Date.now() - startTime, toolId, 0);
      } catch (err: any) {
        return buildEnvelope("error", null, { code: "UPLOAD_FAILED", message: err.message, retryable: false }, Date.now() - startTime, toolId, 0);
      }
    }

    const prompt = args.prompt;
    if (!prompt) {
      return buildEnvelope("error", null, { code: "MISSING_PROMPT", message: "prompt is required for generate action.", retryable: false }, Date.now() - startTime, toolId, 0);
    }

    const width = args.width || 512;
    const height = args.height || 512;
    const count = 1;
    const timeoutMs = args.timeoutMs || 120000;
    const pollIntervalMs = Math.max(1000, args.pollIntervalMs || 3000);
    const maxAttempts = Math.max(1, Math.floor(timeoutMs / pollIntervalMs));
    const toolName = args.toolName || "anime_lab_wai_illustrious";

    const inputs = args.inputs || [
      { type: "STRING", value: prompt },
      { type: "INTEGER", value: width },
      { type: "INTEGER", value: height },
      { type: "INTEGER", value: count },
    ];

    try {
      const submitRes = await apiPost(baseUrl, apiKey, "task", { toolName, inputs });
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

        const pollData = await apiPost(baseUrl, apiKey, "task/query", { taskIds: [jobId] });
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
            const imageRes = await fetch(imageUrl);
            if (imageRes.ok) {
              const buffer = Buffer.from(await imageRes.arrayBuffer());
              const { path, os, mkdir, writeFile } = await loadNodeFs();
              const ext = path.extname(new URL(imageUrl).pathname) || ".png";
              const outDir = path.join(os.tmpdir(), "yuihime-tensorart");
              await mkdir(outDir, { recursive: true });
              localPath = path.join(outDir, `tensorart_${jobId}${ext}`);
              await writeFile(localPath, buffer);
              console.log(`[TENSORART_GENERATE] Auto-downloaded to: ${localPath}`);

              if (args.sendToChat) {
                const sent = await sendImageToChat(localPath, context?.contextId, `Generated: ${prompt}`);
                console.log(`[TENSORART_GENERATE] Auto-send to chat: ${sent ? "success" : "skipped/failed"}`);
              }
            } else {
              console.warn(`[TENSORART_GENERATE_WARN] Failed to download image: HTTP ${imageRes.status}`);
            }
          } catch (downloadErr: any) {
            console.warn(`[TENSORART_GENERATE_WARN] Download error: ${downloadErr.message}`);
          }

          return buildEnvelope("success", {
            imageUrl,
            localPath,
            jobId,
            prompt,
            toolName,
            inputs,
            metadata: { width, height },
          }, null, Date.now() - startTime, toolId, attempts);
        } else if (status === "EXCEPTION" || status === "FAILED") {
          return buildEnvelope("error", null, { code: "TASK_FAILED", message: `TensorArt generation task failed: ${taskInfo.error || taskInfo.message || "Unknown Error"}`, retryable: false }, Date.now() - startTime, toolId, attempts);
        } else if (status === "CANCELED") {
          return buildEnvelope("error", null, { code: "TASK_CANCELED", message: "TensorArt generation task was canceled.", retryable: false }, Date.now() - startTime, toolId, attempts);
        }
      }

      return buildEnvelope("timeout", null, { code: "TIMEOUT", message: `TensorArt generation timed out after ${maxAttempts * (pollIntervalMs / 1000)} seconds.`, retryable: true }, Date.now() - startTime, toolId, maxAttempts);
    } catch (err: any) {
      console.error("[TENSORART_GENERATE_ERROR] Execution failure:", err);
      return buildEnvelope("error", null, { code: "EXECUTION_ERROR", message: err.message || "Unknown error occurred during real-time TensorArt generation.", retryable: false }, Date.now() - startTime, toolId, 0);
    }
  }
};
