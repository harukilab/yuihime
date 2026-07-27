import { ToolModule } from '@shared/include/types';
import manifest from './manifest.json';

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
