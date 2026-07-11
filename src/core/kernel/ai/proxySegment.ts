import { SettingsManager } from '../settings.js';

export async function proxyAIRequest(options: {
  url: string;
  method?: string;
  headers?: any;
  body?: any;
}): Promise<any> {
  const { url, method = 'POST', headers = {}, body = {} } = options;
  
  // Safety check
  const allowedDomains = [
    'openrouter.ai', 'anthropic.com', 'openai.com', 'groq.com', 
    'google.com', 'googleapis.com', 'deepseek.com', 'sambanova.ai', 
    'together.ai', 'together.xyz', 'mistral.ai', 'hyperbolic.xyz',
    'cerebras.ai', 'novita.ai', 'nebius.ai'
  ];
  const isAllowed = allowedDomains.some(domain => url.toLowerCase().includes(domain)) || 
                    url.includes('localhost') || 
                    url.includes('127.0.0.1') || 
                    url.startsWith('/') ||
                    url.includes('192.168.') ||
                    url.includes('10.');
  
  if (!isAllowed) throw new Error(`Domain ${url} is not in the allowed list for AI Proxying. Please use one of the supported standard endpoints or configure local interface.`);

  // Swap environment keys if placeholders are used
  const processedHeaders = { ...headers };
  const settingsManager = SettingsManager.getInstance();
  const settings = await settingsManager.load();
  for (const key in processedHeaders) {
    if (processedHeaders[key] === 'ENV_OPENROUTER_KEY') {
      processedHeaders[key] = `Bearer ${settings.openrouter?.apiKey || process.env.OPENROUTER_API_KEY || ''}`;
    } else if (processedHeaders[key] === 'ENV_ANTHROPIC_KEY') {
      processedHeaders[key] = settings.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY || '';
    } else if (processedHeaders[key] === 'ENV_OPENAI_KEY' || processedHeaders[key]?.includes('ENV_OPENAI_KEY')) {
      processedHeaders[key] = processedHeaders[key].replace('ENV_OPENAI_KEY', settings.openai?.apiKey || process.env.OPENAI_API_KEY || '');
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...processedHeaders
      },
      body: method !== 'GET' ? JSON.stringify(body) : undefined
    });
  } catch (e: any) {
    throw new Error(`AI Proxy Connectivity Error: ${e.message}`);
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI Proxy Error (${response.status}): ${errText}`);
  }

  return await response.json();
}
