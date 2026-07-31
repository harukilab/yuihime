import { ToolModule } from '@shared/include/types';
import manifest from './manifest.json';

function yesterdayKey(): string {
  const d = new Date(Date.now() - 86400000);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export const DailySummaryTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any) => {
    const action = args?.action === 'generate' ? 'generate' : 'read';
    const rawDate = args?.date ? String(args.date).trim() : '';
    const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : '';
    const targetDate = date || yesterdayKey();

    const isServer = typeof window === 'undefined';
    const baseUrl = isServer
      ? `http://127.0.0.1:${process.env.PORT || "3000"}`
      : `${window.location.origin}`;

    try {
      if (action === 'generate') {
        const res = await fetch(`${baseUrl}/api/cortex/chat-summary/daily`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: targetDate })
        });
        const data = await res.json();
        if (!data.success) {
          return { success: false, action, date: targetDate, error: data.reason === 'no_log' ? `Tidak ada log obrolan untuk tanggal ${targetDate}.` : data.error || data.reason || 'Gagal membuat ringkasan harian.' };
        }
        return { success: true, action, date: data.date, summary: data.summary };
      }

      // read
      const res = await fetch(`${baseUrl}/api/cortex/chat-summary/daily?date=${encodeURIComponent(targetDate)}`);
      if (res.status === 404) {
        return { success: false, action, date: targetDate, error: `Belum ada ringkasan harian untuk tanggal ${targetDate}. Gunakan action 'generate' untuk membuatnya.` };
      }
      const data = await res.json();
      if (!data.success) {
        return { success: false, action, date: targetDate, error: data.error || 'Gagal mengambil ringkasan harian.' };
      }
      return { success: true, action, date: data.date, summary: data.summary };
    } catch (e: any) {
      return { success: false, action, date: targetDate, error: `Network or internal error: ${e.message || e}` };
    }
  }
};
