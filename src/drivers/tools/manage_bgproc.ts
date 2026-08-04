import { ToolModule } from '@shared/include/types';

const manifest = {
  "id": "manage_bgproc",
  "name": "Background Process Manager",
  "description": "Spawn, monitor, stop, and remove long-running external processes (e.g. Python servers, Node scripts, shell daemons) as persistent background tasks. Use 'spawn' to start a detached process, 'list' to see all, 'logs' to tail output, 'stop' to terminate, and 'remove' to clean up.",
  "version": "1.0.0",
  "type": "TOOL",
  "order": 108,
  "parameters": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": ["spawn", "list", "stop", "remove", "logs"],
        "description": "Action to perform: spawn=start new process, list=show all processes, stop=send SIGTERM, remove=delete exited process from registry, logs=tail stdout/stderr"
      },
      "command": {
        "type": "string",
        "description": "Executable to run, e.g. 'python3', 'node', 'bash'. Required for 'spawn'."
      },
      "args": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Arguments to pass to the command, e.g. ['server.py', '--port', '9000']. Optional for 'spawn'."
      },
      "label": {
        "type": "string",
        "description": "Human-friendly name for the process (optional, defaults to command)."
      },
      "cwd": {
        "type": "string",
        "description": "Working directory for the spawned process. Optional, defaults to Yui's root."
      },
      "env": {
        "type": "object",
        "description": "Extra environment variables to set for the process. Optional.",
        "additionalProperties": { "type": "string" }
      },
      "id": {
        "type": "string",
        "description": "Process ID returned from 'spawn'. Required for 'stop', 'remove', and 'logs'."
      },
      "signal": {
        "type": "string",
        "description": "OS signal to send when stopping, e.g. 'SIGTERM' (default) or 'SIGKILL'."
      },
      "tail": {
        "type": "number",
        "description": "Number of log lines to return for 'logs' action. Default 100."
      }
    },
    "required": ["action"]
  }
} as const;

const getBaseUrl = () => {
  if (typeof window === 'undefined') {
    return `http://127.0.0.1:${process.env.PORT ?? '3000'}`;
  }
  return window.location.origin;
};

export const BgProcTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any) => {
    const base = getBaseUrl();
    const { action, command, args: cmdArgs, label, cwd, env, id, signal, tail } = args;

    switch (action) {
      case 'spawn': {
        if (!command) return { error: 'command is required for spawn.' };
        const res = await fetch(`${base}/api/tools/bgproc/spawn`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command, args: cmdArgs, label, cwd, env }),
        });
        return res.json();
      }

      case 'list': {
        const res = await fetch(`${base}/api/tools/bgproc/list`);
        return res.json();
      }

      case 'stop': {
        if (!id) return { error: 'id is required for stop.' };
        const res = await fetch(`${base}/api/tools/bgproc/stop`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, signal }),
        });
        return res.json();
      }

      case 'remove': {
        if (!id) return { error: 'id is required for remove.' };
        const res = await fetch(`${base}/api/tools/bgproc/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        return res.json();
      }

      case 'logs': {
        if (!id) return { error: 'id is required for logs.' };
        const tailParam = tail ? `?tail=${tail}` : '';
        const res = await fetch(`${base}/api/tools/bgproc/${encodeURIComponent(id)}/logs${tailParam}`);
        return res.json();
      }

      default:
        return { error: `Unknown action: ${action}` };
    }
  },
};
