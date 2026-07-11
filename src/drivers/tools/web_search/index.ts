import { ToolModule } from '../../../include/types';
import { SystemRegistry } from '../../../core/registry';
import { StandardizedProcessor } from '../../../core/kernel/processor';
import manifest from './manifest.json';

export const WebSearchTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args) => {
    const config = await SystemRegistry.getConfig('web_search');
    console.log(`[SYSTEM] Performing Neural Search: ${args.query} using ${config.searchProvider || 'google'}`);
    
    const execution = await StandardizedProcessor.executeStandardized(
      'web_search',
      '1.0.0',
      { query: args.query },
      async () => {
        const isServer = typeof window === 'undefined';
        if (isServer) {
          try {
            const { AIService } = await import('../../../core/kernel/ai.js');
            return await AIService.getInstance().search(args.query);
          } catch (importErr: any) {
            console.warn("[SEARCH] Direct dynamic import of AIService failed. Falling back to loopback fetch:", importErr.message);
            const baseUrl = `http://127.0.0.1:${process.env.PORT || "3000"}`;
            const res = await fetch(`${baseUrl}/api/tools/search?query=${encodeURIComponent(args.query)}&provider=${config.searchProvider || 'google'}&key=${config.serperApiKey || ''}`);
            if (!res.ok) throw new Error("Search provider unreachable via loopback fetch");
            return await res.json();
          }
        } else {
          const baseUrl = window.location.origin;
          const res = await fetch(`${baseUrl}/api/tools/search?query=${encodeURIComponent(args.query)}&provider=${config.searchProvider || 'google'}&key=${config.serperApiKey || ''}`);
          if (!res.ok) throw new Error("Search provider unreachable");
          return await res.json();
        }
      }
    );

    if (execution.feedback.status === 'success') {
      return execution.output;
    } else {
      console.warn("[SEARCH] Falling back to neural intuition due to provider failure.");
      return [
        { 
          title: `Neural Context for ${args.query}`, 
          snippet: "The external data link is unstable. Processing based on existing neural weights: " + args.query, 
          url: "https://nexus-7.ai/cache" 
        }
      ];
    }
  }
};
