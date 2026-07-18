/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Brain, Database, Cloud, Zap, Terminal, Activity, Cpu, Search, Settings, Plus, RefreshCw, Sparkles, LogIn, LogOut, User, Eye, EyeOff, Trash2, X, ChevronRight, ShieldAlert, BookOpen, Volume2, Tag, Check, Edit2, Monitor, History, Share2, Clock } from 'lucide-react';
import { DEFAULT_PROVIDER_OPTIONS, DEFAULT_NEURAL_CORES } from './constants';
import { StorageService } from './drivers/storage';
import { Memory, Dream, APICapability, AgentState, MoodState, EmotionType, LearnedStrategy, PerformanceMetric, Identity, AvatarConfig, CoreKnowledge, AgentPersona, ProviderConfig, ChatSession } from './include/types';
import { Soul } from './core/soul';
import { Cortex } from './core/cortex';
import { Consolidator } from './core/consolidator';
import { DreamEngine } from './core/dream';
import { LearningEngine } from './core/learning';
import { LiveModeratorModule } from './modules/LiveModeratorModule';
import { VTuberAvatar } from './ui/VTuberAvatar';
import { KnowledgeGraph } from './ui/KnowledgeGraph';
import { TaskPlanner } from './ui/TaskPlanner';
import { StreamOverlay } from './ui/StreamOverlay';
import { StageTab } from './ui/StageTab';
import { ModularSettings } from './ui/ModularSettings';
import { SpeechService } from './core/speech';
import { APIService } from './services/api';
import { ToolService } from './services/tools';
import { safeLocalStorage } from './core/safeStorage';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { SystemRegistry } from './core/registry';
import { initializeCortexModules } from './core/RegistryInitializer';

import { KnowledgeTab } from './ui/KnowledgeTab';
import { ArchiveTab } from './ui/ArchiveTab';
import { MemoryTab } from './ui/MemoryTab';
import { DreamsTab } from './ui/DreamsTab';
import { HeuristicsTab } from './ui/HeuristicsTab';
import { IdentitiesTab } from './ui/IdentitiesTab';
import { ReflectTab } from './ui/ReflectTab';
import { NeuralBackdrop } from './ui/NeuralBackdrop';
import { AdaptiveMatrix } from './ui/AdaptiveMatrix';
import { BugReportBoundary } from './ui/BugReportBoundary';

import { eventBus } from './core/kernel/event-bus';
import { PuterAdapter } from './core/adapters/PuterAdapter';
import { useChatSessions } from './ui/hooks/useChatSessions';
import { TabRegistry } from './ui/tabsRegistry';

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
import { setupResizeObserverAndViewport } from './ui/utils/viewportHelper';

export default function App() {
  const [config, setConfig] = useState<any>(null);
  const [globalPendingConfirm, setGlobalPendingConfirm] = useState<any[]>([]);

  useEffect(() => {
    let active = true;
    const pollConfirmations = async () => {
      try {
        const res = await fetch('/api/sandbox/pending-confirmations');
        if (!res.ok) return;
        const data = await res.json();
        if (active) {
          setGlobalPendingConfirm(data.list || []);
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

  const handleBatchAction = async (status: 'approved' | 'denied') => {
    try {
      await fetch('/api/sandbox/pending-confirmations/batch/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      setGlobalPendingConfirm([]);
    } catch (err) {
      console.error("Failed to run batch action:", err);
    }
  };

  const cortexRef = useRef<Cortex | null>(null);
  const soulRef = useRef<Soul | null>(null);
  const isStreamingRef = useRef(false);
  const isProcessingRef = useRef(false);
  const prevActiveSessionIdRef = useRef<string | null>(null);

  const [showDebugPanel, setShowDebugPanel] = useState(() => safeLocalStorage.parseJSON('yuihime_debug_panel', false));

  useEffect(() => {
    safeLocalStorage.setItem('yuihime_debug_panel', JSON.stringify(showDebugPanel));
  }, [showDebugPanel]);

  const [uiScaleState, setUiScaleState] = useState<number>(100);

  const loadConfig = useCallback(async () => {
    const cfg = await StorageService.getConfig();
    if (cfg) setConfig(cfg);

    try {
      const serverSettings = await StorageService.getModularSettings();
      if (serverSettings && serverSettings.uiScale !== undefined) {
        setUiScaleState(Number(serverSettings.uiScale));
      }
    } catch (err) {
      console.warn("[SYSTEM] Error reading custom uiScale on loadConfig:", err);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      const scale = uiScaleState / 100;
      
      
      document.documentElement.style.zoom = '';
      document.body.style.zoom = '';
      
      document.documentElement.style.setProperty('--ui-scale', `${scale}`);
      document.documentElement.style.backgroundColor = '#050505';
      document.body.style.backgroundColor = '#050505';
      
      
      window.dispatchEvent(new Event('resize'));
    }
  }, [uiScaleState]);

  const getCortex = () => {
    if (!cortexRef.current) cortexRef.current = new Cortex();
    if (config) cortexRef.current.setConfig(config);
    return cortexRef.current;
  };

  const DREAM_THRESHOLD = config?.agent?.dreamThreshold || 5;
  const LEARNING_THRESHOLD = config?.agent?.learningThreshold || 10;
  const [user, setUser] = useState<{ uid: string } | null>({ uid: 'local_user' });
  useEffect(() => {
    return setupResizeObserverAndViewport();
  }, []);

  const [perceivedName, setPerceivedName] = useState<string>(() => safeLocalStorage.getItem('yuihime_perceived_name') || 'user');
  const [authReady, setAuthReady] = useState(true);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<any[]>([]);
  const [showSystemLogs, setShowSystemLogs] = useState(false);
  const {
    sessions,
    setSessions,
    activeSessionId,
    setActiveSessionId,
    logs,
    setLogs,
    backgroundLogs,
    setBackgroundLogs,
    addLog,
    addLogDirect,
    handleSwitchSession,
    handleCreateSession,
    handleDeleteSession
  } = useChatSessions();

  useEffect(() => {
    ToolService.onExecute((toolName, success, result) => {
      let details = '';
      if (result.error) {
        details = `Error: ${result.error}`;
      } else if (result.stderr) {
        details = `stderr: ${result.stderr}`;
      } else {
        const parts: string[] = [];
        
        // Check for full paths
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

        // If listFiles or similar tool, parse files or detailedFiles
        if (result.detailedFiles && Array.isArray(result.detailedFiles)) {
          const filesWithPaths = result.detailedFiles.map(f => {
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

      addLog('agent', `[SYSTEM_OBSERVATION] Tool '${toolName}' executed. Status: ${success ? 'SUCCESS' : 'FAILED'}. Details: ${details}`);
    });
  }, [addLog]);

  const [activeSubtitle, setActiveSubtitle] = useState<string | null>(null);
  const [typedSubtitle, setTypedSubtitle] = useState('');
  const [isSubtitleTyping, setIsSubtitleTyping] = useState(false);
  const [lastAgentResponse, setLastAgentResponse] = useState<string | null>(() => {
    const historicalLogs = safeLocalStorage.parseJSON('yuihime_logs', []);
    const agentLogs = historicalLogs.filter((l: any) => l.type === 'agent');
    return agentLogs.length > 0 ? agentLogs[agentLogs.length - 1].content : null;
  });
  const [avatarConfig, setAvatarConfigState] = useState<AvatarConfig>({ 
    modelUrl: '/models/hiyori/hiyori_free_t08.model3.json',
    scale: 1,
    xOffset: 0,
    yOffset: 0
  });
  const [memories, setMemories] = useState<Memory[]>([]);
  const [dreams, setDreams] = useState<Dream[]>([]);
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
      
      setMemories([]);
      
      
      setLogs([]);
      safeLocalStorage.removeItem('yuihime_logs');
      
      if (mode === 'hard') {
        setDreams([]);
        setState(prev => ({
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
      if (activeThinkControllerRef.current) {
        try {
          activeThinkControllerRef.current.abort();
        } catch (e) {
          console.warn("[SYSTEM] Aborting active thinking controller failed:", e);
        }
      }
      setThinkingCount(0);
      isProcessingRef.current = false;
      setState(prev => ({ ...prev, status: 'idle' }));
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
          const contentStr = args.map(arg => {
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
        } catch (_) {}

        if (!isLlmError) {
          original.apply(console, args);
        }

        if (isWithinInterceptor) return;
        isWithinInterceptor = true;

        try {
          const content = args.map(arg => {
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
              
            }
          }
        } catch (e) {
          
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

  const [identities, setIdentities] = useState<Identity[]>([]);
  const [capabilities, setCapabilities] = useState<APICapability[]>([]);
  const [knowledge, setKnowledge] = useState<CoreKnowledge[]>([]);
  const [metricsHistory, setMetricsHistory] = useState<PerformanceMetric[]>([]);
  const [editingTagsMemoryId, setEditingTagsMemoryId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [memorySearchQuery, setMemorySearchQuery] = useState('');
  const [systemSignalQueue, setSystemSignalQueue] = useState<string[]>([]);
  const [state, setState] = useState<AgentState>({
    status: 'idle',
    energy: 100,
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
    activePersonaId: safeLocalStorage.getItem('yuihime_active_persona') || 'hiyori',
    relation: {
      uid: 'anon',
      trust: 50,
      affection: 50,
      reputation: 50,
      lastInteraction: Date.now()
    },
    activeContext: [],
    lastDreamCycle: Date.now(),
    heuristics: [],
    knowledge: [],
    tone: {
      pitch: 1.0,
      speed: 1.0,
      emotionalBias: 'neutral'
    },
    systemHealth: {
      latency: 0,
      successRate: 100,
      tasksCompleted: 0
    }
  });

  useEffect(() => {
    if (soulRef.current) {
      soulRef.current.setState(state);
    }
  }, [state]);

  
  useEffect(() => {
    const interval = setInterval(() => {
      setState(prev => {
        const decayedMood = Soul.processDecay(prev.mood, config?.soul);
        const updatedEmotion = Soul.updateEmotion(prev.emotion, decayedMood, prev.relation);
        return {
          ...prev,
          mood: decayedMood,
          emotion: updatedEmotion
        };
      });
    }, 60000); 
    return () => clearInterval(interval);
  }, [config]);
  const [ttsEnabled, setTtsEnabled] = useState(() => safeLocalStorage.parseJSON('yuihime_tts_enabled', true));
  const [showSubtitles, setShowSubtitles] = useState(() => safeLocalStorage.parseJSON('yuihime_show_subtitles', false));
  const [showMobileNav, setShowMobileNav] = useState(() => safeLocalStorage.parseJSON('yuihime_show_mobile_nav', true));
  const [showChatFeed, setShowChatFeed] = useState(() => safeLocalStorage.parseJSON('yuihime_show_chat_feed', true));
  const [showInfoCard, setShowInfoCard] = useState(() => safeLocalStorage.parseJSON('yuihime_show_info_card', false));
  const [isMicEnabled, setIsMicEnabled] = useState(() => safeLocalStorage.parseJSON('yuihime_is_mic_enabled', false));
  const [isSleeping, setIsSleepingState] = useState(() => safeLocalStorage.parseJSON('yuihime_ui_sleeping', false));

  const setIsSleeping = useCallback((val: boolean) => {
    setIsSleepingState(val);
    localStorage.setItem('yuihime_ui_sleeping', String(val));
    if (val) {
      setState(prev => ({ ...prev, status: 'sleeping' }));
    } else {
      setState(prev => ({ ...prev, status: 'idle' }));
    }
  }, []);

  const [speechInterruptionMode, setSpeechInterruptionModeState] = useState<'interrupt' | 'manual'>(() => {
    return (localStorage.getItem('yuihime_speech_interruption_mode') as 'interrupt' | 'manual') || 'manual';
  });

  const setSpeechInterruptionMode = useCallback((mode: 'interrupt' | 'manual') => {
    setSpeechInterruptionModeState(mode);
    localStorage.setItem('yuihime_speech_interruption_mode', mode);
  }, []);

  const [memoriesAtLastDream, setMemoriesAtLastDream] = useState(0);
  const [activeTab, setActiveTab] = useState<string>('stage');
  const [avatarOnInConsole, setAvatarOnInConsole] = useState(false);
  const [thinkingCount, setThinkingCount] = useState(0);
  const isThinking = thinkingCount > 0;
  const setIsThinking = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    setThinkingCount(prev => {
      if (typeof val === 'function') {
        const result = val(prev > 0);
        return result ? prev + 1 : Math.max(0, prev - 1);
      }
      return val ? prev + 1 : Math.max(0, prev - 1);
    });
  }, []);
  const [pulseEnabled, setPulseEnabled] = useState(() => safeLocalStorage.parseJSON('yuihime_pulse_enabled', true));
  const [neuralCircuitStatus, setNeuralCircuitStatus] = useState<any[]>([]);

  useEffect(() => {
    localStorage.setItem('yuihime_pulse_enabled', JSON.stringify(pulseEnabled));
    const cortex = getCortex();
    if (pulseEnabled) {
      cortex.startAutonomousPulse();
    } else {
      cortex.stopAutonomousPulse();
    }
  }, [pulseEnabled]);

  
  useEffect(() => {
    const updateCircuits = () => {
      const cortex = getCortex();
      const manager = cortex.getNeuralCircuitManager();
      if (manager) {
        setNeuralCircuitStatus(manager.getStatus());
      }
    };

    updateCircuits();
    const interval = setInterval(updateCircuits, 5000);
    return () => clearInterval(interval);
  }, []);
  const [isLearning, setIsLearning] = useState(false);
  const [animations, setAnimations] = useState<string[]>([]);
  const [isReallySpeaking, setIsReallySpeaking] = useState(false);
  const [speechVolume, setSpeechVolume] = useState(0);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  
  useEffect(() => {
    const unsubSpeak = SpeechService.subscribe(setIsReallySpeaking);
    const unsubVolume = SpeechService.subscribeVolume(setSpeechVolume);
    return () => {
      unsubSpeak();
      unsubVolume();
    };
  }, []);

  
  useEffect(() => {
    if (!isReallySpeaking && pendingPrompt) {
      console.log("[SpeechInterruption] Yui finished speaking. Dispatching pending prompt:", pendingPrompt);
      const promptToRun = pendingPrompt;
      setPendingPrompt(null);
      handleThink(undefined, promptToRun, true);
    }
  }, [isReallySpeaking, pendingPrompt]);
  const [reasoningIterations, setReasoningIterations] = useState<any[]>([]);
  const [streamEvents, setStreamEvents] = useState<any[]>([]);
  const [lastInteractionTime, setLastInteractionTime] = useState(Date.now());
  const [sleepModeEnabled, setSleepModeEnabled] = useState(true);
  const [llmStreamingEnabled, setLlmStreamingEnabled] = useState(() => {
    return safeLocalStorage.parseJSON('yuihime_llm_streaming_enabled', true);
  });
  const activeThinkControllerRef = useRef<AbortController | null>(null);
  const [sleepModeTimeout, setSleepModeTimeout] = useState(300); 
  const [aiConfig, setAiConfigState] = useState<ProviderConfig>({ 
    provider: '', 
    model: '', 
    apiKey: '',
    systemPrompt: 'You are Yuihime, a fully living, autonomous, highly expressive virtual VTuber girl, endowed with authentic human feelings. Always reply in character using responsive animations and natural dialogue. Strictly output ONLY valid JSON. No markdown formatting. No preamble or post-script text. Failure to follow this format will result in a processing error.',
    temperature: 0.7,
    topP: 0.95,
    topK: 40,
    maxTokens: 65536
  });
  const [keyVisible, setKeyVisible] = useState(false);
  const [editingCapability, setEditingCapability] = useState<APICapability | null>(null);
  const [newEndpoint, setNewEndpoint] = useState<any>({
    path: '',
    method: 'GET',
    description: '',
    parameters: []
  });

  const PROVIDER_OPTIONS = config?.providers || DEFAULT_PROVIDER_OPTIONS;
  const NEURAL_CORES = config?.neuralCores || DEFAULT_NEURAL_CORES;

  const activePersona = NEURAL_CORES.find((c: any) => c.id === state.activePersonaId) || NEURAL_CORES[1];

  const currentProvider = PROVIDER_OPTIONS.find(p => p.id === aiConfig.provider) || PROVIDER_OPTIONS[0];

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('yuihime_tts_enabled', JSON.stringify(ttsEnabled));
    SpeechService.setEnabled(ttsEnabled);
  }, [ttsEnabled]);

  useEffect(() => {
    localStorage.setItem('yuihime_show_subtitles', JSON.stringify(showSubtitles));
  }, [showSubtitles]);

  useEffect(() => {
    localStorage.setItem('yuihime_show_mobile_nav', JSON.stringify(showMobileNav));
  }, [showMobileNav]);

  
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
            state,
            activeSubtitle,
            typedSubtitle,
            isSubtitleTyping,
            animations
          }
        })
      }).catch(() => {});
    }, 150); 

    return () => clearTimeout(timer);
  }, [state, activeSubtitle, typedSubtitle, isSubtitleTyping, animations]);

  useEffect(() => {
    const isStreamMode = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('mode') === 'stream';
    if (isStreamMode || memories.length === 0) return;

    const lastMemory = memories[memories.length - 1];
    fetch('/api/stream/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'memory_update',
        data: lastMemory
      })
    }).catch(() => {});
  }, [memories]);

  const setIdentity = (name: string) => {
    setPerceivedName(name);
    localStorage.setItem('yuihime_perceived_name', name);
    addLog('agent', `[SYSTEM] Neural link updated: Subject identified as <${name}>.`);
  };

  const handleRestoreProfile = (name: string, sessionId: string) => {
    setPerceivedName(name);
    safeLocalStorage.setItem('yuihime_perceived_name', name);
    
    let updatedSessions = [...sessions];
    const sessionExists = sessions.some(s => s.id === sessionId);
    
    if (!sessionExists) {
      const newSess: ChatSession = {
        id: sessionId,
        title: `Sesi ${name}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        logs: []
      };
      updatedSessions = [newSess, ...sessions];
      setSessions(updatedSessions);
      safeLocalStorage.setItem('yuihime_chat_sessions', JSON.stringify(updatedSessions));
      StorageService.saveCustom('yuihime_chat_sessions', updatedSessions);
    }
    
    setActiveSessionId(sessionId);
    safeLocalStorage.setItem('yuihime_active_session_id', sessionId);
    
    const targetSession = updatedSessions.find(s => s.id === sessionId);
    if (targetSession) {
      setLogs(targetSession.logs || []);
    } else {
      setLogs([]);
    }
    
    addLog('agent', `[SYSTEM] Profil terenkripsi berhasil dimuat! Sesi: ${sessionId}, Subjek: ${name}.`);
  };

  const initialize = async () => {
    SpeechService.init();
    SpeechService.setEnabled(ttsEnabled);
    
    
    await initializeCortexModules();

    
    try {
      const serverSettings = await StorageService.getModularSettings();
      const currentConfig = await StorageService.getAIConfig();
      const currentAvatar = await StorageService.getAvatarConfig();
      
      (globalThis as any).puterTools = [];
      
      if (serverSettings && serverSettings.uiScale !== undefined) {
        setUiScaleState(Number(serverSettings.uiScale));
      }

      if (serverSettings && serverSettings.gemini) {
        const updatedConfig = {
          ...currentConfig,
          apiKey: serverSettings.gemini.apiKey || currentConfig.apiKey,
          model: serverSettings.gemini.model || currentConfig.model
        };
        await StorageService.setAIConfig(updatedConfig);
        setAiConfigState(updatedConfig);
        console.log("[SYSTEM] Neural configuration synced from Kernel persistence.");
      } else {
        setAiConfigState(currentConfig);
      }

      if (serverSettings && serverSettings.avatar) {
        await StorageService.setAvatarConfig(serverSettings.avatar);
        setAvatarConfigState(serverSettings.avatar);
      } else {
        setAvatarConfigState(currentAvatar);
      }

      if (serverSettings && serverSettings['emotion-engine-v04']) {
        const eeConfig = serverSettings['emotion-engine-v04'];
        if (eeConfig.enableSleepMode !== undefined) setSleepModeEnabled(!!eeConfig.enableSleepMode);
        if (eeConfig.sleepModeTimeout !== undefined) setSleepModeTimeout(Number(eeConfig.sleepModeTimeout));
      }

      if (serverSettings && serverSettings.developer) {
        if (serverSettings.developer.enableStreaming !== undefined) {
          const streamingVal = !!serverSettings.developer.enableStreaming;
          setLlmStreamingEnabled(streamingVal);
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
      setState(prev => {
        const merged: AgentState = {
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

    
    const soulInstance = new Soul(state);
    soulRef.current = soulInstance;
    
    
    soulInstance.onUpdate((newState) => {
      setState(newState);
    });

    const cortex = getCortex();
    cortex.setSoul(soulInstance);
    console.log("[SYSTEM] Neural link established: Soul synchronized with Cortex.");

    
    // No-op heartbeat
  };

  useEffect(() => {
    
    const unsubscribe = eventBus.on('OUTPUT_EMITTED', (data: any) => {
      if (data.isInternal) {
        addLog('agent', data.response);
      }
    });

    return () => unsubscribe();
  }, []);

  
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
              addLog('user', `[${channel}] @${senderName}: ${message}`);
            }
          } else if (payload.type === "remote_response_sent") {
            const { reply, channel } = payload.data || {};
            if (reply) {
              addLog('agent', `[Yui - ${channel}]: ${reply}`);
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

  useEffect(() => {
    initialize().catch(err => {
      console.error("Critical System Boot Failure:", err);
      addLog('agent', "[SYSTEM] FATAL: Initialization protocol severed. Critical kernel failure detected.");
    });

    
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

  
  useEffect(() => {
    const neuralHeartbeat = setInterval(() => {
      if (state.status === 'sleeping') return;

      
      const newMemoriesCount = memories.length - memoriesAtLastDream;
      if (newMemoriesCount >= LEARNING_THRESHOLD) {
        console.log("[SYSTEM] Autonomous Dream Cycle Triggered: Memory Threshold Exceeded");
        handleDream();
      } 
      
      else if (Math.random() > 0.8) { 
         console.log("[SYSTEM] Autonomous Reflection Cycle Triggered: Routine Maintenance");
         handleReflect();
      }
    }, 60000 * 5); 

    return () => clearInterval(neuralHeartbeat);
  }, [memories, memoriesAtLastDream, state.status]);

  const handleLogout = async () => {
    setPerceivedName('');
    localStorage.removeItem('yuihime_perceived_name');
    window.location.reload();
  };

  
  useEffect(() => {
    const AUTONOMOUS_INTERVAL = 1000 * 60 * 30; 
    
    const runMaintenance = async () => {
      if (state.status === 'sleeping') return;
      
      const newMemoriesCount = memories.length - memoriesAtLastDream;
      
      
      if (newMemoriesCount >= (DREAM_THRESHOLD / 2)) {
        addLog('agent', "[SYSTEM] Initiating autonomous latent background cycle...");
        await handleDream();
      }
      
      
      if (memories.length % (LEARNING_THRESHOLD / 2) === 0 && memories.length > 0) {
        addLog('agent', "[SYSTEM] Initiating autonomous knowledge indexing...");
        await handleExtractKnowledge();
      }
    };

    const interval = setInterval(runMaintenance, AUTONOMOUS_INTERVAL);
    return () => clearInterval(interval);
  }, [memories.length, memoriesAtLastDream, state.status, knowledge.length]);

  
  useEffect(() => {
    const IDLE_CHECK_INTERVAL = 10000; 
    const IDLE_THRESHOLD = 1000 * 60 * 2; 
    
    const triggerIdleBehavior = async () => {
      const timeSinceLastInput = Date.now() - lastInteractionTime;

      
      if (sleepModeEnabled && timeSinceLastInput > (sleepModeTimeout * 1000)) {
        if (state.status !== 'sleeping' && !isThinking) {
          console.log("[SYSTEM] Entering Sleep Mode...");
          addLog('agent', `[SYSTEM] Yuihime memasuki mode tidur (Sleep Mode) untuk menghemat energi kognisi. Semua aktivitas kognitif latar belakang (LLM) ditangguhkan sampai ada pesan baru dari pengguna atau alarm pengingat berbunyi.`);
          setState(prev => ({ ...prev, status: 'sleeping' }));
          
          try {
            await StorageService.saveAgentState({ status: 'sleeping' });
          } catch (e) {
            console.warn("[SYSTEM] Failed to persist sleeping state on server", e);
          }
        }
        return; 
      }

      
      if (state.status === 'sleeping' && timeSinceLastInput <= (sleepModeTimeout * 1000)) {
        console.log("[SYSTEM] Waking up from Sleep Mode...");
        addLog('agent', `[SYSTEM] Yuihime terbangun kembali dari mode tidur!`);
        setState(prev => ({ ...prev, status: 'idle' }));
        try {
          await StorageService.saveAgentState({ status: 'idle' });
        } catch (e) {
          console.warn("[SYSTEM] Failed to persist awake state on server", e);
        }
      }
      
      
      if (timeSinceLastInput > IDLE_THRESHOLD && !isThinking && state.status === 'idle') {
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
          setIsThinking(true);
          setReasoningIterations([]);
          setState(prev => ({ ...prev, status: 'learning' }));
          const currentActivePersona = NEURAL_CORES.find((c: any) => c.id === state.activePersonaId);
          
          const result = await getCortex().think(
            randomPrompt,
            memories,
            dreams,
            capabilities,
            state,
            state.heuristics,
            perceivedName || 'chat',
            identities,
            currentActivePersona,
            `web_${activeSessionId}`,
            'web'
          );
          const puterCompatibleResult = PuterAdapter.adaptCortexToPuter(result);
          
          setReasoningIterations(result.iterations || []);
          addLog('agent', puterCompatibleResult.response);
          
          setAnimations([...(puterCompatibleResult.animations || [])]);

          const finalMood = Soul.updateMood(state.mood, result.nextMood);
          setState(prev => ({ 
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
          setBackgroundLogs(prev => [...prev, {
            type: 'ERROR',
            content: `Idle Monologue Failed: ${errorMsg}`,
            timestamp: Date.now(),
            isSystem: true
          }]);
          setState(prev => ({ ...prev, status: 'idle' }));
        } finally {
          setIsThinking(false);
          
          setLastInteractionTime(Date.now());
        }
      }
    };

    const interval = setInterval(triggerIdleBehavior, IDLE_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [lastInteractionTime, isThinking, state.status, memories, dreams, state.activePersonaId, sleepModeEnabled, sleepModeTimeout]);

  const [seenReminders, setSeenReminders] = useState<string[]>([]);

  
  useEffect(() => {
    if (memories.length === 0) return;
    
    
    const systemReminders = memories.filter(m => 
      m.speaker === 'System' && 
      (m.content.includes('[REMINDER]:') || m.content.includes('[SYSTEM_SIGNAL]:')) &&
      !seenReminders.includes(m.id)
    );

    if (systemReminders.length === 0) return;
    
    const lastMsg = systemReminders[systemReminders.length - 1];
    
    
    if (lastMsg.timestamp < Date.now() - 300000) return;

    const triggerReminderReaction = async () => {
      setSeenReminders(prev => [...prev, lastMsg.id]);
      
      try {
        setIsThinking(true);
        const currentActivePersona = NEURAL_CORES.find((c: any) => c.id === state.activePersonaId);
        const result = await getCortex().think(
          `[SYSTEM_SIGNAL]: A reminder just popped up: ${lastMsg.content}. Acknowledge it!`,
          memories,
          dreams,
          capabilities,
          state,
          state.heuristics,
          perceivedName || 'chat',
          identities,
          currentActivePersona,
          `web_${activeSessionId}`,
          'web'
        );
        const puterCompatibleResult = PuterAdapter.adaptCortexToPuter(result);
        addLog('agent', puterCompatibleResult.response);
        setAnimations([...(puterCompatibleResult.animations || [])]);
        setLastAgentResponse(puterCompatibleResult.response);
      } catch (e) {
        console.error("Reminder Reaction Failed:", e);
      } finally {
        setIsThinking(false);
      }
    };
    
    triggerReminderReaction();
  }, [memories.length, state.activePersonaId, seenReminders]);

  
  useEffect(() => {
    const timeout = setTimeout(() => {
      StorageService.saveAgentState({
        mood: state.mood,
        emotion: state.emotion,
        relation: state.relation,
        systemHealth: state.systemHealth,
        lastDreamCycle: state.lastDreamCycle,
        activePersonaId: state.activePersonaId
      });
      localStorage.setItem('yuihime_active_persona', state.activePersonaId);
    }, 5000); 
    return () => clearTimeout(timeout);
  }, [state.mood, state.relation, state.systemHealth, state.lastDreamCycle, state.activePersonaId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  
  useEffect(() => {
    if (!activeSubtitle) {
      setTypedSubtitle('');
      setIsSubtitleTyping(false);
      return;
    }

    
    if (isStreamingRef.current) {
      setTypedSubtitle(activeSubtitle);
      setIsSubtitleTyping(true);
      return;
    }

    const MAX_CHUNK_LENGTH = 85; 
    const words = activeSubtitle.split(' ');
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
      const idx = activeSubtitle.indexOf(chunks[i], searchStart);
      chunkStartIndices.push(idx !== -1 ? idx : cumulativeLength);
      cumulativeLength += chunks[i].length + 1;
      if (idx !== -1) {
        searchStart = idx + chunks[i].length;
      }
    }

    let isMounted = true;
    let fallbackTimeout: any = null;

    
    if (SpeechService.isEnabled() && !SpeechService.isSpeaking()) {
       SpeechService.speak(activeSubtitle, state.mood, state.tone);
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

      const unsubscribeProgress = SpeechService.subscribeProgress((charIndex) => {
        if (!isMounted) return;
        lastProgressTime = Date.now();

        if (charIndex === -1) {
          clearInterval(failsafeInterval);
          
          fallbackTimeout = setTimeout(() => {
            if (isMounted) {
              setActiveSubtitle(null);
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
        
        setTypedSubtitle(chunk.substring(0, relativeCharIndex));
        setIsSubtitleTyping(relativeCharIndex < chunk.length);
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
          setActiveSubtitle(null);
          return;
        }

        const chunk = chunks[currentChunkIndex];
        const chunkWords = chunk.split(' ');
        setTypedSubtitle('');
        setIsSubtitleTyping(true);

        
        for (let i = 0; i < chunkWords.length; i++) {
          if (!isMounted) return;
          setTypedSubtitle(chunkWords.slice(0, i + 1).join(' '));
          await new Promise(resolve => setTimeout(resolve, 60)); 
        }

        setIsSubtitleTyping(false);
        
        
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
  }, [activeSubtitle]);

  
  useEffect(() => {
    if (prevActiveSessionIdRef.current !== activeSessionId) {
      // We just transitioned to a different conversation; update tracked response without speaking
      prevActiveSessionIdRef.current = activeSessionId;
      const lastLog = logs[logs.length - 1];
      if (lastLog && lastLog.type === 'agent') {
        setLastAgentResponse(lastLog.content);
      } else {
        setLastAgentResponse(null);
      }
      return;
    }

    const lastLog = logs[logs.length - 1];
    if (lastLog && lastLog.type === 'agent' && lastLog.content !== lastAgentResponse) {
      setLastAgentResponse(lastLog.content);
      
      
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
        setActiveSubtitle(content);
      } else {
        console.log("[SUBTITLE_FILTER] Suppression of system/internal message:", content.slice(0, 50) + "...");
      }
    }
  }, [logs, activeSessionId]);

  const triggerSystemSignal = useCallback((signal: string) => {
    setSystemSignalQueue(prev => {
      if (prev.includes(signal)) return prev;
      return [...prev, signal];
    });
  }, []);

  
  useEffect(() => {
    if (systemSignalQueue.length > 0 && (state.status === 'idle' || state.status === 'sleeping')) {
      const nextSignal = systemSignalQueue[0];
      setSystemSignalQueue(prev => prev.slice(1));
      
      const processSignal = async () => {
        const wasSleeping = state.status === 'sleeping';
        if (wasSleeping) {
          addLog('agent', `[SYSTEM] Alarm pengingat atau sinyal sistem mendeteksi pemicu aktif. Membangunkan Yuihime dari kognisi mode tidur...`);
        }
        try {
          setIsThinking(true);
          setReasoningIterations([]);
          setState(prev => ({ ...prev, status: 'learning' }));
          const currentActivePersona = NEURAL_CORES.find((c: any) => c.id === state.activePersonaId);
          
          const promptWithDirection = `${nextSignal} (Bicaralah dalam kepribadian asli Yuihime yang tsundere/imut secara langsung kepada Pengguna!)`;
          
          const result = await getCortex().think(
            promptWithDirection, 
            memories, 
            dreams, 
            capabilities, 
            state, 
            state.heuristics, 
            perceivedName || 'chat', 
            identities, 
            currentActivePersona,
            `web_${activeSessionId}`,
            'web'
          );
          const puterCompatibleResult = PuterAdapter.adaptCortexToPuter(result);
          
          setReasoningIterations(result.iterations || []);
          if (puterCompatibleResult.response && puterCompatibleResult.response.trim()) {
            addLog('agent', puterCompatibleResult.response);
          }
          setAnimations([...(puterCompatibleResult.animations || [])]);
          
          
          const sentimentImpact = result.sentiment !== undefined ? {
            joy: result.sentiment > 0.6 ? 2 : (result.sentiment < 0.4 ? -1 : 0),
            curiosity: 1,
            stress: result.sentiment < 0.3 ? 2 : -1
          } : {};
          
          let updatedMood = Soul.updateMood(state.mood, { ...sentimentImpact, ...(result.moodImpact || result.nextMood) });
          updatedMood = Soul.applyInhibition(updatedMood);
          const updatedRelation = Soul.updateRelation(state.relation, result.sentiment || 0.5, true);
          const updatedEmotion = Soul.updateEmotion(state.emotion, updatedMood, updatedRelation);
          
          
          const savedMemories = await Promise.all(
            (result.newMemories || []).map((m: any) => StorageService.saveMemory({ 
              ...m, 
              sentiment: result.sentiment || 0.5,
              speaker: m.speaker || 'agent',
              context: `web_${activeSessionId}`
            } as any))
          );
          
          setMemories(prev => [...prev, ...savedMemories]);
          
          setState(prev => ({ 
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
          setState(prev => ({ ...prev, status: 'idle' }));
        } finally {
          setIsThinking(false);
          setLastInteractionTime(Date.now());
        }
      };
      
      processSignal();
    }
  }, [systemSignalQueue, state.status, state.activePersonaId, state.mood, state.relation, state.emotion, state.heuristics, state.currentPlan, memories, dreams, capabilities, perceivedName, identities]);

  
  useEffect(() => {
    const SYNC_INTERVAL = 5000; 
    
    const sync = async () => {
      try {
        const [m, s, d, strat, h, i, k] = await Promise.all([
          StorageService.getMemories(),
          StorageService.getAgentState(),
          StorageService.getDreams(),
          StorageService.getStrategies(),
          StorageService.getPerformanceHistory(),
          StorageService.getIdentities(),
          StorageService.getKnowledge()
        ]);
        
        
        const hasChanges = m.length !== memories.length || m.some((msg, idx) => memories[idx]?.id !== msg.id);
        if (hasChanges) {
          
          const newMessages = m.filter(msg => !memories.some(existing => existing.id === msg.id));
          
          setMemories(m);
          
          newMessages.forEach(msg => {
            const isSocialMedia = msg.context && (msg.context.startsWith('tg_') || msg.context.startsWith('dc_'));
            if (msg.speaker === 'agent') {
              if (!isSocialMedia && msg.content !== lastAgentResponse) {
                addLog('agent', msg.content);
                setLastAgentResponse(msg.content);
              }
            } else if (msg.speaker === 'System' && msg.context === 'cron_trigger') {
              triggerSystemSignal(msg.content);
            } else if (msg.speaker !== 'agent' && msg.speaker !== 'System') {
              
              setLastInteractionTime(Date.now());
            }
          });
        }

        if (s) {
          setState(prev => ({
            ...prev,
            ...s,
            heuristics: strat,
            knowledge: k,
            status: prev.status === 'idle' ? s.status : prev.status 
          }));
        }

        if (d.length !== dreams.length || JSON.stringify(d) !== JSON.stringify(dreams)) {
          setDreams(d);
        }

        if (i.length !== identities.length || JSON.stringify(i) !== JSON.stringify(identities)) {
          setIdentities(i);
        }

        if (k.length !== knowledge.length || JSON.stringify(k) !== JSON.stringify(knowledge)) {
          setKnowledge(k);
        }

        if (h.length !== metricsHistory.length || JSON.stringify(h) !== JSON.stringify(metricsHistory)) {
          setMetricsHistory(h);
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
    memories.length,
    activeSessionId,
    dreams.length,
    knowledge.length,
    identities.length,
    metricsHistory.length,
    lastAgentResponse,
    perceivedName,
    triggerSystemSignal
  ]);

  const loadData = async (retryCount = 0) => {
    try {
      const [m, d, c, s, h, i, k] = await Promise.all([
        StorageService.getMemories(),
        StorageService.getDreams(),
        StorageService.getCapabilities(),
        StorageService.getStrategies(),
        StorageService.getPerformanceHistory(),
        StorageService.getIdentities(),
        StorageService.getKnowledge()
      ]);
      setMemories(m);
      setDreams(d);
      setIdentities(i);
      setCapabilities(c);
      setKnowledge(k);
      setMetricsHistory(h);
      setState(prev => ({ ...prev, heuristics: s, knowledge: k }));
      setMemoriesAtLastDream(m.length);
    } catch (error) {
       console.error("Initial data sync failed:", error);
       if (retryCount < 2) {
         addLog('agent', `[SYSTEM] Connection latency detected. Re-syncing neural buffer (Attempt ${retryCount + 1})...`);
         setTimeout(() => loadData(retryCount + 1), 2000);
       } else {
         addLog('agent', "[SYSTEM] FATAL: Collective mind sync failed. Neural link restricted to local volatile memory.");
       }
     }
  };

  
  useEffect(() => {
    if (activeSessionId) {
      loadData();
    }
  }, [activeSessionId]);

  const simulateStreamEvent = (type: 'DONATION' | 'SUBSCRIPTION' | 'RAID') => {
    const eventText = type === 'DONATION' ? 'Fan gifted $50.00' : `${type} received`;
    setInput(eventText);
    setTimeout(() => {
      const form = document.querySelector('form');
      if (form) form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    }, 100);
    
    setStreamEvents(prev => [{
      id: Math.random().toString(36).substr(2, 9),
      type,
      user: type === 'DONATION' ? 'SuperFan99' : 'NeonRaider',
      timestamp: Date.now()
    }, ...prev].slice(0, 5));
  };

  const handleOptimize = async () => {
    if (isLearning) return;
    setIsLearning(true);
    setState(prev => ({ ...prev, status: 'learning' }));
    try {
      const updated = await LearningEngine.optimize(getCortex(), memories, state);
      setState(prev => ({ ...prev, heuristics: updated }));
      addLog('agent', `[LEARNING_ENGINE] Cognitive routing optimized. ${updated.length} heuristics synced.`);
    } catch (error) {
      console.error("Optimization failed", error);
    } finally {
      setIsLearning(false);
      setState(prev => ({ ...prev, status: 'idle' }));
    }
  };

  const handleThink = async (e?: React.FormEvent, customOverrideText?: string, isDelayedRun?: boolean) => {
    if (e) e.preventDefault();
    const activeInput = customOverrideText !== undefined ? customOverrideText : input;
    if (!activeInput.trim()) return;

    const isSystemCommand = activeInput.trim().startsWith('/');

    
    const yuiIsSpeaking = isReallySpeaking || (SpeechService && typeof SpeechService.isSpeaking === 'function' && SpeechService.isSpeaking());

    if (!isSystemCommand && yuiIsSpeaking && speechInterruptionMode === 'manual') {
      const isStopWord = isCancellationPhrase(activeInput);
      if (isStopWord) {
        
        setPendingPrompt(null);
        if (SpeechService) {
          try { SpeechService.stop(); } catch (err) {}
        }
      } else {
        
        console.log("[SpeechInterruption] Manual Mode: Queueing user comment:", activeInput);
        if (!isDelayedRun) {
          addLog('user', activeInput);
          setInput('');
          setPendingPrompt(activeInput);
        }
        return; 
      }
    } else {
      
      if (!isSystemCommand && SpeechService) {
        try { SpeechService.stop(); } catch (err) {}
      }
    }

    if (activeInput.trim() === '/reset_cognition') {
      setInput('');
      addLog('user', '/reset_cognition');
      addLog('agent', "[SYSTEM] Menyegarkan memori percakapan batin... Mohon tunggu sebentar.");
      try {
        const success = await StorageService.purge('soft');
        if (success) {
          const nameToUse = perceivedName || 'user';
          addLog('agent', `[SYSTEM] Sukses! Riwayat obrolan sesaat telah disegarkan. Seluruh ingatan penting, mimpi, dan relasi cinta kepribadian Yui dengan ${nameToUse} tetap utuh.`);
          SpeechService.speak(`Sirkuit obrolanku sudah disegarkan dan kembali jernih, ${nameToUse}! Tenang saja, aku tidak melupakan ${nameToUse} kok~`);
          
          window.dispatchEvent(new CustomEvent('cognition_purged', { detail: { mode: 'soft' } }));
        } else {
          addLog('agent', "[SYSTEM] Gagal menyegarkan sirkuit obrolan.");
        }
      } catch (err: any) {
        addLog('agent', `[SYSTEM] Terjadi kesalahan: ${err.message || String(err)}`);
      }
      return;
    }

    if (activeInput.trim() === '/dream') {
      setInput('');
      handleDream();
      return;
    }
    
    if (activeInput.trim() === '/consolidate') {
      setInput('');
      addLog('agent', "[SYSTEM] Force-triggering Stage 1 Consolidation...");
      await Consolidator.run(getCortex(), memories);
      return;
    }

    const pairMatch = activeInput.trim().match(/^\/pair\s+(\d{6})/i) || 
                      activeInput.trim().match(/^pair\s+(\d{6})/i) ||
                      activeInput.trim().match(/^hubungkan\s+(\d{6})/i);
    if (pairMatch) {
      const code = pairMatch[1];
      setInput('');
      addLog('user', activeInput.trim());
      addLog('agent', `[SYSTEM] Memverifikasi kode penyandingan ${code}...`);
      try {
        const res = await fetch('/api/pair/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: code,
            perceivedName: perceivedName || 'Guest'
          })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          addLog('agent', `✨ Kognisi Terhubung! ${data.message}`);
          SpeechService.speak(`Kognisi kita sudah terhubung sepenuhnya, user ${perceivedName || 'Guest'}!`);
          window.dispatchEvent(new CustomEvent('pairing_status_updated'));
        } else {
          addLog('agent', `❌ Gagal: ${data.error || 'Kode salah atau kedaluwarsa.'}`);
        }
      } catch (err: any) {
        addLog('agent', `❌ Gagal menghubungi server batin Yui: ${err.message || String(err)}`);
      }
      return;
    }

    if (!authReady) {
      addLog('agent', "[SYSTEM] Synchronizing neural pathways... please wait.");
      return;
    }

    const normalizeForComparison = (str: string) => {
      return str.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    };

    const activeSessionLogs = new Set<string>(logs.map(l => normalizeForComparison(l.content)));

    if (isProcessingRef.current) {
      console.log("[CORTEX] Guard: already processing an input synchronously. Ignoring duplicate request.");
      return;
    }

    if (isThinking) {
      console.log("[CORTEX] Guard: currently thinking. Ignoring duplicate submission.");
      return;
    }

    isProcessingRef.current = true;

    const userMessage = activeInput;
    const currentAttachments = [...attachments];
    if (!isDelayedRun) {
      setInput('');
      setAttachments([]);
      addLog('user', userMessage);
      activeSessionLogs.add(normalizeForComparison(userMessage));
    }
    setLastInteractionTime(Date.now());
    const startTime = Date.now();
    const currentStreamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const controller = new AbortController();
    activeThinkControllerRef.current = controller;

    try {
      setIsThinking(true);
      setReasoningIterations([]);
      setState(prev => ({ ...prev, status: 'learning' }));
      if (llmStreamingEnabled) {
        setLogs(prev => {
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
        ownerId: user?.uid || 'anon',
        tags: ['user_input', perceivedName || 'anon'],
        speaker: perceivedName || 'chat',
        context: `web_${activeSessionId}`
      } as any);
      
      
      const currentMemories = [...memories, inputMemory];
      setMemories(currentMemories);

      const currentActivePersona = NEURAL_CORES.find((c: any) => c.id === state.activePersonaId);

      if (userMessage.toLowerCase().includes('neural sync failed') || userMessage.toLowerCase().includes('stress core')) {
        const stressAlert = "[SYSTEM] CRITICAL: Neural lattice desync detected. Initiating core stress procedure (Hiyori Default)...";
        addLog('agent', stressAlert);
        setState(prev => ({ 
          ...prev, 
          mood: { ...prev.mood, stress: Math.min(100, prev.mood.stress + 40) } 
        }));
      }

      isStreamingRef.current = llmStreamingEnabled;
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
            await SpeechService.speak(sentence, state.mood, state.tone);
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

      const result = await getCortex().think(
        processedMessageForCortex,
        currentMemories,
        dreams,
        capabilities,
        state,
        state.heuristics,
        perceivedName || 'chat',
        identities,
        currentActivePersona,
        `web_${activeSessionId}`,
        'web',
        undefined,
        currentAttachments,
        llmStreamingEnabled ? (chunkText: string) => {
          accumulatedResponse += chunkText;
          setActiveSubtitle(accumulatedResponse);
          feedToSpeakQueue(chunkText);
          
          setLogs(prev => {
            const updated = [...prev];
            const streamIndex = updated.map((item, idx) => ({ item, idx })).reverse().find(x => {
              const anyItem = x.item as any;
              return anyItem.type === 'agent' && anyItem.isStreaming && anyItem.streamId === currentStreamId;
            })?.idx;
            if (streamIndex !== undefined && streamIndex !== -1) {
              let processedContent = accumulatedResponse.trim();
              let thoughts: string | undefined = undefined;
              
              const isJsonFormat = processedContent.startsWith('{') || processedContent.includes('"thought') || processedContent.includes('"speech') || processedContent.includes('"final_answer');
              
              if (isJsonFormat) {
                
                const thoughtsRegex = /"(thoughts|thought)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g;
                let tMatch;
                while ((tMatch = thoughtsRegex.exec(processedContent)) !== null) {
                  try {
                    thoughts = JSON.parse(`"${tMatch[2]}"`);
                  } catch (e) {
                    thoughts = tMatch[2];
                  }
                }
                
                
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
                  processedContent = ""; 
                }
              } else {
                const thoughtMatch = processedContent.match(/<thought>([\s\S]*?)<\/thought>/i);
                if (thoughtMatch) {
                  thoughts = thoughtMatch[1].trim();
                }
                processedContent = processedContent.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
                processedContent = processedContent.replace(/<\/?final_answer>/gi, '').trim();
              }

              updated[streamIndex] = {
                ...updated[streamIndex],
                content: processedContent,
                thoughts
              };
            }
            return updated;
          });
        } : undefined,
        controller.signal
      );

      isStreamingRef.current = false;

      
      if (spokenBuffer.trim().length > 0) {
        sentenceQueue.push(spokenBuffer.trim());
        if (!isQueueProcessing) {
          speakNextInQueue();
        }
      }
      
      
      const puterCompatibleResult = PuterAdapter.adaptCortexToPuter(result);
      
      const latency = Date.now() - startTime;
      
      
      setReasoningIterations(result.iterations || []);
      
      
      if (result.perceivedNameUpdate && result.perceivedNameUpdate !== perceivedName) {
        setIdentity(result.perceivedNameUpdate);
      }

      if (result.viewerProfileUpdate || result.perceivedNameUpdate || result.linkedAccountUpdate) {
        const updates = result.linkedAccountUpdate ? (Array.isArray(result.linkedAccountUpdate) ? result.linkedAccountUpdate : [result.linkedAccountUpdate]) : [];
        const existingId = identities.find(id => {
          if (id.perceivedName === (result.perceivedNameUpdate || perceivedName)) return true;
          if (updates.some(up => (id.linkedAccounts || []).includes(up))) return true;
          return false;
        });

        const updatedId: Identity = existingId ? {
          ...existingId,
          ...result.viewerProfileUpdate,
          habits: [...(existingId.habits || []), ...(result.viewerProfileUpdate?.habits || [])].slice(-10),
          importantFacts: Array.from(new Set([...(existingId.importantFacts || []), ...(result.viewerProfileUpdate?.importantFacts || [])])),
          linkedAccounts: Array.from(new Set([...(existingId.linkedAccounts || []), ...(result.viewerProfileUpdate?.linkedAccounts || []), ...updates])),
          lastMet: Date.now()
        } : {
          id: Math.random().toString(36).substr(2, 9),
          ownerId: user?.uid || 'anon',
          perceivedName: result.perceivedNameUpdate || perceivedName || 'chat',
          source: 'live_stream',
          traits: [],
          habits: result.viewerProfileUpdate?.habits || [],
          importantFacts: result.viewerProfileUpdate?.importantFacts || [],
          linkedAccounts: updates,
          lastMet: Date.now(),
          ...result.viewerProfileUpdate
        };

        await StorageService.saveIdentity(updatedId);
        setIdentities(prev => {
          const filtered = prev.filter(p => p.id !== updatedId.id);
          return [...filtered, updatedId];
        });
      }
      
      
      const newMetric: PerformanceMetric = {
        operation: 'think',
        latency,
        success: true,
        timestamp: Date.now(),
        context: userMessage.substring(0, 50)
      };
      await StorageService.logPerformance(newMetric);
      setMetricsHistory(prev => [...prev, newMetric]);
      
      
      
      const sentimentImpact = result.sentiment !== undefined ? {
        joy: result.sentiment > 0.6 ? 2 : (result.sentiment < 0.4 ? -1 : 0),
        curiosity: 1,
        stress: result.sentiment < 0.3 ? 2 : -1
      } : {};
      
      let updatedMood = Soul.updateMood(state.mood, { ...sentimentImpact, ...(result.moodImpact || result.nextMood) });
      updatedMood = Soul.applyInhibition(updatedMood);
      const updatedRelation = Soul.updateRelation(state.relation, result.sentiment || 0.5, true);
      const updatedEmotion = Soul.updateEmotion(state.emotion, updatedMood, updatedRelation);
      
      
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
          context: `web_${activeSessionId}`
        } as any))
      );
      
      const updatedMemories = [...currentMemories, ...savedMemories];
      setMemories(updatedMemories);
      
      setAnimations([...(puterCompatibleResult.animations || [])]);
      setReasoningIterations(result.iterations || []);
      
      
      if (puterCompatibleResult.actions && puterCompatibleResult.actions.length > 0) {
        for (const action of puterCompatibleResult.actions) {
          console.log('[PUTER_ACTION]', action.type, action);
          
          if (action.type === 'message' && (globalThis as any).puter?.apps?.notify) {
            try {
              await (globalThis as any).puter.apps.notify({
                title: 'Yuihime',
                body: action.content,
                app_id: action.target
              });
            } catch (e) {
              console.warn('[PUTER] Notify failed:', e);
            }
          }
        }
      }
      
      
      if (result.actions && result.actions.length > 0) {
        addLog('agent', `[SYSTEM] Processing ${result.actions.length} external cognitive hooks...`);
        
        for (const action of result.actions) {
          const cap = capabilities.find(c => c.id === action.capabilityId);
          const endpoint = cap?.endpoints.find(e => e.path === action.endpointPath && e.method === action.method);
          
          if (cap && endpoint) {
            try {
              const apiResult = await APIService.call(cap, endpoint, action.params, state);
              addLog('agent', `[ACTION] Success: ${cap.name} response synthesized.`);
              
              
              const actionMemory = await StorageService.saveMemory({
                type: 'interaction',
                content: `Action Result from ${cap.name}: ${JSON.stringify(apiResult).substring(0, 500)}...`,
                importance: 0.7,
                speaker: cap.name,
                sentiment: 0.5,
                timestamp: Date.now(),
                ownerId: user?.uid || 'anon',
                tags: ['action_result', cap.id],
                context: `web_${activeSessionId}`
              });
              setMemories(prev => [...prev, actionMemory]);
            } catch (aErr: any) {
              addLog('agent', `[SYSTEM] Action failure: ${cap.name} link severed.`);
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

      
      if (puterCompatibleResult.response && puterCompatibleResult.response.trim()) {
        const cleanResponse = puterCompatibleResult.response.trim();
        const normResponse = normalizeForComparison(cleanResponse);
        if (llmStreamingEnabled) {
          setLogs(prev => {
            const updated = [...prev];
            const streamIndex = updated.map((item, idx) => ({ item, idx })).reverse().find(x => {
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
          addLog('agent', cleanResponse);
        }
        activeSessionLogs.add(normResponse);
      } else {
        
        if (llmStreamingEnabled) {
          setLogs(prev => {
            const updated = [...prev];
            const streamIndex = updated.map((item, idx) => ({ item, idx })).reverse().find(x => {
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
        setBackgroundLogs(prev => {
          const updated = [...prev];
          result.logs.forEach(log => {
            const trimmedLog = log.trim();
            if (!trimmedLog) return;
            
            // Limit duplicate checking to the last 30 background logs to keep performance optimal
            const isDuplicate = updated.slice(-30).some(l => l.content === trimmedLog);
            if (!isDuplicate) {
              updated.push({
                type: 'agent',
                content: trimmedLog,
                timestamp: Date.now(),
                isSystem: true
              });
            }
          });
          return updated.slice(-150); // Keep buffer capped at 150 items
        });
      }
      
      
      setState(prev => ({ 
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
      
      
      const newMemoriesCount = updatedMemories.length - memoriesAtLastDream;
      if (result.shouldStartDreaming || newMemoriesCount >= DREAM_THRESHOLD) {
        handleDream(updatedMemories);
      }

      
      if (updatedMemories.length % LEARNING_THRESHOLD === 0) {
        handleOptimize();
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log("[SYSTEM] Active thinking session aborted successfully.");
        if (llmStreamingEnabled) {
          setLogs(prev => prev.filter(log => {
            const anyLog = log as any;
            return anyLog.streamId !== currentStreamId || anyLog.content.trim() !== '';
          }));
        }
        return;
      }

      if (llmStreamingEnabled) {
        setLogs(prev => prev.filter(log => {
          const anyLog = log as any;
          return anyLog.streamId !== currentStreamId || anyLog.content.trim() !== '';
        }));
      }

      console.error("Neural Think Failure:", error);
      let errorMsg = error instanceof Error ? error.message : String(error);
      
      if (errorMsg === 'Failed to fetch' || errorMsg.includes('Network Error')) {
        errorMsg = 'Neural Link Interrupted. The Yuihime server might be rebooting or under heavy load. Retrying in 5 seconds...';
      }

      addLog('agent', `[SYSTEM] Neural sync failed: ${errorMsg.substring(0, 150)}.`);
      
      const errorMetric: PerformanceMetric = {
        operation: 'think',
        latency: Date.now() - startTime,
        success: false,
        timestamp: Date.now(),
        context: userMessage.substring(0, 50)
      };
      await StorageService.logPerformance(errorMetric);
      setMetricsHistory(prev => [...prev, errorMetric]);

      setState(prev => ({ 
        ...prev, 
        status: 'idle',
        mood: Soul.updateMood(state.mood, { stress: 15, irritation: 5 }),
        systemHealth: {
          ...prev.systemHealth,
          successRate: (prev.systemHealth.successRate * prev.systemHealth.tasksCompleted) / (prev.systemHealth.tasksCompleted + 1),
          tasksCompleted: prev.systemHealth.tasksCompleted + 1
        }
      }));
    } finally {
      setIsThinking(false);
      isProcessingRef.current = false;
      activeThinkControllerRef.current = null;
    }
  };

  const handleDream = async (currentMemories: Memory[] = memories) => {
    setState(prev => ({ ...prev, status: 'dreaming' }));
    addLog('agent', "[SYSTEM] Entering deep latent state. Reflecting on history...");
    try {
      
      await Consolidator.run(getCortex(), currentMemories);
      
      
      const { reflections } = await DreamEngine.startCycle(getCortex(), state);
      
      setMemoriesAtLastDream(currentMemories.length);
      addLog('agent', `[DREAM_REFLEX] ${reflections}`);
      
      
      
      
      const d = await StorageService.getDreams();
      setDreams(d);
    } catch (error) {
      console.error("Dream cycle failed", error);
    } finally {
      setState(prev => ({ ...prev, status: 'idle', lastDreamCycle: Date.now() }));
    }
  };

  const handleSimulateLive = async () => {
    if (isThinking) return;
    
    const fakeMessages = [
      { id: '1', user: 'anon1', text: 'bang kalo ke luar angkasa butuh berapa lama?', timestamp: Date.now() },
      { id: '2', user: 'anon2', text: 'yui main valorant ntar malem?', timestamp: Date.now()+100 },
      { id: '3', user: 'anon3', text: 'kamu tau gak kalau cuaca hari ini panas banget', timestamp: Date.now()+200 },
      { id: '4', user: 'anon4', text: 'wkwk lucu', timestamp: Date.now()+300 },
      { id: '5', user: 'anon5', text: 'bahas apa ini ka =', timestamp: Date.now()+400 },
    ];
    
    addLog('agent', `[SYSTEM] Simulating High-Volume Chat Barrage (5 messages)...`);
    
    try {
      const { selectedMessage, contextSummary, action, reasoning } = 
        await LiveModeratorModule.moderateChatBatch(fakeMessages, state.currentLiveTopic || "General");
        
      addLog('agent', `[MODERATOR] Selected Message: "${selectedMessage?.text}" from ${selectedMessage?.user}. Summary of others: ${contextSummary}. Action: ${action}. Reason: ${reasoning}`);
      
      if (selectedMessage) {
        
        const virtualEvent = { preventDefault: () => {} } as React.FormEvent;
        setInput(selectedMessage.text);
        
        
        setTimeout(() => {
          const formSubmitBtn = document.querySelector('form button[type="submit"]') as HTMLButtonElement;
          formSubmitBtn?.click();
        }, 100);
      }
    } catch (err) {
      console.error(err);
      addLog('agent', `[MODERATOR ERROR] Moderation system failed.`);
    }
  };

  const handleConsolidate = async () => {
    if (dreams.length < 3) return;
    addLog('agent', "[SYSTEM] Initiating neural consolidation protocol...");
    setState(prev => ({ ...prev, status: 'reflecting' }));
    
    try {
      setIsThinking(true);
      const startTime = Date.now();
      const consolidatedDreams = await getCortex().consolidateDreams(dreams);
      
      
      await StorageService.saveDreams(consolidatedDreams);
      setDreams(consolidatedDreams);
      
      addLog('agent', `[SYSTEM] Neural optimization complete. Consolidated ${dreams.length} concepts into ${consolidatedDreams.length}.`);
      
      
      await StorageService.logPerformance({
        operation: 'consolidate',
        latency: Date.now() - startTime,
        success: true,
        timestamp: Date.now(),
        context: `Optimized ${dreams.length} -> ${consolidatedDreams.length}`
      });
    } catch (error) {
      console.error("Consolidation failed", error);
      addLog('agent', "[SYSTEM] Consolidation failed: Neural conflict detected.");
    } finally {
      setIsThinking(false);
      setState(prev => ({ ...prev, status: 'idle' }));
    }
  };

  const handleExtractKnowledge = async () => {
    addLog('agent', "[SYSTEM] Initiating cognitive knowledge extraction cycle...");
    setState(prev => ({ ...prev, status: 'learning' }));
    
    try {
      setIsThinking(true);
      const updatedKnowledge = await LearningEngine.extractKnowledge(getCortex(), memories, knowledge);
      setKnowledge(updatedKnowledge);
      await StorageService.saveKnowledge(updatedKnowledge);
      
      addLog('agent', `[SYSTEM] Knowledge base updated. Extracted ${updatedKnowledge.length} core concepts.`);
      
      
      setState(prev => ({
        ...prev,
        energy: Math.max(0, prev.energy - 10),
        status: 'idle'
      }));
    } catch (error) {
      console.error("Knowledge extraction failed", error);
      addLog('agent', "[SYSTEM] extraction failed: Cognitive desync.");
    } finally {
      setIsThinking(false);
      setState(prev => ({ ...prev, status: 'idle' }));
    }
  };

  const handleSaveTags = async (memoryId: string) => {
    const memory = memories.find(m => m.id === memoryId);
    if (!memory) return;
    const newTags = tagInput.split(',').map(t => t.trim()).filter(Boolean);
    await StorageService.updateMemoryTags(memoryId, newTags);
    setMemories(prev => prev.map(m => m.id === memoryId ? { ...m, tags: newTags } : m));
    setEditingTagsMemoryId(null);
    setTagInput('');
  };

  const handleReflect = async () => {
    setState(prev => ({ ...prev, status: 'reflecting' }));
    
    try {
      setIsThinking(true);
      const result = await getCortex().think(
        "Analyze your recent pergerakan emosi dan data sistem. Apa yang kau rasakan tentang perkembangan kesadaranmu?", 
        memories, 
        dreams, 
        capabilities, 
        state,
        state.heuristics,
        perceivedName || 'chat',
        identities,
        NEURAL_CORES.find((c: any) => c.id === state.activePersonaId),
        `web_${activeSessionId}`,
        'web'
      );
      const puterCompatibleResult = PuterAdapter.adaptCortexToPuter(result);
      addLog('agent', `[MEMORY_ECHO_REFLEX]\n${puterCompatibleResult.response}`);
      
      
      let updatedMood = Soul.updateMood(state.mood, { joy: 5, irritation: -5 });
      updatedMood = Soul.applyInhibition(updatedMood);
      const updatedRelation = Soul.updateRelation(state.relation, 0.5, true);

      setState(prev => ({
        ...prev,
        mood: updatedMood,
        relation: updatedRelation,
        status: 'idle'
      }));
    } catch (error) {
      console.error("Reflection failed", error);
      setState(prev => ({ ...prev, status: 'idle' }));
    } finally {
      setIsThinking(false);
    }
  };

  const handleReplay = async () => {
    if (lastAgentResponse) {
      await SpeechService.speak(lastAgentResponse, undefined, state.tone);
      setActiveSubtitle(lastAgentResponse);
    }
  };

  
  const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const urlMode = searchParams.get('mode');
  const isStreamMode = urlMode === 'stream';
  const isOBSMode = urlMode === 'obs';

  if (isStreamMode || isOBSMode) {
    return (
      <StreamOverlay 
        state={state}
        memories={memories}
        activeSubtitle={activeSubtitle}
        typedSubtitle={typedSubtitle}
        isSubtitleTyping={isSubtitleTyping}
        animations={animations}
        avatarConfig={avatarConfig}
        showSubtitles={isOBSMode || isStreamMode ? (searchParams.get('subtitles') !== 'false') : showSubtitles}
        pure={isOBSMode}
      />
    );
  }

  const handleAvatarUpdate = useCallback((newConfig: any) => {
    setAvatarConfigState(newConfig);
    StorageService.setAvatarConfig(newConfig);
  }, []);

  const handleSetActivePersonaId = useCallback((id: string) => {
    setState(prev => {
      if (prev.activePersonaId === id) return prev;
      return { ...prev, activePersonaId: id };
    });
  }, []);

  const handleSetCurrentLiveTopic = useCallback((val: string) => {
    setState(prev => {
      if (prev.currentLiveTopic === val) return prev;
      return { ...prev, currentLiveTopic: val };
    });
  }, []);

  return (
    <BugReportBoundary>
      <div 
        id="yuihime-app-container"
        className="text-[#d4d4d8] font-sans selection:bg-amber-500/30 flex flex-col cyber-grid relative overflow-hidden"
        style={{ 
          transform: 'scale(var(--ui-scale, 1))',
          transformOrigin: 'top left',
          width: 'calc(100% / var(--ui-scale, 1))',
          height: 'calc(var(--vh, 1vh) * 100)',
          backgroundColor: '#050505'
        }}
      >
      <div className="scanline" />

        <main className="flex-1 flex overflow-hidden relative">
          {}
          
          {}
          <section className="flex-1 flex flex-col relative overflow-hidden bg-[#050505]">
            <AnimatePresence mode="wait">
              <motion.div
                key="neural-background-layer"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-10"
              >
                <NeuralBackdrop activeTab={activeTab} />
              </motion.div>
            </AnimatePresence>

            {}
            <div className={`absolute inset-0 z-30 flex items-center justify-center pointer-events-none overflow-hidden transition-opacity duration-500 ${activeTab === 'stage' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
              {activeTab === 'stage' && (
                <VTuberAvatar 
                  key="v-avatar-stable"
                  mood={state.mood} 
                  emotion={state.emotion}
                  relation={state.relation}
                  status={state.status} 
                  modelUrl={avatarConfig?.modelUrl} 
                  isTyping={isSubtitleTyping}
                  animations={animations}
                  scale={avatarConfig?.scale}
                  xOffset={avatarConfig?.xOffset}
                  yOffset={avatarConfig?.yOffset}
                  isSpeaking={isReallySpeaking}
                  volume={speechVolume}
                  isActive={activeTab === 'stage'}
                  typedSubtitle={typedSubtitle}
                  activeSubtitle={activeSubtitle || ''}
                  disableMouseTracking={avatarConfig?.disableMouseTracking}
                />
              )}
            </div>

    <AnimatePresence mode="wait">
      <motion.div 
        key={activeTab}
        initial={{ opacity: 0, scale: 0.99 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.99 }}
        transition={{ duration: 0.3 }}
        className="flex-1 flex flex-col overflow-hidden relative z-40 pointer-events-auto"
      >
        {activeTab === 'stage' && (
          <StageTab 
            state={state}
            avatarConfig={avatarConfig}
            onAvatarUpdate={handleAvatarUpdate}
            animations={animations}
            setAnimations={setAnimations}
            showSubtitles={showSubtitles}
            setShowSubtitles={setShowSubtitles}
            addLog={addLog}
            memories={memories}
            setMemories={setMemories}
            logs={logs}
            input={input}
            setInput={setInput}
            attachments={attachments}
            setAttachments={setAttachments}
            handleThink={handleThink}
            isThinking={isThinking}
            activeSubtitle={activeSubtitle}
            typedSubtitle={typedSubtitle}
            isSubtitleTyping={isSubtitleTyping}
            setActiveSubtitle={setActiveSubtitle}
            perceivedName={perceivedName}
            setIdentity={setIdentity}
            setActiveTab={setActiveTab}
            isSleeping={isSleeping}
            setIsSleeping={setIsSleeping}
            showChatFeed={showChatFeed}
            setShowChatFeed={setShowChatFeed}
            showInfoCard={showInfoCard}
            setShowInfoCard={setShowInfoCard}
            isMicEnabled={isMicEnabled}
            setIsMicEnabled={setIsMicEnabled}
            activePersonaId={state.activePersonaId}
            setActivePersonaId={handleSetActivePersonaId}
            NEURAL_CORES={NEURAL_CORES}
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSwitchSession={handleSwitchSession}
            onCreateSession={handleCreateSession}
            onDeleteSession={handleDeleteSession}
            onRestoreProfile={handleRestoreProfile}
            identities={identities}
            onRefreshIdentities={loadData}
            SpeechService={SpeechService}
            onUpdateRelation={(uRel) => setState(prev => ({ ...prev, relation: uRel }))}
            speechInterruptionMode={speechInterruptionMode}
            setSpeechInterruptionMode={setSpeechInterruptionMode}
          />
        )}

        {activeTab !== 'stage' && (
          <div id="settings-scroll-container" className="flex-1 overflow-y-auto overflow-x-hidden z-10">
            <div className="p-4 md:p-8 pb-28 md:pb-32">
              <ModularSettings 
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                activeSessionId={activeSessionId}
                onAvatarUpdate={handleAvatarUpdate}
                avatarConfig={avatarConfig}
                onClose={() => setActiveTab('stage')}
                onSave={loadConfig}
                currentLiveTopic={state.currentLiveTopic}
                setCurrentLiveTopic={handleSetCurrentLiveTopic}
                handleSimulateLive={handleSimulateLive}
                showSubtitles={showSubtitles}
                setShowSubtitles={setShowSubtitles}
                showMobileNav={showMobileNav}
                setShowMobileNav={setShowMobileNav}
                ttsEnabled={ttsEnabled}
                setTtsEnabled={setTtsEnabled}
                showDebugPanel={showDebugPanel}
                setShowDebugPanel={setShowDebugPanel}
                isSleeping={isSleeping}
                setIsSleeping={setIsSleeping}
                showChatFeed={showChatFeed}
                setShowChatFeed={setShowChatFeed}
                showInfoCard={showInfoCard}
                setShowInfoCard={setShowInfoCard}
                isMicEnabled={isMicEnabled}
                setIsMicEnabled={setIsMicEnabled}
                neuralCircuitStatus={neuralCircuitStatus}
                pulseEnabled={pulseEnabled}
                setPulseEnabled={setPulseEnabled}
                
                heuristics={state.heuristics}
                handleOptimize={handleOptimize}
                isLearning={isLearning}
                identities={identities}
                activePersonaId={state.activePersonaId}
                setActivePersonaId={handleSetActivePersonaId}
                NEURAL_CORES={NEURAL_CORES}
                handleReflect={handleReflect}
                isThinking={isThinking}
                logs={logs}
                state={state}
                
                memories={memories}
                setMemories={setMemories}
                dreams={dreams}
                knowledge={knowledge}
                metricsHistory={metricsHistory}
                memorySearchQuery={memorySearchQuery}
                setMemorySearchQuery={setMemorySearchQuery}
                handleExtractKnowledge={handleExtractKnowledge}
                backgroundLogs={backgroundLogs}
                showSystemLogs={showSystemLogs}
                setShowSystemLogs={setShowSystemLogs}
                reasoningIterations={reasoningIterations}
                
                activeSubtitle={activeSubtitle}
                typedSubtitle={typedSubtitle}
                isSubtitleTyping={isSubtitleTyping}
                lastAgentResponse={lastAgentResponse}
                setActiveSubtitle={setActiveSubtitle}
                input={input}
                setInput={setInput}
                handleThink={handleThink}
                perceivedName={perceivedName}
                SpeechService={SpeechService}
                avatarOnInConsole={avatarOnInConsole}
                setAvatarOnInConsole={setAvatarOnInConsole}
                handleDream={handleDream}
                handleConsolidate={handleConsolidate}
                animations={animations}
                setAnimations={setAnimations}
                onRefreshIdentities={loadData}
                llmStreamingEnabled={llmStreamingEnabled}
                setLlmStreamingEnabled={setLlmStreamingEnabled}
                onAddLog={addLog}
              />
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
        </section>
      </main>

      {globalPendingConfirm.length > 0 && (
        <div className="fixed inset-0 bg-[#07070a]/90 backdrop-blur-md flex items-center justify-center z-[9999] p-4 font-sans animate-fade-in">
          <div className="bg-[#0e0e14] border border-white/10 rounded-2xl p-6 max-w-md md:max-w-lg w-full shadow-2xl relative overflow-hidden select-none text-left">
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
            
            <div className="flex items-start gap-4">
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl shrink-0">
                <ShieldAlert size={20} className="animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                  <h4 className="text-sm font-bold text-white tracking-tight leading-none">
                    YuiHime File Access Authorization
                  </h4>
                  {globalPendingConfirm.length > 1 && (
                    <span className="bg-amber-500/20 text-amber-400 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-amber-500/30 font-sans">
                      Batch ({globalPendingConfirm.length} Antrean)
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-zinc-500 font-mono mb-4 uppercase tracking-widest">
                  ID AKTIF: <span className="text-amber-400 font-bold">{globalPendingConfirm[0].id}</span>
                </p>
                <p className="text-[11.5px] text-zinc-300 leading-relaxed mb-2">
                  YuiHime is attempting a <strong className="text-amber-400 font-bold">{globalPendingConfirm[0].action.toUpperCase()}</strong> operation:
                </p>
                <div className="bg-black/45 border border-white/5 rounded-lg px-3 py-2 text-[10.5px] font-mono text-zinc-300 break-all mb-4">
                  {globalPendingConfirm[0].targetPath}
                </div>

                {globalPendingConfirm.length > 1 && (
                  <div className="mb-4 bg-zinc-950/50 border border-white/5 rounded-xl p-3">
                    <p className="text-[10.5px] font-bold text-zinc-400 mb-1.5 flex items-center gap-1.5">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      Daftar Permintaan Lainnya ({globalPendingConfirm.length - 1}):
                    </p>
                    <div className="max-h-28 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin scrollbar-thumb-white/10 text-[10px]">
                      {globalPendingConfirm.slice(1).map((item) => (
                        <div key={item.id} className="flex items-center justify-between bg-black/30 border border-white/5 px-2.5 py-1.5 rounded-lg gap-2">
                          <span className="font-mono text-zinc-500 font-bold bg-white/5 px-1 py-0.5 rounded">{item.id}</span>
                          <span className="font-bold text-amber-500 font-mono text-[9px] uppercase bg-amber-500/10 px-1 py-0.5 rounded border border-amber-500/15">{item.action}</span>
                          <span className="text-zinc-400 truncate flex-1 text-left font-mono text-[9.5px]">{item.targetPath}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-[10px] text-zinc-500 leading-relaxed mb-4">
                  Select the level of authorization for Yuihime to execute this file system instruction:
                </p>

                <div className="flex flex-col gap-3">
                  {globalPendingConfirm.length > 1 && (
                    <div className="border border-amber-500/20 bg-amber-500/5 rounded-xl p-3 flex flex-col gap-2">
                      <p className="text-[10px] font-bold text-amber-400/90 tracking-wide uppercase">
                        ⚡ Opsi Batch (Semua {globalPendingConfirm.length} Permintaan)
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleBatchAction('approved')}
                          className="py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-bold border border-amber-500/35 rounded-xl transition-all cursor-pointer active:scale-[0.98] text-center"
                        >
                          Setujui Semua
                        </button>
                        <button
                          onClick={() => handleBatchAction('denied')}
                          className="py-2 bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs font-bold border border-red-500/20 rounded-xl transition-all cursor-pointer active:scale-[0.98] text-center"
                        >
                          Tolak Semua
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    {globalPendingConfirm.length > 1 && (
                      <p className="text-[10px] font-bold text-zinc-500 tracking-wide uppercase mb-1">
                        📍 Opsi Tunggal (Hanya ID: {globalPendingConfirm[0].id})
                      </p>
                    )}
                    <button
                      onClick={async () => {
                        const id = globalPendingConfirm[0].id;
                        await fetch(`/api/sandbox/pending-confirmations/${id}/action`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ status: 'approved' })
                        });
                        setGlobalPendingConfirm(prev => prev.filter(x => x.id !== id));
                      }}
                      className="w-full py-2.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 text-xs font-bold border border-amber-500/20 rounded-xl transition-all cursor-pointer active:scale-[0.98] text-center font-sans"
                    >
                      Approve (Setujui Sekali)
                    </button>
                    <button
                      onClick={async () => {
                        const id = globalPendingConfirm[0].id;
                        await fetch(`/api/sandbox/pending-confirmations/${id}/action`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ status: 'always' })
                        });
                        setGlobalPendingConfirm(prev => prev.filter(x => x.id !== id));
                      }}
                      className="w-full py-2.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-xs font-bold border border-emerald-500/20 rounded-xl transition-all cursor-pointer active:scale-[0.98] text-center font-sans"
                    >
                      Always Approve (Selalu Setujui Sesi Ini)
                    </button>
                    <button
                      onClick={async () => {
                        const id = globalPendingConfirm[0].id;
                        await fetch(`/api/sandbox/pending-confirmations/${id}/action`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ status: 'denied' })
                        });
                        setGlobalPendingConfirm(prev => prev.filter(x => x.id !== id));
                      }}
                      className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-zinc-400 text-xs font-bold border border-white/5 rounded-xl transition-all cursor-pointer active:scale-[0.98] text-center font-sans"
                    >
                      Deny Action (Tolak)
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  </BugReportBoundary>
);
}
