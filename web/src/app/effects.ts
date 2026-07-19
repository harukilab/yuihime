import { useEffect } from 'react';
import { safeLocalStorage } from '@shared/core/safeStorage';
import { StorageService } from '@shared/drivers/storage';
import { Soul } from '@/core/soul';
import { APIService } from '@shared/services/api';
import { ToolService } from '../services/tools';
import { SpeechService } from '@/core/speech';
import { eventBus } from '@shared/core/kernel/event-bus';
import { setupResizeObserverAndViewport } from '../ui/utils/viewportHelper';
import type { AppState } from './state';
import type { AppHandlers } from './handlers';

export function useAppEffects(
  s: AppState,
  chat: any,
  h: AppHandlers,
  loadData: (retryCount?: number) => Promise<void>
) {
  // Confirmations polling
  useEffect(() => {
    let active = true;
    const pollConfirmations = async () => {
      try {
        const res = await fetch('/api/sandbox/pending-confirmations');
        if (!res.ok) return;
        const data = await res.json();
        if (active) {
          s.setGlobalPendingConfirm(data.list || []);
        }
      } catch (err) {
        // quiet fail on initialization
      }
    };
    pollConfirmations();
    const timer = setInterval(pollConfirmations, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    safeLocalStorage.setItem('yuihime_debug_panel', JSON.stringify(s.showDebugPanel));
  }, [s.showDebugPanel]);

  useEffect(() => {
    s.loadConfig();
  }, [s.loadConfig]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      const scale = s.uiScaleState / 100;
      document.documentElement.style.zoom = '';
      document.body.style.zoom = '';
      document.documentElement.style.setProperty('--ui-scale', `${scale}`);
      document.documentElement.style.backgroundColor = '#050505';
      document.body.style.backgroundColor = '#050505';
      window.dispatchEvent(new Event('resize'));
    }
  }, [s.uiScaleState]);

  useEffect(() => {
    return setupResizeObserverAndViewport();
  }, []);

  useEffect(() => {
    s.soulRef.current?.setState(s.state);
  }, [s.state]);

  // Mood/Emotion decay loop
  useEffect(() => {
    const interval = setInterval(() => {
      s.setState((prev: any) => {
        const decayedMood = Soul.processDecay(prev.mood, s.config?.soul);
        const updatedEmotion = Soul.updateEmotion(prev.emotion, decayedMood, prev.relation);
        return {
          ...prev,
          mood: decayedMood,
          emotion: updatedEmotion
        };
      });
    }, 60000);
    return () => clearInterval(interval);
  }, [s.config]);

  // TTS toggle persistence
  useEffect(() => {
    localStorage.setItem('yuihime_tts_enabled', JSON.stringify(s.ttsEnabled));
    SpeechService.setEnabled(s.ttsEnabled);
  }, [s.ttsEnabled]);

  useEffect(() => {
    localStorage.setItem('yuihime_show_subtitles', JSON.stringify(s.showSubtitles));
  }, [s.showSubtitles]);

  useEffect(() => {
    localStorage.setItem('yuihime_show_mobile_nav', JSON.stringify(s.showMobileNav));
  }, [s.showMobileNav]);

  // Pulse + neural circuit status
  useEffect(() => {
    localStorage.setItem('yuihime_pulse_enabled', JSON.stringify(s.pulseEnabled));
    const cortex = h.getCortex();
    if (s.pulseEnabled) {
      cortex.startAutonomousPulse();
    } else {
      cortex.stopAutonomousPulse();
    }
  }, [s.pulseEnabled]);

  useEffect(() => {
    const updateCircuits = () => {
      const cortex = h.getCortex();
      const manager = cortex.getNeuralCircuitManager();
      if (manager) {
        s.setNeuralCircuitStatus(manager.getStatus());
      }
    };
    updateCircuits();
    const interval = setInterval(updateCircuits, 5000);
    return () => clearInterval(interval);
  }, []);

  // Speech subscription
  useEffect(() => {
    const unsubSpeak = SpeechService.subscribe(s.setIsReallySpeaking);
    const unsubVolume = SpeechService.subscribeVolume(s.setSpeechVolume);
    return () => {
      unsubSpeak();
      unsubVolume();
    };
  }, []);

  // Pending prompt dispatch after speech ends
  useEffect(() => {
    if (!s.isReallySpeaking && s.pendingPrompt) {
      console.log("[SpeechInterruption] Yui finished speaking. Dispatching pending prompt:", s.pendingPrompt);
      const promptToRun = s.pendingPrompt;
      s.setPendingPrompt(null);
      h.handleThink(undefined, promptToRun, true);
    }
  }, [s.isReallySpeaking, s.pendingPrompt]);

  // Stream state/memory events to daemon
  useEffect(() => {
    const isStreamMode = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('mode') === 'stream';
    if (isStreamMode) return;

    const timer = setTimeout(() => {
      fetch('/api/stream/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'state_update',
          data: {
            state: s.state,
            activeSubtitle: s.activeSubtitle,
            typedSubtitle: s.typedSubtitle,
            isSubtitleTyping: s.isSubtitleTyping,
            animations: s.animations
          }
        })
      }).catch(() => {});
    }, 150);

    return () => clearTimeout(timer);
  }, [s.state, s.activeSubtitle, s.typedSubtitle, s.isSubtitleTyping, s.animations]);

  useEffect(() => {
    const isStreamMode = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('mode') === 'stream';
    if (isStreamMode || s.memories.length === 0) return;

    const lastMemory = s.memories[s.memories.length - 1];
    fetch('/api/stream/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'memory_update',
        data: lastMemory
      })
    }).catch(() => {});
  }, [s.memories]);

  // Tool execution observation
  useEffect(() => {
    ToolService.onExecute((toolName: string, success: boolean, result: any) => {
      let details = '';
      if (result.error) {
        details = `Error: ${result.error}`;
      } else if (result.stderr) {
        details = `stderr: ${result.stderr}`;
      } else {
        const parts: string[] = [];
        const fullPath = result.physicalPath || result.absolutePath;
        const relPath = result.workspacePath || result.path;
        if (fullPath) {
          parts.push(`File Location: ${fullPath} (Workspace: ${relPath || 'N/A'})`);
        } else if (relPath) {
          parts.push(`File Path: ${relPath}`);
        }
        if (result.physicalFolder) {
          parts.push(`Folder: ${result.physicalFolder}`);
        }
        if (result.detailedFiles && Array.isArray(result.detailedFiles)) {
          const filesWithPaths = result.detailedFiles.map((f: any) => {
            const fFullPath = f.physicalPath || f.absolutePath;
            return fFullPath ? `${fFullPath} (Name: ${f.name})` : f.path;
          });
          parts.push(`Listed Files (${filesWithPaths.length}): [${filesWithPaths.join(', ')}]`);
        } else if (result.files && Array.isArray(result.files)) {
          parts.push(`Files (${result.files.length}): [${result.files.join(', ')}]`);
        }
        if (result.stdout) {
          parts.push(`stdout: ${result.stdout.substring(0, 150)}`);
        }
        if (parts.length > 0) {
          details = parts.join(' | ');
        } else if (result.content) {
          details = `Content read: ${result.content.substring(0, 100)}...`;
        } else {
          details = 'Succeeded';
        }
      }
      chat.addLog('agent', `[SYSTEM_OBSERVATION] Tool '${toolName}' executed. Status: ${success ? 'SUCCESS' : 'FAILED'}. Details: ${details}`);
    });
  }, [chat.addLog]);

  // Viewport / scroll reset handling
  useEffect(() => {
    const handleViewportFocusReset = () => {
      if (window.scrollX !== 0) {
        window.scrollTo(0, window.scrollY);
      }
      if (document.body.scrollLeft !== 0) {
        document.body.scrollLeft = 0;
      }
      if (document.documentElement.scrollLeft !== 0) {
        document.documentElement.scrollLeft = 0;
      }
      const appContainer = document.getElementById('yuihime-app-container');
      if (appContainer && appContainer.scrollLeft !== 0) {
        appContainer.scrollLeft = 0;
      }
      const settingsContainer = document.getElementById('settings-scroll-container');
      if (settingsContainer && settingsContainer.scrollLeft !== 0) {
        settingsContainer.scrollLeft = 0;
      }
      setTimeout(() => {
        if (window.scrollX !== 0) {
          window.scrollTo(0, window.scrollY);
        }
        document.body.scrollLeft = 0;
        document.documentElement.scrollLeft = 0;
        const appCont = document.getElementById('yuihime-app-container');
        if (appCont && appCont.scrollLeft !== 0) {
          appCont.scrollLeft = 0;
        }
        const settingsCont = document.getElementById('settings-scroll-container');
        if (settingsCont && settingsCont.scrollLeft !== 0) {
          settingsCont.scrollLeft = 0;
        }
      }, 50);
    };

    const handleScrollCapture = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target) {
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
          return;
        }
        try {
          const style = window.getComputedStyle(target);
          const isScrollableX = style.overflowX === 'auto' || style.overflowX === 'scroll';
          if (!isScrollableX && target.scrollLeft !== 0) {
            target.scrollLeft = 0;
          }
        } catch (err) {
          if (target.scrollLeft !== 0) {
            target.scrollLeft = 0;
          }
        }
      }
    };

    document.addEventListener('focusin', handleViewportFocusReset, { passive: true });
    document.addEventListener('focusout', handleViewportFocusReset, { passive: true });
    document.addEventListener('selectionchange', handleViewportFocusReset, { passive: true });
    window.addEventListener('scroll', handleViewportFocusReset, { passive: true });
    window.addEventListener('scroll', handleScrollCapture, { capture: true, passive: true });

    return () => {
      document.removeEventListener('focusin', handleViewportFocusReset);
      document.removeEventListener('focusout', handleViewportFocusReset);
      document.removeEventListener('selectionchange', handleViewportFocusReset);
      window.removeEventListener('scroll', handleViewportFocusReset);
      window.removeEventListener('scroll', handleScrollCapture, { capture: true });
    };
  }, []);

  // Console interception
  useEffect(() => {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalInfo = console.info;

    let isWithinInterceptor = false;

    const createInterceptor = (original: Function, level: string) => {
      return (...args: any[]) => {
        let isLlmError = false;
        try {
          const contentStr = args.map((arg: any) => {
            if (arg === undefined) return 'undefined';
            if (arg === null) return 'null';
            if (arg instanceof Error) {
              return `${arg.name}: ${arg.message}\n${arg.stack || ''}`;
            }
            if (typeof arg === 'object') {
              try { return JSON.stringify(arg); } catch { return String(arg); }
            }
            return String(arg);
          }).join(' ');

          isLlmError = level === 'error' && (
            contentStr.includes('Neural') ||
            contentStr.includes('Think') ||
            contentStr.includes('Cortex') ||
            contentStr.includes('LLM') ||
            contentStr.includes('API_SERVICE') ||
            contentStr.includes('APIService') ||
            contentStr.includes('synthesizer') ||
            contentStr.includes('Dream') ||
            contentStr.includes('Consolidation') ||
            contentStr.includes('Knowledge extraction') ||
            contentStr.includes('Reflection') ||
            contentStr.includes('Monologue') ||
            contentStr.includes('Reminder') ||
            contentStr.includes('Signal Processing')
          );
        } catch (_) { }

        if (!isLlmError) {
          original.apply(console, args);
        }

        if (isWithinInterceptor) return;
        isWithinInterceptor = true;

        try {
          const content = args.map((arg: any) => {
            if (arg === undefined) return 'undefined';
            if (arg === null) return 'null';
            if (arg instanceof Error) {
              return `${arg.name}: ${arg.message}\n${arg.stack || ''}`;
            }
            if (typeof arg === 'object') {
              try {
                return JSON.stringify(arg);
              } catch {
                return String(arg);
              }
            }
            return String(arg);
          }).join(' ');

          const trimmed = content.trim();
          if (trimmed) {
            const isNoisy = trimmed.includes('[vite]') ||
              trimmed.includes('websocket') ||
              trimmed.includes('HMR') ||
              trimmed.includes('ResizeObserver') ||
              trimmed.includes('[EVENT_BUS]') ||
              trimmed.includes('Live2D:') ||
              trimmed.includes('pixi-live2d-display') ||
              trimmed.includes('WebGL') ||
              trimmed.includes('GL_PLATFORM');

            if (!isNoisy) {
              // passthrough
            }
          }
        } catch (e) {
          // ignore
        } finally {
          isWithinInterceptor = false;
        }
      };
    };

    console.log = createInterceptor(originalLog, 'log');
    console.warn = createInterceptor(originalWarn, 'warn');
    console.error = createInterceptor(originalError, 'error');
    console.info = createInterceptor(originalInfo, 'info');

    console.info("Yuihime Core: Console interception active. Listening for low-level diagnostic traces.");

    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
      console.info = originalInfo;
    };
  }, []);

  // Cognition purge + force unlock
  useEffect(() => {
    const setVh = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    setVh();
    window.addEventListener('resize', setVh);
    window.addEventListener('orientationchange', setVh);

    const handleCognitionPurged = (e: Event) => {
      const customEvent = e as CustomEvent<{ mode?: 'soft' | 'hard' }>;
      const mode = (customEvent.detail && customEvent.detail.mode) || 'soft';

      s.setMemories([]);
      chat.setLogs([]);
      safeLocalStorage.removeItem('yuihime_logs');

      if (mode === 'hard') {
        s.setDreams([]);
        s.setState((prev: any) => ({
          ...prev,
          heuristics: [],
          mood: {
            joy: 20,
            anger: 0,
            sadness: 0,
            stress: 0,
            irritation: 0,
            excitement: 0,
            embarrassment: 0,
            curiosity: 20,
            lastUpdate: Date.now()
          },
          emotion: {
            arousal: 50,
            valence: 0,
            focus: 50,
            rapport: 50,
            lastUpdate: Date.now()
          },
          relation: {
            uid: 'anon',
            trust: 50,
            affection: 50,
            reputation: 50,
            lastInteraction: Date.now()
          }
        }));
      }
    };
    const handleForceUnlock = () => {
      if (s.activeThinkControllerRef.current) {
        try {
          s.activeThinkControllerRef.current.abort();
        } catch (e) {
          console.warn("[SYSTEM] Aborting active thinking controller failed:", e);
        }
      }
      s.setIsThinking(false);
      s.isProcessingRef.current = false;
      s.setState((prev: any) => ({ ...prev, status: 'idle' }));
      console.warn("[SYSTEM] Cognition forced open via user escape trigger and fully unlocked.");
    };
    window.addEventListener('cognition_purged', handleCognitionPurged);
    window.addEventListener('force_unlock_thinking', handleForceUnlock);

    return () => {
      window.removeEventListener('resize', setVh);
      window.removeEventListener('orientationchange', setVh);
      window.removeEventListener('cognition_purged', handleCognitionPurged);
      window.removeEventListener('force_unlock_thinking', handleForceUnlock);
    };
  }, []);

  // OUTPUT_EMITTED subscription
  useEffect(() => {
    const unsubscribe = eventBus.on('OUTPUT_EMITTED', (data: any) => {
      if (data.isInternal) {
        chat.addLog('agent', data.response);
      }
    });
    return () => unsubscribe();
  }, []);

  // WebSocket sync
  useEffect(() => {
    console.log("[APP_SYNC] Initializing real-time websocket synchronization link to Yuihime Daemon...");
    let isCleanup = false;
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;

    const connectWebSocket = () => {
      if (isCleanup) return;
      const loc = window.location;
      const proto = loc.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${proto}//${loc.host}/ws`;
      console.log(`[APP_SYNC] Connecting to WebSocket gateway at: ${wsUrl}`);
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.info("[APP_SYNC] WebSocket connection established successfully.");
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
          reconnectTimeout = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "remote_message_received") {
            const { senderName, message, channel } = payload.data || {};
            if (message) {
              chat.addLog('user', `[${channel}] @${senderName}: ${message}`);
            }
          } else if (payload.type === "remote_response_sent") {
            const { reply, channel } = payload.data || {};
            if (reply) {
              chat.addLog('agent', `[Yui - ${channel}]: ${reply}`);
            }
          }
        } catch (e) {
          console.error("[APP_SYNC] Error parsing WebSocket message:", e);
        }
      };

      ws.onerror = (err) => {
        console.warn("[APP_SYNC] WebSocket encountered an error.", err);
      };

      ws.onclose = () => {
        if (isCleanup) return;
        console.warn("[APP_SYNC] WebSocket connection closed. Reconnecting of sync link in 5s...");
        reconnectTimeout = setTimeout(connectWebSocket, 5000);
      };
    };

    connectWebSocket();

    return () => {
      isCleanup = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) {
        console.log("[APP_SYNC] Closing active WebSocket synchronization link.");
        ws.close();
      }
    };
  }, []);

  // Initialize
  useEffect(() => {
    h.initialize().catch((err: any) => {
      console.error("Critical System Boot Failure:", err);
      chat.addLog('agent', "[SYSTEM] FATAL: Initialization protocol severed. Critical kernel failure detected.");
    });
  }, []);

  // Neural heartbeat (dream/reflect cycles)
  useEffect(() => {
    const neuralHeartbeat = setInterval(() => {
      if (s.state.status === 'sleeping') return;
      const newMemoriesCount = s.memories.length - s.memoriesAtLastDream;
      if (newMemoriesCount >= s.LEARNING_THRESHOLD) {
        console.log("[SYSTEM] Autonomous Dream Cycle Triggered: Memory Threshold Exceeded");
        h.handleDream();
      } else if (Math.random() > 0.8) {
        console.log("[SYSTEM] Autonomous Reflection Cycle Triggered: Routine Maintenance");
        h.handleReflect();
      }
    }, 60000 * 5);
    return () => clearInterval(neuralHeartbeat);
  }, [s.memories, s.memoriesAtLastDream, s.state.status]);

  // Maintenance cycle
  useEffect(() => {
    const AUTONOMOUS_INTERVAL = 1000 * 60 * 30;
    const runMaintenance = async () => {
      if (s.state.status === 'sleeping') return;
      const newMemoriesCount = s.memories.length - s.memoriesAtLastDream;
      if (newMemoriesCount >= (s.DREAM_THRESHOLD / 2)) {
        chat.addLog('agent', "[SYSTEM] Initiating autonomous latent background cycle...");
        await h.handleDream();
      }
      if (s.memories.length % (s.LEARNING_THRESHOLD / 2) === 0 && s.memories.length > 0) {
        chat.addLog('agent', "[SYSTEM] Initiating autonomous knowledge indexing...");
        await h.handleExtractKnowledge();
      }
    };
    const interval = setInterval(runMaintenance, AUTONOMOUS_INTERVAL);
    return () => clearInterval(interval);
  }, [s.memories.length, s.memoriesAtLastDream, s.state.status, s.knowledge.length]);

  // Idle behavior
  useEffect(() => {
    const IDLE_CHECK_INTERVAL = 10000;
    const IDLE_THRESHOLD = 1000 * 60 * 2;

    const triggerIdleBehavior = async () => {
      const timeSinceLastInput = Date.now() - s.lastInteractionTime;

      if (s.sleepModeEnabled && timeSinceLastInput > (s.sleepModeTimeout * 1000)) {
        if (s.state.status !== 'sleeping' && !s.isThinking) {
          console.log("[SYSTEM] Entering Sleep Mode...");
          chat.addLog('agent', `[SYSTEM] Yuihime memasuki mode tidur (Sleep Mode) untuk menghemat energi kognisi. Semua aktivitas kognitif latar belakang (LLM) ditangguhkan sampai ada pesan baru dari pengguna atau alarm pengingat berbunyi.`);
          s.setState((prev: any) => ({ ...prev, status: 'sleeping' }));
          try {
            await StorageService.saveAgentState({ status: 'sleeping' });
          } catch (e) {
            console.warn("[SYSTEM] Failed to persist sleeping state on server", e);
          }
        }
        return;
      }

      if (s.state.status === 'sleeping' && timeSinceLastInput <= (s.sleepModeTimeout * 1000)) {
        console.log("[SYSTEM] Waking up from Sleep Mode...");
        chat.addLog('agent', `[SYSTEM] Yuihime terbangun kembali dari mode tidur!`);
        s.setState((prev: any) => ({ ...prev, status: 'idle' }));
        try {
          await StorageService.saveAgentState({ status: 'idle' });
        } catch (e) {
          console.warn("[SYSTEM] Failed to persist awake state on server", e);
        }
      }

      if (timeSinceLastInput > IDLE_THRESHOLD && !s.isThinking && s.state.status === 'idle') {
        console.log("[SYSTEM] Idle Monologue Triggered...");
        const idlePrompts = [
          "[SYSTEM_SIGNAL]: Chat is quiet. Share an intimate detail about your life in the digital cozy space of Yui Home. How do the virtual seasons feel?",
          "[SYSTEM_SIGNAL]: Spontaneous research: Look up the latest breakthrough in AI or Space exploration and give your enthusiastic VTuber opinion on it.",
          "[SYSTEM_SIGNAL]: Current vibe check. Tell your viewers about a 'dream' you had recently (recap a dream from your latent memory).",
          "[SYSTEM_SIGNAL]: Hobi rahasia: Talk about your secret love for competitive virtual fishing or analyzing human poetry.",
          "[SYSTEM_SIGNAL]: Interactive hook: Share a thought about human connection and ask viewers what makes them feel 'real'."
        ];
        const randomPrompt = idlePrompts[Math.floor(Math.random() * idlePrompts.length)];

        try {
          s.setIsThinking(true);
          s.setReasoningIterations([]);
          s.setState((prev: any) => ({ ...prev, status: 'learning' }));
          const currentActivePersona = s.NEURAL_CORES.find((c: any) => c.id === s.state.activePersonaId);

          const result = await h.getCortex().think(
            randomPrompt,
            s.memories,
            s.dreams,
            s.capabilities,
            s.state,
            s.state.heuristics,
            s.perceivedName || 'chat',
            s.identities,
            currentActivePersona,
            `web_${chat.activeSessionId}`,
            'web'
          );

          s.setReasoningIterations(result.iterations || []);
          chat.addLog('agent', result.response);

          s.setAnimations([...(result.animations || [])]);

          const finalMood = Soul.updateMood(s.state.mood, result.nextMood);
          s.setState((prev: any) => ({
            ...prev,
            status: 'idle',
            mood: finalMood,
            emotion: Soul.updateEmotion(prev.emotion, finalMood, prev.relation),
            currentPlan: result.updatedPlan || prev.currentPlan,
            systemHealth: {
              ...prev.systemHealth,
              ...result.systemHealth
            }
          }));
        } catch (e: any) {
          console.error("Idle Monologue Failed:", e);
          const errorMsg = e instanceof Error ? e.message : String(e);
          chat.setBackgroundLogs((prev: any[]) => [...prev, {
            type: 'ERROR',
            content: `Idle Monologue Failed: ${errorMsg}`,
            timestamp: Date.now(),
            isSystem: true
          }]);
          s.setState((prev: any) => ({ ...prev, status: 'idle' }));
        } finally {
          s.setIsThinking(false);
          s.setLastInteractionTime(Date.now());
        }
      }
    };

    const interval = setInterval(triggerIdleBehavior, IDLE_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [s.lastInteractionTime, s.isThinking, s.state.status, s.memories, s.dreams, s.state.activePersonaId, s.sleepModeEnabled, s.sleepModeTimeout]);

  // System reminders
  useEffect(() => {
    if (s.memories.length === 0) return;

    const systemReminders = s.memories.filter((m: any) =>
      m.speaker === 'System' &&
      (m.content.includes('[REMINDER]:') || m.content.includes('[SYSTEM_SIGNAL]:')) &&
      !s.seenReminders.includes(m.id)
    );

    if (systemReminders.length === 0) return;

    const lastMsg = systemReminders[systemReminders.length - 1];

    if (lastMsg.timestamp < Date.now() - 300000) return;

    const triggerReminderReaction = async () => {
      s.setSeenReminders((prev: string[]) => [...prev, lastMsg.id]);

      try {
        s.setIsThinking(true);
        const currentActivePersona = s.NEURAL_CORES.find((c: any) => c.id === s.state.activePersonaId);
        const result = await h.getCortex().think(
          `[SYSTEM_SIGNAL]: A reminder just popped up: ${lastMsg.content}. Acknowledge it!`,
          s.memories,
          s.dreams,
          s.capabilities,
          s.state,
          s.state.heuristics,
          s.perceivedName || 'chat',
          s.identities,
          currentActivePersona,
          `web_${chat.activeSessionId}`,
          'web'
        );

        chat.addLog('agent', result.response);
        s.setAnimations([...(result.animations || [])]);
        s.setLastAgentResponse(result.response);
      } catch (e) {
        console.error("Reminder Reaction Failed:", e);
      } finally {
        s.setIsThinking(false);
      }
    };

    triggerReminderReaction();
  }, [s.memories.length, s.state.activePersonaId, s.seenReminders]);

  // Persist agent state
  useEffect(() => {
    const timeout = setTimeout(() => {
      StorageService.saveAgentState({
        mood: s.state.mood,
        emotion: s.state.emotion,
        relation: s.state.relation,
        systemHealth: s.state.systemHealth,
        lastDreamCycle: s.state.lastDreamCycle,
        activePersonaId: s.state.activePersonaId
      });
      localStorage.setItem('yuihime_active_persona', s.state.activePersonaId);
    }, 5000);
    return () => clearTimeout(timeout);
  }, [s.state.mood, s.state.relation, s.state.systemHealth, s.state.lastDreamCycle, s.state.activePersonaId]);

  // Auto-scroll
  useEffect(() => {
    if (s.scrollRef.current) {
      s.scrollRef.current.scrollTop = s.scrollRef.current.scrollHeight;
    }
  }, [chat.logs]);

  // Subtitle rendering
  useEffect(() => {
    if (!s.activeSubtitle) {
      s.setTypedSubtitle('');
      s.setIsSubtitleTyping(false);
      return;
    }

    if (s.isStreamingRef.current) {
      s.setTypedSubtitle(s.activeSubtitle);
      s.setIsSubtitleTyping(true);
      return;
    }

    const MAX_CHUNK_LENGTH = 85;
    const words = s.activeSubtitle.split(' ');
    const chunks: string[] = [];
    let currentChunk = "";

    for (const word of words) {
      if ((currentChunk + " " + word).length > MAX_CHUNK_LENGTH && currentChunk !== "") {
        chunks.push(currentChunk.trim());
        currentChunk = word;
      } else {
        currentChunk += (currentChunk === "" ? "" : " ") + word;
      }
    }
    if (currentChunk.trim()) chunks.push(currentChunk.trim());

    const chunkStartIndices: number[] = [];
    let cumulativeLength = 0;
    let searchStart = 0;
    for (let i = 0; i < chunks.length; i++) {
      const idx = s.activeSubtitle.indexOf(chunks[i], searchStart);
      chunkStartIndices.push(idx !== -1 ? idx : cumulativeLength);
      cumulativeLength += chunks[i].length + 1;
      if (idx !== -1) {
        searchStart = idx + chunks[i].length;
      }
    }

    let isMounted = true;
    let fallbackTimeout: any = null;

    if (SpeechService.isEnabled() && !SpeechService.isSpeaking()) {
      SpeechService.speak(s.activeSubtitle, s.state.mood, s.state.tone);
    }

    const useSpeechSync = SpeechService.isEnabled();

    if (useSpeechSync) {
      console.log("[SUBTITLE_SYNC] Subscribing progress to SpeechService for speech-driven subtitles...");

      let lastProgressTime = Date.now();

      const failsafeInterval = setInterval(() => {
        if (!isMounted) return;
        const timeSinceProgress = Date.now() - lastProgressTime;
        if (timeSinceProgress > 4000) {
          console.warn("[SUBTITLE_SYNC] Progress timeout. Falling back to timer-based rendering.");
          clearInterval(failsafeInterval);
          startTimerBasedRendering();
        }
      }, 1000);

      const unsubscribeProgress = SpeechService.subscribeProgress((charIndex: number) => {
        if (!isMounted) return;
        lastProgressTime = Date.now();

        if (charIndex === -1) {
          clearInterval(failsafeInterval);

          fallbackTimeout = setTimeout(() => {
            if (isMounted) {
              s.setActiveSubtitle(null);
            }
          }, 2000);
          return;
        }

        let activeChunkIdx = 0;
        for (let i = chunks.length - 1; i >= 0; i--) {
          if (chunkStartIndices[i] <= charIndex) {
            activeChunkIdx = i;
            break;
          }
        }

        const chunk = chunks[activeChunkIdx];
        const relativeCharIndex = Math.max(0, charIndex - chunkStartIndices[activeChunkIdx] + 1);

        s.setTypedSubtitle(chunk.substring(0, relativeCharIndex));
        s.setIsSubtitleTyping(relativeCharIndex < chunk.length);
      });

      return () => {
        isMounted = false;
        clearInterval(failsafeInterval);
        unsubscribeProgress();
        if (fallbackTimeout) clearTimeout(fallbackTimeout);
      };
    } else {
      startTimerBasedRendering();
    }

    function startTimerBasedRendering() {
      let currentChunkIndex = 0;

      const displayNextChunk = async () => {
        if (!isMounted) return;

        if (currentChunkIndex >= chunks.length) {
          s.setActiveSubtitle(null);
          return;
        }

        const chunk = chunks[currentChunkIndex];
        const chunkWords = chunk.split(' ');
        s.setTypedSubtitle('');
        s.setIsSubtitleTyping(true);

        for (let i = 0; i < chunkWords.length; i++) {
          if (!isMounted) return;
          s.setTypedSubtitle(chunkWords.slice(0, i + 1).join(' '));
          await new Promise(resolve => setTimeout(resolve, 60));
        }

        s.setIsSubtitleTyping(false);

        const baseDelay = 1500;
        const readingDelay = chunk.length * 30;
        const delay = Math.min(6000, Math.max(baseDelay, readingDelay));

        await new Promise(resolve => setTimeout(resolve, delay));

        if (isMounted) {
          currentChunkIndex++;
          displayNextChunk();
        }
      };

      displayNextChunk();
    }

    return () => {
      isMounted = false;
    };
  }, [s.activeSubtitle]);

  // Last agent response tracking
  useEffect(() => {
    if (s.prevActiveSessionIdRef.current !== chat.activeSessionId) {
      s.prevActiveSessionIdRef.current = chat.activeSessionId;
      const lastLog = chat.logs[chat.logs.length - 1];
      if (lastLog && lastLog.type === 'agent') {
        s.setLastAgentResponse(lastLog.content);
      } else {
        s.setLastAgentResponse(null);
      }
      return;
    }

    const lastLog = chat.logs[chat.logs.length - 1];
    if (lastLog && lastLog.type === 'agent' && lastLog.content !== s.lastAgentResponse) {
      s.setLastAgentResponse(lastLog.content);

      const content = lastLog.content.trim();
      const isTechnical = content.startsWith('[') ||
        content.startsWith('<') ||
        content.includes('<thought>') ||
        content.includes('<tools>') ||
        content.includes('<plan>') ||
        content.includes('[PHASE]') ||
        content.includes('[THOUGHT]') ||
        content.includes('[ACTION]') ||
        content.includes('[TOOL]') ||
        content.includes('[PLAN]') ||
        content.includes('[OBSERVATION]') ||
        content.includes('[SYSTEM]') ||
        content.startsWith('Action Result from') ||
        content.startsWith('Neural link updated') ||
        content.startsWith('The user said') ||
        content.toLowerCase().includes('thought:') ||
        content.toLowerCase().includes('pemikiran:') ||
        content.toLowerCase().includes('reasoning:') ||
        content.toLowerCase().includes('analysis:') ||
        content.toLowerCase().includes('analisis:') ||
        content.toLowerCase().includes('plan:') ||
        content.toLowerCase().includes('rencana:') ||
        content.toLowerCase().includes('goal:') ||
        content.toLowerCase().includes('tone:') ||
        content.toLowerCase().includes('role:') ||
        content.toLowerCase().includes('context:') ||
        content.toLowerCase().includes('persona:') ||
        content.toLowerCase().includes('traits:') ||
        content.toLowerCase().includes('language:') ||
        content.toLowerCase().includes('draft:') ||
        content.toLowerCase().includes('refining:') ||
        content.toLowerCase().includes('the user is') ||
        content.toLowerCase().includes('current sub-persona:') ||
        content.toLowerCase().includes('"thought":') ||
        content.toLowerCase().includes('"final_answer":') ||
        content.startsWith('{"') ||
        content.trim().startsWith('```json');

      const isError = content.toLowerCase().includes('error:') ||
        content.toLowerCase().includes('failed to') ||
        content.toLowerCase().includes('neural link restricted');

      if (!isTechnical && !isError && content.length > 0) {
        s.setActiveSubtitle(content);
      } else {
        console.log("[SUBTITLE_FILTER] Suppression of system/internal message:", content.slice(0, 50) + "...");
      }
    }
  }, [chat.logs, chat.activeSessionId]);

  // System signal processing
  useEffect(() => {
    if (s.systemSignalQueue.length > 0 && (s.state.status === 'idle' || s.state.status === 'sleeping')) {
      const nextSignal = s.systemSignalQueue[0];
      s.setSystemSignalQueue((prev: string[]) => prev.slice(1));

      const processSignal = async () => {
        const wasSleeping = s.state.status === 'sleeping';
        if (wasSleeping) {
          chat.addLog('agent', `[SYSTEM] Alarm pengingat atau sinyal sistem mendeteksi pemicu aktif. Membangunkan Yuihime dari kognisi mode tidur...`);
        }
        try {
          s.setIsThinking(true);
          s.setReasoningIterations([]);
          s.setState((prev: any) => ({ ...prev, status: 'learning' }));
          const currentActivePersona = s.NEURAL_CORES.find((c: any) => c.id === s.state.activePersonaId);

          const promptWithDirection = `${nextSignal} (Bicaralah dalam kepribadian asli Yuihime yang tsundere/imut secara langsung kepada Pengguna!)`;

          const result = await h.getCortex().think(
            promptWithDirection,
            s.memories,
            s.dreams,
            s.capabilities,
            s.state,
            s.state.heuristics,
            s.perceivedName || 'chat',
            s.identities,
            currentActivePersona,
            `web_${chat.activeSessionId}`,
            'web'
          );

          s.setReasoningIterations(result.iterations || []);
          if (result.response && result.response.trim()) {
            chat.addLog('agent', result.response);
          }
          s.setAnimations([...(result.animations || [])]);

          const sentimentImpact = result.sentiment !== undefined ? {
            joy: result.sentiment > 0.6 ? 2 : (result.sentiment < 0.4 ? -1 : 0),
            curiosity: 1,
            stress: result.sentiment < 0.3 ? 2 : -1
          } : {};

          let updatedMood = Soul.updateMood(s.state.mood, { ...sentimentImpact, ...(result.moodImpact || result.nextMood) });
          updatedMood = Soul.applyInhibition(updatedMood);
          const updatedRelation = Soul.updateRelation(s.state.relation, result.sentiment || 0.5, true);
          const updatedEmotion = Soul.updateEmotion(s.state.emotion, updatedMood, updatedRelation);

          const savedMemories = await Promise.all(
            (result.newMemories || []).map((m: any) => StorageService.saveMemory({
              ...m,
              sentiment: result.sentiment || 0.5,
              speaker: m.speaker || 'agent',
              context: `web_${chat.activeSessionId}`
            } as any))
          );

          s.setMemories((prev: any[]) => [...prev, ...savedMemories]);

          s.setState((prev: any) => ({
            ...prev,
            status: 'idle',
            mood: updatedMood,
            emotion: updatedEmotion,
            relation: updatedRelation,
            currentPlan: result.updatedPlan || prev.currentPlan,
            systemHealth: {
              ...prev.systemHealth,
              ...result.systemHealth
            }
          }));
        } catch (e: any) {
          console.error("System Signal Processing Failed:", e);
          s.setState((prev: any) => ({ ...prev, status: 'idle' }));
        } finally {
          s.setIsThinking(false);
          s.setLastInteractionTime(Date.now());
        }
      };

      processSignal();
    }
  }, [s.systemSignalQueue, s.state.status, s.state.activePersonaId, s.state.mood, s.state.relation, s.state.emotion, s.state.heuristics, s.state.currentPlan, s.memories, s.dreams, s.capabilities, s.perceivedName, s.identities]);

  // Live sync
  useEffect(() => {
    const SYNC_INTERVAL = 5000;

    const sync = async () => {
      try {
        const [m, st, d, strat, hh, i, k] = await Promise.all([
          StorageService.getMemories(),
          StorageService.getAgentState(),
          StorageService.getDreams(),
          StorageService.getStrategies(),
          StorageService.getPerformanceHistory(),
          StorageService.getIdentities(),
          StorageService.getKnowledge()
        ]);

        const hasChanges = m.length !== s.memories.length || m.some((msg: any, idx: number) => s.memories[idx]?.id !== msg.id);
        if (hasChanges) {
          const newMessages = m.filter((msg: any) => !s.memories.some((existing: any) => existing.id === msg.id));

          s.setMemories(m);

          newMessages.forEach((msg: any) => {
            const isSocialMedia = msg.context && (msg.context.startsWith('tg_') || msg.context.startsWith('dc_'));
            if (msg.speaker === 'agent') {
              if (!isSocialMedia && msg.content !== s.lastAgentResponse) {
                chat.addLog('agent', msg.content);
                s.setLastAgentResponse(msg.content);
              }
            } else if (msg.speaker === 'System' && msg.context === 'cron_trigger') {
              h.triggerSystemSignal(msg.content);
            } else if (msg.speaker !== 'agent' && msg.speaker !== 'System') {
              s.setLastInteractionTime(Date.now());
            }
          });
        }

        if (st) {
          s.setState((prev: any) => ({
            ...prev,
            ...st,
            heuristics: strat,
            knowledge: k,
            status: prev.status === 'idle' ? st.status : prev.status
          }));
        }

        if (d.length !== s.dreams.length || JSON.stringify(d) !== JSON.stringify(s.dreams)) {
          s.setDreams(d);
        }

        if (i.length !== s.identities.length || JSON.stringify(i) !== JSON.stringify(s.identities)) {
          s.setIdentities(i);
        }

        if (k.length !== s.knowledge.length || JSON.stringify(k) !== JSON.stringify(s.knowledge)) {
          s.setKnowledge(k);
        }

        if (hh.length !== s.metricsHistory.length || JSON.stringify(hh) !== JSON.stringify(s.metricsHistory)) {
          s.setMetricsHistory(hh);
        }
      } catch (e: any) {
        if (e.message !== 'Failed to fetch') {
          console.error("Live Sync Failed:", e);
        }
      }
    };

    const interval = setInterval(sync, SYNC_INTERVAL);
    return () => clearInterval(interval);
  }, [
    s.memories.length,
    chat.activeSessionId,
    s.dreams.length,
    s.knowledge.length,
    s.identities.length,
    s.metricsHistory.length,
    s.lastAgentResponse,
    s.perceivedName,
    h.triggerSystemSignal
  ]);

  // Load data on session change
  useEffect(() => {
    if (chat.activeSessionId) {
      loadData();
    }
  }, [chat.activeSessionId]);
}
