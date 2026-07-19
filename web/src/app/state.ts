import React from 'react';
import { useState, useRef, useCallback } from 'react';
import { DEFAULT_PROVIDER_OPTIONS, DEFAULT_NEURAL_CORES } from '@shared/constants';
import { StorageService } from '@shared/drivers/storage';
import {
  Memory,
  Dream,
  APICapability,
  AgentState,
  MoodState,
  EmotionType,
  LearnedStrategy,
  PerformanceMetric,
  Identity,
  AvatarConfig,
  CoreKnowledge,
  AgentPersona,
  ProviderConfig,
  ChatSession
} from '@shared/include/types';
import { Soul } from '@/core/soul';
import { Cortex } from '@/core/cortex';
import { safeLocalStorage } from '@shared/core/safeStorage';

export interface AppState {
  config: any;
  setConfig: React.Dispatch<React.SetStateAction<any>>;
  globalPendingConfirm: any[];
  setGlobalPendingConfirm: React.Dispatch<React.SetStateAction<any>>;
  cortexRef: React.MutableRefObject<Cortex | null>;
  soulRef: React.MutableRefObject<Soul | null>;
  isStreamingRef: React.MutableRefObject<boolean>;
  isProcessingRef: React.MutableRefObject<boolean>;
  prevActiveSessionIdRef: React.MutableRefObject<string | null>;
  activeThinkControllerRef: React.MutableRefObject<AbortController | null>;
  showDebugPanel: boolean;
  setShowDebugPanel: React.Dispatch<React.SetStateAction<boolean>>;
  uiScaleState: number;
  setUiScaleState: React.Dispatch<React.SetStateAction<number>>;
  user: { uid: string } | null;
  setUser: React.Dispatch<React.SetStateAction<{ uid: string } | null>>;
  perceivedName: string;
  setPerceivedName: React.Dispatch<React.SetStateAction<string>>;
  authReady: boolean;
  setAuthReady: React.Dispatch<React.SetStateAction<boolean>>;
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  attachments: any[];
  setAttachments: React.Dispatch<React.SetStateAction<any[]>>;
  showSystemLogs: boolean;
  setShowSystemLogs: React.Dispatch<React.SetStateAction<boolean>>;
  activeSubtitle: string | null;
  setActiveSubtitle: React.Dispatch<React.SetStateAction<string | null>>;
  typedSubtitle: string;
  setTypedSubtitle: React.Dispatch<React.SetStateAction<string>>;
  isSubtitleTyping: boolean;
  setIsSubtitleTyping: React.Dispatch<React.SetStateAction<boolean>>;
  lastAgentResponse: string | null;
  setLastAgentResponse: React.Dispatch<React.SetStateAction<string | null>>;
  avatarConfig: AvatarConfig;
  setAvatarConfigState: React.Dispatch<React.SetStateAction<AvatarConfig>>;
  memories: Memory[];
  setMemories: React.Dispatch<React.SetStateAction<Memory[]>>;
  dreams: Dream[];
  setDreams: React.Dispatch<React.SetStateAction<Dream[]>>;
  identities: Identity[];
  setIdentities: React.Dispatch<React.SetStateAction<Identity[]>>;
  capabilities: APICapability[];
  setCapabilities: React.Dispatch<React.SetStateAction<APICapability[]>>;
  knowledge: CoreKnowledge[];
  setKnowledge: React.Dispatch<React.SetStateAction<CoreKnowledge[]>>;
  metricsHistory: PerformanceMetric[];
  setMetricsHistory: React.Dispatch<React.SetStateAction<PerformanceMetric[]>>;
  editingTagsMemoryId: string | null;
  setEditingTagsMemoryId: React.Dispatch<React.SetStateAction<string | null>>;
  tagInput: string;
  setTagInput: React.Dispatch<React.SetStateAction<string>>;
  memorySearchQuery: string;
  setMemorySearchQuery: React.Dispatch<React.SetStateAction<string>>;
  systemSignalQueue: string[];
  setSystemSignalQueue: React.Dispatch<React.SetStateAction<string[]>>;
  state: AgentState;
  setState: React.Dispatch<React.SetStateAction<any>>;
  ttsEnabled: boolean;
  setTtsEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  showSubtitles: boolean;
  setShowSubtitles: React.Dispatch<React.SetStateAction<boolean>>;
  showMobileNav: boolean;
  setShowMobileNav: React.Dispatch<React.SetStateAction<boolean>>;
  showChatFeed: boolean;
  setShowChatFeed: React.Dispatch<React.SetStateAction<boolean>>;
  showInfoCard: boolean;
  setShowInfoCard: React.Dispatch<React.SetStateAction<boolean>>;
  isMicEnabled: boolean;
  setIsMicEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  isSleeping: boolean;
  setIsSleeping: (v: boolean) => void;
  speechInterruptionMode: 'interrupt' | 'manual';
  setSpeechInterruptionMode: (m: 'interrupt' | 'manual') => void;
  memoriesAtLastDream: number;
  setMemoriesAtLastDream: React.Dispatch<React.SetStateAction<number>>;
  activeTab: string;
  setActiveTab: React.Dispatch<React.SetStateAction<string>>;
  avatarOnInConsole: boolean;
  setAvatarOnInConsole: React.Dispatch<React.SetStateAction<boolean>>;
  thinkingCount: number;
  setIsThinking: React.Dispatch<React.SetStateAction<boolean | ((prev: boolean) => boolean)>>;
  isThinking: boolean;
  pulseEnabled: boolean;
  setPulseEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  neuralCircuitStatus: any[];
  setNeuralCircuitStatus: React.Dispatch<React.SetStateAction<any[]>>;
  isLearning: boolean;
  setIsLearning: React.Dispatch<React.SetStateAction<boolean>>;
  animations: string[];
  setAnimations: React.Dispatch<React.SetStateAction<string[]>>;
  isReallySpeaking: boolean;
  setIsReallySpeaking: React.Dispatch<React.SetStateAction<boolean>>;
  speechVolume: number;
  setSpeechVolume: React.Dispatch<React.SetStateAction<number>>;
  pendingPrompt: string | null;
  setPendingPrompt: React.Dispatch<React.SetStateAction<string | null>>;
  reasoningIterations: any[];
  setReasoningIterations: React.Dispatch<React.SetStateAction<any[]>>;
  streamEvents: any[];
  setStreamEvents: React.Dispatch<React.SetStateAction<any[]>>;
  lastInteractionTime: number;
  setLastInteractionTime: React.Dispatch<React.SetStateAction<number>>;
  sleepModeEnabled: boolean;
  setSleepModeEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  llmStreamingEnabled: boolean;
  setLlmStreamingEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  sleepModeTimeout: number;
  setSleepModeTimeout: React.Dispatch<React.SetStateAction<number>>;
  aiConfig: ProviderConfig;
  setAiConfigState: React.Dispatch<React.SetStateAction<ProviderConfig>>;
  keyVisible: boolean;
  setKeyVisible: React.Dispatch<React.SetStateAction<boolean>>;
  editingCapability: APICapability | null;
  setEditingCapability: React.Dispatch<React.SetStateAction<APICapability | null>>;
  newEndpoint: any;
  setNewEndpoint: React.Dispatch<React.SetStateAction<any>>;
  seenReminders: string[];
  setSeenReminders: React.Dispatch<React.SetStateAction<string[]>>;
  DREAM_THRESHOLD: number;
  LEARNING_THRESHOLD: number;
  PROVIDER_OPTIONS: any[];
  NEURAL_CORES: any[];
  activePersona: any;
  currentProvider: any;
  scrollRef: React.MutableRefObject<HTMLDivElement | null>;
  loadConfig: () => Promise<void>;
}

export function useAppState() {
  const [config, setConfig] = useState<any>(null);
  const [globalPendingConfirm, setGlobalPendingConfirm] = useState<any[]>([]);

  const cortexRef = useRef<Cortex | null>(null);
  const soulRef = useRef<Soul | null>(null);
  const isStreamingRef = useRef(false);
  const isProcessingRef = useRef(false);
  const prevActiveSessionIdRef = useRef<string | null>(null);
  const activeThinkControllerRef = useRef<AbortController | null>(null);

  const [showDebugPanel, setShowDebugPanel] = useState(() => safeLocalStorage.parseJSON('yuihime_debug_panel', false));

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

  const [user, setUser] = useState<{ uid: string } | null>({ uid: 'local_user' });
  const [perceivedName, setPerceivedName] = useState<string>(() => safeLocalStorage.getItem('yuihime_perceived_name') || 'user');
  const [authReady, setAuthReady] = useState(true);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<any[]>([]);
  const [showSystemLogs, setShowSystemLogs] = useState(false);

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

  const [ttsEnabled, setTtsEnabled] = useState(() => safeLocalStorage.parseJSON('yuihime_tts_enabled', true));
  const [showSubtitles, setShowSubtitles] = useState(() => safeLocalStorage.parseJSON('yuihime_show_subtitles', false));
  const [showMobileNav, setShowMobileNav] = useState(() => safeLocalStorage.parseJSON('yuihime_show_mobile_nav', true));
  const [showChatFeed, setShowChatFeed] = useState(() => safeLocalStorage.parseJSON('yuihime_show_chat_feed', true));
  const [showInfoCard, setShowInfoCard] = useState(() => safeLocalStorage.parseJSON('yuihime_show_info_card', false));
  const [isMicEnabled, setIsMicEnabled] = useState(() => safeLocalStorage.parseJSON('yuihime_is_mic_enabled', false));
  const [isSleepingState, setIsSleepingState] = useState(() => safeLocalStorage.parseJSON('yuihime_ui_sleeping', false));

  const setIsSleeping = useCallback((val: boolean) => {
    setIsSleepingState(val);
    localStorage.setItem('yuihime_ui_sleeping', String(val));
    if (val) {
      setState(prev => ({ ...prev, status: 'sleeping' }));
    } else {
      setState(prev => ({ ...prev, status: 'idle' }));
    }
  }, []);

  const [speechInterruptionModeState, setSpeechInterruptionModeState] = useState<'interrupt' | 'manual'>(() => {
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

  const [isLearning, setIsLearning] = useState(false);
  const [animations, setAnimations] = useState<string[]>([]);
  const [isReallySpeaking, setIsReallySpeaking] = useState(false);
  const [speechVolume, setSpeechVolume] = useState(0);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  const [reasoningIterations, setReasoningIterations] = useState<any[]>([]);
  const [streamEvents, setStreamEvents] = useState<any[]>([]);
  const [lastInteractionTime, setLastInteractionTime] = useState(Date.now());
  const [sleepModeEnabled, setSleepModeEnabled] = useState(true);
  const [llmStreamingEnabled, setLlmStreamingEnabled] = useState(() => {
    return safeLocalStorage.parseJSON('yuihime_llm_streaming_enabled', true);
  });
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

  const [seenReminders, setSeenReminders] = useState<string[]>([]);

  const DREAM_THRESHOLD = config?.agent?.dreamThreshold || 5;
  const LEARNING_THRESHOLD = config?.agent?.learningThreshold || 10;

  const PROVIDER_OPTIONS = config?.providers || DEFAULT_PROVIDER_OPTIONS;
  const NEURAL_CORES = config?.neuralCores || DEFAULT_NEURAL_CORES;

  const activePersona = NEURAL_CORES.find((c: any) => c.id === state.activePersonaId) || NEURAL_CORES[1];

  const currentProvider = PROVIDER_OPTIONS.find(p => p.id === aiConfig.provider) || PROVIDER_OPTIONS[0];

  const scrollRef = useRef<HTMLDivElement>(null);

  return {
    config, setConfig,
    globalPendingConfirm, setGlobalPendingConfirm,
    cortexRef, soulRef, isStreamingRef, isProcessingRef, prevActiveSessionIdRef, activeThinkControllerRef,
    showDebugPanel, setShowDebugPanel,
    uiScaleState, setUiScaleState,
    user, setUser,
    perceivedName, setPerceivedName,
    authReady, setAuthReady,
    input, setInput,
    attachments, setAttachments,
    showSystemLogs, setShowSystemLogs,
    activeSubtitle, setActiveSubtitle,
    typedSubtitle, setTypedSubtitle,
    isSubtitleTyping, setIsSubtitleTyping,
    lastAgentResponse, setLastAgentResponse,
    avatarConfig, setAvatarConfigState,
    memories, setMemories,
    dreams, setDreams,
    identities, setIdentities,
    capabilities, setCapabilities,
    knowledge, setKnowledge,
    metricsHistory, setMetricsHistory,
    editingTagsMemoryId, setEditingTagsMemoryId,
    tagInput, setTagInput,
    memorySearchQuery, setMemorySearchQuery,
    systemSignalQueue, setSystemSignalQueue,
    state, setState,
    ttsEnabled, setTtsEnabled,
    showSubtitles, setShowSubtitles,
    showMobileNav, setShowMobileNav,
    showChatFeed, setShowChatFeed,
    showInfoCard, setShowInfoCard,
    isMicEnabled, setIsMicEnabled,
    isSleeping: isSleepingState, setIsSleeping,
    speechInterruptionMode: speechInterruptionModeState, setSpeechInterruptionMode,
    memoriesAtLastDream, setMemoriesAtLastDream,
    activeTab, setActiveTab,
    avatarOnInConsole, setAvatarOnInConsole,
    thinkingCount, setIsThinking, isThinking,
    pulseEnabled, setPulseEnabled,
    neuralCircuitStatus, setNeuralCircuitStatus,
    isLearning, setIsLearning,
    animations, setAnimations,
    isReallySpeaking, setIsReallySpeaking,
    speechVolume, setSpeechVolume,
    pendingPrompt, setPendingPrompt,
    reasoningIterations, setReasoningIterations,
    streamEvents, setStreamEvents,
    lastInteractionTime, setLastInteractionTime,
    sleepModeEnabled, setSleepModeEnabled,
    llmStreamingEnabled, setLlmStreamingEnabled,
    sleepModeTimeout, setSleepModeTimeout,
    aiConfig, setAiConfigState,
    keyVisible, setKeyVisible,
    editingCapability, setEditingCapability,
    newEndpoint, setNewEndpoint,
    seenReminders, setSeenReminders,
    DREAM_THRESHOLD, LEARNING_THRESHOLD,
    PROVIDER_OPTIONS, NEURAL_CORES,
    activePersona, currentProvider,
    scrollRef,
    loadConfig
  } as AppState;
}
