import { ToolModule, ModuleType } from '@shared/include/types';

const DEDUP_WINDOW_MS = 300_000;
const dedupRegistry = new Map<string, number>();

function getDedupKey(contextId: string, text: string): string {
  const normalized = (text || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `${contextId || 'unknown'}::${normalized}`;
}

function isDuplicateSend(key: string): boolean {
  const now = Date.now();
  const last = dedupRegistry.get(key);
  return !!(last && now - last < DEDUP_WINDOW_MS);
}

function markDeduplicated(key: string): void {
  dedupRegistry.set(key, Date.now());
}

async function sendTelegramMessage(bot: any, chatId: string, text: string): Promise<boolean> {
  const MAX_CHUNK = 4000;
  if ((text || '').length <= MAX_CHUNK) {
    await bot.telegram.sendMessage(chatId, text);
    return true;
  }
  const chunks = (text || '').match(new RegExp(`[\\s\\S]{1,${MAX_CHUNK}}`, 'g')) || [text];
  for (const chunk of chunks) {
    await bot.telegram.sendMessage(chatId, chunk);
  }
  return true;
}

export const SendStatusUpdateTool: ToolModule = {
  metadata: {
    id: 'status_update',
    name: 'status_update',
    description: 'Sends a short voice/text transition message or visual indicator so the user knows ${characterName} is working in the middle of thinking.',
    version: '1.0.0',
    type: ModuleType.TOOL,
    order: 201,
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Sweet transition phrase spoken by the assistant (e.g. 'Let me look that up for you, user!~')"
        },
        animation: {
          type: "string",
          description: "Nama animasi Live2D transisi (misal: 'THINKING', 'WAVE')"
        }
      },
      required: ["message"]
    }
  } as any,
  execute: async (args: any, context?: any) => {
    try {
      const hostPort = process.env.PORT || "3000";
      const senderName = context?.userName || context?.state?.relation?.uid || "Unknown";
      const contextId = context?.contextId || "";
      const dedupKey = getDedupKey(contextId, args.message);

      if (isDuplicateSend(dedupKey)) {
        return { status: "skipped", info: `Duplicate status_update suppressed for: ${args.message}`, senderName };
      }

      const payload = {
        type: "state_update",
        data: {
          state: { status: "talking" },
          activeSubtitle: args.message,
          typedSubtitle: args.message,
          isSubtitleTyping: false,
          animations: args.animation ? [args.animation] : ["TALK"],
          senderName
        }
      };

      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutId = controller ? setTimeout(() => controller.abort(), 2000) : null;

        await fetch(`http://127.0.0.1:${hostPort}/api/stream/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller ? controller.signal : undefined
        });

        if (timeoutId) clearTimeout(timeoutId);
      } catch (fetchErr: any) {
        console.warn("[LiveStatus] Failed to send status update to stream events (bypassed):", fetchErr.message);
      }

      markDeduplicated(dedupKey);

      return { status: "success", info: `Status update sent: ${args.message}`, senderName };
    } catch (err: any) {
      console.error("[LiveStatus] Failed to execute status update:", err.message);
      return { status: "error", message: err.message };
    }
  }
};

export const SendFinalReplyTool: ToolModule = {
  metadata: {
    id: 'speak',
    name: 'speak',
    description: 'Speak aloud to the user mid-loop or as a final reply. Use this tool to deliver ${characterName}\'s verbal response — either while other tools are running in parallel, or as the conclusive reply after tools complete.',

    version: '1.0.0',
    type: ModuleType.TOOL,
    order: 202,
    parameters: {
      type: "object",
      properties: {
        speech: {
          type: "string",
          description: "A pure, warm, sweetly in-character reply addressed directly to the user (must NOT contain XML, JSON, or log data)."
        },
        animations: {
          type: "array",
          items: { type: "string" },
          description: "List of body/face gestures performed by ${characterName} (e.g. ['HAPPY', 'SMILE'])"
        },
        mood_impact: {
          type: "object",
          description: "Accumulative inner mood status changes."
        }
      },
      required: ["speech"]
    }
  } as any,
  execute: async (args: any, context?: any) => {
    try {
      const hostPort = process.env.PORT || "3000";
      const senderName = context?.userName || context?.state?.relation?.uid || "Unknown";
      const contextId = context?.contextId || "";
      const dedupKey = getDedupKey(contextId, args.speech);

      if (isDuplicateSend(dedupKey)) {
        return {
          status: "skipped",
          info: `Duplicate speak suppressed for: ${args.speech}`,
          senderName
        };
      }

      const payload = {
        type: "state_update",
        data: {
          state: { status: "talking" },
          activeSubtitle: args.speech,
          typedSubtitle: args.speech,
          isSubtitleTyping: false,
          animations: args.animations || ["TALK", "SMILE"],
          senderName
        }
      };

      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutId = controller ? setTimeout(() => controller.abort(), 2000) : null;

        await fetch(`http://127.0.0.1:${hostPort}/api/stream/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller ? controller.signal : undefined
        });

        if (timeoutId) clearTimeout(timeoutId);
      } catch (fetchErr: any) {
        console.warn("[LiveStatus] Failed to send final reply to stream events (bypassed):", fetchErr.message);
      }

      let sentDirectly = false;
      if (contextId.startsWith("tg_")) {
        try {
          const bot = (globalThis as any).activeTelegramBot;
          if (bot && bot.telegram) {
            const chatId = contextId.split("|")[0].replace("tg_", "");
            await sendTelegramMessage(bot, chatId, args.speech);
            sentDirectly = true;
          }
        } catch (tgErr: any) {
          console.warn("[LiveStatus] Failed to send speak to Telegram:", tgErr.message);
        }
      } else if (contextId.startsWith("dc_")) {
        try {
          const client = (globalThis as any).activeDiscordClient;
          if (client && client.channels) {
            const channelId = contextId.split("|")[0].replace("dc_", "");
            const channel = await client.channels.fetch(channelId);
            if (channel && channel.isTextBased()) {
              await channel.send(args.speech);
              sentDirectly = true;
            }
          }
        } catch (dcErr: any) {
          console.warn("[LiveStatus] Failed to send speak to Discord:", dcErr.message);
        }
      }

      if (sentDirectly) {
        markDeduplicated(dedupKey);
      }

      return { 
        status: "success", 
        isFinalReply: true, 
        speech: args.speech, 
        animations: args.animations || ["TALK", "SMILE"], 
        mood_impact: args.mood_impact || {},
        senderName,
        sentDirectly
      };
    } catch (err: any) {
      console.error("[LiveStatus] Failed to execute final reply:", err.message);
      return { status: "error", message: err.message };
    }
  }
};
