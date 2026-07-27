import { ToolModule } from '@shared/include/types';
import manifest from './manifest.json';

export const GetCurrentTimeTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any) => {
    try {
      const tz = args && args.timezone ? String(args.timezone) : undefined;
      const now = new Date();
      let display: string;
      try {
        display = tz
          ? new Intl.DateTimeFormat('en-US', {
              timeZone: tz,
              dateStyle: 'full',
              timeStyle: 'long'
            }).format(now)
          : now.toString();
      } catch {
        display = now.toString();
      }
      return {
        success: true,
        iso: now.toISOString(),
        unix: Math.floor(now.getTime() / 1000),
        timezone: tz || Intl.DateTimeFormat().resolvedOptions().timeZone,
        display
      };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  }
};
