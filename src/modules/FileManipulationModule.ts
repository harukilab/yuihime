import { CortexModule, ModuleType } from '../include/types';
import { SystemRegistry } from '../core/registry';

/**
 * FileManipulationModule (CORTEX)
 * Augments the agent's context with a live directory list of the sandbox when files are mentioned.
 * This makes Yuihime instantly aware of what documents, images, code, or archives are stored.
 */
export const FileManipulationModule: CortexModule = {
  metadata: {
    id: 'file-cognitive-booster',
    name: 'yui-cortex: File Systems Awareness',
    description: 'Injects live sandbox directory status and available file manipulations into Yuihime’s active context.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 6,
    phase: 'context-augmentation',
    configSchema: {
      fields: {
        autoInjectOnKeywords: {
          type: 'boolean',
          label: 'Auto-inject Directory List',
          description: 'Automatically inject the current directory list if user mentions file/archive/folder terms',
          default: true
        },
        cognitivePrompt: {
          type: 'textarea',
          label: 'File Cognition Context Injection',
          description: 'Special prompt prepended to the sandbox files list to guide Yuihime on her file capabilities.',
          default: '[SANDBOX PHYSICAL REALITY]: You have complete system authorization to perform automatic file executions and manipulations in the active sandbox workspace using the "file_manipulate" toolset. The files currently residing in the workspace directory are:'
        }
      }
    }
  },
  run: async (input, state, context) => {
    try {
      const config = await SystemRegistry.getConfig('file-cognitive-booster');
      const autoEnable = config.autoInjectOnKeywords !== false;
      const injectionPrefix = config.cognitivePrompt || '[SANDBOX PHYSICAL REALITY]:';

      // Check if user is referencing directories or file manipulation terms
      const fileKeywords = ['file', 'berkas', 'dokumen', 'gambar', 'zip', 'folder', 'csv', 'ringkas', 'konversi', 'sandbox', 'sort', 'archive', 'toml', 'baca file'];
      const textMatches = fileKeywords.some(keyword => input.toLowerCase().includes(keyword));

      if (autoEnable && textMatches) {
        console.log("[FILE_CORTEX] File context match detected. Fetching live sandbox state...");
        
        // Fetch files from local sandbox API (full stack local fallback)
        const hostPort = process.env.PORT || "3000";
        const res = await fetch(`http://127.0.0.1:${hostPort}/api/sandbox/file`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'list', name: '.' })
        });

        if (res.ok) {
          const data = await res.json();
          const fileList = data.files || [];
          
          if (fileList.length > 0) {
            const formattedFiles = fileList.map((f: any) => 
              `- ${f.name} (${f.isDir ? 'Directory' : (f.size / 1024).toFixed(1) + ' KB'})`
            ).join('\n');

            const contextPayload = `${injectionPrefix}\n${formattedFiles}\n\nUse the "file_manipulate" tool directly if the user commands file sorting, compilation, compression (zipping), parsing, indexing, summaries, or type conversions.`;
            
            console.log("[FILE_CORTEX] Successfully injected sandbox directory state into neural context.");
            return {
              sandboxContext: contextPayload,
              filesRetrieved: fileList.length
            };
          } else {
            return {
              sandboxContext: "[SANDBOX PHYSICAL REALITY]: The sandboxed project workspace directory is currently empty. You are fully empowered to write new files, drop figures, or pleasantly ask the user to upload source files for compilation.",
              filesRetrieved: 0
            };
          }
        }
      }
    } catch (e: any) {
      console.warn("[FILE_CORTEX] Error augmenting neural context with sandbox state:", e.message);
    }

    return {};
  }
};
