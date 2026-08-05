import { ToolModule } from '@shared/include/types';
import { SystemRegistry } from '@shared/core/registry';
import { AIService } from '../../core/kernel/ai.js';
import { StandardizedProcessor } from '../../core/kernel/processor';
import { injectCharacterName } from '../../core/kernel/characterName';

const manifest = {
  "id": "websearch",
  "name": "Web Search",
  "description": "Search the internet for real-time information via Gemini Grounding. Returns concise, factual results relevant to the query.",
  "version": "1.0.0",
  "type": "TOOL",
  "order": 10,
  "strict": true,
  "configSchema": {
    "fields": {
      "maxResults": {
        "type": "number",
        "label": "Max Results",
        "default": 5,
        "min": 1,
        "max": 20
      },
      "usageGuidelines": {
        "type": "textarea",
        "label": "Search Context Prompt",
        "description": "Special instructions for the search engine",
        "default": "Extract concise, factual information relevant to the user query."
      }
    }
  },
  "parameters": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Websearch query.",
        "minLength": 1,
        "maxLength": 500
      },
      "numResults": {
        "type": "integer",
        "description": "Number of search results to return (default: 8, maximum: 20).",
        "default": 8,
        "minimum": 1,
        "maximum": 20
      },
      "type": {
        "type": "string",
        "enum": ["auto", "fast", "deep"],
        "description": "Search type - 'auto': balanced search (default), 'fast': quick results, 'deep': comprehensive search"
      },
      "contextMaxCharacters": {
        "type": "integer",
        "description": "Maximum characters for context string optimized for models (default: 10000, maximum: 50000)",
        "default": 10000,
        "maximum": 50000
      }
    },
    "required": ["query"],
    "additionalProperties": false
  }
} as const;

function normalizeSearchResult(r: any): any {
  const title = typeof r.title === 'string' ? r.title : String(r.title || '');
  const url = typeof r.url === 'string' ? r.url : String(r.url || '');
  const snippet = typeof r.snippet === 'string' ? r.snippet : String(r.snippet || '');
  const score = typeof r.score === 'number' ? r.score : undefined;
  const published_date = typeof r.published_date === 'string' ? r.published_date : undefined;

  if (!title && !url && !snippet) {
    return null;
  }

  return {
    title,
    url,
    snippet,
    ...(score !== undefined ? { score } : {}),
    ...(published_date !== undefined ? { published_date } : {})
  };
}

export const WebSearchTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args) => {
    const query = String(args.query || '').trim();
    if (!query) {
      return [];
    }

    const config = await SystemRegistry.getConfig('websearch');
    const numResults = Math.max(1, Math.min(20, Number(args.numResults || args.top_k || config.maxResults || 8)));
    const type = args.type || 'auto';

    const execution = await StandardizedProcessor.executeStandardized(
      'websearch',
      '1.0.0',
      { query, numResults, type },
      async () => {
        const isServer = typeof window === 'undefined';
        let rawResults: any[] = [];

        if (isServer) {
          try {
            const results = await AIService.getInstance().search(query);
            rawResults = Array.isArray(results) ? results : [];
          } catch (importErr: any) {
            console.warn("[SEARCH] Direct AIService search failed:", importErr.message);
            rawResults = [];
          }
        } else {
          try {
            const baseUrl = window.location.origin;
            const res = await fetch(`${baseUrl}/api/tools/search?query=${encodeURIComponent(query)}&top_k=${encodeURIComponent(String(numResults))}`);
            if (res.ok) {
              const data = await res.json();
              rawResults = Array.isArray(data) ? data : [];
            }
          } catch (fetchErr: any) {
            console.warn("[SEARCH] Client-side fetch to /api/tools/search failed:", fetchErr.message);
            rawResults = [];
          }
        }

        if (!Array.isArray(rawResults) || rawResults.length === 0) {
          return [];
        }

        const sliced = rawResults.slice(0, numResults);
        const normalized = sliced.map(normalizeSearchResult).filter((r: any) => r !== null);

        if (normalized.length === 0) {
          return [];
        }

        return normalized;
      }
    );

    if (execution.feedback.status === 'success' && Array.isArray(execution.output) && execution.output.length > 0) {
      return execution.output;
    }

    return [{
      title: 'Web Search Under Maintenance',
      snippet: injectCharacterName('Web search for ${characterName} is currently under maintenance and failed to respond in time (technical/network issue). Let the user know that the web search feature is being fixed, then help them with your best answer without real-time web data.'),
      url: ''
    }];
  }
};
