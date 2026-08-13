import { SettingsManager } from '../settings.js';
import { toSingleString } from '../configNormalizer.js';

export async function proxyAIRequest(options: {
  url: string;
  method?: string;
  headers?: any;
  body?: any;
}): Promise<any> {
  const { url, method = 'POST', headers = {}, body = {} } = options;

  const settingsManager = SettingsManager.getInstance();
  const settings = await settingsManager.load();

  // Safety check: static baseline allowlist...
  const allowedDomains = [
    'openrouter.ai', 'anthropic.com', 'openai.com', 'groq.com', 
    'google.com', 'googleapis.com', 'deepseek.com', 'sambanova.ai', 
    'together.ai', 'together.xyz', 'mistral.ai', 'hyperbolic.xyz',
    'cerebras.ai', 'novita.ai', 'nebius.ai', 'kilo.ai', 'puter.com'
  ];

  // Auto-derive allowed domains from every provider baseUrl/base_url/endpoint
  // configured in config.toml, so adding a new provider needs no code change.
  const urlLikeKeys = new Set(['baseurl', 'base_url', 'endpoint']);
  const seenDomains = new Set<string>();
  const collectConfiguredDomains = (obj: any, depth = 0) => {
    if (!obj || typeof obj !== 'object' || depth > 5) return;
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string' && urlLikeKeys.has(key.toLowerCase())) {
        const m1 = value.trim().match(/^https?:\/\/([^/?#]+)/i);
        const m2 = value.trim().match(/^([a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(:\d+)?)(\/|$)/);
        const host = (m1 && m1[1]) || (m2 && m2[1]);
        if (host && !seenDomains.has(host)) {
          seenDomains.add(host);
          allowedDomains.push(host);
        }
      } else if (value && typeof value === 'object') {
        collectConfiguredDomains(value, depth + 1);
      }
    }
  };
  collectConfiguredDomains(settings);

  const isAllowed = allowedDomains.some(domain => url.toLowerCase().includes(domain)) || 
                    url.includes('localhost') || 
                    url.includes('127.0.0.1') || 
                    url.startsWith('/') ||
                    url.includes('192.168.') ||
                    url.includes('10.');
  
  if (!isAllowed) throw new Error(`Domain ${url} is not in the allowed list for AI Proxying. Please use one of the supported standard endpoints or configure local interface.`);

  // Swap environment keys if placeholders are used
  const processedHeaders = { ...headers };
  for (const key in processedHeaders) {
    if (processedHeaders[key] === 'ENV_OPENROUTER_KEY') {
      processedHeaders[key] = `Bearer ${toSingleString(settings.openrouter?.apiKey) || process.env.OPENROUTER_API_KEY || ''}`;
    } else if (processedHeaders[key] === 'ENV_ANTHROPIC_KEY') {
      processedHeaders[key] = toSingleString(settings.anthropic?.apiKey) || process.env.ANTHROPIC_API_KEY || '';
    } else if (processedHeaders[key] === 'ENV_OPENAI_KEY' || processedHeaders[key]?.includes('ENV_OPENAI_KEY')) {
      processedHeaders[key] = processedHeaders[key].replace('ENV_OPENAI_KEY', toSingleString(settings.openai?.apiKey) || process.env.OPENAI_API_KEY || '');
    }
  }

  let response: Response;
  try {
    // Hard timeout (10m) to prevent hanging forever on the upstream provider.
    // Raised from 120s so slow local models (llama.cpp on CPU) can finish.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 600000);
    try {
      response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...processedHeaders
        },
        body: method !== 'GET' ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (e: any) {
    throw new Error(`AI Proxy Connectivity Error: ${e.message}`);
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI Proxy Error (${response.status}): ${errText}`);
  }

  return await response.json();
}
