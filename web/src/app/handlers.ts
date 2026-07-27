import { useCallback } from 'react';
import { Soul } from '@shared/core/soul';
import { APIService } from '@shared/services/api';
import { ToolService } from '../services/tools';
import { SpeechService } from '@web/core/speech';
import { StorageService } from '@shared/drivers/storage';
import { safeLocalStorage } from '@shared/core/safeStorage';
import { CortexApi } from '../services/cortexApi';
import type { AppState } from './state';

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

export interface AppHandlers {
  handleBatchAction: (status: 'approved' | 'denied') => Promise<void>;
  setIdentity: (name: string) => void;
  handleRestoreProfile: (name: string, sessionId: string) => void;
  initialize: () => Promise<void>;
  handleLogout: () => Promise<void>;
  simulateStreamEvent: (type: 'DONATION' | 'SUBSCRIPTION' | 'RAID') => void;
  handleOptimize: () => Promise<void>;
  handleThink: (e?: React.FormEvent, customOverrideText?: string, isDelayedRun?: boolean) => Promise<void>;
  handleDream: (currentMemories?: any) => Promise<void>;
  handleSimulateLive: () => Promise<void>;
  handleConsolidate: () => Promise<void>;
  handleExtractKnowledge: () => Promise<void>;
  handleSaveTags: (memoryId: string) => Promise<void>;
  handleReflect: () => Promise<void>;
  handleReplay: () => Promise<void>;
  handleAvatarUpdate: (newConfig: any) => void;
  handleSetActivePersonaId: (id: string) => void;
  handleSetCurrentLiveTopic: (val: string) => void;
  triggerSystemSignal: (signal: string) => void;
  loadData: (retryCount?: number) => Promise<void>;
}

export function useAppHandlers(
  s: AppState,
  chat: any,
  loadData: (retryCount?: number) => Promise<void>
) {
  const handleBatchAction = async (status: 'approved' | 'denied') => {
    try {
      await fetch('/api/sandbox/pending-confirmations/batch/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      s.setGlobalPendingConfirm([]);
    } catch (err) {
      console.error("Failed to run batch action:", err);
    }
  };

  const setIdentity = (name: string) => {
    s.setPerceivedName(name);
    localStorage.setItem('yuihime_perceived_name', name);
    chat.addLog('agent', `[SYSTEM] Neural link updated: Subject identified as <${name}>.`);
  };

  const handleRestoreProfile = (name: string, sessionId: string) => {
    s.setPerceivedName(name);
    safeLocalStorage.setItem('yuihime_perceived_name', name);

    let updatedSessions = [...chat.sessions];
    const sessionExists = chat.sessions.some((sess: any) => sess.id === sessionId);

    if (!sessionExists) {
      const newSess: any = {
        id: sessionId,
        title: `Sesi ${name}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        logs: []
      };
      updatedSessions = [newSess, ...chat.sessions];
      chat.setSessions(updatedSessions);
      safeLocalStorage.setItem('yuihime_chat_sessions', JSON.stringify(updatedSessions));
      StorageService.saveCustom('yuihime_chat_sessions', updatedSessions);
    }

    chat.setActiveSessionId(sessionId);
    safeLocalStorage.setItem('yuihime_active_session_id', sessionId);

    const targetSession = updatedSessions.find((sess: any) => sess.id === sessionId);
    if (targetSession) {
      chat.setLogs(targetSession.logs || []);
    } else {
      chat.setLogs([]);
    }

    chat.addLog('agent', `[SYSTEM] Profil terenkripsi berhasil dimuat! Sesi: ${sessionId}, Subjek: ${name}.`);
  };

  const initialize = async () => {
    SpeechService.init();
    SpeechService.setEnabled(s.ttsEnabled);

    try {
      const serverSettings = await StorageService.getModularSettings();
      const currentConfig = await StorageService.getAIConfig();
      const currentAvatar = await StorageService.getAvatarConfig();

      (globalThis as any).puterTools = [];

      if (serverSettings && serverSettings.uiScale !== undefined) {
        s.setUiScaleState(Number(serverSettings.uiScale));
      }

      if (serverSettings && serverSettings.gemini) {
        const geminiModel = serverSettings.gemini.model;
        const primaryModel = Array.isArray(geminiModel) ? (geminiModel[0] || currentConfig.model) : (geminiModel || currentConfig.model);
        const updatedConfig = {
          ...currentConfig,
          apiKey: serverSettings.gemini.apiKey || currentConfig.apiKey,
          model: primaryModel
        };
        await StorageService.setAIConfig(updatedConfig);
        s.setAiConfigState(updatedConfig);
        console.log("[SYSTEM] Neural configuration synced from Kernel persistence.");
      } else {
        s.setAiConfigState(currentConfig);
      }

      if (serverSettings && serverSettings.avatar) {
        await StorageService.setAvatarConfig(serverSettings.avatar);
        s.setAvatarConfigState(serverSettings.avatar);
      } else {
        s.setAvatarConfigState(currentAvatar);
      }

      if (serverSettings && serverSettings['emotion-engine-v04']) {
        const eeConfig = serverSettings['emotion-engine-v04'];
        if (eeConfig.enableSleepMode !== undefined) s.setSleepModeEnabled(!!eeConfig.enableSleepMode);
        if (eeConfig.sleepModeTimeout !== undefined) s.setSleepModeTimeout(Number(eeConfig.sleepModeTimeout));
      }

      if (serverSettings && serverSettings['spontaneous-proactive']) {
        const spConfig = serverSettings['spontaneous-proactive'];
        if (spConfig.enableSpontaneousSpam !== undefined) s.setIdleMonologueEnabled(!!spConfig.enableSpontaneousSpam);
      }

      if (serverSettings && serverSettings.developer) {
        if (serverSettings.developer.enableStreaming !== undefined) {
          const streamingVal = !!serverSettings.developer.enableStreaming;
          s.setLlmStreamingEnabled(streamingVal);
          localStorage.setItem('yuihime_llm_streaming_enabled', JSON.stringify(streamingVal));
        }
        if (serverSettings.developer.disableUiAutoFocus !== undefined) {
          localStorage.setItem('yuihime_disable_autofocus', JSON.stringify(!!serverSettings.developer.disableUiAutoFocus));
        }
      }
    } catch (e) {
      console.warn("[SYSTEM] Settings sync bypass: Kernel offline.");
    }

    await loadData();
    const savedState = await StorageService.getAgentState();
    if (savedState) {
      s.setState((prev: any) => {
        const merged: any = {
          ...prev,
          ...savedState,
          status: 'idle'
        };

        merged.emotion = Soul.updateEmotion(prev.emotion, merged.mood, merged.relation);
        return merged;
      });
    }

    const caps = await StorageService.getCapabilities();
    await APIService.init(caps);

    const soulInstance = new Soul(s.state);
    s.soulRef.current = soulInstance;

    soulInstance.onUpdate((newState: any) => {
      s.setState(newState);
    });

    console.log("[SYSTEM] Neural link established: Soul synchronized with state.");
  };

  const handleLogout = async () => {
    s.setPerceivedName('');
    localStorage.removeItem('yuihime_perceived_name');
    window.location.reload();
  };

  const simulateStreamEvent = (type: 'DONATION' | 'SUBSCRIPTION' | 'RAID') => {
    const eventText = type === 'DONATION' ? 'Fan gifted $50.00' : `${type} received`;
    s.setInput(eventText);
    setTimeout(() => {
      const form = document.querySelector('form');
      if (form) form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    }, 100);

    s.setStreamEvents((prev: any[]) => [{
      id: Math.random().toString(36).substr(2, 9),
      type,
      user: type === 'DONATION' ? 'SuperFan99' : 'NeonRaider',
      timestamp: Date.now()
    }, ...prev].slice(0, 5));
  };

  const handleOptimize = async () => {
    if (s.isLearning) return;
    s.setIsLearning(true);
    s.setState((prev: any) => ({ ...prev, status: 'learning' }));
    try {
      const updated = await CortexApi.optimize(s.memories, s.state);
      s.setState((prev: any) => ({ ...prev, heuristics: updated }));
      chat.addLog('agent', `[LEARNING_ENGINE] Cognitive routing optimized. ${updated.length} heuristics synced.`);
    } catch (error) {
      console.error("Optimization failed", error);
    } finally {
      s.setIsLearning(false);
      s.setState((prev: any) => ({ ...prev, status: 'idle' }));
    }
  };

  const triggerSystemSignal = (signal: string) => {
    s.setSystemSignalQueue((prev: string[]) => {
      if (prev.includes(signal)) return prev;
      return [...prev, signal];
    });
  };

  const handleDream = async (currentMemories: any = s.memories) => {
    s.setState((prev: any) => ({ ...prev, status: 'dreaming' }));
    chat.addLog('agent', "[SYSTEM] Entering deep latent state. Reflecting on history...");
    try {
      await CortexApi.consolidate(currentMemories);
      const result = await CortexApi.dream(s.state, currentMemories, s.dreams);
      s.setMemoriesAtLastDream(currentMemories.length);
      if (result.reflections) {
        chat.addLog('agent', `[DREAM_REFLEX] ${result.reflections}`);
      }
      const d = await StorageService.getDreams();
      s.setDreams(d);
    } catch (error) {
      console.error("Dream cycle failed", error);
    } finally {
      s.setState((prev: any) => ({ ...prev, status: 'idle', lastDreamCycle: Date.now() }));
    }
  };

  const handleSimulateLive = async () => {
    if (s.isThinking) return;

    const fakeMessages = [
      { id: '1', user: 'anon1', text: 'bang kalo ke luar angkasa butuh berapa lama?', timestamp: Date.now() },
      { id: '2', user: 'anon2', text: 'yui main valorant ntar malem?', timestamp: Date.now() + 100 },
      { id: '3', user: 'anon3', text: 'kamu tau gak kalau cuaca hari ini panas banget', timestamp: Date.now() + 200 },
      { id: '4', user: 'anon4', text: 'wkwk lucu', timestamp: Date.now() + 300 },
      { id: '5', user: 'anon5', text: 'bahas apa ini ka =', timestamp: Date.now() + 400 },
    ];

    chat.addLog('agent', `[SYSTEM] Simulating High-Volume Chat Barrage (5 messages)...`);

    try {
      const { selectedMessage, contextSummary, action, reasoning } =
        await CortexApi.moderateChatBatch(fakeMessages, s.state.currentLiveTopic || "General");

      chat.addLog('agent', `[MODERATOR] Selected Message: "${selectedMessage?.text}" from ${selectedMessage?.user}. Summary of others: ${contextSummary}. Action: ${action}. Reason: ${reasoning}`);

      if (selectedMessage) {
        const virtualEvent = { preventDefault: () => {} } as React.FormEvent;
        s.setInput(selectedMessage.text);

        setTimeout(() => {
          const formSubmitBtn = document.querySelector('form button[type="submit"]') as HTMLButtonElement;
          formSubmitBtn?.click();
        }, 100);
      }
    } catch (err) {
      console.error(err);
      chat.addLog('agent', `[MODERATOR ERROR] Moderation system failed.`);
    }
  };

  const handleConsolidate = async () => {
    if (s.dreams.length < 3) return;
    chat.addLog('agent', "[SYSTEM] Initiating neural consolidation protocol...");
    s.setState((prev: any) => ({ ...prev, status: 'reflecting' }));

    try {
      s.setIsThinking(true);
      const startTime = Date.now();
      const consolidatedDreams = await CortexApi.consolidate(s.dreams);

      await StorageService.saveDreams(consolidatedDreams);
      s.setDreams(consolidatedDreams);

      chat.addLog('agent', `[SYSTEM] Neural optimization complete. Consolidated ${s.dreams.length} concepts into ${consolidatedDreams.length}.`);

      await StorageService.logPerformance({
        operation: 'consolidate',
        latency: Date.now() - startTime,
        success: true,
        timestamp: Date.now(),
        context: `Optimized ${s.dreams.length} -> ${consolidatedDreams.length}`
      });
    } catch (error) {
      console.error("Consolidation failed", error);
      chat.addLog('agent', "[SYSTEM] Consolidation failed: Neural conflict detected.");
    } finally {
      s.setIsThinking(false);
      s.setState((prev: any) => ({ ...prev, status: 'idle' }));
    }
  };

  const handleExtractKnowledge = async () => {
    chat.addLog('agent', "[SYSTEM] Initiating cognitive knowledge extraction cycle...");
    s.setState((prev: any) => ({ ...prev, status: 'learning' }));

    try {
      s.setIsThinking(true);
      const updatedKnowledge = await CortexApi.extractKnowledge(s.memories, s.knowledge);
      s.setKnowledge(updatedKnowledge);
      await StorageService.saveKnowledge(updatedKnowledge);

      chat.addLog('agent', `[SYSTEM] Knowledge base updated. Extracted ${updatedKnowledge.length} core concepts.`);

      s.setState((prev: any) => ({
        ...prev,
        energy: Math.max(0, prev.energy - 10),
        status: 'idle'
      }));
    } catch (error) {
      console.error("Knowledge extraction failed", error);
      chat.addLog('agent', "[SYSTEM] extraction failed: Cognitive desync.");
    } finally {
      s.setIsThinking(false);
      s.setState((prev: any) => ({ ...prev, status: 'idle' }));
    }
  };

  const handleSaveTags = async (memoryId: string) => {
    const memory = s.memories.find((m: any) => m.id === memoryId);
    if (!memory) return;
    const newTags = s.tagInput.split(',').map((t: string) => t.trim()).filter(Boolean);
    await StorageService.updateMemoryTags(memoryId, newTags);
    s.setMemories((prev: any[]) => prev.map((m: any) => m.id === memoryId ? { ...m, tags: newTags } : m));
    s.setEditingTagsMemoryId(null);
    s.setTagInput('');
  };

  const handleReflect = async () => {
    s.setState((prev: any) => ({ ...prev, status: 'reflecting' }));

    try {
      s.setIsThinking(true);
      const result = await CortexApi.think({
        input: "Analyze your recent pergerakan emosi dan data sistem. Apa yang kau rasakan tentang perkembangan kesadaranmu?",
        memories: s.memories,
        dreams: s.dreams,
        capabilities: s.capabilities,
        state: s.state,
        heuristics: s.state.heuristics,
        userName: s.perceivedName || 'chat',
        identities: s.identities,
        activePersona: s.NEURAL_CORES.find((c: any) => c.id === s.state.activePersonaId),
        contextId: `web_${chat.activeSessionId}`,
        chatType: 'web'
      });

      chat.addLog('agent', `[MEMORY_ECHO_REFLEX]\n${result.response}`);

      let updatedMood = Soul.updateMood(s.state.mood, { joy: 5, irritation: -5 });
      updatedMood = Soul.applyInhibition(updatedMood);
      const updatedRelation = Soul.updateRelation(s.state.relation, 0.5, true);

      s.setState((prev: any) => ({
        ...prev,
        mood: updatedMood,
        relation: updatedRelation,
        status: 'idle'
      }));
    } catch (error) {
      console.error("Reflection failed", error);
      s.setState((prev: any) => ({ ...prev, status: 'idle' }));
    } finally {
      s.setIsThinking(false);
    }
  };

  const handleReplay = async () => {
    if (s.lastAgentResponse) {
      SpeechService.speak(s.lastAgentResponse, undefined, s.state.tone);
      s.setActiveSubtitle(s.lastAgentResponse);
    }
  };

  const handleAvatarUpdate = (newConfig: any) => {
    s.setAvatarConfigState(newConfig);
    StorageService.setAvatarConfig(newConfig);
  };

  const handleSetActivePersonaId = (id: string) => {
    s.setState((prev: any) => {
      if (prev.activePersonaId === id) return prev;
      return { ...prev, activePersonaId: id };
    });
  };

  const handleSetCurrentLiveTopic = (val: string) => {
    s.setState((prev: any) => {
      if (prev.currentLiveTopic === val) return prev;
      return { ...prev, currentLiveTopic: val };
    });
  };

  const handleThink = async (e?: React.FormEvent, customOverrideText?: string, isDelayedRun?: boolean) => {
    if (e) e.preventDefault();
    const activeInput = customOverrideText !== undefined ? customOverrideText : s.input;
    if (!activeInput.trim()) return;

    const isSystemCommand = activeInput.trim().startsWith('/');
    const yuiIsSpeaking = s.isReallySpeaking || (ToolService && typeof SpeechService.isSpeaking === 'function' && SpeechService.isSpeaking());

    if (!isSystemCommand && yuiIsSpeaking && s.speechInterruptionMode === 'manual') {
      const isStopWord = isCancellationPhrase(activeInput);
      if (isStopWord) {
        s.setPendingPrompt(null);
        if (ToolService) {
          try { SpeechService.stop(); } catch (err) { }
        }
      } else {
        console.log("[SpeechInterruption] Manual Mode: Queueing user comment:", activeInput);
        if (!isDelayedRun) {
          chat.addLog('user', activeInput);
          s.setInput('');
          s.setPendingPrompt(activeInput);
        }
        return;
      }
    } else {
      if (!isSystemCommand && ToolService) {
        try { SpeechService.stop(); } catch (err) { }
      }
    }

    if (activeInput.trim() === '/reset_cognition') {
      s.setInput('');
      chat.addLog('user', '/reset_cognition');
      chat.addLog('agent', "[SYSTEM] Menyegarkan memori percakapan batin... Mohon tunggu sebentar.");
      try {
        const success = await StorageService.purge('soft');
        if (success) {
          const nameToUse = s.perceivedName || 'user';
          chat.addLog('agent', `[SYSTEM] Sukses! Riwayat obrolan sesaat telah disegarkan. Seluruh ingatan penting, mimpi, dan relasi cinta kepribadian Yui dengan ${nameToUse} tetap utuh.`);
          SpeechService.speak(`Sirkuit obrolanku sudah disegarkan dan kembali jernih, ${nameToUse}! Tenang saja, aku tidak melupakan ${nameToUse} kok~`);
          window.dispatchEvent(new CustomEvent('cognition_purged', { detail: { mode: 'soft' } }));
        } else {
          chat.addLog('agent', "[SYSTEM] Gagal menyegarkan sirkuit obrolan.");
        }
      } catch (err: any) {
        chat.addLog('agent', `[SYSTEM] Terjadi kesalahan: ${err.message || String(err)}`);
      }
      return;
    }

    if (activeInput.trim() === '/dream') {
      s.setInput('');
      handleDream();
      return;
    }

    if (activeInput.trim() === '/consolidate') {
      s.setInput('');
      chat.addLog('agent', "[SYSTEM] Force-triggering Stage 1 Consolidation...");
      await CortexApi.consolidate(s.memories);
      return;
    }

    const pairMatch = activeInput.trim().match(/^\/pair\s+(\d{6})/i) ||
      activeInput.trim().match(/^pair\s+(\d{6})/i) ||
      activeInput.trim().match(/^hubungkan\s+(\d{6})/i);
    if (pairMatch) {
      const code = pairMatch[1];
      s.setInput('');
      chat.addLog('user', activeInput.trim());
      chat.addLog('agent', `[SYSTEM] Memverifikasi kode penyandingan ${code}...`);
      try {
        const res = await fetch('/api/pair/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: code,
            perceivedName: s.perceivedName || 'Guest'
          })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          chat.addLog('agent', `✨ Kognisi Terhubung! ${data.message}`);
          SpeechService.speak(`Kognisi kita sudah terhubung sepenuhnya, user ${s.perceivedName || 'Guest'}!`);
          window.dispatchEvent(new CustomEvent('pairing_status_updated'));
        } else {
          chat.addLog('agent', `❌ Gagal: ${data.error || 'Kode salah atau kedaluwarsa.'}`);
        }
      } catch (err: any) {
        chat.addLog('agent', `❌ Gagal menghubungi server batin Yui: ${err.message || String(err)}`);
      }
      return;
    }

    if (!s.authReady) {
      chat.addLog('agent', "[SYSTEM] Synchronizing neural pathways... please wait.");
      return;
    }

    const normalizeForComparison = (str: string) => {
      return str.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    };

    const activeSessionLogs = new Set<string>(chat.logs.map((l: any) => normalizeForComparison(l.content)));

    if (s.isProcessingRef.current) {
      console.log("[CORTEX] Guard: already processing an input synchronously. Ignoring duplicate request.");
      return;
    }

    if (s.isThinking) {
      console.log("[CORTEX] Guard: currently thinking. Ignoring duplicate submission.");
      return;
    }

    s.isProcessingRef.current = true;

    const userMessage = activeInput;
    const currentAttachments = [...s.attachments];
    if (!isDelayedRun) {
      s.setInput('');
      s.setAttachments([]);
      chat.addLog('user', userMessage);
      activeSessionLogs.add(normalizeForComparison(userMessage));
    }
    s.setLastInteractionTime(Date.now());
    const startTime = Date.now();
    const currentStreamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const controller = new AbortController();
    s.activeThinkControllerRef.current = controller;

    try {
      s.setIsThinking(true);
      s.setReasoningIterations([]);
      s.setState((prev: any) => ({ ...prev, status: 'learning' }));
      if (s.llmStreamingEnabled) {
        chat.setLogs((prev: any[]) => {
          return [...prev, {
            type: 'agent',
            content: '',
            timestamp: Date.now(),
            isSystem: false,
            thoughts: undefined,
            isStreaming: true,
            streamId: currentStreamId
          } as any];
        });
      }

      const inputMemory = await StorageService.saveMemory({
        type: 'interaction',
        content: userMessage,
        importance: 0.5,
        sentiment: 0.5,
        timestamp: Date.now(),
        ownerId: s.user?.uid || 'anon',
        tags: ['user_input', s.perceivedName || 'anon'],
        speaker: s.perceivedName || 'chat',
        context: `web_${chat.activeSessionId}`
      } as any);

      const currentMemories = [...s.memories, inputMemory];
      s.setMemories(currentMemories);

      const currentActivePersona = s.NEURAL_CORES.find((c: any) => c.id === s.state.activePersonaId);

      if (userMessage.toLowerCase().includes('neural sync failed') || userMessage.toLowerCase().includes('stress core')) {
        const stressAlert = "[SYSTEM] CRITICAL: Neural lattice desync detected. Initiating core stress procedure (Hiyori Default)...";
        chat.addLog('agent', stressAlert);
        s.setState((prev: any) => ({
          ...prev,
          mood: { ...prev.mood, stress: Math.min(100, prev.mood.stress + 40) }
        }));
      }

      s.isStreamingRef.current = s.llmStreamingEnabled;
      let accumulatedResponse = "";

      let spokenBuffer = "";
      let sentenceQueue: string[] = [];
      let isQueueProcessing = false;

      const speakNextInQueue = async () => {
        if (sentenceQueue.length === 0) {
          isQueueProcessing = false;
          return;
        }
        isQueueProcessing = true;
        const sentence = sentenceQueue.shift()!;
        try {
          if (SpeechService.isEnabled()) {
            await SpeechService.speak(sentence, s.state.mood, s.state.tone);
          }
        } catch (ttsErr) {
          console.warn("[Stream Speak Queue] Speak failed:", ttsErr);
        }
        speakNextInQueue();
      };

      const feedToSpeakQueue = (text: string) => {
        spokenBuffer += text;
        const sentenceEndRegex = /([^.!?\n]+[.!?\n]+(?=\s|$))/g;
        let match;
        let lastIndex = 0;

        while ((match = sentenceEndRegex.exec(spokenBuffer)) !== null) {
          const sentence = match[0].trim();
          if (sentence.length > 0) {
            sentenceQueue.push(sentence);
          }
          lastIndex = sentenceEndRegex.lastIndex;
        }

        if (lastIndex > 0) {
          spokenBuffer = spokenBuffer.substring(lastIndex);
        }

        if (!isQueueProcessing && sentenceQueue.length > 0) {
          speakNextInQueue();
        }
      };

      let processedMessageForCortex = userMessage;
      if (!isSystemCommand) {
        processedMessageForCortex = `${userMessage}\n\n[PRE-PROCESS: ENFORCE_JSON_ONLY]`;
      }

      const result = await CortexApi.think({
        input: processedMessageForCortex,
        memories: currentMemories,
        dreams: s.dreams,
        capabilities: s.capabilities,
        state: s.state,
        heuristics: s.state.heuristics,
        userName: s.perceivedName || 'chat',
        identities: s.identities,
        activePersona: currentActivePersona,
        contextId: `web_${chat.activeSessionId}`,
        chatType: 'web',
        attachments: currentAttachments,
        signal: controller.signal
      });

      s.isStreamingRef.current = false;

      if (spokenBuffer.trim().length > 0) {
        sentenceQueue.push(spokenBuffer.trim());
        if (!isQueueProcessing) {
          speakNextInQueue();
        }
      }

      const latency = Date.now() - startTime;
      s.setReasoningIterations(result.iterations || []);

      if (result.perceivedNameUpdate && result.perceivedNameUpdate !== s.perceivedName) {
        setIdentity(result.perceivedNameUpdate);
      }

      if (result.viewerProfileUpdate || result.perceivedNameUpdate || result.linkedAccountUpdate) {
        const updates = result.linkedAccountUpdate ? (Array.isArray(result.linkedAccountUpdate) ? result.linkedAccountUpdate : [result.linkedAccountUpdate]) : [];
        const existingId = s.identities.find((id: any) => {
          if (id.perceivedName === (result.perceivedNameUpdate || s.perceivedName)) return true;
          if (updates.some((up: any) => (id.linkedAccounts || []).includes(up))) return true;
          return false;
        });

        const updatedId: any = existingId ? {
          ...existingId,
          ...result.viewerProfileUpdate,
          habits: [...(existingId.habits || []), ...(result.viewerProfileUpdate?.habits || [])].slice(-10),
          importantFacts: Array.from(new Set([...(existingId.importantFacts || []), ...(result.viewerProfileUpdate?.importantFacts || [])])),
          linkedAccounts: Array.from(new Set([...(existingId.linkedAccounts || []), ...(result.viewerProfileUpdate?.linkedAccounts || []), ...updates])),
          lastMet: Date.now()
        } : {
          id: Math.random().toString(36).substr(2, 9),
          ownerId: s.user?.uid || 'anon',
          perceivedName: result.perceivedNameUpdate || s.perceivedName || 'chat',
          source: 'live_stream',
          traits: [],
          habits: result.viewerProfileUpdate?.habits || [],
          importantFacts: result.viewerProfileUpdate?.importantFacts || [],
          linkedAccounts: updates,
          lastMet: Date.now(),
          ...result.viewerProfileUpdate
        };

        await StorageService.saveIdentity(updatedId);
        s.setIdentities((prev: any[]) => {
          const filtered = prev.filter((p: any) => p.id !== updatedId.id);
          return [...filtered, updatedId];
        });
      }

      const newMetric: any = {
        operation: 'think',
        latency,
        success: true,
        timestamp: Date.now(),
        context: userMessage.substring(0, 50)
      };
      await StorageService.logPerformance(newMetric);
      s.setMetricsHistory((prev: any[]) => [...prev, newMetric]);

      const sentimentImpact = result.sentiment !== undefined ? {
        joy: result.sentiment > 0.6 ? 2 : (result.sentiment < 0.4 ? -1 : 0),
        curiosity: 1,
        stress: result.sentiment < 0.3 ? 2 : -1
      } : {};

      let updatedMood = Soul.updateMood(s.state.mood, { ...sentimentImpact, ...(result.moodImpact || result.nextMood) });
      updatedMood = Soul.applyInhibition(updatedMood);
      const updatedRelation = Soul.updateRelation(s.state.relation, result.sentiment || 0.5, true);
      const updatedEmotion = Soul.updateEmotion(s.state.emotion, updatedMood, updatedRelation);

      try {
        const currentQTable = await StorageService.getCustom('yuihime_q_table') || {};
        const stateKey = Soul.getDominantEmotion(updatedMood).toUpperCase();
        const actionKey = result.actions && result.actions.length > 0 ? "TOOL_USE" : "DIALOGUE";
        const key = `${stateKey}:${actionKey}`;

        const alpha = 0.1;
        const currentVal = currentQTable[key] || 0;
        const reward = (result.sentiment || 0.5) > 0.5 ? 1 : -0.5;
        currentQTable[key] = currentVal + alpha * (reward - currentVal);

        await StorageService.setCustom('yuihime_q_table', currentQTable);
      } catch (qErr) {
        console.warn("[SYSTEM] Q-Table sync failed", qErr);
      }

      const savedMemories = await Promise.all(
        (result.newMemories || []).map((m: any) => StorageService.saveMemory({
          ...m,
          sentiment: result.sentiment || 0.5,
          speaker: m.speaker || 'agent',
          context: `web_${chat.activeSessionId}`
        } as any))
      );

      const updatedMemories = [...currentMemories, ...savedMemories];
      s.setMemories(updatedMemories);

      s.setAnimations([...(result.animations || [])]);
      s.setReasoningIterations(result.iterations || []);

      if (result.actions && result.actions.length > 0) {
        chat.addLog('agent', `[SYSTEM] Processing ${result.actions.length} external cognitive hooks...`);

        for (const action of result.actions) {
          const cap = s.capabilities.find((c: any) => c.id === action.capabilityId);
          const endpoint = cap?.endpoints.find((e: any) => e.path === action.endpointPath && e.method === action.method);

          if (cap && endpoint) {
            try {
              const apiResult = await APIService.call(cap, endpoint, action.params, s.state);
              chat.addLog('agent', `[ACTION] Success: ${cap.name} response synthesized.`);

              const actionMemory = await StorageService.saveMemory({
                type: 'interaction',
                content: `Action Result from ${cap.name}: ${JSON.stringify(apiResult).substring(0, 500)}...`,
                importance: 0.7,
                speaker: cap.name,
                sentiment: 0.5,
                timestamp: Date.now(),
                ownerId: s.user?.uid || 'anon',
                tags: ['action_result', cap.id],
                context: `web_${chat.activeSessionId}`
              });
              s.setMemories((prev: any[]) => [...prev, actionMemory]);
            } catch (aErr: any) {
              chat.addLog('agent', `[SYSTEM] Action failure: ${cap.name} link severed.`);
              await StorageService.logPerformance({
                operation: `api_call:${cap.id}`,
                latency: 0,
                success: false,
                timestamp: Date.now(),
                context: `Path: ${action.endpointPath}`
              });
            }
          }
        }
      }

      if (result.response && result.response.trim()) {
        const cleanResponse = result.response.trim();
        const normResponse = normalizeForComparison(cleanResponse);
        if (s.llmStreamingEnabled) {
          chat.setLogs((prev: any[]) => {
            const updated = [...prev];
            const streamIndex = updated.map((item, idx) => ({ item, idx })).reverse().find((x: any) => {
              const anyItem = x.item as any;
              return anyItem.type === 'agent' && anyItem.isStreaming && anyItem.streamId === currentStreamId;
            })?.idx;
            if (streamIndex !== undefined && streamIndex !== -1) {
              updated[streamIndex] = {
                ...updated[streamIndex],
                content: cleanResponse,
                thoughts: result.thought || (result as any).thoughts,
                isStreaming: false
              };
            } else {
              updated.push({
                type: 'agent',
                content: cleanResponse,
                timestamp: Date.now(),
                isSystem: false,
                thoughts: result.thought || (result as any).thoughts,
                isStreaming: false
              });
            }
            return updated;
          });
        } else {
          chat.addLog('agent', cleanResponse);
        }
        activeSessionLogs.add(normResponse);
      } else {
        if (s.llmStreamingEnabled) {
          chat.setLogs((prev: any[]) => {
            const updated = [...prev];
            const streamIndex = updated.map((item, idx) => ({ item, idx })).reverse().find((x: any) => {
              const anyItem = x.item as any;
              return anyItem.type === 'agent' && anyItem.isStreaming && anyItem.streamId === currentStreamId;
            })?.idx;
            if (streamIndex !== undefined && streamIndex !== -1) {
              const computedThoughts = result.thought || (result as any).thoughts;
              if (computedThoughts) {
                updated[streamIndex] = {
                  ...updated[streamIndex],
                  content: "",
                  thoughts: computedThoughts,
                  isStreaming: false
                };
              } else {
                updated.splice(streamIndex, 1);
              }
            }
            return updated;
          });
        }
      }

      if (result.logs && result.logs.length > 0) {
        chat.setBackgroundLogs((prev: any[]) => {
          const updated = [...prev];
          result.logs.forEach((log: string) => {
            const trimmedLog = log.trim();
            if (!trimmedLog) return;
            const isDuplicate = updated.slice(-30).some((l: any) => l.content === trimmedLog);
            if (!isDuplicate) {
              updated.push({
                type: 'agent',
                content: trimmedLog,
                timestamp: Date.now(),
                isSystem: true
              });
            }
          });
          return updated.slice(-150);
        });
      }

      s.setState((prev: any) => ({
        ...prev,
        status: 'idle',
        mood: updatedMood,
        emotion: updatedEmotion,
        relation: updatedRelation,
        currentPlan: result.updatedPlan || prev.currentPlan,
        systemHealth: {
          ...prev.systemHealth,
          ...result.systemHealth,
          latency,
          successRate: ((prev.systemHealth.successRate * prev.systemHealth.tasksCompleted) + 100) / (prev.systemHealth.tasksCompleted + 1),
          tasksCompleted: prev.systemHealth.tasksCompleted + 1
        }
      }));

      const newMemoriesCount = updatedMemories.length - s.memoriesAtLastDream;
      if (result.shouldStartDreaming || newMemoriesCount >= s.DREAM_THRESHOLD) {
        handleDream(updatedMemories);
      }

      if (updatedMemories.length % s.LEARNING_THRESHOLD === 0) {
        handleOptimize();
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log("[SYSTEM] Active thinking session aborted successfully.");
        if (s.llmStreamingEnabled) {
          chat.setLogs((prev: any[]) => prev.filter((log: any) => {
            return log.streamId !== currentStreamId || log.content.trim() !== '';
          }));
        }
        return;
      }

      if (s.llmStreamingEnabled) {
        chat.setLogs((prev: any[]) => prev.filter((log: any) => {
          return log.streamId !== currentStreamId || log.content.trim() !== '';
        }));
      }

      console.error("Neural Think Failure:", error);
      let errorMsg = error instanceof Error ? error.message : String(error);

      if (errorMsg === 'Failed to fetch' || errorMsg.includes('Network Error')) {
        errorMsg = 'Neural Link Interrupted. The Yuihime server might be rebooting or under heavy load. Retrying in 5 seconds...';
      }

      chat.addLog('agent', `[SYSTEM] Neural sync failed: ${errorMsg.substring(0, 150)}.`);

      const errorMetric: any = {
        operation: 'think',
        latency: Date.now() - startTime,
        success: false,
        timestamp: Date.now(),
        context: userMessage.substring(0, 50)
      };
      await StorageService.logPerformance(errorMetric);
      s.setMetricsHistory((prev: any[]) => [...prev, errorMetric]);

      s.setState((prev: any) => ({
        ...prev,
        status: 'idle',
        mood: Soul.updateMood(s.state.mood, { stress: 15, irritation: 5 }),
        systemHealth: {
          ...prev.systemHealth,
          successRate: (prev.systemHealth.successRate * prev.systemHealth.tasksCompleted) / (prev.systemHealth.tasksCompleted + 1),
          tasksCompleted: prev.systemHealth.tasksCompleted + 1
        }
      }));
    } finally {
      s.setIsThinking(false);
      s.isProcessingRef.current = false;
      s.activeThinkControllerRef.current = null;
    }
  };

  return {
    handleBatchAction,
    setIdentity,
    handleRestoreProfile,
    initialize,
    handleLogout,
    simulateStreamEvent,
    handleOptimize,
    triggerSystemSignal,
    handleDream,
    handleSimulateLive,
    handleConsolidate,
    handleExtractKnowledge,
    handleSaveTags,
    handleReflect,
    handleReplay,
    handleAvatarUpdate,
    handleSetActivePersonaId,
    handleSetCurrentLiveTopic,
    handleThink,
    loadData
  } as AppHandlers;
}
