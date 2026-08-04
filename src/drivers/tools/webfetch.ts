import { ToolModule } from '@shared/include/types';
import { SystemRegistry } from '@shared/core/registry';
import { StandardizedProcessor } from '../../core/kernel/processor';
import { StorageServer } from '@shared/drivers/storageServer';
import { load } from 'cheerio';

const manifest = {
  "id": "webfetch",
  "name": "WebFetch",
  "description": "Fetch content from an HTTP or HTTPS URL and return it as text, markdown, or HTML. Markdown is the default. Uses the Jina Reader engine with local parsing as fallback.",
  "version": "1.0.0",
  "type": "TOOL",
  "order": 11,
  "configSchema": {
    "fields": {
      "engine": {
        "type": "select",
        "label": "Scraping Engine",
        "description": "Select preferred scraping engine: Jina Reader API (high-fidelity clean Markdown) or Local Scraper (Cheerio fallback)",
        "options": [
          {"label": "Jina Reader API (r.jina.ai)", "value": "jina"},
          {"label": "Local Cheerio/Regex Parser", "value": "local"}
        ],
        "default": "jina"
      },
      "jinaApiKey": {
        "type": "password",
        "label": "Jina Reader API Key",
        "description": "Optional Jina API Key (r.jina.ai) to boost rate limits for high-volume scanning",
        "default": ""
      },
      "defaultUserAgent": {
        "type": "input",
        "label": "Default User-Agent",
        "description": "The browser User-Agent header used for web requests",
        "default": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      "maxContentLength": {
        "type": "number",
        "label": "Max Content Length",
        "description": "Maximum characters to extract and return in a single fetch session",
        "default": 12000
      }
    }
  },
  "parameters": {
    "type": "object",
    "properties": {
      "url": {
        "type": "string",
        "description": "The HTTP or HTTPS URL to fetch content from.",
        "format": "uri",
        "minLength": 1
      },
      "format": {
        "type": "string",
        "enum": ["text", "markdown", "html"],
        "description": "The format to return the content in. Defaults to markdown."
      },
      "timeout": {
        "type": "number",
        "description": "Optional timeout in seconds (maximum: 120)."
      },
      "saveToMemory": {
        "type": "boolean",
        "description": "Whether to write the fetched result into the memory database. Defaults to false."
      }
    },
    "required": ["url"]
  }
} as const;

const MAX_TIMEOUT_SECONDS = 120;

function convertToFormat(raw: string, format: string, $: any): string {
  if (format === 'html') return raw;
  if (format === 'text') {
    if ($) {
      return $('body').text()
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .trim();
    }
    return raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  // markdown — Jina already returns clean markdown; local path gets a text approximation
  return raw;
}

export const WebSnipperTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any) => {
    const url = args.url;
    if (!url || typeof url !== 'string' || (!url.startsWith('https://') && !url.startsWith('http://'))) {
      throw new Error(`Invalid URL: "${url}". URL must be a valid http/https string.`);
    }
    const format = args.format || 'markdown';
    const timeout = Math.min(Number(args.timeout) || 30, MAX_TIMEOUT_SECONDS);

    const config = await SystemRegistry.getConfig('webfetch');
    console.log(`[WEBFETCH] Fetching URL: ${url} (format: ${format}, timeout: ${timeout}s)`);

    const execution = await StandardizedProcessor.executeStandardized(
      'webfetch',
      '1.0.0',
      { url, format, timeout },
      async () => {
        const isServer = typeof window === 'undefined';
        const saveToMemory = args.saveToMemory === true;
        const defaultUserAgent = config?.defaultUserAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        const maxContentLength = typeof config?.maxContentLength === 'number' ? config.maxContentLength : 12000;
        const engine = config?.engine || 'jina';
        const jinaApiKey = config?.jinaApiKey || process.env.JINA_API_KEY || '';

        if (isServer) {
          let extractedText = '';
          let contentType = 'text/markdown';
          let fetchSuccess = false;

          // 1. Primary Engine: Jina Reader API (returns clean markdown)
          if (engine === 'jina') {
            try {
              console.log(`[WEBFETCH] Scraping via Jina Reader API (r.jina.ai) for URL: ${url}`);
              const jinaHeaders: Record<string, string> = {
                'Accept': format === 'text' ? 'text/plain' : 'text/markdown, text/plain'
              };
              if (jinaApiKey) {
                jinaHeaders['Authorization'] = `Bearer ${jinaApiKey}`;
              }
              const jinaResponse = await fetch(`https://r.jina.ai/${url}`, {
                headers: jinaHeaders,
                signal: AbortSignal.timeout(timeout * 1000)
              });
              if (jinaResponse.ok) {
                extractedText = await jinaResponse.text();
                fetchSuccess = true;
                console.log(`[WEBFETCH] Successfully fetched ${extractedText.length} chars via Jina Reader API.`);
              } else {
                console.warn(`[WEBFETCH] Jina Reader returned non-ok status: ${jinaResponse.status}. Falling back to local scraper...`);
              }
            } catch (jinaErr: any) {
              console.warn(`[WEBFETCH] Jina Reader execution failed (${jinaErr.message}). Falling back to local scraper...`);
            }
          }

          // 2. Secondary Engine/Fallback: Local scraping via Cheerio / Regex
          if (!fetchSuccess) {
            try {
              console.log(`[WEBFETCH] Scraping via Local Scraper for URL: ${url}`);
              const response = await fetch(url, {
                headers: { 'User-Agent': defaultUserAgent },
                signal: AbortSignal.timeout(timeout * 1000)
              });
              if (!response.ok) {
                throw new Error(`Failed to fetch URL ${url}: ${response.status} ${response.statusText}`);
              }
              contentType = response.headers.get('content-type') || 'text/html';
              const html = await response.text();
              let $;
              let cheerioFailed = false;
              try {
                $ = load(html);
              } catch (cheerioErr: any) {
                console.warn("[WEBFETCH] Direct Cheerio import or load failed. Using primitive fallback parser:", cheerioErr.message);
                cheerioFailed = true;
              }
              $('script, style, head, iframe, noscript, svg, footer, header, nav').remove();
              extractedText = convertToFormat(html, format, cheerioFailed ? null : $);
              if (format === 'markdown' && !cheerioFailed && $) {
                const body = $('body').text()
                  .replace(/\s+/g, ' ')
                  .replace(/\n\s*\n/g, '\n')
                  .trim();
                extractedText = body;
              }
            } catch (localErr: any) {
              console.error("[WEBFETCH] Local scraper execution failed:", localErr.message);
              throw localErr;
            }
          }

          if (extractedText.length > maxContentLength) {
            extractedText = extractedText.substring(0, maxContentLength) + `... [TRUNCATED - Content exceeded limit of ${maxContentLength} characters]`;
          }

          const result: any = {
            url,
            contentType,
            format,
            output: extractedText,
            savedToMemory: false
          };

          if (saveToMemory && extractedText.trim().length > 0) {
            const memoryData = {
              type: "system",
              speaker: "system",
              content: `[WEBFETCH] Fetched data from ${url} (format: ${format}):\n${extractedText}`,
              tags: ["web_fetch", "scraped_content"],
              context: 'web_default',
              importance: 0.7,
              meta: { url, format, fetchedAt: Date.now() }
            };
            const saved = await StorageServer.saveMemory(memoryData);
            result.savedToMemory = true;
            result.memoryId = saved.id;
          }

          return result;
        } else {
          // Client-side environment
          const baseUrl = window.location.origin;
          const res = await fetch(`${baseUrl}/api/tools/snipper`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, format, saveToMemory, defaultUserAgent, maxContentLength, engine, jinaApiKey })
          });
          if (!res.ok) throw new Error("WebFetch service unreachable");
          return await res.json();
        }
      }
    );

    if (execution.feedback.status === 'success') {
      return execution.output;
    } else {
      throw new Error((execution.feedback as any).error || (execution.feedback as any).message || "WebFetch execution failed.");
    }
  }
};
