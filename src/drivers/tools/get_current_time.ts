import { ToolModule } from '@shared/include/types';
import { getTzOffsetHours, formatLocalFull, tzLabel } from '../../core/utils/dualClock.js';

const manifest = {
  "id": "get_current_time",
  "name": "Current Time",
  "description": "Get the current date and time, with optional IANA timezone support. Use this when the user asks about the current time, today's date, the day of the week, or needs time context for scheduling.",
  "version": "1.0.0",
  "type": "TOOL",
  "order": 95,
  "parameters": {
    "type": "object",
    "properties": {
      "timezone": {
        "type": "string",
        "description": "Optional IANA timezone (e.g., 'Asia/Jakarta', 'UTC', 'America/New_York'). Defaults to the server's local timezone when omitted."
      }
    },
    "required": []
  }
} as const;

export const GetCurrentTimeTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any) => {
    try {
      const tz = args && args.timezone ? String(args.timezone) : undefined;
      const now = new Date();
      let display: string;
      let timezoneLabel: string;
      if (tz) {
        try {
          display = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            dateStyle: 'full',
            timeStyle: 'long'
          }).format(now);
          timezoneLabel = tz;
        } catch {
          display = now.toString();
          timezoneLabel = 'server';
        }
      } else {
        // Default: waktu lokal user yang dikonfigurasi (circadian-rhythm.timezoneOffsetHours)
        const offset = getTzOffsetHours();
        display = formatLocalFull(offset);
        timezoneLabel = tzLabel(offset);
      }
      return {
        success: true,
        iso: now.toISOString(),
        utc: now.toISOString(),
        local: display,
        unix: Math.floor(now.getTime() / 1000),
        timezone: timezoneLabel,
        display
      };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  }
};
