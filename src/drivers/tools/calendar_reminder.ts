import { ToolModule } from '@shared/include/types';
import { getDb } from '@/core/database.js';
import { genId } from '@shared/core/idGen';

const manifest = {
  "id": "calendar_reminder",
  "name": "Calendar & Reminder Tool",
  "description": "Manage scheduled events, tasks, and calendar reminders. Use this to schedule new reminders, list upcoming tasks, or cancel events requested by the user.",
  "version": "1.0.0",
  "type": "TOOL",
  "order": 96,
  "parameters": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": ["create", "list", "delete"],
        "description": "The calendar action to execute."
      },
      "title": {
        "type": "string",
        "description": "The title or description of the reminder/event. Required for 'create'."
      },
      "scheduledTime": {
        "type": "string",
        "description": "The target time in ISO format or relative terms (e.g. '2026-07-25T15:00:00+07:00' or 'in 15 minutes'). Required for 'create'."
      },
      "reminderId": {
        "type": "string",
        "description": "The unique ID of the reminder to delete. Required for 'delete'."
      }
    },
    "required": ["action"]
  }
} as const;

export const CalendarReminderTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any, context?: any) => {
    const db = getDb();
    const action = args.action;

    try {
      if (action === 'create') {
        const title = args.title;
        const timeInput = args.scheduledTime;

        if (!title || !timeInput) {
          return { success: false, error: "Missing required parameters 'title' or 'scheduledTime' for action 'create'." };
        }

        let nextRunTime = Date.now();
        // Parse ISO time or relative time (e.g., 'in 15 minutes', 'in 2 hours')
        if (timeInput.startsWith('in ') || timeInput.includes('minute') || timeInput.includes('hour')) {
          const match = timeInput.match(/\d+/);
          const amount = match ? parseInt(match[0], 10) : 0;
          let multiplier = 60 * 1000; // minutes default
          if (timeInput.includes('hour')) {
            multiplier = 60 * 60 * 1000;
          } else if (timeInput.includes('second')) {
            multiplier = 1000;
          }
          nextRunTime += amount * multiplier;
        } else {
          const parsed = Date.parse(timeInput);
          if (isNaN(parsed)) {
            return { success: false, error: `Invalid date format: '${timeInput}'. Use ISO-8601 or relative formats like 'in X minutes'.` };
          }
          nextRunTime = parsed;
        }

        const id = 'rem_' + genId(9);
        const contextId = context?.contextId || 'web_default';
        const chatType = context?.chatType || 'web';
        const senderName = context?.perceivedName || 'user';

        db.prepare(`
          INSERT INTO cron_tasks (id, name, schedule, action, prompt, enabled, repeating, lastRun, nextRun, context_id, chat_type, sender_name)
          VALUES (?, ?, NULL, 'speak', ?, 1, 0, 0, ?, ?, ?, ?)
        `).run(
          id,
          `Reminder: ${title}`,
          `Hei! Yui ingin mengingatkan Kakak tentang: "${title}"`,
          nextRunTime,
          contextId,
          chatType,
          senderName
        );

        return {
          success: true,
          message: `Pengingat berhasil dibuat dengan ID: ${id}`,
          reminder: {
            id,
            title,
            nextRun: new Date(nextRunTime).toISOString()
          }
        };
      }

      if (action === 'list') {
        const rows = db.prepare(`
          SELECT id, name, nextRun, context_id, sender_name 
          FROM cron_tasks 
          WHERE id LIKE 'rem_%' AND enabled = 1
        `).all() as any[];

        return {
          success: true,
          reminders: rows.map(r => ({
            id: r.id,
            title: r.name.replace('Reminder: ', ''),
            nextRun: r.nextRun ? new Date(r.nextRun).toISOString() : null,
            contextId: r.context_id,
            sender: r.sender_name
          }))
        };
      }

      if (action === 'delete') {
        const reminderId = args.reminderId;
        if (!reminderId) {
          return { success: false, error: "Missing required parameter 'reminderId' for action 'delete'." };
        }

        const info = db.prepare("DELETE FROM cron_tasks WHERE id = ?").run(reminderId);
        if (info.changes > 0) {
          return { success: true, message: `Reminder ${reminderId} berhasil dihapus.` };
        } else {
          return { success: false, error: `Reminder dengan ID '${reminderId}' tidak ditemukan.` };
        }
      }

      return { success: false, error: `Unknown action: ${action}` };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  }
};
