/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { safeLocalStorage } from '@shared/core/safeStorage';
import { StorageService } from '@shared/drivers/storage';
import { ChatSession } from '@shared/include/types';

const isCancellationPhrase = (text: string): boolean => {
  const normalized = text.toLowerCase().trim();
  const patterns = [
    /stop dulu/i,
    /stop yui/i,
    /\bstop\b/i,
    /diam dulu/i,
    /\bdiam\b/i,
    /jangan bicara/i,
    /\bberhenti\b/i,
    /\btunggu dulu\b/i,
    /\btunggu\b/i,
    /brentilah/i,
  ];
  return patterns.some(pattern => pattern.test(normalized));
};

export function useChatSessions(loadDataCallback?: () => void) {
  const [logs, setLogs] = useState<{ type: 'user' | 'agent', content: string, timestamp: number, isSystem: boolean, thoughts?: string, isStreaming?: boolean }[]>(() => {
    const raw = safeLocalStorage.parseJSON('yuihime_logs', []);
    return raw.filter((log: any) => {
      const trimmed = (log.content || '').trim();
      const isSystemLog = trimmed.startsWith('[') || 
                          trimmed.startsWith('Action Result from') ||
                          trimmed.startsWith('Neural sync failed') ||
                          trimmed.startsWith('Starting Server') ||
                          trimmed.includes('[SYSTEM]') ||
                          trimmed.includes('[LEARNING_ENGINE]') ||
                          trimmed.includes('[DREAM_ENGINE]') ||
                          trimmed.includes('[CORTEX]') ||
                          trimmed.includes('[SYSTEM_OBSERVATION]') ||
                          trimmed.includes('[PHASE]') ||
                          trimmed.includes('[THOUGHT]') ||
                          trimmed.includes('[ACTION]') ||
                          trimmed.includes('[TOOL]') ||
                          trimmed.includes('[PLAN]') ||
                          trimmed.includes('[OBSERVATION]') ||
                          trimmed.includes('[LOG]') ||
                          trimmed.includes('Step') ||
                          trimmed.includes('The user said') ||
                          trimmed.includes('Analyzing user') ||
                          trimmed.includes('Current Sub-Persona:') ||
                          trimmed.includes('Goal:') ||
                          trimmed.includes('Tone:');
      return !isSystemLog;
    });
  });

  const [backgroundLogs, setBackgroundLogs] = useState<{ type: string, content: string, timestamp: number, isSystem: boolean }[]>(() => {
    return safeLocalStorage.parseJSON('yuihime_background_logs', []);
  });

  // Sessions management
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    return safeLocalStorage.parseJSON('yuihime_chat_sessions', []);
  });
  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    return safeLocalStorage.getItem('yuihime_active_session_id') || 'default';
  });

  // Response Queue to prevent simultaneous UI / stream flooding
  const [responseQueue, setResponseQueue] = useState<{ type: 'user' | 'agent', content: string }[]>([]);
  const responseQueueRef = useRef<{ type: 'user' | 'agent', content: string }[]>([]);
  const isProcessingQueueRef = useRef<boolean>(false);

  // Synchronous turn-based caches to prevent duplicate log insertions in microtasks and React StrictMode double rendering
  const lastProcessedMessagesRef = useRef<Set<string>>(new Set());
  const lastUserMessageRef = useRef<string | null>(null);
  const lastActiveSessionIdRef = useRef<string>(activeSessionId);

  // Load sessions from backend custom storage
  useEffect(() => {
    StorageService.getCustom('yuihime_chat_sessions').then((dbData) => {
      const currentLocal = safeLocalStorage.parseJSON<ChatSession[]>('yuihime_chat_sessions', []);
      
      if (dbData && Array.isArray(dbData) && dbData.length > 0) {
        // Gabungkan dbData dari peladen dan localStorage secara aman demi mencegah overwriting pesan tepercaya baru yang dikirim
        const merged: ChatSession[] = [];
        const dbMap = new Map<string, ChatSession>(dbData.map(s => [s.id, s]));
        const localMap = new Map<string, ChatSession>(currentLocal.map(s => [s.id, s]));
        
        const allIds = Array.from(new Set([...dbMap.keys(), ...localMap.keys()]));
        for (const id of allIds) {
          const dbSess = dbMap.get(id);
          const localSess = localMap.get(id);
          if (dbSess && localSess) {
            const useLocal = (localSess.updatedAt || 0) > (dbSess.updatedAt || 0) || (localSess.logs || []).length > (dbSess.logs || []).length;
            merged.push(useLocal ? localSess : dbSess);
          } else if (dbSess) {
            merged.push(dbSess);
          } else if (localSess) {
            merged.push(localSess);
          }
        }

        merged.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

        setSessions(merged);
        safeLocalStorage.setItem('yuihime_chat_sessions', JSON.stringify(merged));
        StorageService.saveCustom('yuihime_chat_sessions', merged);

        // Load active ID dari backend custom storage
        StorageService.getCustom('yuihime_active_session_id').then((dbActiveId) => {
          const storedActiveId = dbActiveId || safeLocalStorage.getItem('yuihime_active_session_id') || merged[0].id;
          const exists = merged.some((s: any) => s.id === storedActiveId);
          const finalActiveId = exists ? storedActiveId : merged[0].id;

          setActiveSessionId(finalActiveId);
          safeLocalStorage.setItem('yuihime_active_session_id', finalActiveId);
          
          const activeSess = merged.find((s: any) => s.id === finalActiveId) || merged[0];
          if (activeSess) {
            setLogs(activeSess.logs || []);
          }
        });
      } else {
        if (currentLocal.length > 0) {
          StorageService.saveCustom('yuihime_chat_sessions', currentLocal);
          const currentActive = safeLocalStorage.getItem('yuihime_active_session_id') || 'default';
          StorageService.saveCustom('yuihime_active_session_id', currentActive);
        } else {
          const initialSess: ChatSession = {
            id: 'default',
            title: logs.length > 0 ? (logs.find(l => l.type === 'user')?.content?.slice(0, 30) || 'hqlo lagi apa') : 'hqlo lagi apa',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            logs: logs
          };
          const defaultList = [initialSess];
          setSessions(defaultList);
          setActiveSessionId('default');
          safeLocalStorage.setItem('yuihime_chat_sessions', JSON.stringify(defaultList));
          StorageService.saveCustom('yuihime_chat_sessions', defaultList);
          StorageService.saveCustom('yuihime_active_session_id', 'default');
        }
      }
    });
  }, []);

  // Sync current logs changes to active session with high performance and change sensing
  useEffect(() => {
    if (!activeSessionId) return;

    if (activeSessionId !== lastActiveSessionIdRef.current) {
      // Just switched sessions or deleted a session; update the ref and ignore
      lastActiveSessionIdRef.current = activeSessionId;
      return;
    }

    setSessions(prevSessions => {
      if (!prevSessions || prevSessions.length === 0) return prevSessions;

      let titleUpdated = false;
      const updated = prevSessions.map(s => {
        if (s.id === activeSessionId) {
          let currentTitle = s.title;
          if (currentTitle === 'Default Session' || currentTitle === 'New Conversation' || currentTitle === 'hqlo lagi apa' || currentTitle === '') {
            const firstUserLog = logs.find(l => l.type === 'user');
            if (firstUserLog && firstUserLog.content) {
              const cleanTitle = firstUserLog.content.replace(/^\/.*$/, '').substring(0, 35).trim();
              if (cleanTitle) {
                currentTitle = cleanTitle;
                titleUpdated = true;
              }
            }
          }
          return {
            ...s,
            title: currentTitle,
            updatedAt: Date.now(),
            logs
          };
        }
        return s;
      });

      const activeSess = prevSessions.find(s => s.id === activeSessionId);
      const hasChanged = !activeSess || JSON.stringify(activeSess.logs) !== JSON.stringify(logs) || titleUpdated;

      if (hasChanged) {
        safeLocalStorage.setItem('yuihime_chat_sessions', JSON.stringify(updated));
        StorageService.saveCustom('yuihime_chat_sessions', updated);
        return updated;
      }
      return prevSessions;
    });
  }, [logs, activeSessionId]);

  const handleSwitchSession = (id: string) => {
    setActiveSessionId(id);
    safeLocalStorage.setItem('yuihime_active_session_id', id);
    StorageService.saveCustom('yuihime_active_session_id', id);
    const targetSession = sessions.find(s => s.id === id);
    if (targetSession) {
      setLogs(targetSession.logs || []);
    } else {
      setLogs([]);
    }
  };

  const handleCreateSession = () => {
    const newId = 'session_' + Date.now();
    const newSess: ChatSession = {
      id: newId,
      title: 'New Conversation',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      logs: []
    };
    const updated = [newSess, ...sessions];
    setSessions(updated);
    setActiveSessionId(newId);
    setLogs([]);
    safeLocalStorage.setItem('yuihime_active_session_id', newId);
    safeLocalStorage.setItem('yuihime_chat_sessions', JSON.stringify(updated));
    StorageService.saveCustom('yuihime_chat_sessions', updated);
    StorageService.saveCustom('yuihime_active_session_id', newId);
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filtered = sessions.filter(s => s.id !== id);
    let targetActiveId = activeSessionId;

    if (activeSessionId === id) {
      if (filtered.length > 0) {
        targetActiveId = filtered[0].id;
        setLogs(filtered[0].logs || []);
      } else {
        const defaultId = 'session_' + Date.now();
        const defaultSess: ChatSession = {
          id: defaultId,
          title: 'New Conversation',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          logs: []
        };
        filtered.push(defaultSess);
        targetActiveId = defaultId;
        setLogs([]);
      }
    }

    setSessions(filtered);
    setActiveSessionId(targetActiveId);
    safeLocalStorage.setItem('yuihime_active_session_id', targetActiveId);
    safeLocalStorage.setItem('yuihime_chat_sessions', JSON.stringify(filtered));
    StorageService.saveCustom('yuihime_chat_sessions', filtered);
    StorageService.saveCustom('yuihime_active_session_id', targetActiveId);

    // Bersihkan seluruh riwayat memori percakapan batin yang terkait dengan sesi tersebut secara aman di sisi SQLite database
    StorageService.deleteMemoriesByContext(`web_${id}`).then((success) => {
      if (success) {
        addLog('agent', `[SYSTEM] Riwayat database batin sesi <web_${id}> telah dibersihkan secara aman.`);
      }
    }).catch(err => {
      console.warn("[SYSTEM] Gagal membersihkan memori di SQLite:", err);
    });
  };

  // Selaraskan memori obrolan secara instan saat terjadi perpindahan Sesi ID aktif
  useEffect(() => {
    if (activeSessionId && loadDataCallback) {
      loadDataCallback();
    }
  }, [activeSessionId, loadDataCallback]);

  // Persist logs to localStorage
  useEffect(() => {
    safeLocalStorage.setItem('yuihime_logs', JSON.stringify(logs));
  }, [logs]);

  useEffect(() => {
    safeLocalStorage.setItem('yuihime_background_logs', JSON.stringify(backgroundLogs));
  }, [backgroundLogs]);

  // Synchronize synchronous turn-based cache refs whenever logs state changes
  useEffect(() => {
    let lastUserIndex = -1;
    for (let i = logs.length - 1; i >= 0; i--) {
      if (logs[i].type === 'user') {
        lastUserIndex = i;
        break;
      }
    }
    const currentTurn = lastUserIndex !== -1 ? logs.slice(lastUserIndex + 1) : logs;
    
    lastProcessedMessagesRef.current.clear();
    currentTurn.forEach(l => {
      if (l.type === 'agent') {
        lastProcessedMessagesRef.current.add(stripMessageMeta(l.content));
      }
    });

    if (lastUserIndex !== -1) {
      lastUserMessageRef.current = stripMessageMeta(logs[lastUserIndex].content);
    } else {
      lastUserMessageRef.current = null;
    }
  }, [logs]);

  const stripMessageMeta = (text: string): string => {
    let cleaned = text.trim();
    // Strip [Yui - channel]: or [Yui - channel] prefixes
    cleaned = cleaned.replace(/^\[Yui\s*-\s*[^\]]+\]:?\s*/i, '');
    // Strip [channel] @user: prefix
    cleaned = cleaned.replace(/^\[[^\]]+\]\s*@[^:]+:\s*/i, '');
    // Strip standard system prefixes
    cleaned = cleaned.replace(/^\[SYSTEM\]\s*/i, '');
    return cleaned.trim();
  };

  const addLogDirect = (type: 'user' | 'agent', content: string) => {
    let processedContent = content.trim();
    let thoughts: string | undefined = undefined;

    // ALWAYS sanitize thought blocks and final_answer tags from user-facing conversation logs
    if (type === 'agent') {
      const isJsonFormat = processedContent.startsWith('{') || processedContent.includes('"thought') || processedContent.includes('"speech') || processedContent.includes('"final_answer');
      
      if (isJsonFormat) {
        // Try to extract thoughts using regex matching JSON keys
        const thoughtsRegex = /"(thoughts|thought)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g;
        let tMatch;
        while ((tMatch = thoughtsRegex.exec(processedContent)) !== null) {
          try {
            thoughts = JSON.parse(`"${tMatch[2]}"`);
          } catch (e) {
            thoughts = tMatch[2];
          }
        }
        
        // Try to extract speech/final_answer/response
        const speechRegex = /"(speech|final_answer|response)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g;
        let sMatch;
        let extractedSpeech = "";
        while ((sMatch = speechRegex.exec(processedContent)) !== null) {
          try {
            extractedSpeech = JSON.parse(`"${sMatch[2]}"`);
          } catch (e) {
            extractedSpeech = sMatch[2];
          }
        }
        
        if (extractedSpeech) {
          processedContent = extractedSpeech;
        } else {
          processedContent = ""; // Keep clean of raw JSON structure
        }
      } else {
        const thoughtMatch = processedContent.match(/<thought>([\s\S]*?)<\/thought>/i);
        if (thoughtMatch) {
          thoughts = thoughtMatch[1].trim();
        }
        processedContent = processedContent.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
        processedContent = processedContent.replace(/<\/?final_answer>/gi, '').trim();
      }
    }

    // Guard to prevent adding empty logs if a response only had thought tags and nothing else
    if (type === 'agent' && !processedContent) {
      // However, if we have thoughts, we still want to save it as a log item with empty content
      // so the user can expand and see the thoughts of Yuihime!
      if (!thoughts) {
        console.warn("[addLogDirect] Suppression of empty/only-thoughts agent log.");
        return;
      }
    }

    const strippedNew = stripMessageMeta(processedContent);

    // If it starts with [ and ends with ], or contains specific tags, it's a system/background log
    const isSystem = processedContent.startsWith('[') || 
                     processedContent.startsWith('Action Result from') ||
                     processedContent.startsWith('Neural sync failed') ||
                     processedContent.startsWith('Starting Server') ||
                     processedContent.startsWith('✨ Kognisi Terhubung') ||
                     processedContent.startsWith('❌ Gagal') ||
                     processedContent.startsWith('Riwayat database batin') ||
                     processedContent.includes('[SYSTEM]') ||
                     processedContent.includes('[SYSTEM_OBSERVATION]') ||
                     processedContent.includes('[LEARNING_ENGINE]') ||
                     processedContent.includes('[DREAM_ENGINE]') ||
                     processedContent.includes('[CORTEX]') ||
                     processedContent.includes('[PHASE]') ||
                     processedContent.includes('[THOUGHT]') ||
                     processedContent.includes('[ACTION]') ||
                     processedContent.includes('[TOOL]') ||
                     processedContent.includes('[PLAN]') ||
                     processedContent.includes('[OBSERVATION]') ||
                     processedContent.includes('[LOG]') ||
                     processedContent.includes('color-scheme') ||
                     processedContent.includes('font-family:') ||
                     processedContent.includes('<!doctype') ||
                     processedContent.includes('.model3.json') ||
                     processedContent.startsWith('Step') ||
                     processedContent.startsWith('The user said') ||
                     processedContent.startsWith('Analyzing user') ||
                     processedContent.includes('Current Sub-Persona:') ||
                     processedContent.includes('Goal:') ||
                     processedContent.includes('Tone:');

    const newLog = { 
      type, 
      content: processedContent, 
      timestamp: Date.now(),
      isSystem,
      thoughts
    };
    
    if (isSystem) {
      setBackgroundLogs(prev => {
        const lastFew = prev.slice(-15);
        const isDuplicate = lastFew.some(l => stripMessageMeta(l.content) === strippedNew);
        if (isDuplicate) {
          console.warn("[addLogDirect] Ignored duplicate background log:", processedContent);
          return prev;
        }
        return [...prev, newLog].slice(-150);
      });
    } else {
      if (type === 'agent') {
        if (lastProcessedMessagesRef.current.has(strippedNew)) {
          console.warn("[addLogDirect] Ignored duplicate agent message via synchronous turn cache:", strippedNew);
          return;
        }
        // Cache immediately and synchronously to block other rapid double-calls in the same tick
        lastProcessedMessagesRef.current.add(strippedNew);

        setLogs(prev => {
          // Find the last message of the opposite type (user) to define the start of the current turn
          let lastUserIndex = -1;
          for (let i = prev.length - 1; i >= 0; i--) {
            if (prev[i].type === 'user') {
              lastUserIndex = i;
              break;
            }
          }
          // Messages in the current turn are from lastUserIndex + 1 to the end
          const currentTurnMessages = lastUserIndex !== -1 ? prev.slice(lastUserIndex + 1) : prev;
          
          const isDuplicate = currentTurnMessages.some(l => {
            if (l.type !== 'agent') return false;
            const strippedExisting = stripMessageMeta(l.content);
            return (
              strippedExisting === strippedNew ||
              strippedExisting.includes(strippedNew) ||
              strippedNew.includes(strippedExisting)
            );
          });
          if (isDuplicate) {
            console.warn("[addLogDirect] Ignored duplicate agent message in the current turn.");
            return prev;
          }
          return [...prev, newLog];
        });
      } else {
        if (lastUserMessageRef.current === strippedNew) {
          console.warn("[addLogDirect] Ignored duplicate user message via synchronous turn cache:", strippedNew);
          return;
        }
        lastUserMessageRef.current = strippedNew;

        setLogs(prev => {
          const lastUserMessage = [...prev].reverse().find(l => l.type === 'user');
          const isDuplicate = lastUserMessage && stripMessageMeta(lastUserMessage.content) === strippedNew;
          if (isDuplicate) {
            console.warn(`[addLogDirect] Ignored duplicate user message in the current turn.`);
            return prev;
          }
          return [...prev, newLog];
        });
      }
    }
  };

  const processQueue = async () => {
    if (isProcessingQueueRef.current) return;
    isProcessingQueueRef.current = true;

    while (responseQueueRef.current.length > 0) {
      const nextItem = responseQueueRef.current.shift();
      // Synchronize component state for visualization if needed
      setResponseQueue([...responseQueueRef.current]);

      if (nextItem) {
        addLogDirect(nextItem.type, nextItem.content);

        // Dynamic delay based on word count to humanize typing and avoid UI flash
        const wordCount = nextItem.content.split(/\s+/).length;
        const delay = Math.min(1500, Math.max(500, wordCount * 50));
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    isProcessingQueueRef.current = false;
  };

  const addLog = (type: 'user' | 'agent', content: string) => {
    // If we're streaming or interruption is requested, bypass the queue
    const containsInterruption = type === 'user' && isCancellationPhrase(content);
    if (containsInterruption) {
      console.warn("[addLog] Cancellation/interruption code detected. Purging current response queues.");
      responseQueueRef.current = [];
      setResponseQueue([]);
      // Interruption triggers standard direct dispatch immediately
      addLogDirect(type, content);
      return;
    }

    // Agent outputs are queued to emulate live stream chat rate limits beautifully
    const isSystemLog = (content.startsWith('[') && (content.includes(']') || content.includes('[PHASE'))) || 
                        content.startsWith('[SYSTEM]') ||
                        content.startsWith('[SYSTEM_OBSERVATION]') ||
                        content.includes('[DREAM_ENGINE]') ||
                        content.includes('[LEARNING_ENGINE]') ||
                        content.includes('[PHASE') ||
                        content.includes('[CORTEX') ||
                        content.includes('[THOUGHT]') ||
                        content.includes('[PLAN]') ||
                        content.includes('[ACTION]') ||
                        content.includes('[LOG]') ||
                        content.includes('[TOOL]');

    if (type === 'agent' && !isSystemLog) {
      responseQueueRef.current.push({ type, content });
      setResponseQueue([...responseQueueRef.current]);
      processQueue();
    } else {
      addLogDirect(type, content);
    }
  };

  return {
    sessions,
    setSessions,
    activeSessionId,
    setActiveSessionId,
    logs,
    setLogs,
    backgroundLogs,
    setBackgroundLogs,
    responseQueue,
    addLog,
    addLogDirect,
    handleSwitchSession,
    handleCreateSession,
    handleDeleteSession
  };
}
