/**
 * Puter Neural Hub - Bridge Subsystem
 * Logic for handling Puter.js Cloud API calls independently.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// 1. Ambil argumen dari eksekusi Yuihime
// Gabungkan semua argumen untuk menghindari masalah shell splitting
const argsRaw = process.argv.slice(2).join(' ') || '{}';
let args = {};
try {
  args = JSON.parse(argsRaw);
} catch (e) {
  // Jika gagal parse, coba cari pola JSON di dalam string
  try {
     const innerMatch = argsRaw.match(/(\{.*\})/);
     if (innerMatch) args = JSON.parse(innerMatch[1]);
     else args = { raw_input: argsRaw };
  } catch(e2) {
     args = { raw_input: argsRaw };
  }
}

// Pastikan action berhasil diekstrak
if (!args.action && args.raw_input) {
  try {
     const parsed = JSON.parse(args.raw_input);
     Object.assign(args, parsed);
  } catch(e) {}
}

/**
 * MODULE ISOLATION (DOCKER-LIKE): 
 * Menggunakan folder data/ internal untuk persistensi lokal (Volume-like).
 */
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function log(msg) {
  const entry = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(path.join(DATA_DIR, 'subsystem.log'), entry);
  if (process.env.NODE_ENV !== 'production') console.error(msg);
}

/**
 * PuterBridge: Jembatan REST untuk mensimulasikan SDK Puter.js di sisi server.
 */
class PuterBridge {
  constructor(token) {
    this.token = token || process.env.PUTER_HUB_TOKEN || process.env.PUTER_AUTH_TOKEN;
    this.baseUrls = [
      'https://puter.com/api/v1',
      'https://api.puter.com/v1',
      'https://api.puter.com'
    ];
    this.currentBaseUrlIndex = 0;
  }

  get baseUrl() {
    return this.baseUrls[this.currentBaseUrlIndex];
  }

  /**
   * Meniru perilaku puter.ai.chat() atau puter.kv di sisi server.
   */
  async callAI(action, params) {
    log(`Memproses Aksi: ${action} dengan token ${this.token ? 'Tersedia' : 'TIDAK ADA'}`);
    
    if (!this.token) {
      log('PERINGATAN: Token Puter tidak ditemukan. Menggunakan mode simulasi.');
      return this.simulateAI(action, params);
    }

    // Coba semua baseUrls
    let lastError;
    for (let i = 0; i < this.baseUrls.length; i++) {
      this.currentBaseUrlIndex = i;
      try {
        log(`Mencoba Base URL: ${this.baseUrl}`);
        return await this.executeCall(action, params);
      } catch (err) {
        lastError = err;
        log(`Base URL ${this.baseUrl} gagal: ${err.message}`);
        if (!err.message.includes('404') && !err.message.includes('Not Found')) {
           // Jika bukan 404 (misal 401 Unauthorized), mungkin token salah, jangan lanjut muter URL dulu
           break;
        }
      }
    }
    
    log(`Semua Base URL gagal. Terakhir: ${lastError.message}`);
    throw lastError;
  }

  async executeCall(action, params) {
    try {
      if (action === 'chat') {
        let provider = 'openai';
        let modelName = params.model || 'gpt-4o-mini';

        if (modelName.includes(':')) {
          [provider, modelName] = modelName.split(':');
        }

        const payload = {
          messages: [{ role: 'user', content: params.input }],
          model: modelName,
          provider: provider
        };

        // Coba endpoint chat yang mungkin
        const endpoints = ['/ai/chat', '/puterai/chat'];
        let lastChatErr;

        for (const ep of endpoints) {
          try {
            log(`Mencoba chat via ${ep}...`);
            const response = await this.post(ep, payload);
            return {
              text: response.message || response.text || (response.choices && response.choices[0] && response.choices[0].message.content) || "No response from Puter",
              model: modelName,
              provider: provider
            };
          } catch (e) {
            lastChatErr = e;
            log(`Chat via ${ep} gagal: ${e.message}`);
          }
        }
        throw lastChatErr;
      }

      if (action === 'kv_set') {
        const response = await this.post('/kv/set', { key: params.key, value: params.value });
        return { success: true, key: params.key, status: 'saved' };
      }

      if (action === 'kv_get') {
        const response = await this.get(`/kv/get?key=${encodeURIComponent(params.key)}`);
        return { success: true, key: params.key, value: response.value };
      }

      if (action === 'fs_write') {
        const response = await this.post('/fs/write', { path: params.path, content: params.content });
        return { success: true, path: params.path, status: 'written' };
      }

      if (action === 'fs_read') {
        const response = await this.get(`/fs/read?path=${encodeURIComponent(params.path)}`);
        return { success: true, path: params.path, content: response.content };
      }

      if (action === 'tts') {
        const payload = {
          text: params.input,
          voice: params.voice || 'en-US-1'
        };
        // Puter TTS might return a stream or a URL. 
        // In this bridge, we return a proxied URL or the direct one if available.
        return {
          audio_url: `https://api.puter.com/v1/ai/txt2speech/stream?text=${encodeURIComponent(params.input)}&voice=${params.voice || 'en-US-1'}&token=${this.token}`,
          status: 'generated'
        };
      }

      if (action === 'list_models') {
        const fallbacks = [
          { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
          { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
          { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
          { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'google' }
        ];

        if (!this.token) return fallbacks;

        // Coba endpoint model Puter yang diketahui
        const endpoints = [
          '/ai/chat/models', 
          '/ai/models', 
          '/puterai/chat/models',
          '/puterai/chat/models/details'
        ];
        
        for (const endpoint of endpoints) {
          try {
            log(`Mencoba list_models via ${endpoint} di ${this.baseUrl}...`);
            const response = await this.get(endpoint);
            let list = response.models || response;
            
            if (Array.isArray(list) && list.length > 0) {
              log(`BERHASIL: Mendapatkan ${list.length} model dari ${endpoint}`);
              return list;
            }
            log(`Endpoint ${endpoint} tidak mengembalikan array yang valid.`);
          } catch (e) {
            log(`Endpoint ${endpoint} gagal: ${e.message}`);
          }
        }
        
        log('All model endpoints failed or returned empty. Using fallbacks.');
        return fallbacks;
      }

      return this.simulateAI(action, params);
    } catch (err) {
      log(`API ERROR: ${err.message}`);
      return this.simulateAI(action, params);
    }
  }

  simulateAI(action, params) {
    log(`Simulating Puter AI: ${action}`);
    if (action === 'chat') {
      let provider = 'openai';
      let modelName = params.model || 'gpt-4o-mini';
      if (modelName.includes(':')) [provider, modelName] = modelName.split(':');
      return {
        text: `[SIMULASI PUTER/${provider}] Input: "${params.input}". Model: ${modelName}. (Pesan ini muncul karena Token Puter belum valid atau belum diset di Modular Settings)`,
        model: modelName,
        provider: provider
      };
    }
    if (action === 'list_models') {
       return [
         { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
         { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
         { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
         { id: 'claude-3-opus', name: 'Claude 3 Opus', provider: 'anthropic' },
         { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'google' },
         { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'google' }
       ];
    }
    return { error: 'Simulation not fully implemented for this action' };
  }

  post(endpoint, data) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.baseUrl);
      const options = {
        hostname: url.hostname,
        path: `${url.pathname === '/' ? '' : url.pathname}${endpoint}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
          'X-Puter-Token': this.token // Some versions use this
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          log(`API Response: ${res.statusCode} ${body.substring(0, 50)}...`);
          try {
            const parsed = JSON.parse(body);
             if (res.statusCode >= 400) {
               reject(new Error(parsed.error || parsed.message || `HTTP ${res.statusCode}`));
             } else {
               resolve(parsed);
             }
          } catch (e) {
            reject(new Error(`Invalid JSON response: ${body.substring(0, 100)}`));
          }
        });
      });

      req.on('error', reject);
      req.write(JSON.stringify(data));
      req.end();
    });
  }

  get(endpoint) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.baseUrl);
      const options = {
        hostname: url.hostname,
        path: `${url.pathname === '/' ? '' : url.pathname}${endpoint}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'X-Puter-Token': this.token
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          log(`API GET Response: ${res.statusCode} ${body.substring(0, 50)}...`);
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error(`Invalid JSON response: ${body.substring(0, 100)}`));
          }
        });
      });

      req.on('error', reject);
      req.end();
    });
  }
}

// 3. Execution Router
async function run() {
  log(`Execution Arguments: ${argsRaw}`);
  
  // Support case where action is passed directly or inside args
  let action = args.action;
  if (!action && args.raw_input) {
     // Check if raw_input was actually valid JSON that we couldn't parse fully or something
     try {
        const parsed = JSON.parse(args.raw_input);
        action = parsed.action;
        Object.assign(args, parsed);
     } catch(e) {}
  }

  const { input, model, voice, image_url, token, apiKey } = args;
  const bridge = new PuterBridge(token || apiKey || process.env.PUTER_AUTH_TOKEN || process.env.PUTER_API_KEY);

  try {
    let result;
    if (!action) {
       log('ERROR: No action specified in arguments.');
       process.stdout.write(JSON.stringify({ success: false, error: 'No action specified in arguments.', received: args }) + '\n');
       return;
    }

    switch (action) {
      case 'chat':
        const chatResponse = await bridge.callAI('chat', { input, model, image_url });
        result = { success: true, provider: "Puter.js Cloud", message: chatResponse.text, metadata: chatResponse };
        break;

      case 'tts':
        const ttsResponse = await bridge.callAI('tts', { input, voice });
        result = { success: true, type: "audio_stream", url: ttsResponse.audio_url, provider: "Puter.js TTS" };
        break;

      case 'txt2img':
        const imgResponse = await bridge.callAI('txt2img', { input });
        result = { success: true, type: "image_generation", url: imgResponse.image_url, prompt: input };
        break;

      case 'img2txt':
        const ocrResponse = await bridge.callAI('img2txt', { image_url });
        result = { success: true, type: "ocr_result", text: ocrResponse.text };
        break;

      case 'list_models':
        const models = await bridge.callAI('list_models', {});
        result = { success: true, type: "model_list", models: models };
        break;

      case 'evolve_persist':
        // Aksi khusus untuk menyimpan memori Yuihime ke cloud Puter
        // Menggunakan KV store Puter secara otomatis
        const memoryKey = `yui_evolution_${args.identity_id || 'default'}`;
        const memoryData = {
          personality: args.personality,
          last_interaction: new Date().toISOString(),
          status: 'evolving'
        };
        await bridge.callAI('kv_set', { key: memoryKey, value: JSON.stringify(memoryData) });
        result = { success: true, status: 'Memory persisted to Puter Cloud', key: memoryKey };
        break;

      case 'kv_set':
        result = await bridge.callAI('kv_set', { key: args.key, value: args.value });
        break;

      case 'kv_get':
        result = await bridge.callAI('kv_get', { key: args.key });
        break;

      case 'fs_write':
        result = await bridge.callAI('fs_write', { path: args.path, content: args.content });
        break;

      case 'fs_read':
        result = await bridge.callAI('fs_read', { path: args.path });
        break;

      default:
        result = { success: false, error: `Invalid action: ${action}` };
    }

    // Output JSON ke stdout agar ditangkap oleh ToolExecutor Yuihime
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (err) {
    log(`CRITICAL ERROR: ${err.message}`);
    process.stdout.write(JSON.stringify({ success: false, error: err.message }) + '\n');
  }
}

run().catch(err => {
  log(`UNHANDLED ERROR: ${err.message}`);
  process.stdout.write(JSON.stringify({ success: false, error: err.message }) + '\n');
});
