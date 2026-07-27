import { ToolModule, ModuleType } from '@shared/include/types';

export const SendStatusUpdateTool: ToolModule = {
  metadata: {
    id: 'status_update',
    name: 'status_update',
    description: 'Mengirimkan pesan suara/teks transisi singkat atau indikator visual agar pengguna tahu Yui sedang bekerja di sela-sela berpikir.',
    version: '1.0.0',
    type: ModuleType.TOOL,
    order: 201,
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Ucapan transisi manis yang diucapkan asisten (misal: 'Yui cari datanya dulu ya user!~')"
        },
        animation: {
          type: "string",
          description: "Nama animasi Live2D transisi (misal: 'THINKING', 'WAVE')"
        }
      },
      required: ["message"]
    }
  } as any,
  execute: async (args: any) => {
    try {
      const hostPort = process.env.PORT || "3000";
      const payload = {
        type: "state_update",
        data: {
          state: { status: "talking" },
          activeSubtitle: args.message,
          typedSubtitle: args.message,
          isSubtitleTyping: false,
          animations: args.animation ? [args.animation] : ["TALK"]
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
        console.warn("[LiveStatus] Gagal mengirim status update ke stream events (bypassed):", fetchErr.message);
      }

      return { status: "success", info: `Status update sent: ${args.message}` };
    } catch (err: any) {
      console.error("[LiveStatus] Gagal mengeksekusi status update:", err.message);
      return { status: "error", message: err.message };
    }
  }
};

export const SendFinalReplyTool: ToolModule = {
  metadata: {
    id: 'speak',
    name: 'speak',
    description: 'Speak aloud to the user mid-loop or as a final reply. Use this tool to deliver Yuihime\'s verbal response — either while other tools are running in parallel, or as the conclusive reply after tools complete.',

    version: '1.0.0',
    type: ModuleType.TOOL,
    order: 202,
    parameters: {
      type: "object",
      properties: {
        speech: {
          type: "string",
          description: "Jawaban murni, hangat, dan manis berkarakter yang ditujukan langsung ke the user (tidak boleh memuat XML, JSON, atau data log)."
        },
        animations: {
          type: "array",
          items: { type: "string" },
          description: "Daftar gerakan tubuh/wajah yang dilakukan Yuihime (contoh: ['HAPPY', 'SMILE'])"
        },
        mood_impact: {
          type: "object",
          description: "Perubahan status mood akumulatif batin."
        }
      },
      required: ["speech"]
    }
  } as any,
  execute: async (args: any) => {
    try {
      const hostPort = process.env.PORT || "3000";
      const payload = {
        type: "state_update",
        data: {
          state: { status: "talking" },
          activeSubtitle: args.speech,
          typedSubtitle: args.speech,
          isSubtitleTyping: false,
          animations: args.animations || ["TALK", "SMILE"]
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
        console.warn("[LiveStatus] Gagal mengirim final reply ke stream events (bypassed):", fetchErr.message);
      }

      return { 
        status: "success", 
        isFinalReply: true, 
        speech: args.speech, 
        animations: args.animations || ["TALK", "SMILE"], 
        mood_impact: args.mood_impact || {} 
      };
    } catch (err: any) {
      console.error("[LiveStatus] Gagal mengeksekusi final reply:", err.message);
      return { status: "error", message: err.message };
    }
  }
};
