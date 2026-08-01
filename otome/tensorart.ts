import fs from 'fs';
import path from 'path';
import os from 'os';

export interface GenerateImageOpts {
  prompt: string;
  toolName?: string;
  width?: number;
  height?: number;
  count?: number;
  timeoutMs?: number;
  pollIntervalMs?: number;
  retryLimit?: number;
  onProgress?: (msg: string) => void;
}

export interface GenerateImageResult {
  status: 'success' | 'error' | 'timeout';
  imageUrls: string[];
  localPaths: (string | null)[];
  jobId?: string;
  toolName: string;
  width: number;
  height: number;
  error?: string;
}

function configPath(): string {
  return path.join(os.homedir(), '.yuihime', 'otome_tg_config.json');
}

export function loadOtomeConfig(): { botToken: string; ownerId: number | null; tensorartApiKey: string; defaultModel: string } {
  let cfg: any = {};
  try {
    cfg = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch {
    cfg = {};
  }
  return {
    botToken: cfg.botToken || process.env.YUIHIME_OTOME_TG_TOKEN || '',
    ownerId: typeof cfg.ownerId === 'number' ? cfg.ownerId : (cfg.ownerId != null ? Number(cfg.ownerId) : null),
    tensorartApiKey: cfg.tensorartApiKey || process.env.TENSORART_API_KEY || '',
    defaultModel: cfg.defaultModel || 'anime_lab_wai_illustrious'
  };
}

function imageOutputDir(): string {
  const dir = path.join(os.homedir(), '.yuihime', 'otome_images');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function appendLog(entry: any): void {
  try {
    fs.appendFileSync(path.join(os.homedir(), '.yuihime', 'otome_images', 'tensorart_otome.log'),
      JSON.stringify({ ...entry, ts: Date.now() }) + '\n', 'utf8');
  } catch { /* non-blocking */ }
}

async function getAccessKey(): Promise<string> {
  const cfg = loadOtomeConfig();
  let fromFile = '';
  try {
    fromFile = fs.readFileSync(path.join(os.homedir(), '.tensor_access_key'), 'utf8').trim();
  } catch { fromFile = ''; }
  return cfg.tensorartApiKey || process.env.TENSORART_API_KEY || fromFile || '';
}

function getBaseUrl(accessKey: string): string {
  if (accessKey.startsWith('ak_tusi')) return 'https://openapi.tusiart.cn/openworks/v1';
  return 'https://openapi.tensor.art/openworks/v1';
}

function isRetryable(e: any): boolean {
  const msg = (e?.message || '').toLowerCase();
  if (e?.cause?.code === 'ETIMEDOUT' || e?.cause?.code === 'ECONNRESET' || e?.cause?.code === 'ENOTFOUND') return true;
  return msg.includes('fetch failed') || msg.includes('timeout') || msg.includes('econnreset') || msg.includes('etimedout');
}

async function apiPost(baseUrl: string, accessKey: string, endpoint: string, body: any, opts: { timeoutMs?: number; retryLimit?: number } = {}): Promise<any> {
  const timeoutMs = opts.timeoutMs || 20000;
  const retryLimit = opts.retryLimit ?? 0;
  let lastErr: any;
  for (let attempt = 0; attempt <= retryLimit; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Echo-Access-Key': accessKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs)
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
        await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, attempt), 8000)));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

let toolSchemaCache: { ts: number; tools: any[] } | null = null;
const TOOL_SCHEMA_CACHE_TTL = 10 * 60 * 1000;

export async function listTools(accessKey: string, timeoutMs = 12000): Promise<any[]> {
  if (toolSchemaCache && Date.now() - toolSchemaCache.ts < TOOL_SCHEMA_CACHE_TTL) return toolSchemaCache.tools;
  try {
    const baseUrl = getBaseUrl(accessKey);
    const data = await apiPost(baseUrl, accessKey, 'tool/list', {}, { timeoutMs, retryLimit: 1 });
    const list = (Array.isArray(data) ? data : data?.tools || data?.tool_list || data?.list) || [];
    toolSchemaCache = { ts: Date.now(), tools: list };
    return list;
  } catch {
    return toolSchemaCache?.tools || [];
  }
}

function simplifyRatio(w: number, h: number): string {
  if (!w || !h) return '1:1';
  let a = Math.round(w), b = Math.round(h);
  let x = a, y = b;
  while (y) { const t = x % y; x = y; y = t; }
  a /= x; b /= x;
  if (a > 24 || b > 24) return 'auto';
  return `${a}:${b}`;
}

function pickImageSize(width: number, height: number): string {
  const maxDim = Math.max(width || 1024, height || 1024);
  if (maxDim > 2048) return '4K';
  if (maxDim > 1024) return '2K';
  return '1K';
}

function buildToolInputs(tools: any[], toolName: string, prompt: string, width: number, height: number, count: number): any[] | null {
  const tool = (tools || []).find((t: any) => String(t?.name || t?.tool_id || t?.toolId) === toolName);
  if (!tool || !Array.isArray(tool.inputs) || tool.inputs.length === 0) return null;
  const inputs: any[] = [];
  for (const field of tool.inputs) {
    const desc = String(field?.description || '').toLowerCase();
    const type = String(field?.type || '').toUpperCase();
    if (type === 'STRING' && /prompt/.test(desc)) inputs.push({ type: 'STRING', value: prompt });
    else if (type === 'INTEGER' && /width/.test(desc)) inputs.push({ type: 'INTEGER', value: width });
    else if (type === 'INTEGER' && /height/.test(desc)) inputs.push({ type: 'INTEGER', value: height });
    else if (type === 'INTEGER' && /count/.test(desc)) inputs.push({ type: 'INTEGER', value: count });
    else if (type === 'STRING' && /image size/.test(desc)) inputs.push({ type: 'STRING', value: pickImageSize(width, height) });
    else if (type === 'STRING' && /aspect ratio/.test(desc)) inputs.push({ type: 'STRING', value: simplifyRatio(width, height) });
  }
  return inputs.length > 0 ? inputs : null;
}

async function downloadImage(url: string, timeoutMs = 20000): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`Image download HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function generateImages(opts: GenerateImageOpts): Promise<GenerateImageResult> {
  const accessKey = await getAccessKey();
  if (!accessKey) {
    return { status: 'error', imageUrls: [], localPaths: [], toolName: '', width: 0, height: 0, error: 'MISSING_API_KEY: TensorArt API key tidak ada. Atur di ~/.yuihime/otome_tg_config.json (tensorartApiKey) atau env TENSORART_API_KEY.' };
  }

  const baseUrl = getBaseUrl(accessKey);
  const width = opts.width || 1024;
  const height = opts.height || 1024;
  const count = Math.max(1, Math.min(Math.round(Number(opts.count) || 1), 4));
  const toolName = opts.toolName || 'anime_lab_wai_illustrious';
  const timeoutMs = opts.timeoutMs || 120000;
  const pollIntervalMs = Math.max(1000, opts.pollIntervalMs || 3000);
  const maxAttempts = Math.max(1, Math.floor(timeoutMs / pollIntervalMs));
  const requestTimeoutMs = 20000;
  const retryLimit = opts.retryLimit ?? 0;

  try {
    const tools = await listTools(accessKey);
    const inputs = buildToolInputs(tools, toolName, opts.prompt, width, height, count) || [
      { type: 'STRING', value: opts.prompt },
      { type: 'INTEGER', value: width },
      { type: 'INTEGER', value: height },
      { type: 'INTEGER', value: count }
    ];

    opts.onProgress?.('Mengirim task ke TensorArt...');
    const submitRes = await apiPost(baseUrl, accessKey, 'task', { toolName, inputs }, { timeoutMs: requestTimeoutMs, retryLimit });
    const jobId = submitRes.data?.task?.id;
    if (!jobId) {
      return { status: 'error', imageUrls: [], localPaths: [], toolName, width, height, error: 'INVALID_RESPONSE: Tidak ada task ID.' };
    }

    let attempts = 0;
    while (attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, pollIntervalMs));
      attempts++;
      const pollData = await apiPost(baseUrl, accessKey, 'task/query', { taskIds: [jobId] }, { timeoutMs: requestTimeoutMs, retryLimit });
      const taskInfo = pollData.data?.tasks?.[0] || {};
      const status = taskInfo.status;

      if (status === 'FINISH') {
        const imageUrls: string[] = [];
        const outputs = taskInfo.successInfo?.outputs || taskInfo.outputs;
        if (outputs && outputs.length > 0) {
          for (const o of outputs) {
            if (!o) continue;
            if (o.type === 'FILE' || o.type === 'STRING') {
              const val = o.value;
              const url = typeof val === 'string' ? val : val?.url || o.url;
              if (typeof url === 'string' && /^https?:\/\//i.test(url)) imageUrls.push(url);
            }
          }
        }
        if (imageUrls.length === 0 && taskInfo.successInfo) {
          const imgs = taskInfo.successInfo.images;
          if (Array.isArray(imgs)) {
            for (const img of imgs) {
              const url = typeof img === 'string' ? img : img?.url || img?.imageUrl;
              if (typeof url === 'string' && /^https?:\/\//i.test(url)) imageUrls.push(url);
            }
          } else if (typeof taskInfo.successInfo.imageUrl === 'string') {
            imageUrls.push(taskInfo.successInfo.imageUrl);
          }
        }

        if (imageUrls.length === 0) {
          return { status: 'error', imageUrls: [], localPaths: [], toolName, width, height, error: 'MISSING_IMAGE_URL: Task selesai tanpa URL gambar.' };
        }

        opts.onProgress?.(`Task selesai! ${imageUrls.length} gambar. Mendownload...`);
        const localPaths: (string | null)[] = [];
        for (let i = 0; i < imageUrls.length; i++) {
          let localPath: string | null = null;
          for (let dl = 0; dl < 3; dl++) {
            try {
              const buffer = await downloadImage(imageUrls[i], requestTimeoutMs);
              const ext = path.extname(new URL(imageUrls[i]).pathname) || '.png';
              const out = path.join(imageOutputDir(), `otome_${jobId}_${i + 1}${ext}`);
              fs.writeFileSync(out, buffer);
              localPath = out;
              break;
            } catch {
              if (dl < 2) await new Promise(r => setTimeout(r, 2000 * (dl + 1)));
            }
          }
          localPaths.push(localPath);
        }

        appendLog({ event: 'generate', prompt: opts.prompt, model: toolName, jobId, width, height, count: imageUrls.length });
        return { status: 'success', imageUrls, localPaths, jobId, toolName, width, height };
      }

      if (status === 'EXCEPTION' || status === 'FAILED') {
        return { status: 'error', imageUrls: [], localPaths: [], toolName, width, height, error: `TASK_FAILED: ${taskInfo.error || taskInfo.message || 'Unknown'}` };
      }
      if (status === 'CANCELED') {
        return { status: 'error', imageUrls: [], localPaths: [], toolName, width, height, error: 'TASK_CANCELED' };
      }
    }

    return { status: 'timeout', imageUrls: [], localPaths: [], toolName, width, height, error: `TIMEOUT setelah ${maxAttempts * (pollIntervalMs / 1000)} detik.` };
  } catch (e: any) {
    return { status: 'error', imageUrls: [], localPaths: [], toolName, width, height, error: `EXECUTION_ERROR: ${e?.message || e}` };
  }
}
