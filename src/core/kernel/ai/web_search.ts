import { SettingsManager } from '../settings.js';
import { toKeyArray, toSingleString } from '../configNormalizer.js';
import { SystemRegistry } from '@shared/core/registry';

const keyPool = {
  configure: (_providerId: string, _config: any, _settings: any) => {},
  next: (_providerId: string, _primaryKey: string, _modelId: string) => _primaryKey,
  reportFailure: (_providerId: string, _key: string, _modelId: string, _msg: string) => {}
};

function summarizeAiError(error: any): string {
  const raw = error?.message || String(error);
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error) {
      const e = parsed.error;
      const details = Array.isArray(e.details) ? e.details : [];
      const quota = details.find((d: any) => d?.quotaMetric)?.quotaMetric || '';
      const retry = details.find((d: any) => d?.retryDelay)?.retryDelay || '';
      const parts = [
        `HTTP ${e.code || ''}`.trim(),
        e.status,
        e.message?.split('\n')[0],
        quota && `quota:${quota}`,
        retry && `retry:${retry}`
      ].filter(Boolean);
      return parts.join(' | ');
    }
  } catch {}
  return raw.split('\n')[0].slice(0, 240);
}

export async function executeGoogleSearch(query: string): Promise<any[]> {
  const settings = SettingsManager.getInstance();
  
  const providersTable = (settings.get('providers') as any) || {};
  const geminiSettings = { ...(providersTable.gemini || {}), ...(settings.get('gemini') || {}) };
  
  let defaultGeminiModel = 'gemini-2.0-flash';
  const GROUNDING_FALLBACKS = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-pro'];
  
  const toModelString = (raw: any): string => {
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'string') return raw[0];
    return '';
  };
  
  if (geminiSettings.model) {
    defaultGeminiModel = toModelString(geminiSettings.model) || defaultGeminiModel;
  } else {
    try {
       const geminiModule = SystemRegistry.getProvider('gemini');
       if (geminiModule && geminiModule.metadata?.models?.length > 0) {
         defaultGeminiModel = toModelString(geminiModule.metadata.models[0]) || defaultGeminiModel;
       }
     } catch (e) {}
  }

  const resolveModelIdName = (rawModel: any): string => {
    if (typeof rawModel !== 'string') return '';
    let clean = rawModel.replace(/^models\//, '');
    if (clean.includes(':')) {
      const parts = clean.split(':');
      if (parts[0] === 'gemini' || parts[0] === 'google') {
        clean = parts[parts.length - 1];
      }
    }
    if (clean.includes('/')) {
      const parts = clean.split('/');
      if (parts[0] === 'google') {
        clean = parts[parts.length - 1];
      }
    }
    return clean;
  };

  const primaryKey = toSingleString(settings.getApiKey());
  const fallbackKey = toSingleString(geminiSettings.fallbackApiKey);

  const geminiAttempts: string[] = [];
  if (primaryKey) geminiAttempts.push(primaryKey);
  if (fallbackKey && fallbackKey !== primaryKey) geminiAttempts.push(fallbackKey);

  if (geminiAttempts.length > 0) {
    const poolConfig = {
      apiKey: primaryKey || fallbackKey || '',
      apiKeys: [...toKeyArray(primaryKey), ...toKeyArray(fallbackKey)].filter((v, i, a) => a.indexOf(v) === i),
      model: defaultGeminiModel,
      ...geminiSettings
    };
    keyPool.configure('gemini', poolConfig, geminiSettings);
  }

  const finalBaseUrl = (geminiSettings.baseUrl || geminiSettings.endpoint || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
  const isTargetingOpenRouter = finalBaseUrl.includes('openrouter.ai');

  if (geminiAttempts.length > 0 && !isTargetingOpenRouter) {
    const modelsToTry = [
      resolveModelIdName(defaultGeminiModel),
      ...GROUNDING_FALLBACKS.filter(m => resolveModelIdName(m) !== resolveModelIdName(defaultGeminiModel)).map(resolveModelIdName)
    ];
    const skippedModels = new Set<string>();
    
    for (const targetModel of modelsToTry) {
      if (skippedModels.has(targetModel)) continue;
      
      const apiKey = keyPool.next('gemini', primaryKey || fallbackKey, targetModel);
      if (!apiKey) continue;
      
      try {
          const apiVersion = geminiSettings.apiVersion || 'v1beta';
          let targetUrl = '';
          if (finalBaseUrl.includes('/models/') || finalBaseUrl.includes(':generateContent')) {
            targetUrl = finalBaseUrl;
          } else {
            targetUrl = `${finalBaseUrl}/${apiVersion}/models/${targetModel}:generateContent?key=${apiKey}`;
          }

          const requestBody = {
            contents: [{
              role: 'user',
              parts: [{ text: `Search Google and return the direct real-time info or relevant details for: "${query}"` }]
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 1024,
            },
            tools: [{ googleSearch: {} }]
          };

          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'User-Agent': 'aistudio-build'
          };

          console.log(`[SERVER_SEARCH_GROUNDING] Querying native Google Search Grounding context via Gemini (${targetModel}) for: ${query}`);

          const res = await fetch(targetUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(15000)
          });

          if (!res.ok) {
            const errText = await res.text().catch(() => 'Unknown error');
            console.warn(`[SERVER_SEARCH_GROUNDING] Gemini grounding returned HTTP ${res.status} for model ${targetModel}:`, errText.slice(0, 200));
            
            if (apiKey) {
              keyPool.reportFailure('gemini', apiKey, targetModel, `HTTP ${res.status}: ${errText.slice(0, 100)}`);
            }
            
            if (res.status === 404) {
              skippedModels.add(targetModel);
            }
            continue;
          }

          const resJson: any = await res.json();
          const groundingChunks = resJson.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
          
          if (groundingChunks.length > 0) {
            return groundingChunks.map((chunk: any, index: number) => {
              const web = chunk.web || {};
              return {
                title: web.title || `Resource ${index + 1}`,
                snippet: web.title ? `Direct info excerpt for: ${web.title}` : `Grounding reference source for "${query}"`,
                url: web.uri || ''
              };
            });
          }

          const parts = resJson.candidates?.[0]?.content?.parts || [];
          const text = parts.map((p: any) => p.text || '').join('').trim();
          if (text) {
            return [{
              title: `Summary for "${query}"`,
              snippet: text,
              url: "https://google.com"
            }];
          }
        } catch (err: any) {
          console.warn(`[SERVER_SEARCH_GROUNDING] Native Gemini grounding attempt failed for model ${targetModel}, trying alternative fallbacks:`, err.message);
        }
      }
    }

  const openrouterSettings = settings.get('openrouter') || {};
  const openrouterKey = toSingleString(openrouterSettings.apiKey) || process.env.OPENROUTER_API_KEY;

  if (openrouterKey) {
    try {
      console.log(`[SERVER_SEARCH_GROUNDING] Triggering search query via OpenRouter API key for: ${query}`);
      const searchModel = toSingleString(openrouterSettings.model) || defaultGeminiModel || 'gemini-2.0-flash';
      
      const payload = {
        model: searchModel,
        messages: [
          {
            role: 'system',
            content: 'You are an intelligent search retrieval assistant. Provide a highly accurate, clean, bulleted list of current 2026 events/factual details to satisfy the search query.'
          },
          {
            role: 'user',
            content: `Search query: "${query}"`
          }
        ],
        max_tokens: 500,
        temperature: 0.1
      };

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openrouterKey}`,
          'HTTP-Referer': 'https://ai.studio/build',
          'X-Title': 'YuiHime AI Studio Search Grounding'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000)
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || '';
        if (content) {
          return [
            {
              title: `Search Grounding Context [${searchModel}]`,
              snippet: content,
              url: "https://openrouter.ai"
            }
          ];
        }
      } else {
        const errText = await res.text().catch(() => 'Unknown error');
        console.warn(`[SERVER_SEARCH_GROUNDING] OpenRouter search returned HTTP ${res.status}:`, errText.slice(0, 200));
      }
    } catch (openrouterErr: any) {
      console.warn(`[SERVER_SEARCH_GROUNDING] OpenRouter search query failed:`, openrouterErr.message);
    }
  }

  const searchResults: any[] = [];

  const scrapeHtmlResults = (html: string, selectors: { resultBlock: RegExp; title: RegExp; link: RegExp; snippet: RegExp }, maxResults = 8): any[] => {
    const results: any[] = [];
    let match;
    while ((match = selectors.resultBlock.exec(html)) !== null && results.length < maxResults) {
      const block = match[1];
      const titleMatch = selectors.title.exec(block);
      const linkMatch = selectors.link.exec(block);
      const snippetMatch = selectors.snippet.exec(block);
      
      if (titleMatch && linkMatch) {
        let link = linkMatch[1];
        if (link.includes('uddg=')) {
          const uddgMatch = /uddg=([^&"]+)/.exec(link);
          if (uddgMatch) link = decodeURIComponent(uddgMatch[1]);
        }
        const title = titleMatch[1]
          .replace(/<[^>]*>/g, '')
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .trim();
        const snippet = snippetMatch 
          ? snippetMatch[1].replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim()
          : `Search result for "${query}"`;
        if (title && link) results.push({ title, snippet, url: link });
      }
    }
    return results;
  };

  try {
    console.log(`[SERVER_SEARCH_GROUNDING] Querying Zero-Key DuckDuckGo Web Scraper for: ${query}`);
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const ddgRes = await fetch(ddgUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      signal: AbortSignal.timeout(6000)
    });

    if (ddgRes.ok) {
      const html = await ddgRes.text();
      const ddgResults = scrapeHtmlResults(html, {
        resultBlock: /<div class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g,
        title: /<a class="result__a"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/,
        link: /<a class="result__a"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/,
        snippet: /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/
      });
      searchResults.push(...ddgResults);
      console.log(`[SERVER_SEARCH_GROUNDING] DuckDuckGo returned ${ddgResults.length} results`);
    }
  } catch (ddgErr: any) {
    console.warn(`[SERVER_SEARCH_GROUNDING] DuckDuckGo zero-key scraper attempt failed:`, ddgErr.message);
  }

  if (searchResults.length < 3) {
    try {
      console.log(`[SERVER_SEARCH_GROUNDING] Querying Zero-Key Qwant Lite for: ${query}`);
      const qwantUrl = `https://lite.qwant.com/?q=${encodeURIComponent(query)}`;
      const qwantRes = await fetch(qwantUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        signal: AbortSignal.timeout(6000)
      });

      if (qwantRes.ok) {
        const html = await qwantRes.text();
        const qwantResults = scrapeHtmlResults(html, {
          resultBlock: /<li class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/li>/g,
          title: /<a class="[^"]*result-link[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/,
          link: /<a class="[^"]*result-link[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/,
          snippet: /<p class="[^"]*result-description[^"]*"[^>]*>([\s\S]*?)<\/p>/
        });
        searchResults.push(...qwantResults);
        console.log(`[SERVER_SEARCH_GROUNDING] Qwant Lite returned ${qwantResults.length} results`);
      }
    } catch (qwantErr: any) {
      console.warn(`[SERVER_SEARCH_GROUNDING] Qwant Lite zero-key scraper attempt failed:`, qwantErr.message);
    }
  }

  if (searchResults.length < 3) {
    try {
      console.log(`[SERVER_SEARCH_GROUNDING] Querying Zero-Key Yandex for: ${query}`);
      const yandexUrl = `https://yandex.com/search/?text=${encodeURIComponent(query)}`;
      const yandexRes = await fetch(yandexUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        signal: AbortSignal.timeout(6000)
      });

      if (yandexRes.ok) {
        const html = await yandexRes.text();
        const yandexResults = scrapeHtmlResults(html, {
          resultBlock: /<li class="[^"]*serp-item[^"]*"[^>]*>([\s\S]*?)<\/li>/g,
          title: /<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>/,
          link: /<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>/,
          snippet: /<div class="[^"]*text-[^"]*"[^>]*>([\s\S]*?)<\/div>/
        });
        searchResults.push(...yandexResults);
        console.log(`[SERVER_SEARCH_GROUNDING] Yandex returned ${yandexResults.length} results`);
      }
    } catch (yandexErr: any) {
      console.warn(`[SERVER_SEARCH_GROUNDING] Yandex zero-key scraper attempt failed:`, yandexErr.message);
    }
  }

  if (searchResults.length < 3) {
    const searxInstances = [
      'https://searx.be',
      'https://search.sapti.me',
      'https://searx.fmac.xyz'
    ];
    
    for (const instance of searxInstances) {
      try {
        console.log(`[SERVER_SEARCH_GROUNDING] Querying Zero-Key SearXNG (${instance}) for: ${query}`);
        const searxUrl = `${instance}/search?q=${encodeURIComponent(query)}&format=json&engines=google,bing,duckduckgo`;
        const searxRes = await fetch(searxUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json'
          },
          signal: AbortSignal.timeout(8000)
        });

        if (searxRes.ok) {
          const data = await searxRes.json();
          const results = (data.results || []).slice(0, 5).map((r: any) => ({
            title: r.title || `Result for "${query}"`,
            snippet: r.content || r.description || `Search result for "${query}"`,
            url: r.url || r.link || ''
          }));
          searchResults.push(...results);
          console.log(`[SERVER_SEARCH_GROUNDING] SearXNG (${instance}) returned ${results.length} results`);
          break;
        }
      } catch (searxErr: any) {
        console.warn(`[SERVER_SEARCH_GROUNDING] SearXNG (${instance}) failed:`, searxErr.message);
      }
    }
  }

  if (searchResults.length < 3) {
    const queryKeywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const rssFeeds = [
      { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', name: 'BBC World', type: 'rss' as const },
      { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml', name: 'NYT Tech', type: 'rss' as const },
      { url: 'https://www.aljazeera.com/xml/rss/all.xml', name: 'Al Jazeera', type: 'rss' as const },
      { url: 'https://feeds.npr.org/1001/rss.xml', name: 'NPR', type: 'rss' as const },
      { url: 'https://www.theverge.com/rss/index.xml', name: 'The Verge', type: 'atom' as const }
    ];

    for (const feed of rssFeeds) {
      try {
        console.log(`[SERVER_SEARCH_GROUNDING] Querying RSS feed (${feed.name}) for: ${query}`);
        const res = await fetch(feed.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/rss+xml, application/xml, text/xml'
          },
          signal: AbortSignal.timeout(6000)
        });

        if (res.ok) {
          const xml = await res.text();
          const feedResults: any[] = [];

          if (feed.type === 'rss') {
            const itemRegex = /<item>([\s\S]*?)<\/item>/g;
            let itemMatch;
            while ((itemMatch = itemRegex.exec(xml)) !== null && feedResults.length < 5) {
              const item = itemMatch[1];
              const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/.exec(item);
              const linkMatch = /<link[^>]*>([\s\S]*?)<\/link>/.exec(item);
              const descMatch = /<description[^>]*>([\s\S]*?)<\/description>/.exec(item);
              
              if (titleMatch && linkMatch) {
                const title = titleMatch[1].replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
                const url = linkMatch[1].replace(/<[^>]*>/g, '').trim();
                const snippet = descMatch 
                  ? descMatch[1].replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim()
                  : `News from ${feed.name}`;
                if (title && url) {
                  const combinedText = `${title} ${snippet}`.toLowerCase();
                  const isRelevant = queryKeywords.length === 0 || queryKeywords.some(kw => combinedText.includes(kw));
                  if (isRelevant) feedResults.push({ title: `${title} (${feed.name})`, snippet: snippet.slice(0, 200), url });
                }
              }
            }
          } else {
            const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
            let entryMatch;
            while ((entryMatch = entryRegex.exec(xml)) !== null && feedResults.length < 5) {
              const entry = entryMatch[1];
              const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/.exec(entry);
              const linkMatch = /<link[^>]*href="([^"]+)"[^>]*/.exec(entry);
              const summaryMatch = /<summary[^>]*>([\s\S]*?)<\/summary>/.exec(entry);
              
              if (titleMatch && linkMatch) {
                const title = titleMatch[1].replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
                const url = linkMatch[1].trim();
                const snippet = summaryMatch 
                  ? summaryMatch[1].replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim()
                  : `News from ${feed.name}`;
                if (title && url) {
                  const combinedText = `${title} ${snippet}`.toLowerCase();
                  const isRelevant = queryKeywords.length === 0 || queryKeywords.some(kw => combinedText.includes(kw));
                  if (isRelevant) feedResults.push({ title: `${title} (${feed.name})`, snippet: snippet.slice(0, 200), url });
                }
              }
            }
          }

          searchResults.push(...feedResults);
          console.log(`[SERVER_SEARCH_GROUNDING] RSS (${feed.name}) returned ${feedResults.length} results`);
          if (searchResults.length >= 3) break;
        }
      } catch (rssErr: any) {
        console.warn(`[SERVER_SEARCH_GROUNDING] RSS (${feed.name}) failed:`, rssErr.message);
      }
    }
  }
  try {
    console.log(`[SERVER_SEARCH_GROUNDING] Performing Zero-Key Wikipedia Multi-Lang query for: ${query}`);
    const targetLangs = ['id', 'en'];

    for (const lang of targetLangs) {
      try {
        const wpUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*`;
        const res = await fetch(wpUrl, {
          signal: AbortSignal.timeout(10000)
        });
        if (res.ok) {
          const data = await res.json();
          const list = data.query?.search || [];
          
          for (const item of list.slice(0, 3)) {
            const cleanText = item.snippet
              .replace(/<span class="searchmatch">/g, '')
              .replace(/<\/span>/g, '')
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .trim();

            if (cleanText) {
              searchResults.push({
                title: `${item.title} (${lang.toUpperCase()}) - Wikipedia`,
                snippet: cleanText,
                url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(item.title)}`
              });
            }
          }
        } else {
          console.warn(`[SERVER_SEARCH_GROUNDING] Wikipedia lang=${lang} returned HTTP ${res.status}`);
        }
      } catch (wpErr: any) {
        console.warn(`[SERVER_SEARCH_GROUNDING] Wikipedia lang=${lang} search sub-route failed:`, wpErr.message);
      }
    }
  } catch (globalWikiErr: any) {
    console.error(`[SERVER_SEARCH_GROUNDING] Wikipedia search API completely failed:`, globalWikiErr.message);
  }

  if (searchResults.length > 0) {
    return searchResults;
  }

  return [
    { title: `${query} - Wikipedia`, snippet: `Knowledge query reference helper for "${query}". Check out general encyclopedic articles online.`, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(query)}` },
    { title: `Google Search Index for: ${query}`, snippet: `Direct link to review the live Google Web Search index results for "${query}".`, url: `https://www.google.com/search?q=${encodeURIComponent(query)}` }
  ];
}
