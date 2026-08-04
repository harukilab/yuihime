import { ToolModule } from '@shared/include/types';

const manifest = {
  "id": "code_interpreter",
  "name": "Neural Code Execution",
  "description": "Executes JavaScript code snippets to solve problems.",
  "version": "1.0.0",
  "type": "TOOL",
  "order": 11,
  "configSchema": {
    "fields": {
      "timeoutMs": {
        "type": "number",
        "label": "Execution Timeout (ms)",
        "default": 5000
      }
    }
  },
  "parameters": {
    "type": "object",
    "properties": {
      "language": { "type": "string", "description": "Programming language (javascript)" },
      "code": { "type": "string", "description": "The code to execute" }
    },
    "required": ["language", "code"]
  }
} as const;

export const CodeInterpreter: ToolModule = {
  metadata: manifest as any,
  execute: async (args) => {
    if (args.language === 'javascript' || args.language === 'js') {
      try {
        const isServer = typeof window === 'undefined';
        const baseUrl = isServer 
          ? `http://127.0.0.1:${process.env.PORT || "3000"}`
          : `${window.location.origin}`;
        const res = await fetch(`${baseUrl}/api/tools/execute_js`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: args.code })
        });
        if (!res.ok) throw new Error("Execution failed");
        const data = await res.json();
        return { success: true, output: data.result };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }
    
    return { success: false, error: "Only JavaScript is supported in this sandbox currently." };
  }
};
