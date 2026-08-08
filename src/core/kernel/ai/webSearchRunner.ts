import { Worker } from 'worker_threads';

export interface WebSearchConfig {
  gemini?: {
    apiKeys: string[];
    model?: string;
    baseUrl?: string;
    apiVersion?: string;
  };
  openrouter?: {
    apiKey?: string;
    model?: string;
  };
}

export interface WebSearchRunnerResult {
  results: any[];
  failed: boolean;
  reason?: string;
}

const WEB_SEARCH_HARD_TIMEOUT_MS = 12000;

const WEB_SEARCH_WORKER_CODE = `
const { parentPort } = require('worker_threads');

function hasExpired(start, maxMs) {
  return Date.now() - start > maxMs;
}

function resolveModelIdName(raw) {
  if (typeof raw !== 'string') return '';
  let clean = raw.replace(/^models\\//, '');
  if (clean.indexOf(':') !== -1) {
    const parts = clean.split(':');
    if (parts[0] === 'gemini' || parts[0] === 'google') clean = parts[parts.length - 1];
  }
  if (clean.indexOf('/') !== -1) {
    const parts = clean.split('/');
    if (parts[0] === 'google') clean = parts[parts.length - 1];
  }
  return clean;
}

async function geminiGrounding(query, cfg, topK, start, maxMs) {
  const gemini = cfg && cfg.gemini;
  const keys = gemini && Array.isArray(gemini.apiKeys) ? gemini.apiKeys : [];
  if (!keys || keys.length === 0) return null;
  const baseUrl = String(gemini.baseUrl || 'https://generativelanguage.googleapis.com').replace(/\\/$/, '');
  if (baseUrl.indexOf('openrouter.ai') !== -1) return null;
  const apiVersion = gemini.apiVersion || 'v1beta';
  const models = [resolveModelIdName(gemini.model), 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
  for (let i = 0; i < models.length; i++) {
    if (hasExpired(start, maxMs)) break;
    const model = models[i];
    if (!model) continue;
    for (let j = 0; j < keys.length; j++) {
      if (hasExpired(start, maxMs)) break;
      const key = keys[j];
      try {
        const targetUrl = baseUrl.indexOf('/models/') !== -1 || baseUrl.indexOf(':generateContent') !== -1
          ? baseUrl
          : baseUrl + '/' + apiVersion + '/models/' + model + ':generateContent?key=' + encodeURIComponent(key);
        const res = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'aistudio-build' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'Search Google and return the direct real-time info or relevant details for: "' + query + '"' }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
            tools: [{ googleSearch: {} }]
          }),
          signal: AbortSignal.timeout(6000)
        });
        if (res.ok) {
          const resJson = await res.json();
          const cand = resJson.candidates && resJson.candidates[0];
          const chunks = cand && cand.groundingMetadata ? (cand.groundingMetadata.groundingChunks || []) : [];
          if (chunks.length > 0) {
            return chunks.slice(0, topK).map(function (c, idx) {
              const web = c.web || {};
              return {
                title: web.title || 'Resource ' + (idx + 1),
                snippet: web.title ? 'Direct info excerpt for: ' + web.title : 'Grounding reference source for "' + query + '"',
                url: web.uri || ''
              };
            });
          }
          const parts = cand && cand.content ? (cand.content.parts || []) : [];
          const text = parts.map(function (p) { return p.text || ''; }).join('').trim();
          if (text) return [{ title: 'Summary for "' + query + '"', snippet: text, url: 'https://google.com' }];
        }
      } catch (e) {}
    }
  }
  return null;
}

async function openrouterSearch(query, cfg, start, maxMs) {
  const or = cfg && cfg.openrouter;
  if (!or || !or.apiKey) return null;
  try {
    const payload = {
      model: or.model || 'gemini-flash-latest',
      messages: [
        { role: 'system', content: 'You are an intelligent search retrieval assistant. Provide a highly accurate, clean, bulleted list of current factual details to satisfy the search query.' },
        { role: 'user', content: 'Search query: "' + query + '"' }
      ],
      max_tokens: 500,
      temperature: 0.1
    };
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + or.apiKey,
        'HTTP-Referer': 'https://ai.studio/build',
        'X-Title': 'YuiHime AI Studio Search Grounding'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(6000)
    });
    if (res.ok) {
      const data = await res.json();
      const content = data.choices && data.choices[0] && data.choices[0].message ? (data.choices[0].message.content || '') : '';
      if (content) return [{ title: 'Search Grounding Context', snippet: content, url: 'https://openrouter.ai' }];
    }
  } catch (e) {}
  return null;
}

async function wikipediaSearch(query, start, maxMs) {
  const results = [];
  const langs = ['id', 'en'];
  for (let i = 0; i < langs.length; i++) {
    if (hasExpired(start, maxMs)) break;
    const lang = langs[i];
    try {
      const url = 'https://' + lang + '.wikipedia.org/w/api.php?action=query&list=search&srsearch=' + encodeURIComponent(query) + '&utf8=&format=json&origin=*';
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const data = await res.json();
        const list = data.query && data.query.search ? data.query.search : [];
        for (let j = 0; j < list.length && j < 2; j++) {
          if (hasExpired(start, maxMs)) break;
          const item = list[j];
          const cleanText = String(item.snippet || '').replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
          if (cleanText) results.push({
            title: item.title + ' (' + lang.toUpperCase() + ') - Wikipedia',
            snippet: cleanText,
            url: 'https://' + lang + '.wikipedia.org/wiki/' + encodeURIComponent(item.title)
          });
        }
      }
    } catch (e) {}
  }
  return results;
}

async function rssSearch(query, start, maxMs) {
  const results = [];
  const feeds = [
    { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', name: 'BBC World' },
    { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml', name: 'NYT Tech' },
    { url: 'https://www.aljazeera.com/xml/rss/all.xml', name: 'Al Jazeera' },
    { url: 'https://www.theverge.com/rss/index.xml', name: 'The Verge' }
  ];
  const keywords = query.toLowerCase().split(/\\s+/).map(function (k) { return k.replace(/[^\\w]/g, ''); }).filter(Boolean);
  for (let i = 0; i < feeds.length; i++) {
    if (hasExpired(start, maxMs) || results.length >= 8) break;
    const feed = feeds[i];
    try {
      const res = await fetch(feed.url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(6000)
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const isAtom = feed.url.indexOf('verge') !== -1;
      const re = isAtom ? /<entry>([\\s\\S]*?)<\\/entry>/g : /<item>([\\s\\S]*?)<\\/item>/g;
      const feedResults = [];
      let m;
      while ((m = re.exec(xml)) !== null && feedResults.length < 3) {
        const item = m[1];
        const t = /<title[^>]*>([\\s\\S]*?)<\\/title>/.exec(item);
        const l = isAtom ? /<link[^>]*href="([^"]+)"/.exec(item) : /<link[^>]*>([\\s\\S]*?)<\\/link>/.exec(item);
        const d = /<description[^>]*>([\\s\\S]*?)<\\/description>/.exec(item);
        const s = /<summary[^>]*>([\\s\\S]*?)<\\/summary>/.exec(item);
        const snip = d || s;
        if (t && l) {
          const title = t[1].replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').trim();
          const url = (isAtom ? l[1] : String(l[1] || '').replace(/<[^>]*>/g, '')).trim();
          const snippet = snip ? snip[1].replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').trim() : '';
          const combined = (title + ' ' + snippet).toLowerCase();
          const relevant = keywords.length === 0 || keywords.some(function (kw) { return combined.indexOf(kw) !== -1; });
          if (title && url && relevant) feedResults.push({ title: title + ' (' + feed.name + ')', snippet: snippet.slice(0, 200), url: url });
        }
      }
      for (let j = 0; j < feedResults.length; j++) results.push(feedResults[j]);
    } catch (e) {}
  }
  return results;
}

async function runSearch(msg) {
  const query = String(msg.query || '').trim();
  if (!query) return [];
  const topK = Math.max(1, Math.min(20, Number(msg.topK) || 5));
  const start = Date.now();
  const MAX_MS = 9000;
  const results = [];

  const grounding = await geminiGrounding(query, msg.config, topK, start, MAX_MS);
  if (grounding && grounding.length > 0) return grounding.slice(0, topK);

  const or = await openrouterSearch(query, msg.config, start, MAX_MS);
  if (or && or.length > 0) results.push.apply(results, or);

  const wiki = await wikipediaSearch(query, start, MAX_MS);
  results.push.apply(results, wiki);

  if (results.length < 3) {
    const rss = await rssSearch(query, start, MAX_MS);
    results.push.apply(results, rss);
  }

  return results.slice(0, topK);
}

parentPort.on('message', async function (msg) {
  try {
    const results = await runSearch(msg);
    parentPort.postMessage({ id: msg.id, success: true, results: results });
  } catch (err) {
    parentPort.postMessage({ id: msg.id, success: false, error: String((err && err.message) || err) });
  }
});
`;

export class WebSearchRunner {
  public static async search(query: string, topK: number, config: WebSearchConfig): Promise<WebSearchRunnerResult> {
    const isNode = typeof window === 'undefined';
    if (!isNode) {
      return { results: [], failed: false };
    }

    return new Promise<WebSearchRunnerResult>((resolve) => {
      let settled = false;
      let worker: Worker | null = null;
      let hardTimeout: NodeJS.Timeout | null = null;

      const finish = (result: WebSearchRunnerResult) => {
        if (settled) return;
        settled = true;
        if (hardTimeout) clearTimeout(hardTimeout);
        try {
          if (worker) worker.terminate();
        } catch (err) {}
        resolve(result);
      };

      hardTimeout = setTimeout(() => {
        finish({ results: [], failed: true, reason: 'timeout' });
      }, WEB_SEARCH_HARD_TIMEOUT_MS);

      try {
        worker = new Worker(WEB_SEARCH_WORKER_CODE, { eval: true });
      } catch (err: any) {
        finish({ results: [], failed: true, reason: 'worker_spawn_failed' });
        return;
      }

      worker.on('message', (msg: any) => {
        if (settled) return;
        if (msg && msg.success) {
          finish({ results: Array.isArray(msg.results) ? msg.results : [], failed: false });
        } else {
          finish({ results: [], failed: true, reason: (msg && msg.error) || 'search_failed' });
        }
      });

      worker.on('error', (err: Error) => {
        finish({ results: [], failed: true, reason: (err && err.message) || 'worker_error' });
      });

      worker.on('exit', () => {
        finish({ results: [], failed: true, reason: 'worker_exited' });
      });

      worker.postMessage({ id: 1, query, topK, config });
    });
  }
}
