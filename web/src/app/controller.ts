import { useCallback } from 'react';
import { StorageService } from '@shared/drivers/storage';
import { useChatSessions } from '../ui/hooks/useChatSessions';
import { useAppState, AppState } from './state';
import { useAppHandlers, AppHandlers } from './handlers';
import { useAppEffects } from './effects';

export interface AppController {
  s: AppState;
  chat: any;
  h: AppHandlers;
}

export function useAppController(): AppController {
  const s = useAppState();
  const chat = useChatSessions();

  const loadData = useCallback(async (retryCount = 0) => {
    try {
      const [m, d, c, st, hh, i, k] = await Promise.all([
        StorageService.getMemories(),
        StorageService.getDreams(),
        StorageService.getCapabilities(),
        StorageService.getStrategies(),
        StorageService.getPerformanceHistory(),
        StorageService.getIdentities(),
        StorageService.getKnowledge()
      ]);
      s.setMemories(m);
      s.setDreams(d);
      s.setIdentities(i);
      s.setCapabilities(c);
      s.setKnowledge(k);
      s.setMetricsHistory(hh);
      s.setState((prev: any) => ({ ...prev, heuristics: st, knowledge: k }));
      s.setMemoriesAtLastDream(m.length);
    } catch (error) {
      console.error("Initial data sync failed:", error);
      if (retryCount < 2) {
        chat.addLog('agent', `[SYSTEM] Connection latency detected. Re-syncing neural buffer (Attempt ${retryCount + 1})...`);
        setTimeout(() => loadData(retryCount + 1), 2000);
      } else {
        chat.addLog('agent', "[SYSTEM] FATAL: Collective mind sync failed. Neural link restricted to local volatile memory.");
      }
    }
  }, [s, chat]);

  const h = useAppHandlers(s, chat, loadData);
  useAppEffects(s, chat, h, loadData);

  return { s, chat, h };
}
