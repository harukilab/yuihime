import { ToolModule } from '../../../include/types';
import { SystemRegistry } from '../../../core/registry';
import { StandardizedProcessor } from '../../../core/kernel/processor';
import manifest from './manifest.json';

export const WebSnipperTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any) => {
    const config = await SystemRegistry.getConfig('scrape_web');
    const url = args.url;
    console.log(`[SYSTEM] WebSnipper initiating request to URL: ${url}`);
    
    const execution = await StandardizedProcessor.executeStandardized(
      'scrape_web',
      '1.0.0',
      { url: args.url, selector: args.selector },
      async () => {
        const isServer = typeof window === 'undefined';
        const saveToMemory = args.saveToMemory !== false;
        const selector = args.selector || '';
        const context = args.context || 'web_default';
        const importance = typeof args.importance === 'number' ? args.importance : 0.8;
        const defaultUserAgent = config?.defaultUserAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        const maxContentLength = typeof config?.maxContentLength === 'number' ? config.maxContentLength : 12000;
        const engine = config?.engine || 'jina';
        const jinaApiKey = config?.jinaApiKey || process.env.JINA_API_KEY || '';

        if (isServer) {
          let extractedText = '';
          let scrapeSuccess = false;

          // 1. Primary Engine: Jina Reader API
          if (engine === 'jina') {
            try {
              console.log(`[WEB_SNIPPER] Scraping via Jina Reader API (r.jina.ai) for URL: ${url}`);
              const jinaHeaders: Record<string, string> = {
                'Accept': 'text/plain'
              };
              if (jinaApiKey) {
                jinaHeaders['Authorization'] = `Bearer ${jinaApiKey}`;
              }
              if (selector) {
                jinaHeaders['X-Target-Selector'] = selector;
              }

              const jinaResponse = await fetch(`https://r.jina.ai/${url}`, {
                headers: jinaHeaders,
                signal: AbortSignal.timeout(12000)
              });

              if (jinaResponse.ok) {
                extractedText = await jinaResponse.text();
                scrapeSuccess = true;
                console.log(`[WEB_SNIPPER] Successfully scraped ${extractedText.length} chars via Jina Reader API.`);
              } else {
                console.warn(`[WEB_SNIPPER] Jina Reader returned non-ok status: ${jinaResponse.status} ${jinaResponse.statusText}. Falling back to local scraper...`);
              }
            } catch (jinaErr: any) {
              console.warn(`[WEB_SNIPPER] Jina Reader execution failed (${jinaErr.message}). Falling back to local scraper...`);
            }
          }

          // 2. Secondary Engine/Fallback: Local scraping via Cheerio / Regex
          if (!scrapeSuccess) {
            try {
              console.log(`[WEB_SNIPPER] Scraping via Local Scraper for URL: ${url}`);
              const response = await fetch(url, { 
                headers: { 'User-Agent': defaultUserAgent },
                signal: AbortSignal.timeout(10000)
              });
              
              if (!response.ok) {
                throw new Error(`Failed to fetch URL ${url}: ${response.status} ${response.statusText}`);
              }

              const html = await response.text();
              let cheerioFailed = false;
              let $;

              try {
                const cheerioPath = 'cheerio';
                const cheerio = await import(/* @vite-ignore */ cheerioPath);
                $ = cheerio.load(html);
              } catch (cheerioErr: any) {
                console.warn("[WEB_SNIPPER] Direct Cheerio import or load failed. Using primitive fallback parser:", cheerioErr.message);
                cheerioFailed = true;
              }

              if (!cheerioFailed && $) {
                if (!selector) {
                  $('script, style, head, iframe, noscript, svg, footer, header, nav').remove();
                }

                if (selector) {
                  const matches = $(selector);
                  if (matches.length === 0) {
                    extractedText = `[Warning] CSS selector "${selector}" did not match any elements on the target webpage.`;
                  } else {
                    const texts: string[] = [];
                    matches.each((_, el) => {
                      const txt = $(el).text().trim();
                      if (txt) texts.push(txt);
                    });
                    extractedText = texts.join('\n\n');
                  }
                } else {
                  extractedText = $('body').text()
                    .replace(/\s+/g, ' ')
                    .replace(/\n\s*\n/g, '\n')
                    .trim();
                }
              } else {
                extractedText = parseHtmlFallback(html, selector);
              }

              // Suggest headless browser option for dynamic JS-driven SPA contents
              const isDynamicSPA = html.includes('id="root"') || html.includes('id="app"') || html.includes('react-root') || html.includes('__NEXT_DATA__');
              if (isDynamicSPA && extractedText.trim().length < 350) {
                extractedText += `\n\n[System Advice: This webpage appears to be a JavaScript-driven Single Page Application (SPA). To scrape dynamic/hydrated content, consider using a headless browser option (such as Puppeteer, Playwright, or an external dynamic scraping proxy).]`;
              }
            } catch (localErr: any) {
              console.error("[WEB_SNIPPER] Local scraper execution failed:", localErr.message);
              throw localErr;
            }
          }

          if (extractedText.length > maxContentLength) {
            extractedText = extractedText.substring(0, maxContentLength) + `... [TRUNCATED - Content exceeded limit of ${maxContentLength} characters]`;
          }

          const result: any = {
            url,
            selector: selector || null,
            length: extractedText.length,
            content: extractedText,
            savedToMemory: false
          };

          if (saveToMemory && extractedText.trim().length > 0 && !extractedText.startsWith('[Warning]')) {
            const storageModulePath = '../../storageServer.js';
            const { StorageServer } = await import(/* @vite-ignore */ storageModulePath);
            const memoryData = {
              type: "system",
              speaker: "system",
              content: `[WEB_SNIPPER] Snipped data from ${url} (Selector: ${selector || 'Entire page'}):\n${extractedText}`,
              tags: ["web_snip", "scraped_content"],
              context,
              importance,
              meta: { url, selector, snippedAt: Date.now() }
            };

            const saved = await StorageServer.saveMemory(memoryData);
            result.savedToMemory = true;
            result.memoryId = saved.id;
            result.context = context;
          }

          return result;
        } else {
          // Client-side environment
          const baseUrl = window.location.origin;
          const res = await fetch(`${baseUrl}/api/tools/snipper`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, selector, saveToMemory, context, importance, defaultUserAgent, maxContentLength, engine, jinaApiKey })
          });
          if (!res.ok) throw new Error("WebSnipper service unreachable");
          return await res.json();
        }
      }
    );

    if (execution.feedback.status === 'success') {
      return execution.output;
    } else {
      throw new Error((execution.feedback as any).error || (execution.feedback as any).message || "WebSnipper execution failed.");
    }
  }
};

function parseHtmlFallback(html: string, selector?: string): string {
  let text = html;

  // Stripping unneeded structural blocks
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  text = text.replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, '');
  text = text.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  text = text.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '');
  text = text.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '');
  text = text.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '');
  text = text.replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '');
  text = text.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '');

  if (selector) {
    // Basic extraction for simple tags (e.g. h1, p, title)
    const tags = selector.split(',').map(s => s.trim().split(/[#.]/)[0]).filter(Boolean);
    if (tags.length > 0) {
      const matches: string[] = [];
      for (const tag of tags) {
        const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
        let match;
        while ((match = regex.exec(text)) !== null) {
          const cleanContent = match[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          if (cleanContent) {
            matches.push(cleanContent);
          }
        }
      }
      if (matches.length > 0) {
        return matches.join('\n\n');
      }
      return `[Warning] CSS selector "${selector}" did not match any elements via fallback regex parser.`;
    }
  }

  // Strip all remaining HTML tags
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

