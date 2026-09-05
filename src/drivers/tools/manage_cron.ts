import { ToolModule } from '@shared/include/types';
import { extractCronPromptFromArgs, normalizeCronPromptForSave, isSystemCronTask, getOneShotFireAtMs } from '../../core/kernel/cron';

const manifest = {
  "id": "scheduler",
  "name": "Scheduler",
  "description": "Classic cron-style scheduler: schedule + command (prompt). Create/list/edit/toggle/delete recurring jobs. ALWAYS set prompt to the full instruction Yui must execute when the job fires (the command body). taskName is only a short label.",
  "version": "1.1.0",
  "type": "TOOL",
  "order": 105,
  "parameters": {
    "type": "object",
    "properties": {
      "action": { 
        "type": "string", 
        "enum": ["list", "add", "edit", "toggle", "delete"],
        "description": "Action to perform on the cron system"
      },
      "taskName": { 
        "type": "string", 
        "description": "Short human label for the job (like a crontab comment). Not a substitute for prompt." 
      },
      "schedule": { 
        "type": "string", 
        "description": "When to run. Supported formats: interval (5m, 30s, 2h, 1d); absolute one-shot ('2026-08-07T09:00:00' or '@at 2026-08-07 09:00', naive times use the user's local timezone); a bare daily time ('19:00' = every day at 19:00); or standard cron with optional IANA timezone suffix (e.g. '0 7 * * *', '0 9 * * 1-5 (Asia/Jakarta)', 'TZ=America/New_York 0 8 * * *'). One-shot/at tasks delete themselves after firing." 
      },
      "taskId": {
        "type": "string",
        "description": "ID of the task to modify or delete"
      },
      "repeating": {
        "type": "boolean",
        "description": "Whether the task should repeat or be deleted after one-time execution"
      },
      "prompt": {
        "type": "string",
        "description": "REQUIRED for add when possible. Full command/instruction executed when the job fires (like a crontab command). Include deliverable, style, and target user. Example: 'Generate a fresh AI image prompt and short caption for Al, then send it in this chat.'"
      },
      "command": {
        "type": "string",
        "description": "Alias of prompt — the job command body (crontab-style)."
      },
      "instruction": {
        "type": "string",
        "description": "Alias of prompt — the full scheduled instruction."
      },
      "targetChannel": {
        "type": "string",
        "description": "Optional fallback chat channel. Use 'Telegram (Private)' if the user requested the output destination to be Telegram."
      }
    },
    "required": ["action"]
  }
} as const;

export const CronTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any, context?: any) => {
    // 1. TRY ZERO-IMPORT DIRECT GLOBAL EXECUTION (Server-side, highly robust, immune to loopback deadlocks and port binding bugs)
    const g = globalThis as any;
    if (g.yuihime_db && g.yuihime_CronModule) {
      try {
        const db = g.yuihime_db;
        const CronModule = g.yuihime_CronModule;
        const getCronAction = g.yuihime_getCronAction;
        const cron = CronModule.getInstance();

        // Helper to resolve taskId by ID or Name directly from database
        const resolveTaskIdDirect = (inputQuery: string): string | null => {
          if (!inputQuery) return null;
          try {
            const tasks = db.prepare("SELECT * FROM cron_tasks").all();
            
            // 1. Direct exact ID match
            const exactId = tasks.find((t: any) => t.id === inputQuery);
            if (exactId) return exactId.id;
            
            // 2. Exact name match (case insensitive)
            const exactName = tasks.find((t: any) => t.name?.toLowerCase() === inputQuery.toLowerCase());
            if (exactName) return exactName.id;
            
            // 3. Fuzzy name match (includes query, case insensitive)
            const fuzzyName = tasks.find((t: any) => t.name?.toLowerCase().includes(inputQuery.toLowerCase()));
            if (fuzzyName) return fuzzyName.id;
            
            return inputQuery;
          } catch (e) {
            return inputQuery;
          }
        };

        if (args.action === 'list') {
          const tasks = db.prepare("SELECT * FROM cron_tasks").all();
          const runs = db.prepare("SELECT * FROM cron_run_history ORDER BY run_at DESC LIMIT 200").all() as any[];
          const runsByTask: Record<string, any[]> = {};
          for (const r of runs) {
            if (!runsByTask[r.task_id]) runsByTask[r.task_id] = [];
            if (runsByTask[r.task_id].length < 20) runsByTask[r.task_id].push(r);
          }
          return tasks.map((t: any) => ({
            ...t,
            enabled: t.enabled === 1,
            repeating: t.repeating === 1,
            runHistory: runsByTask[t.id] || []
          }));
        }

        if (args.action === 'add' || args.action === 'edit') {
          let id = args.taskId;
          
          if (args.action === 'edit') {
            const resolved = resolveTaskIdDirect(args.taskId);
            if (!resolved) return { error: "taskId (or task name) is required for 'edit'" };
            id = resolved;
          } else {
            // action === 'add'
            if (!id) {
              if (args.taskName) {
                const slug = args.taskName.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
                id = slug ? `task_${slug}_${Date.now().toString().slice(-4)}` : `task_${Date.now()}`;
              } else {
                id = `task_${Date.now()}`;
              }
            }
          }

          const taskName = args.taskName || id;
          const schedule = args.schedule || '5m';
          const enabled = true;
          const repeating = args.repeating ?? false;

          // De-duplicate pending tasks: skip creating another enabled task with the
          // same name + schedule + repeating flag. Prevents duplicate deliveries.
          if (args.action === 'add' && args.taskName) {
            const dup = db.prepare(
              "SELECT * FROM cron_tasks WHERE name = ? AND schedule = ? AND repeating = ? AND enabled = 1"
            ).get(taskName, schedule, repeating ? 1 : 0) as any;
            if (dup) {
              console.log(`[CRON_DE_DUP] Skipped duplicate '${taskName}' (${schedule}): reusing ${dup.id}`);
              return {
                success: true,
                skippedDuplicate: true,
                existingId: dup.id,
                message: `Duplicate pending task skipped — a task named '${dup.name}' with the same schedule (${dup.schedule}) already exists (${dup.id}). Reusing it instead of creating another.`
              };
            }
          }

          // Crontab model: schedule + command(prompt). Accept prompt/command/instruction aliases.
          const rawFromArgs = extractCronPromptFromArgs(args);
          const promptProvided = typeof rawFromArgs === 'string';
          let final_prompt = '';
          if (args.action === 'edit' && !promptProvided) {
            // Preserve existing command body when edit omits prompt
            try {
              const existing = db.prepare("SELECT prompt, action FROM cron_tasks WHERE id = ?").get(id) as any;
              final_prompt = normalizeCronPromptForSave({
                id,
                name: args.taskName || existing?.name || taskName,
                prompt: existing?.prompt,
                action: existing?.action,
              });
            } catch {
              final_prompt = normalizeCronPromptForSave({ id, name: taskName, prompt: '' });
            }
          } else {
            final_prompt = normalizeCronPromptForSave({
              id,
              name: taskName,
              prompt: rawFromArgs ?? '',
            });
          }

          let final_context_id = context?.contextId || 'live_stream';
          let final_chat_type = args.targetChannel || context?.chatType || 'Live Chat';
          const final_sender_name = context?.userName || 'user';

          // Auto-resolve Telegram context if target chat type is Telegram but context is live_stream or generic
          if (final_chat_type.toLowerCase().includes('telegram') && (final_context_id === 'live_stream' || !final_context_id.startsWith('tg_'))) {
            try {
              const callerName = final_sender_name;
              let foundTgId = '';

              // Search for identity matching caller's name
              const identity = db.prepare("SELECT * FROM identities WHERE perceivedName = ?").get(callerName);
              if (identity) {
                const accounts = identity.linkedAccounts ? JSON.parse(identity.linkedAccounts) : [];
                
                // 1. Check for stored telegram identifier in linkedAccounts format (e.g. telegram:id:12345)
                for (const acc of accounts) {
                  const cleanAcc = acc.toLowerCase();
                  if (cleanAcc.startsWith('telegram:id:')) {
                    foundTgId = acc.split(':')[2];
                    break;
                  }
                }
                
                if (!foundTgId) {
                  // 2. Fallback to matching username from telegram_users
                  for (const acc of accounts) {
                    const cleanAcc = acc.toLowerCase();
                    if (cleanAcc.startsWith('telegram (private):')) {
                      const tgName = acc.split(':')[1];
                      const tgUser = db.prepare("SELECT tg_id FROM telegram_users WHERE username = ?").get(tgName);
                      if (tgUser) {
                        foundTgId = tgUser.tg_id?.toString();
                        break;
                      }
                    }
                  }
                }
              }

              // Ultimate Fallback A: Any identity with a linked Telegram ID
              if (!foundTgId) {
                const anyPaired = db.prepare("SELECT linkedAccounts FROM identities WHERE linkedAccounts LIKE '%telegram:id:%' LIMIT 1").get();
                if (anyPaired) {
                  const pairedAccs = JSON.parse(anyPaired.linkedAccounts);
                  for (const acc of pairedAccs) {
                    if (acc.toLowerCase().startsWith('telegram:id:')) {
                      foundTgId = acc.split(':')[2];
                      break;
                    }
                  }
                }
              }

              // Ultimate Fallback B: Most recently active Telegram user from logs
              if (!foundTgId) {
                const lastTgUser = db.prepare("SELECT tg_id FROM telegram_users ORDER BY last_seen DESC LIMIT 1").get();
                if (lastTgUser) {
                  foundTgId = lastTgUser.tg_id?.toString();
                }
              }
              
              if (foundTgId) {
                final_context_id = `tg_${foundTgId}`;
                final_chat_type = 'Telegram (Private)';
                console.log(`[CRON_AUTO_RESOLVE_TOOL] Redirected task target for user ${callerName} to ${final_context_id} on Telegram`);
              }
            } catch (err: any) {
              console.error("[CRON_AUTO_RESOLVE_TOOL] Failed to resolve target telegram user chat ID:", err.message);
            }
          }

          db.prepare(`
            INSERT INTO cron_tasks (id, name, schedule, enabled, repeating, context_id, chat_type, sender_name, prompt, fire_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              schedule = excluded.schedule,
              enabled = excluded.enabled,
              repeating = excluded.repeating,
              context_id = COALESCE(excluded.context_id, cron_tasks.context_id),
              chat_type = COALESCE(excluded.chat_type, cron_tasks.chat_type),
              sender_name = COALESCE(excluded.sender_name, cron_tasks.sender_name),
              prompt = excluded.prompt,
              fire_at = excluded.fire_at
          `).run(
            id, taskName, schedule, enabled ? 1 : 0, repeating ? 1 : 0,
            final_context_id,
            final_chat_type,
            final_sender_name,
            final_prompt,
            repeating ? null : getOneShotFireAtMs(schedule)
          );

          if (enabled) {
            if (!getCronAction) {
              throw new Error("Cron globals not initialized (yuihime_getCronAction missing) — falling back to HTTP loopback");
            }
            cron.registerTask({
              id,
              name: taskName,
              schedule,
              enabled: true,
              repeating,
              fire_at: repeating ? undefined : (getOneShotFireAtMs(schedule) ?? undefined),
              context_id: final_context_id,
              chat_type: final_chat_type,
              sender_name: final_sender_name,
              action: getCronAction(id, taskName, repeating, db)
            });
          } else {
            cron.stopTask(id);
          }

          return { success: true, message: `Task '${taskName}' (${id}) successfully processed.` };
        }

        if (args.action === 'toggle') {
          const resolvedId = resolveTaskIdDirect(args.taskId);
          if (!resolvedId) return { error: "taskId (or task name) is required for 'toggle'" };

          const task = db.prepare("SELECT * FROM cron_tasks WHERE id = ?").get(resolvedId);
          if (!task) return { error: `Task '${args.taskId}' not found` };
          
          const nextEnabled = task.enabled === 1 ? 0 : 1;
          db.prepare("UPDATE cron_tasks SET enabled = ? WHERE id = ?").run(nextEnabled, resolvedId);
          
          if (nextEnabled === 1) {
            if (!getCronAction) {
              throw new Error("Cron globals not initialized (yuihime_getCronAction missing) — falling back to HTTP loopback");
            }
            cron.registerTask({
              id: task.id,
              name: task.name,
              schedule: task.schedule,
              enabled: true,
              repeating: task.repeating === 1,
              fire_at: task.fire_at ?? undefined,
              context_id: task.context_id,
              chat_type: task.chat_type,
              sender_name: task.sender_name,
              action: getCronAction(task.id, task.name, task.repeating === 1, db)
            });
          } else {
            cron.stopTask(resolvedId);
          }
          return { success: true, message: `Task '${task.name}' status toggled to ${nextEnabled === 1 ? 'enabled' : 'disabled'}.` };
        }

        if (args.action === 'delete') {
          const resolvedId = resolveTaskIdDirect(args.taskId);
          if (!resolvedId) return { error: "taskId (or task name) is required for 'delete'" };
          if (isSystemCronTask(resolvedId)) {
            return { error: `Task '${resolvedId}' is a protected system task and cannot be deleted.` };
          }
          db.prepare("DELETE FROM cron_tasks WHERE id = ?").run(resolvedId);
          db.prepare("DELETE FROM cron_run_history WHERE task_id = ?").run(resolvedId);
          cron.removeTask(resolvedId);
          return { success: true, message: `Task with ID/Name '${args.taskId}' has been deleted.` };
        }

        return { error: "Invalid action" };
      } catch (directErr: any) {
        console.warn("[CRON_TOOL_GLOBAL_DIRECT] Global direct execution failed. Falling back to HTTP loopback:", directErr.message || directErr);
      }
    }

    // 2. FALLBACK TO HTTP LOOPBACK IN CASE OF BROWSER ENVIRONMENT OR EMPTY GLOBALS
    const localFetch = async (path: string, options?: RequestInit) => {
      const isServer = typeof window === 'undefined';
      const baseUrl = isServer 
        ? `http://127.0.0.1:${process.env.PORT || "3000"}`
        : `${window.location.origin}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 seconds timeout to protect from infinite hangs
      try {
        const response = await fetch(`${baseUrl}${path}`, {
          ...options,
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
      } catch (err: any) {
        clearTimeout(timeoutId);
        throw err;
      }
    };

    // Helper to resolve taskId by ID or Name
    const resolveTaskIdHttp = async (inputQuery: string): Promise<string | null> => {
      if (!inputQuery) return null;
      try {
        const tasksRes = await localFetch('/api/cron');
        const tasks = await tasksRes.json();
        
        const exactId = tasks.find((t: any) => t.id === inputQuery);
        if (exactId) return exactId.id;
        
        const exactName = tasks.find((t: any) => t.name?.toLowerCase() === inputQuery.toLowerCase());
        if (exactName) return exactName.id;
        
        const fuzzyName = tasks.find((t: any) => t.name?.toLowerCase().includes(inputQuery.toLowerCase()));
        if (fuzzyName) return fuzzyName.id;
        
        return inputQuery;
      } catch (e) {
        return inputQuery;
      }
    };

    try {
      if (args.action === 'list') {
        const res = await localFetch('/api/cron');
        return res.json();
      }
      
      if (args.action === 'add' || args.action === 'edit') {
        let id = args.taskId;
        
        if (args.action === 'edit') {
          const resolved = await resolveTaskIdHttp(args.taskId);
          if (!resolved) return { error: "taskId (or task name) is required for 'edit'" };
          id = resolved;
        } else {
          if (!id) {
            if (args.taskName) {
              const slug = args.taskName.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
              id = slug ? `task_${slug}_${Date.now().toString().slice(-4)}` : `task_${Date.now()}`;
            } else {
              id = `task_${Date.now()}`;
            }
          }
        }
        
        const rawPrompt = extractCronPromptFromArgs(args);
        const res = await localFetch('/api/cron', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id,
            name: args.taskName,
            schedule: args.schedule || '5m',
            enabled: true,
            repeating: args.repeating ?? false,
            // Always send command body; API normalizes empty → name-based prompt
            prompt: typeof rawPrompt === 'string' ? rawPrompt : '',
            command: typeof args.command === 'string' ? args.command : undefined,
            instruction: typeof args.instruction === 'string' ? args.instruction : undefined,
            context_id: context?.contextId || 'live_stream',
            chat_type: args.targetChannel || context?.chatType || 'Live Chat',
            sender_name: context?.userName || 'user'
          })
        });
        return res.json();
      }
      
      if (args.action === 'toggle') {
        const resolvedId = await resolveTaskIdHttp(args.taskId);
        if (!resolvedId) return { error: "taskId (or task name) is required for 'toggle'" };

        const tasksRes = await localFetch('/api/cron');
        const tasks = await tasksRes.json();
        const task = tasks.find((t: any) => t.id === resolvedId);
        if (!task) return { error: `Task '${args.taskId}' not found` };
        
        const res = await localFetch('/api/cron', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...task, enabled: !task.enabled })
        });
        return res.json();
      }

      if (args.action === 'delete') {
        const resolvedId = await resolveTaskIdHttp(args.taskId);
        if (!resolvedId) return { error: "taskId (or task name) is required for 'delete'" };
        
        const res = await localFetch(`/api/cron/${resolvedId}`, {
          method: 'DELETE'
        });
        return res.json();
      }
      
      return { error: "Invalid action" };
    } catch (httpErr: any) {
      console.error("[CRON_TOOL_HTTP] HTTP loopback fallback failed:", httpErr.message || httpErr);
      return { error: `Failed to execute cron operation: ${httpErr.message || httpErr}` };
    }
  }
};
