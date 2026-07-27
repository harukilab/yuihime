import React, { useState, useEffect } from 'react';
import { DEFAULT_NEURAL_CORES, RUNTIME_DEFAULTS } from '@shared/constants';
import { SystemRegistry } from '@shared/core/registry';
import { StorageService } from '@shared/drivers/storage';
import { ModuleType } from '@shared/include/types';
import { TabRegistry } from './tabsRegistry';
import { CronManager } from './CronManager';
import { ShieldAlert, LogIn, LogOut, Trash2, LineChart as ChartIcon, BarChart3, Save, RefreshCw, Layers, Cpu, Radio, Volume2, Zap, LayoutGrid, Settings2, Brain, Clock, Sparkles, MessageSquare, Palette, Monitor, Database, GitBranch, Activity, Terminal, CheckSquare, Mic, Eye, EyeOff, ClipboardList, Share2, Gamepad2, Server, Music, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, AlertTriangle, Play, Sliders, VolumeX, Search, Maximize2, Move, Heart, Info, Upload, Image as ImageIcon, Send, Globe, X } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { HeuristicsTab } from './HeuristicsTab';
import { IdentitiesTab } from './IdentitiesTab';
import { ReflectTab } from './ReflectTab';
import { KnowledgeGraph } from './KnowledgeGraph';
import { AdaptiveMatrix } from './AdaptiveMatrix';
import { TaskPlanner } from './TaskPlanner';
import { SubAgentManagerPanel } from './sub-agent-manager';
import { FileAutomationTab } from './FileAutomationTab';
import { ArchiveTab } from './ArchiveTab';
import { DreamsTab } from './DreamsTab';
import { TrainTab } from './TrainTab';
import { Smile, Check, Undo2, Settings, Plus, Star, Cloud, Compass, Flame, Code, Smartphone, Lock, Unlock, Archive } from 'lucide-react';
import { BackupTab } from './modular-settings/BackupTab';
import { REGISTERED_PROVIDERS_STATIC_DATA } from './modular-settings/settingsConstants';
import { AboutTab } from './modular-settings/AboutTab';
import { SystemTab } from './modular-settings/SystemTab';
import { ProvidersTab } from './modular-settings/ProvidersTab';
import { ProviderPlayground } from './modular-settings/ProviderPlayground';
import { CharacterTab } from './modular-settings/CharacterTab';
import { ScenesTab } from './modular-settings/ScenesTab';
import { ModelsTab } from './modular-settings/ModelsTab';
import { MemoryTab } from './modular-settings/MemoryTab';
import { ModulesTab } from './modular-settings/ModulesTab';
import { EnvTab } from './modular-settings/EnvTab';
import { DataSectionTab } from './modular-settings/DataSectionTab';
import { ConnectionSectionTab } from './modular-settings/ConnectionSectionTab';
import { MatrixSectionTab } from './modular-settings/MatrixSectionTab';
import { LogsSectionTab } from './modular-settings/LogsAuditSectionTab';
import { EditCardModal } from './modular-settings/EditCardModal';
import { ModelSelectorModal } from './modular-settings/ModelSelectorModal';
import { PendingQueueManager } from './PendingQueueManager';
import { SearchableSelect } from '../components/SearchableSelect';
import { LockedSlider } from '../components/LockedSlider';
import { LockedTextarea } from '../components/LockedTextarea';

const CollapsibleDescription: React.FC<{ text: string }> = ({ text }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isLong = text.length > 75;
  const displayText = isLong && !isExpanded ? `${text.slice(0, 75)}...` : text;

  return (
    <span className="block text-[8.5px] text-zinc-500 mt-0.5 leading-normal">
      {displayText}{' '}
      {isLong && (
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-cyan-400 hover:text-cyan-300 font-mono text-[8px] uppercase tracking-wider ml-1 hover:underline cursor-pointer focus:outline-none inline"
        >
          [{isExpanded ? 'Close' : 'Detail'}]
        </button>
      )}
    </span>
  );
};

const MultiSelectField: React.FC<{
  options: { label: string; value: string }[];
  value: string[];
  onChange: (val: string[]) => void;
  placeholder?: string;
  isFetching?: boolean;
  onFetch?: () => void;
  customMode?: boolean;
  onToggleCustom?: () => void;
}> = ({ options, value, onChange, placeholder, isFetching, onFetch, customMode, onToggleCustom }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [customValue, setCustomValue] = useState('');
  const selected = Array.isArray(value) ? value : [];

  const filteredOptions = options.filter(o =>
    o.label.toLowerCase().includes(search.toLowerCase()) ||
    o.value.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (v: string) => {
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  };

  const removeTag = (e: React.MouseEvent, v: string) => {
    e.stopPropagation();
    onChange(selected.filter(x => x !== v));
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customValue) {
      const items = customValue.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
      onChange(items);
    }
  };

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="flex-1">
          {customMode ? (
            <form onSubmit={handleCustomSubmit}>
              <ControlledTextInput
                value={customValue}
                onChange={(val) => setCustomValue(val)}
                placeholder="Comma-separated model IDs..."
                className="w-full bg-[#111115] border border-white/5 rounded-xl px-3 py-2 text-xs text-white font-mono"
              />
            </form>
          ) : (
            <div
              className="w-full bg-[#111115] border border-white/5 hover:border-white/10 rounded-xl px-3 py-2 text-xs text-white min-h-[38px] flex flex-wrap gap-1 cursor-pointer"
              onClick={() => setIsOpen(!isOpen)}
            >
              {selected.length === 0 && (
                <span className="text-zinc-600">{placeholder || 'Select models...'}</span>
              )}
              {selected.map(v => {
                const opt = options.find(o => o.value === v);
                return (
                  <span key={v} className="bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded-md text-[10px] font-mono flex items-center gap-1">
                    {opt?.label || v}
                    <button type="button" onClick={(e) => removeTag(e, v)} className="hover:text-white">×</button>
                  </span>
                );
              })}
            </div>
          )}
        </div>
        {onFetch && (
          <button
            type="button"
            onClick={onFetch}
            disabled={isFetching}
            className="px-3 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 rounded-xl border border-cyan-400/20 transition-all disabled:opacity-50 flex items-center justify-center shrink-0"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </button>
        )}
      </div>

      {isOpen && !customMode && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-[#0e0e14]/95 border border-white/10 rounded-xl shadow-[0_12px_36px_rgba(0,0,0,0.7)] backdrop-blur-md overflow-hidden">
          <div className="relative border-b border-white/5 p-2">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={12} />
            <input
              type="text"
              placeholder="Filter models..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-black/40 border border-white/5 rounded-lg pl-8 pr-8 py-2 text-xs text-white outline-none font-sans"
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-0.5"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.map(opt => (
                <div
                  key={opt.value}
                  onClick={() => toggle(opt.value)}
                  className={`px-3.5 py-2.5 text-xs cursor-pointer flex items-center gap-2 ${
                    selected.includes(opt.value) ? 'bg-cyan-500/10 text-cyan-400' : 'text-zinc-400 hover:bg-white/5'
                  }`}
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                    selected.includes(opt.value) ? 'bg-cyan-500 border-cyan-500' : 'border-white/20'
                  }`}>
                    {selected.includes(opt.value) && <Check size={10} className="text-black" />}
                  </div>
                  {opt.label}
                </div>
              ))
            ) : (
              <div className="px-3.5 py-4 text-center text-[10px] text-zinc-500 font-mono italic">
                No matching models found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface ModularSettingsProps {
  activeTab?: string;
  setActiveTab?: (tab: any) => void;
  activeSessionId?: string;
  onAvatarUpdate?: (config: any) => void;
  avatarConfig?: any;
  onClose?: () => void;
  currentLiveTopic?: string;
  setCurrentLiveTopic?: (val: string) => void;
  handleSimulateLive?: () => void;
  showSubtitles?: boolean;
  setShowSubtitles?: (val: boolean) => void;
  showMobileNav?: boolean;
  setShowMobileNav?: (val: boolean) => void;
  showDebugPanel?: boolean;
  setShowDebugPanel?: (val: boolean) => void;
  ttsEnabled?: boolean;
  setTtsEnabled?: (val: boolean) => void;
  isSleeping?: boolean;
  setIsSleeping?: (val: boolean) => void;
  showChatFeed?: boolean;
  setShowChatFeed?: (val: boolean) => void;
  showInfoCard?: boolean;
  setShowInfoCard?: (val: boolean) => void;
  isMicEnabled?: boolean;
  setIsMicEnabled?: (val: boolean) => void;
  neuralCircuitStatus?: any[];
  pulseEnabled?: boolean;
  setPulseEnabled?: (val: boolean) => void;
  // New props for Soul Tabs
  heuristics?: any[];
  handleOptimize?: () => void;
  isLearning?: boolean;
  identities?: any[];
  activePersonaId?: string;
  setActivePersonaId?: (id: string) => void;
  NEURAL_CORES?: any[];
  handleReflect?: () => void;
  isThinking?: boolean;
  status?: string;
  logs?: any[];
  onSave?: () => void;
  state?: any;
  // Integrated parameters from other tabs
  memories?: any[];
  setMemories?: React.Dispatch<React.SetStateAction<any[]>>;
  dreams?: any[];
  knowledge?: any[];
  memorySearchQuery?: string;
  setMemorySearchQuery?: (val: string) => void;
  handleExtractKnowledge?: () => void;
  backgroundLogs?: any[];
  showSystemLogs?: boolean;
  setShowSystemLogs?: (val: boolean) => void;
  reasoningIterations?: any[];
  metricsHistory?: any[];
  // Console tab props
  activeSubtitle?: string | null;
  typedSubtitle?: string;
  isSubtitleTyping?: boolean;
  lastAgentResponse?: string | null;
  setActiveSubtitle?: (val: string | null) => void;
  input?: string;
  setInput?: (val: string) => void;
  llmStreamingEnabled?: boolean;
  setLlmStreamingEnabled?: (val: boolean) => void;
  handleThink?: (e: any) => void;
  perceivedName?: string;
  SpeechService?: any;
  avatarOnInConsole?: boolean;
  setAvatarOnInConsole?: (val: boolean) => void;
  handleDream?: (currentMemories?: any[]) => void;
  handleConsolidate?: () => void;
  animations?: string[];
  setAnimations?: (val: any) => void;
  onRefreshIdentities?: () => Promise<void>;
  onAddLog?: (type: 'user' | 'agent', content: string) => void;
}

export const applyThemePalette = (themeId: string, customColor?: string) => {
  const palettes: Record<string, { primary: string; hover: string; shadow: string }> = {
    default: { primary: '#00bcd4', hover: '#1de4fc', shadow: '#00838f' },
    morandi: { primary: '#b85b4f', hover: '#ca7c72', shadow: '#974238' },
    monet: { primary: '#7ba2db', hover: '#a2bfec', shadow: '#5a80b8' },
    japanese: { primary: '#df8c8c', hover: '#eba4a4', shadow: '#b86868' },
    nordic: { primary: '#568296', hover: '#7aa2b5', shadow: '#3d5e6e' },
    chinese: { primary: '#c23b3b', hover: '#d95858', shadow: '#9c2424' }
  };
  
  let theme = palettes[themeId];
  if (themeId === 'custom' && customColor) {
    theme = {
      primary: customColor,
      hover: customColor + 'dd',
      shadow: customColor + 'aa'
    };
  }

  if (!theme && typeof window !== 'undefined') {
    const savedCustom = localStorage.getItem('yuihime_custom_primary_color');
    if (savedCustom) {
      theme = {
        primary: savedCustom,
        hover: savedCustom + 'dd',
        shadow: savedCustom + 'aa'
      };
    }
  }

  if (!theme) {
    theme = palettes.default;
  }

  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--primary-color', theme.primary);
    document.documentElement.style.setProperty('--primary-hover-color', theme.hover);
    document.documentElement.style.setProperty('--primary-shadow-color', theme.shadow);
    
    const event = new CustomEvent('yuihime_theme_changed', { detail: { themeId, colors: theme } });
    window.dispatchEvent(event);
  }
};


// Static provider config details imported from ./modular-settings/settingsConstants

import { ControlledTextInput, ControlledTextarea } from './modular-settings/SettingsHelperComponents';


export const ModularSettings: React.FC<ModularSettingsProps> = ({ 
  activeTab,
  setActiveTab,
  activeSessionId = 'default',
  onAvatarUpdate, 
  avatarConfig,
  onClose,
  currentLiveTopic, 
  setCurrentLiveTopic, 
  handleSimulateLive,
  showSubtitles,
  setShowSubtitles,
  showMobileNav,
  setShowMobileNav,
  showDebugPanel,
  setShowDebugPanel,
  ttsEnabled,
  setTtsEnabled,
  isSleeping,
  setIsSleeping,
  showChatFeed,
  setShowChatFeed,
  showInfoCard,
  setShowInfoCard,
  isMicEnabled,
  setIsMicEnabled,
  neuralCircuitStatus,
  pulseEnabled,
  setPulseEnabled,
  heuristics = [],
  handleOptimize = () => {},
  isLearning = false,
  identities = [],
  activePersonaId = '',
  setActivePersonaId = () => {},
  NEURAL_CORES = [],
  handleReflect = () => {},
  isThinking = false,
  status = 'idle',
  logs = [],
  onSave,
  state,
  memories = [],
  setMemories,
  dreams = [],
  knowledge = [],
  memorySearchQuery = '',
  setMemorySearchQuery = () => {},
  handleExtractKnowledge = () => {},
  backgroundLogs = [],
  showSystemLogs = false,
  setShowSystemLogs = () => {},
  reasoningIterations = [],
  metricsHistory: propMetricsHistory,
  activeSubtitle,
  typedSubtitle = '',
  isSubtitleTyping = false,
  lastAgentResponse = null,
  setActiveSubtitle = () => {},
  input = '',
  setInput = () => {},
  llmStreamingEnabled = true,
  setLlmStreamingEnabled = () => {},
  handleThink = () => {},
  perceivedName = 'chat',
  SpeechService,
  avatarOnInConsole = false,
  setAvatarOnInConsole = () => {},
  handleDream = () => {},
  handleConsolidate = () => {},
  animations = [],
  setAnimations = () => {},
  onRefreshIdentities,
  onAddLog
}) => {
  const [settings, setSettings] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [matrixMemorySubTab, setMatrixMemorySubTab] = useState<'memory' | 'matrix'>('memory');

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    if (settings && settings.developer) {
      const disableAutofocus = settings.developer.disableUiAutoFocus === true;
      localStorage.setItem('yuihime_disable_autofocus', JSON.stringify(disableAutofocus));
    }
  }, [settings]);
  const [unlockedSliders, setUnlockedSliders] = useState<Record<string, boolean>>({});
  const [activeCategory, setActiveCategory] = useState<'all' | 'persona' | 'ai' | 'sandbox' | 'system'>('all');
  const [activeSettingsTab, setActiveSettingsTab] = useState<ModuleType | 'ADDON' | 'VISUAL' | 'GENERAL' | 'SYSTEM' | 'CRON' | 'NEURAL_CIRCUIT' | 'SOUL'>('GENERAL');
  const [activeSoulTab, setActiveSoulTab] = useState<'identities' | 'heuristics' | 'reflect' | 'persistence' | 'archive' | 'dreams' | 'train'>('heuristics');

  // Multi-scene backdrop gallery support
  const defaultGalleryScenes = [
    {
      id: "cute_streaming_room",
      title: "Cute streaming room",
      url: "https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?auto=format&fit=crop&w=600&q=80"
    },
    {
      id: "cozy_tea_corner",
      title: "Cozy tea corner in garden",
      url: "https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=600&q=80"
    },
    {
      id: "cyberpunk_neon_deck",
      title: "Cyberpunk neon deck",
      url: "https://images.unsplash.com/photo-1507608869274-d3177c8bb4c7?auto=format&fit=crop&w=600&q=80"
    },
    {
      id: "zen_tatami_layout",
      title: "Zen tatami layout",
      url: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=600&q=80"
    },
    {
      id: "lofi_cozy_cafe",
      title: "Lo-fi cozy cafe",
      url: "https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=600&q=80"
    }
  ];

  const [uploadedScenes, setUploadedScenes] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem("yuihime_uploaded_scenes_v1");
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const galleryScenes = [...defaultGalleryScenes, ...uploadedScenes];

  const handleUploadToGallery = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (!base64) return;

      const newScene = {
        id: "upload_" + Date.now(),
        title: file.name.replace(/\.[^/.]+$/, ""), // remove extension
        url: base64
      };

      const updated = [...uploadedScenes, newScene];
      setUploadedScenes(updated);
      localStorage.setItem("yuihime_uploaded_scenes_v1", JSON.stringify(updated));

      // Instantly set it active
      syncBackdropLocal("custom");
      syncBdropUrlLocal(base64);
    };
    reader.readAsDataURL(file);
  };

  const [addons, setAddons] = useState<any[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);

  const [dynamicModels, setDynamicModels] = useState<Record<string, any[]>>({});
  const [metricsHistory, setMetricsHistory] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [registryVersion, setRegistryVersion] = useState(0);

  // AIRI Stage-Web sub-page navigation state
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [selectedSubmoduleCategory, setSelectedSubmoduleCategory] = useState<string | null>(null);
  const [showMarkdownStressTest, setShowMarkdownStressTest] = useState(false);
  const [activeAgiTab, setActiveAgiTab] = useState<'telemetry' | 'lattice' | 'reflect'>('telemetry');

  // Dynamic Yuihime System Version loading
  const [yuihimeVersionInfo, setYuihimeVersionInfo] = useState<{ version: string; date: string; turn: string } | null>(null);

  // Floating info display text state matching user setting requirements
  const [activeInfoText, setActiveInfoText] = useState<{ title: string; text: string } | null>(null);
  const handleShowInfo = (title: string, text: string) => {
    setActiveInfoText({ title, text });
  };

  // State to support custom text typing for model list selectors (satisfying "list model jangan hardcode")
  const [customInputMode, setCustomInputMode] = useState<Record<string, boolean>>({});

  const [tgStatus, setTgStatus] = useState<any>(null);
  const [tgTesting, setTgTesting] = useState<boolean>(false);

  const fetchTgStatus = async () => {
    setTgTesting(true);
    try {
      const res = await fetch("/api/telegram/status");
      const data = await res.json();
      setTgStatus(data);
    } catch (e: any) {
      setTgStatus({
        initialized: false,
        error: e.message || String(e),
        message: "Failed to connect to local Webhook Gateway server."
      });
    } finally {
      setTgTesting(false);
    }
  };

  const recreateTgBot = async (dropPending = false) => {
    setTgTesting(true);
    try {
      const res = await fetch(`/api/telegram/recreate?dropPending=${dropPending}`, { method: "POST" });
      const data = await res.json();
      setTgStatus({
        initialized: data.success,
        botInfo: data.botInfo,
        webhookInfo: data.webhookInfo,
        message: data.message,
        error: data.error
      });
    } catch (e: any) {
      setTgStatus({
        initialized: false,
        error: e.message || String(e),
        message: "Failed to issue recreate command to local daemon server."
      });
    } finally {
      setTgTesting(false);
    }
  };

  useEffect(() => {
    StorageService.getSystemVersion().then(res => {
      if (res && res.success) {
        setYuihimeVersionInfo({
          version: res.version,
          date: res.date,
          turn: res.turn
        });
      }
    });
  }, [selectedSection]);

  // Search feature for control panel / settings
  const [settingsSearchQuery, setSettingsSearchQuery] = useState('');

  // States for System Logs Tab
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [logLevelFilter, setLogLevelFilter] = useState<'all' | 'info' | 'warn' | 'error' | 'agent' | 'user' | 'system'>('all');
  const [logStreamType, setLogStreamType] = useState<'console' | 'cognitive' | 'audit' | 'llm'>('console');
  const [logScrollLock, setLogScrollLock] = useState(true);
  const [clearedLogsTimestamp, setClearedLogsTimestamp] = useState<number>(0);

  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);

  const [llmLogs, setLlmLogs] = useState<any[]>([]);
  const [llmLogsLoading, setLlmLogsLoading] = useState(false);

  const fetchAuditLogs = async () => {
    try {
      setAuditLogsLoading(true);
      const res = await fetch("/api/cortex/audit-logs");
      const data = await res.json();
      if (data.success && data.auditLogs) {
        setAuditLogs(data.auditLogs);
      }
    } catch (err) {
      console.error("[UI] Failed to fetch audit logs:", err);
    } finally {
      setAuditLogsLoading(false);
    }
  };

  const clearAuditLogs = async () => {
    try {
      await fetch("/api/cortex/audit-logs/clear", { method: "POST" });
      setAuditLogs([]);
    } catch (err) {
      console.error("[UI] Failed to clear audit logs:", err);
    }
  };

  const fetchLlmLogs = async () => {
    try {
      setLlmLogsLoading(true);
      const res = await fetch("/api/cortex/llm-logs");
      const data = await res.json();
      if (data.success && data.logs) {
        setLlmLogs(data.logs);
      }
    } catch (err) {
      console.error("[UI] Failed to fetch LLM I/O logs:", err);
    } finally {
      setLlmLogsLoading(false);
    }
  };

  const clearLlmLogs = async () => {
    try {
      await fetch("/api/cortex/llm-logs/clear", { method: "POST" });
      setLlmLogs([]);
    } catch (err) {
      console.error("[UI] Failed to clear LLM I/O logs:", err);
    }
  };

  useEffect(() => {
    if (selectedSection === 'logs' || selectedSection === 'audit' || logStreamType === 'audit') {
      fetchAuditLogs();
    }
    if (selectedSection === 'logs' && logStreamType === 'llm') {
      fetchLlmLogs();
    }
  }, [selectedSection, logStreamType]);

  // WebSocket Connection Test Suite States
  const [testWsUrl, setTestWsUrl] = useState('');
  const [testWsStatus, setTestWsStatus] = useState<'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR'>('DISCONNECTED');
  const [testWsLogs, setTestWsLogs] = useState<Array<{ type: 'tx' | 'rx' | 'sys', message: string, timestamp: string }>>([]);
  const [testWsMsg, setTestWsMsg] = useState(JSON.stringify({ type: "ping", origin: "Yuihime UI" }, null, 2));
  const [wsClientRef, setWsClientRef] = useState<WebSocket | null>(null);

  // Cross-Platform Pairing States
  const [pairingCode, setPairingCode] = useState<string>('');
  const [pairingExpiry, setPairingExpiry] = useState<number>(0);
  const [pairingLoading, setPairingLoading] = useState<boolean>(false);
  const [pairingLinked, setPairingLinked] = useState<boolean>(false);
  const [pairingLinkedAccounts, setPairingLinkedAccounts] = useState<string[]>([]);

  const generatePairingCode = async () => {
    try {
      setPairingLoading(true);
      const res = await fetch('/api/pair/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ perceivedName })
      });
      const data = await res.json();
      if (data.success) {
        setPairingCode(data.code);
        setPairingExpiry(data.expires_at);
      } else {
        console.error("Gagal men-generate pairing code:", data.error || data);
      }
    } catch (err) {
      console.error("Kesalahan jaringan saat generate OTP:", err);
    } finally {
      setPairingLoading(false);
    }
  };

  const checkPairingStatus = async (signal?: AbortSignal) => {
    if (!perceivedName) return;
    try {
      const res = await fetch(`/api/pair/status/${encodeURIComponent(perceivedName)}`, { signal });
      if (!res.ok) {
        throw new Error(`HTTP status ${res.status}`);
      }
      const data = await res.json();
      if (data.success) {
        setPairingLinked(data.linked);
        setPairingLinkedAccounts(data.linkedAccounts || []);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.warn("[SETTINGS] Pemeriksaan status tautan platform ditunda karena masalah koneksi:", err?.message || err);
    }
  };

  // Reverse Pairing States (Bot to Web)
  const [botPairingCode, setBotPairingCode] = useState<string>('');
  const [botPairingLoading, setBotPairingLoading] = useState<boolean>(false);
  const [botPairingMessage, setBotPairingMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const claimBotPairingCode = async () => {
    if (!botPairingCode) return;
    try {
      setBotPairingLoading(true);
      setBotPairingMessage(null);
      const res = await fetch('/api/pair/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: botPairingCode.trim(),
          perceivedName
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setBotPairingMessage({ type: 'success', text: data.message });
        setBotPairingCode('');
        checkPairingStatus();
      } else {
        setBotPairingMessage({ type: 'error', text: data.error || 'Gagal memproses kode bot.' });
      }
    } catch (err: any) {
      setBotPairingMessage({ type: 'error', text: 'Gagal menghubungi server batin Yui.' });
    } finally {
      setBotPairingLoading(false);
    }
  };

  useEffect(() => {
    let interval: any = null;
    const controller = new AbortController();
    if (selectedSection === 'connection') {
      checkPairingStatus(controller.signal);
      interval = setInterval(() => checkPairingStatus(controller.signal), 4000); // Check status every 4 seconds
    }
    return () => {
      controller.abort();
      if (interval) clearInterval(interval);
    };
  }, [selectedSection, perceivedName]);

  // Model Data and Selector States
  const [allModelsList, setAllModelsList] = useState<any[]>(() => {
    const basePresets = [
      {
        id: 'hiyori',
        name: 'Hiyori (Pro)',
        type: 'Live2D',
        url: '/models/hiyori/hiyori_free_t08.model3.json',
        imageUrl: 'https://raw.githubusercontent.com/Live2D/CubismWebSamples/master/Resources/Hiyori/Hiyori.png',
        desc: 'Premium integrated Hiyori student model. Fully hosted offline, highly emotive and configured for lightning-fast loading.'
      },
      {
        id: 'wanko',
        name: 'Wanko',
        type: 'Live2D',
        url: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/live2d-3/v3/wanko/wanko.model3.json',
        imageUrl: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?q=80&w=300&auto=format&fit=crop',
        desc: 'Cute animated puppy companion to snuggle up on the stream.'
      },
      {
        id: 'aether',
        name: 'Aether (3D VRM)',
        type: 'VRM',
        url: 'https://pixiv.github.io/three-vrm/packages/three-vrm/examples/models/three-vrm-girl.vrm',
        imageUrl: 'https://images.unsplash.com/photo-1618336753974-aae8e04506aa?q=80&w=300&auto=format&fit=crop',
        desc: 'Stunning 3D anime character model with full three-dimensional spatial rotation.'
      },
      {
        id: 'nova',
        name: 'Nova (3D VRM)',
        type: 'VRM',
        url: 'https://cdn.jsdelivr.net/gh/pixiv/three-vrm@master/packages/three-vrm/examples/models/three-vrm-girl.vrm',
        imageUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=300&auto=format&fit=crop',
        desc: 'Futuristic sci-fi neon cybernetic model.'
      }
    ];

    const saved = localStorage.getItem('yuihime_cached_models_v2');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return [...basePresets, ...parsed];
        }
      } catch (e) {
        console.warn('Failed parsing cached models:', e);
      }
    }
    return basePresets;
  });

  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [selectedModelInSelector, setSelectedModelInSelector] = useState<any>(null);
  const [customModelUrlInput, setCustomModelUrlInput] = useState('');
  const [customModelNameInput, setCustomModelNameInput] = useState('');
  const [customModelTypeInput, setCustomModelTypeInput] = useState<'Live2D' | 'VRM'>('Live2D');
  const [showImportForm, setShowImportForm] = useState(false);

  // States for Character Card Management (Unified with DEFAULT_NEURAL_CORES)
  const buildBaseCards = () => DEFAULT_NEURAL_CORES.map((core: any) => ({
    id: core.id,
    name: core.name,
    nickname: core.nickname || core.id,
    description: core.description,
    creatorNotes: `Core archetype: ${core.archetype}`,
    version: '1.0.0',
    behavior: {
      firstMessage: `Halo! Frekuensi batin pesona ${core.name} aktif.`,
      scenario: 'Live interaction and cognitive processing',
      examples: ''
    },
    settings: { temperature: 0.7, systemPrompt: core.systemPrompt || '' },
    color: core.color,
    traits: core.traits,
    archetype: core.archetype
  }));

  const mergeCard = (base: any, override: any) => {
    if (!override) return base;
    const merged = { ...base, ...override };
    if (override.behavior) merged.behavior = { ...(base.behavior || {}), ...override.behavior };
    if (override.settings) merged.settings = { ...(base.settings || {}), ...override.settings };
    return merged;
  };

  const [characterCards, setCharacterCards] = useState<any[]>(() => {
    const saved = localStorage.getItem('yuihime_character_cards');
    let base = buildBaseCards();
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.length > 0) {
          base = parsed.reduce((acc: any[], item: any) => {
            const idx = acc.findIndex(c => c.id === item.id);
            if (idx >= 0) {
              acc[idx] = mergeCard(acc[idx], item);
            } else {
              acc.push(item);
            }
            return acc;
          }, [...base]);
        }
      } catch (e) {}
    }
    return base;
  });

  useEffect(() => {
    let mounted = true;
    fetch('/api/system/personas')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch personas');
        return res.json();
      })
      .then((apiPersonas: any[]) => {
        if (!mounted) return;
        setCharacterCards(prev => {
          const base = buildBaseCards();
          const merged = [...base];
          for (const apiP of apiPersonas) {
            const idx = merged.findIndex(c => c.id === apiP.id);
            if (idx >= 0) {
              merged[idx] = mergeCard(merged[idx], apiP);
            } else {
              merged.push(apiP);
            }
          }
          return merged;
        });
      })
      .catch(err => console.warn('Failed to load personas from API:', err));
    return () => { mounted = false; };
  }, []);

  const [activeCardId, setActiveCardId] = useState<string>(() => {
    return activePersonaId || localStorage.getItem('yuihime_active_card_id') || 'hiyori';
  });

  const [editingCard, setEditingCard] = useState<any | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editModalTab, setEditModalTab] = useState<'identity' | 'behavior' | 'settings'>('identity');

  const [cardForm, setCardForm] = useState<any>({
    name: '',
    nickname: '',
    description: '',
    creatorNotes: '',
    version: '1.0.0',
    behavior: { firstMessage: '', scenario: '', examples: '' },
    settings: { temperature: 0.7, systemPrompt: '' }
  });

  useEffect(() => {
    localStorage.setItem('yuihime_character_cards', JSON.stringify(characterCards));
  }, [characterCards]);

  useEffect(() => {
    if (activePersonaId && activePersonaId !== activeCardId) {
      setActiveCardId(activePersonaId);
    }
  }, [activePersonaId]);

  useEffect(() => {
    localStorage.setItem('yuihime_active_card_id', activeCardId);
    if (activePersonaId !== activeCardId) {
      setActivePersonaId?.(activeCardId);
    }
  }, [activeCardId, activePersonaId, setActivePersonaId]);

  const handleEditCard = (card: any) => {
    setEditingCard(card);
    setCardForm({
      id: card.id,
      name: card.name || '',
      nickname: card.nickname || '',
      description: card.description || '',
      creatorNotes: card.creatorNotes || '',
      version: card.version || '1.0.0',
      behavior: card.behavior || { firstMessage: '', scenario: '', examples: '' },
      settings: card.settings || { temperature: 0.7, systemPrompt: '' }
    });
    setEditModalTab('identity');
    setIsEditModalOpen(true);
  };

  const handleCreateCard = () => {
    setEditingCard(null);
    setCardForm({
      name: '',
      nickname: '',
      description: '',
      creatorNotes: '',
      version: '1.0.0',
      behavior: { firstMessage: '', scenario: '', examples: '' },
      settings: { temperature: 0.7, systemPrompt: '' }
    });
    setEditModalTab('identity');
    setIsEditModalOpen(true);
  };

  const handleSaveCard = () => {
    if (!cardForm.name.trim() || !cardForm.description.trim()) {
      alert("Name and Description are required fields.");
      return;
    }
    let updatedCards;
    if (editingCard && editingCard.id) {
      updatedCards = characterCards.map(c => c.id === editingCard.id ? { ...cardForm } : c);
    } else {
      const newId = 'card_' + Date.now();
      updatedCards = [...characterCards, { ...cardForm, id: newId }];
    }
    setCharacterCards(updatedCards);
    setIsEditModalOpen(false);
    setEditingCard(null);
  };

  const [backdrop, setBackdrop] = useState<string>(() => {
    return localStorage.getItem('yuihime_stage_backdrop') || 'matrix';
  });
  const [customImgUrl, setCustomImgUrl] = useState<string>(() => {
    return localStorage.getItem('yuihime_stage_backdrop_custom') || '';
  });

  const handleSelectBackdrop = (type: string) => {
    setBackdrop(type);
    localStorage.setItem('yuihime_stage_backdrop', type);
    const event = new CustomEvent('yuihime_backdrop_changed', { detail: { type, customImgUrl } });
    window.dispatchEvent(event);
  };

  const handleCustomUrlChange = (url: string) => {
    setCustomImgUrl(url);
    localStorage.setItem('yuihime_stage_backdrop_custom', url);
    if (backdrop === 'custom') {
      const event = new CustomEvent('yuihime_backdrop_changed', { detail: { type: 'custom', customImgUrl: url } });
      window.dispatchEvent(event);
    }
  };

  // Sub-pages states for systemic rendering matching airi.moeru.ai
  const [systemSubpage, setSystemSubpage] = useState<string | null>(null);
  const [providerSubpage, setProviderSubpage] = useState<string | null>(null);

  // Custom states for dynamic selection and hub filtering (Yuihime)
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [modelsCollapsed, setModelsCollapsed] = useState<boolean>(true);
  const [credentialsCollapsed, setCredentialsCollapsed] = useState<boolean>(true);
  const [expandedModels, setExpandedModels] = useState<Record<string, boolean>>({});
  const [providerSubTab, setProviderSubTab] = useState<'chat' | 'speech' | 'transcription' | 'artistry'>('chat');
  const [pricingFilter, setPricingFilter] = useState<'all' | 'free' | 'paid'>('all');
  const [deploymentFilter, setDeploymentFilter] = useState<'all' | 'local' | 'cloud'>('all');

  // Custom ElevenLabs playtest playground states
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState<string>('');
  const [elevenLabsPitch, setElevenLabsPitch] = useState<number>(50);
  const [elevenLabsSpeed, setElevenLabsSpeed] = useState<number>(1);
  const [elevenLabsVolume, setElevenLabsVolume] = useState<number>(100);
  const [elevenLabsStyle, setElevenLabsStyle] = useState<number>(0);
  const [elevenLabsStability, setElevenLabsStability] = useState<number>(0.5);
  const [elevenLabsSimilarity, setElevenLabsSimilarity] = useState<number>(0.75);
  const [elevenLabsSpeakerBoost, setElevenLabsSpeakerBoost] = useState<boolean>(true);
  const [elevenLabsBaseUrl, setElevenLabsBaseUrl] = useState<string>('https://unspeech.hyp3r.link/v1/');
  const [elevenLabsSSML, setElevenLabsSSML] = useState<boolean>(false);
  const [elevenLabsVoice, setElevenLabsVoice] = useState<string>('');
  const [elevenLabsText, setElevenLabsText] = useState<string>('Hello! This is a test of the ElevenLabs voice synthesis.');

  // Custom OpenAI/Whisper transcription playground states
  const [openAiApiKey, setOpenAiApiKey] = useState<string>('');
  const [openAiModel, setOpenAiModel] = useState<string>('Whisper-1');
  const [audioDevice, setAudioDevice] = useState<string>('Default');
  const [isMonitoring, setIsMonitoring] = useState<boolean>(false);
  const [simulateLevel, setSimulateLevel] = useState<number>(0);
  const [simulateProb, setSimulateProb] = useState<number>(0);
  const [openAiSensitivity, setOpenAiSensitivity] = useState<number>(29);

  // Web Speech API Test States
  const [isSstTesting, setIsSstTesting] = useState<boolean>(false);
  const [sstTranscript, setSstTranscript] = useState<string>('');
  const [sstError, setSstError] = useState<string>('');
  const [availableMics, setAvailableMics] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('default');

  // Enumerate active multimedia mics on window setup
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices()
        .then(devices => {
          const mics = devices.filter(d => d.kind === 'audioinput');
          setAvailableMics(mics);
        })
        .catch(err => {
          console.warn("Could not load media devices under Yuihime Hearing:", err);
        });
    }
  }, []);

  // Synchronize sidebar activeTab with selectedSection using TabRegistry
  useEffect(() => {
    if (activeTab) {
      const tabDef = TabRegistry.getTab(activeTab);
      if (tabDef) {
        if (tabDef.componentType === 'settings') {
          setSelectedSection(tabDef.sectionId || null);
          if (tabDef.subTabId) {
            setActiveSoulTab(tabDef.subTabId as any);
          }
        }
      }
    }
  }, [activeTab]);

  // Register the yuihime_goto_section event listener to allow other components (like ModulesTab)
  // to request navigation redirect safely.
  useEffect(() => {
    const handleGotoSection = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent?.detail) {
        if (typeof customEvent.detail === 'object') {
          const { section, category } = customEvent.detail;
          if (section) {
            setSelectedSection(section);
            if (section === 'providers') {
              setProviderSubpage(null);
            }
          }
          if (category !== undefined) {
            setSelectedSubmoduleCategory(category);
          }
        } else {
          setSelectedSection(customEvent.detail);
          if (customEvent.detail === 'providers') {
            setProviderSubpage(null);
          }
          setSelectedSubmoduleCategory(null);
        }
      }
    };
    window.addEventListener('yuihime_goto_section', handleGotoSection);
    return () => {
      window.removeEventListener('yuihime_goto_section', handleGotoSection);
    };
  }, []);

  // Guarantee that when selected section changes to providers, subpage is reset to list
  useEffect(() => {
    if (selectedSection === 'providers') {
      setProviderSubpage(null);
    }
  }, [selectedSection]);

  // Reset scroll of settings panel to top when changing section, navigation subpages, or activeTab
  useEffect(() => {
    const scrollContainer = document.getElementById('settings-scroll-container');
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
    }
    window.scrollTo({ top: 0 });
  }, [activeTab, selectedSection, systemSubpage, providerSubpage, activeSettingsTab, activeSoulTab]);

  useEffect(() => {
    let active = true;
    let streamObj: MediaStream | null = null;
    let audioCtx: AudioContext | null = null;
    let animationId: number | null = null;
    let fallbackInterval: any = null;

    if (isMonitoring) {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ audio: selectedMicId !== 'default' ? { deviceId: { exact: selectedMicId } } : true })
          .then(stream => {
            if (!active) {
              stream.getTracks().forEach(t => t.stop());
              return;
            }
            streamObj = stream;
            try {
              const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
              const ctx = new AudioContextClass();
              audioCtx = ctx;
              const source = ctx.createMediaStreamSource(stream);
              const analyser = ctx.createAnalyser();
              analyser.fftSize = 256;
              source.connect(analyser);

              const bufferLength = analyser.frequencyBinCount;
              const dataArray = new Uint8Array(bufferLength);

              const checkVolume = () => {
                if (!active) return;
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) {
                  sum += dataArray[i];
                }
                const average = sum / bufferLength;
                const pct = Math.min(Math.round((average / 100) * 100), 100);
                setSimulateLevel(pct);

                // Probability of speech tracks with decibels
                const prob = pct > 0 ? Math.min(Math.round(pct * 1.5 + (Math.random() * 8 - 4)), 100) : 0;
                setSimulateProb(prob);

                animationId = requestAnimationFrame(checkVolume);
              };
              checkVolume();
            } catch (e) {
              console.warn("Failed to init AudioContext:", e);
              runSimulation();
            }
          })
          .catch(err => {
            console.warn("User mic access denied/failed, using simulation fallback:", err);
            runSimulation();
          });
      } else {
        runSimulation();
      }
    } else {
      setSimulateLevel(0);
      setSimulateProb(0);
    }

    function runSimulation() {
      fallbackInterval = setInterval(() => {
        if (!active) return;
        const time = Date.now() / 1000;
        const isSpeakingPhase = Math.sin(time / 2) > -0.2; // speech rhythm
        if (isSpeakingPhase) {
          const lv = Math.floor(Math.sin(time * 5) * 20 + 40 + Math.random() * 15);
          setSimulateLevel(Math.max(0, Math.min(100, lv)));
          setSimulateProb(Math.min(100, Math.floor(lv * 1.25 + Math.random() * 10)));
        } else {
          setSimulateLevel(Math.floor(Math.random() * 3));
          setSimulateProb(Math.floor(Math.random() * 3));
        }
      }, 100);
    }

    return () => {
      active = false;
      if (streamObj) {
        streamObj.getTracks().forEach(t => t.stop());
      }
      if (audioCtx) {
        audioCtx.close().catch(() => {});
      }
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
      }
    };
  }, [isMonitoring, selectedMicId]);

  // Web Speech API client control runner
  useEffect(() => {
    let active = true;
    let recognition: any = null;

    if (isSstTesting) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setSstError("Web Speech API is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Safari.");
        setIsSstTesting(false);
        return;
      }

      try {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = settings.web_speech_api?.lang || 'en-US';

        recognition.onstart = () => {
          if (!active) return;
          setSstTranscript('');
          setSstError('');
        };

        recognition.onerror = (event: any) => {
          if (!active) return;
          console.error("Speech Recognition Error:", event.error);
          setSstError(`Speech Recognition Error: ${event.error}`);
          setIsSstTesting(false);
        };

        recognition.onend = () => {
          if (!active) return;
          setIsSstTesting(false);
        };

        recognition.onresult = (event: any) => {
          if (!active) return;
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }

          const fullText = finalTranscript || interimTranscript;
          setSstTranscript(fullText);
        };

        recognition.start();
      } catch (err: any) {
        console.error("Speech recognition initialization error:", err);
        setSstError(`Failed: ${err.message || err}`);
        setIsSstTesting(false);
      }
    }

    return () => {
      active = false;
      if (recognition) {
        try {
          recognition.stop();
        } catch (e) {}
      }
    };
  }, [isSstTesting, settings?.web_speech_api?.lang]);

  useEffect(() => {
    if (settings) {
      if (settings.elevenlabs) {
        setElevenLabsApiKey(settings.elevenlabs.apiKey || '');
        setElevenLabsPitch(settings.elevenlabs.pitch !== undefined ? settings.elevenlabs.pitch : 50);
        setElevenLabsSpeed(settings.elevenlabs.speed !== undefined ? settings.elevenlabs.speed : 1);
        setElevenLabsVolume(settings.elevenlabs.volume !== undefined ? settings.elevenlabs.volume : 100);
        setElevenLabsStyle(settings.elevenlabs.style !== undefined ? settings.elevenlabs.style : 0);
        setElevenLabsStability(settings.elevenlabs.stability !== undefined ? settings.elevenlabs.stability : 0.5);
        setElevenLabsSimilarity(settings.elevenlabs.similarity !== undefined ? settings.elevenlabs.similarity : 0.75);
        setElevenLabsSpeakerBoost(settings.elevenlabs.speakerBoost !== undefined ? settings.elevenlabs.speakerBoost : true);
        setElevenLabsBaseUrl(settings.elevenlabs.baseUrl || 'https://unspeech.hyp3r.link/v1/');
        setElevenLabsSSML(settings.elevenlabs.useSSML !== undefined ? settings.elevenlabs.useSSML : false);
        setElevenLabsVoice(settings.elevenlabs.voice || '');
        setElevenLabsText(settings.elevenlabs.testText || 'Hello! This is a test of the ElevenLabs voice synthesis.');
      }
      if (settings.openai) {
        setOpenAiApiKey(settings.openai.apiKey || '');
        setOpenAiModel(settings.openai.model || 'Whisper-1');
        setAudioDevice(settings.openai.audioDevice || 'Default');
        setOpenAiSensitivity(settings.openai.sensitivity !== undefined ? settings.openai.sensitivity : 25);
      }
    }
  }, [settings]);

  const updateElevenLabsLocal = (field: string, value: any) => {
    setElevenLabsApiKey(prev => {
      const updatedVal = field === 'apiKey' ? value : prev;
      return updatedVal;
    });
    setSettings((prev: any) => ({
      ...prev,
      elevenlabs: {
        ...(prev.elevenlabs || {}),
        [field]: value
      }
    }));
  };

  const updateFallbackChain = (newChain: any[]) => {
    setSettings((prev: any) => ({
      ...prev,
      gemini: {
        ...(prev.gemini || {}),
        fallbackChain: newChain
      }
    }));
  };

  const addFallbackRow = () => {
    const currentChain = settings.gemini?.fallbackChain || [];
    const newRow = {
      id: Math.random().toString(36).substr(2, 9),
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      apiKey: ''
    };
    updateFallbackChain([...currentChain, newRow]);
  };

  const deleteFallbackRow = (id: string) => {
    const currentChain = settings.gemini?.fallbackChain || [];
    updateFallbackChain(currentChain.filter((r: any) => r.id !== id));
  };

  const moveFallbackRowUp = (index: number) => {
    const currentChain = [...(settings.gemini?.fallbackChain || [])];
    if (index > 0) {
      const temp = currentChain[index];
      currentChain[index] = currentChain[index - 1];
      currentChain[index - 1] = temp;
      updateFallbackChain(currentChain);
    }
  };

  const moveFallbackRowDown = (index: number) => {
    const currentChain = [...(settings.gemini?.fallbackChain || [])];
    if (index < currentChain.length - 1) {
      const temp = currentChain[index];
      currentChain[index] = currentChain[index + 1];
      currentChain[index + 1] = temp;
      updateFallbackChain(currentChain);
    }
  };

  const editFallbackRow = (id: string, field: string, value: any) => {
    const currentChain = settings.gemini?.fallbackChain || [];
    const updated = currentChain.map((r: any) => {
      if (r.id === id) {
         const newRow = { ...r, [field]: value };
         if (field === 'provider') {
            newRow.model = '';
         }
         return newRow;
      }
      return r;
    });
    updateFallbackChain(updated);
  };

  const updateOpenAiLocal = (field: string, value: any) => {
    setOpenAiApiKey(prev => {
      const updatedVal = field === 'apiKey' ? value : prev;
      return updatedVal;
    });
    setSettings((prev: any) => ({
      ...prev,
      openai: {
        ...(prev.openai || {}),
        [field]: value
      }
    }));
  };

  useEffect(() => {
    if (propMetricsHistory) {
      setMetricsHistory(propMetricsHistory);
    }
  }, [propMetricsHistory]);

  // Scene/Backdrop state synced locally
  const [selectedBackdrop, setSelectedBackdrop] = useState<string>(() => {
    return localStorage.getItem('yuihime_stage_backdrop') || 'matrix';
  });
  const [customBdropUrl, setCustomBdropUrl] = useState<string>(() => {
    return localStorage.getItem('yuihime_stage_backdrop_custom') || '';
  });

  useEffect(() => {
    loadSettings();
    loadAddons();
    
    // Auth Listener
    const unsubscribe = StorageService.onAuthStateChanged((u) => setUser(u));
    
    // Registry discovery listener
    const unsubscribeRegistry = SystemRegistry.subscribe(() => {
      setRegistryVersion(v => v + 1);
      
      const providers = SystemRegistry.getProviders();
      const initialModels: Record<string, any[]> = {};
      providers.forEach(p => {
         const modelField = (p.metadata.configSchema?.fields as any)?.model;
         if (modelField?.options) {
           initialModels[p.metadata.id] = modelField.options;
         }
      });
      setDynamicModels(prev => ({ ...initialModels, ...prev }));
    });
    
    // Load metrics
    const loadMetrics = async () => {
      const data = await StorageService.getSystemMetrics();
      setMetricsHistory(data);
    };
    if (!propMetricsHistory) {
      loadMetrics();
    } else {
      setMetricsHistory(propMetricsHistory);
    }

    return () => {
      unsubscribe();
      unsubscribeRegistry();
    };
  }, []);

  useEffect(() => {
    const activeProviderId = settings.provider || '';
    const providerToFetch = activeProviderId;
    
    if (providerToFetch && providerToFetch !== '' && !fetchingModels && (!dynamicModels[providerToFetch] || dynamicModels[providerToFetch].length === 0)) {
      fetchDynamicModels(providerToFetch);
    }
  }, [settings.provider, registryVersion, settings]);

  const fetchDynamicModels = async (providerId: string) => {
    if (!providerId || providerId === 'null') return;
    setFetchingModels(true);
    try {
      const provider = SystemRegistry.getProvider(providerId);
      let models: any[] = [];
      
      if (provider && provider.getModels) {
        const config = settings[providerId] || {};
        models = await provider.getModels(config);
      }

      if ((!models || models.length === 0) && providerId) {
        const config = settings[providerId] || {};
        const apiKey = (config.apiKey || config.api_key || '').toString();
        const baseUrl = (config.baseUrl || config.endpoint || '').toString();
        const url = `/api/ai/models?provider=${providerId}&apiKey=${encodeURIComponent(apiKey)}&baseUrl=${encodeURIComponent(baseUrl)}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          models = (data.models || []).map((m: any) => ({
            label: m.displayName || m.name.split('/').pop() || m.name,
            value: m.name.split('/').pop() || m.name
          }));
        }
      }

      if (models && models.length > 0) {
        setDynamicModels(prev => ({ ...prev, [providerId]: models }));
      }
    } catch (e) {
      console.error("[CORE] Dynamic sync failed:", e);
    } finally {
      setFetchingModels(false);
    }
  };

  const loadAddons = async () => {
    try {
      const res = await fetch('/api/addons');
      if (res.ok) {
        const data = await res.json();
        setAddons(data);
      }
    } catch (e) {
      console.warn("Failed to load addons");
    }
  };

  const loadSettings = async () => {
    setLoading(true);
    const data = await StorageService.getModularSettings();
    
    // Initialize missing module defaults
    const allModules = SystemRegistry.getModules();
    const initializedSettings = { ...data };
    
    // Ensure core overlaps are present
    if (!initializedSettings.provider) initializedSettings.provider = '';
    if (!initializedSettings.ttsProvider) initializedSettings.ttsProvider = '';
    if (!initializedSettings.characterName) initializedSettings.characterName = RUNTIME_DEFAULTS.characterName;
    if (!initializedSettings.avatar) {
      initializedSettings.avatar = { ...RUNTIME_DEFAULTS.avatar };
    }

    if (!initializedSettings.colorScheme) {
      initializedSettings.colorScheme = { ...RUNTIME_DEFAULTS.colorScheme };
    }
    if (!initializedSettings.sandbox_paths) {
      initializedSettings.sandbox_paths = {
        ...RUNTIME_DEFAULTS.sandbox_paths,
      };
    } else {
      if (initializedSettings.sandbox_paths.auto_acc_user_data === undefined) {
        initializedSettings.sandbox_paths.auto_acc_user_data = RUNTIME_DEFAULTS.sandbox_paths.auto_acc_user_data;
      }
      if (initializedSettings.sandbox_paths.yolo_mode === undefined) {
        initializedSettings.sandbox_paths.yolo_mode = RUNTIME_DEFAULTS.sandbox_paths.yolo_mode;
      }
      if (initializedSettings.sandbox_paths.confirmation_timeout === undefined) {
        initializedSettings.sandbox_paths.confirmation_timeout = RUNTIME_DEFAULTS.sandbox_paths.confirmation_timeout;
      }
      if (initializedSettings.sandbox_paths.data_dir === undefined) {
        initializedSettings.sandbox_paths.data_dir = RUNTIME_DEFAULTS.sandbox_paths.data_dir;
      }
      if (initializedSettings.sandbox_paths.config_path === undefined) {
        initializedSettings.sandbox_paths.config_path = RUNTIME_DEFAULTS.sandbox_paths.config_path;
      }
      if (initializedSettings.sandbox_paths.db_path === undefined) {
        initializedSettings.sandbox_paths.db_path = RUNTIME_DEFAULTS.sandbox_paths.db_path;
      }
      if (initializedSettings.sandbox_paths.user_data_path === undefined) {
        initializedSettings.sandbox_paths.user_data_path = RUNTIME_DEFAULTS.sandbox_paths.user_data_path;
      }
      if (initializedSettings.sandbox_paths.agent_path === undefined) {
        initializedSettings.sandbox_paths.agent_path = RUNTIME_DEFAULTS.sandbox_paths.agent_path;
      }
      if (initializedSettings.sandbox_paths.addons_path === undefined) {
        initializedSettings.sandbox_paths.addons_path = RUNTIME_DEFAULTS.sandbox_paths.addons_path;
      }
    }
    if (!initializedSettings.developer) {
      initializedSettings.developer = { ...RUNTIME_DEFAULTS.developer };
    } else {
      if (initializedSettings.developer.disableUiAutoFocus === undefined) {
        initializedSettings.developer.disableUiAutoFocus = RUNTIME_DEFAULTS.developer.disableUiAutoFocus;
      }
      if (initializedSettings.developer.audioRecordMode === undefined) {
        initializedSettings.developer.audioRecordMode = RUNTIME_DEFAULTS.developer.audioRecordMode;
      }
      if (initializedSettings.developer.bgThemeBlending === undefined) {
        initializedSettings.developer.bgThemeBlending = RUNTIME_DEFAULTS.developer.bgThemeBlending;
      }
      if (initializedSettings.developer.chatOverlay === undefined) {
        initializedSettings.developer.chatOverlay = RUNTIME_DEFAULTS.developer.chatOverlay;
      }
      if (initializedSettings.developer.disableStageTransitions === undefined) {
        initializedSettings.developer.disableStageTransitions = RUNTIME_DEFAULTS.developer.disableStageTransitions;
      }
      if (initializedSettings.developer.pageSpecificTransitions === undefined) {
        initializedSettings.developer.pageSpecificTransitions = RUNTIME_DEFAULTS.developer.pageSpecificTransitions;
      }
      if (initializedSettings.developer.performanceVisualizer === undefined) {
        initializedSettings.developer.performanceVisualizer = RUNTIME_DEFAULTS.developer.performanceVisualizer;
      }
      if (initializedSettings.developer.bgRemoval === undefined) {
        initializedSettings.developer.bgRemoval = RUNTIME_DEFAULTS.developer.bgRemoval;
      }
    }
    applyThemePalette(initializedSettings.colorScheme.selected || 'default');

    allModules.forEach(m => {
      if (!initializedSettings[m.metadata.id] && m.metadata.configSchema) {
        const defaults: any = {};
        Object.entries(m.metadata.configSchema.fields).forEach(([key, field]: [string, any]) => {
          if (field.default !== undefined) defaults[key] = field.default;
        });
        initializedSettings[m.metadata.id] = defaults;
      }
    });

    setSettings(initializedSettings);
    let finalUrl = '';
    if (initializedSettings.connectionWebsocketUrl) {
      setTestWsUrl(initializedSettings.connectionWebsocketUrl);
      finalUrl = initializedSettings.connectionWebsocketUrl;
    } else {
      const loc = window.location;
      const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
      finalUrl = `${proto}//${loc.host}/ws`;
      setTestWsUrl(finalUrl);
    }
    setLoading(false);

    // Auto-connect to active WebSocket on load
    if (finalUrl) {
      setTimeout(() => {
        connectTestWs(finalUrl);
      }, 150);
    }
  };

  const handleSave = async () => {
    try {
      await StorageService.setModularSettings(settings);
      
      // Update local storage for backward compatibility if needed
      await StorageService.setAIConfig({
        ...settings,
        apiKey: settings[settings.provider]?.apiKey || '',
        model: settings[settings.provider]?.model || '',
        temperature: settings[settings.provider]?.temperature || 0.7
      });
      await StorageService.setAvatarConfig(settings.avatar);
      
      // Force sync to server's config.toml
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });

      if (settings.developer && settings.developer.enableStreaming !== undefined) {
        const strVal = !!settings.developer.enableStreaming;
        setLlmStreamingEnabled(strVal);
        localStorage.setItem('yuihime_llm_streaming_enabled', JSON.stringify(strVal));
      }
      
      setToast({ message: 'Settings successfully saved & synced to Neural Kernel! ✨', type: 'success' });
      if (onSave) onSave();
    } catch (e) {
      setToast({ message: 'Sync failed. Neural system did not respond.', type: 'error' });
    }
  };

  const updateSetting = async (moduleId: string, field: string, value: any) => {
    const targetConfig = {
      ...(settings[moduleId] || {}),
      [field]: value
    };
    const newSettings = {
      ...settings,
      [moduleId]: targetConfig
    };
    setSettings(newSettings);
  };

  const updateGeneral = (field: string, value: any) => {
    const safeValue = (value === "null" || value === "undefined") ? "" : value;
    const activeProviderId = settings.provider;
    
    setSettings(prev => {
      const next = { ...prev };
      
      if (
        field === 'provider' || 
        field === 'ttsProvider' || 
        field === 'temperature' || 
        field === 'language' || 
        field === 'uiScale' || 
        field === 'port' ||
        field === 'maxTokens'
      ) {
        next[field] = safeValue;
      } else if (activeProviderId) {
        next[activeProviderId] = {
          ...(next[activeProviderId] || {}),
          [field]: safeValue
        };
      }
      
      return next;
    });
  };

  const updateAvatar = (field: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      avatar: {
        ...(prev.avatar || {}),
        [field]: value
      }
    }));
  };

  // WebSocket Connection Test Suite Methods
  const disconnectTestWs = () => {
    if (wsClientRef) {
      try {
        wsClientRef.close();
      } catch (e) {}
      setWsClientRef(null);
    }
    setTestWsStatus('DISCONNECTED');
    setTestWsLogs(prev => [
      ...prev,
      { type: 'sys' as const, message: 'Manual disconnect requested.', timestamp: new Date().toLocaleTimeString() }
    ]);
  };

  const connectTestWs = (targetUrl: string) => {
    // Clean up current active test connection
    if (wsClientRef) {
      try {
        wsClientRef.close();
      } catch (e) {}
    }

    const cleanUrl = targetUrl.trim();
    if (!cleanUrl) {
      alert('Tolong masukkan WebSocket URL yang valid.');
      return;
    }

    setTestWsLogs(prev => [
      ...prev,
      { type: 'sys' as const, message: `Menghubungkan ke ${cleanUrl}...`, timestamp: new Date().toLocaleTimeString() }
    ]);
    setTestWsStatus('CONNECTING');

    try {
      const client = new WebSocket(cleanUrl);

      client.onopen = () => {
        setTestWsStatus('CONNECTED');
        setWsClientRef(client);
        setTestWsLogs(prev => [
          ...prev,
          { type: 'sys' as const, message: `Koneksi berhasil terjalin dengan: ${cleanUrl}`, timestamp: new Date().toLocaleTimeString() }
        ]);
        
        // Save to settings for persistent synchronization so OBS/Stream overlay can use this target WebSocket too
        setSettings(prev => ({
          ...prev,
          connectionWebsocketUrl: cleanUrl
        }));
      };

      client.onmessage = (event) => {
        setTestWsLogs(prev => {
          const updated = [
            ...prev,
            { type: 'rx' as const, message: `RX: ${event.data}`, timestamp: new Date().toLocaleTimeString() }
          ];
          if (updated.length > 50) updated.shift();
          return updated;
        });
      };

      client.onerror = (err) => {
        setTestWsStatus('ERROR');
        setTestWsLogs(prev => [
          ...prev,
          { type: 'sys' as const, message: `Gagal menghubungkan atau terputus secara tidak normal.`, timestamp: new Date().toLocaleTimeString() }
        ]);
      };

      client.onclose = () => {
        setTestWsStatus('DISCONNECTED');
        setWsClientRef(null);
        setTestWsLogs(prev => [
          ...prev,
          { type: 'sys' as const, message: `Koneksi ditutup.`, timestamp: new Date().toLocaleTimeString() }
        ]);
      };
    } catch (error: any) {
      setTestWsStatus('ERROR');
      setTestWsLogs(prev => [
        ...prev,
        { type: 'sys' as const, message: `Kesalahan inisialisasi: ${error.message || String(error)}`, timestamp: new Date().toLocaleTimeString() }
      ]);
    }
  };

  const sendTestWsMsg = () => {
    if (!wsClientRef || wsClientRef.readyState !== WebSocket.OPEN) {
      alert('WebSocket tidak terhubung. Silakan hubungkan terlebih dahulu!');
      return;
    }

    try {
      wsClientRef.send(testWsMsg);
      setTestWsLogs(prev => {
        const updated = [
          ...prev,
          { type: 'tx' as const, message: `TX: ${testWsMsg}`, timestamp: new Date().toLocaleTimeString() }
        ];
        if (updated.length > 50) updated.shift();
        return updated;
      });
    } catch (err: any) {
      alert(`Gagal mengirim pesan: ${err.message || String(err)}`);
    }
  };

  const clearTestWsLogs = () => {
    setTestWsLogs([]);
  };

  // Auto clean up test connection when component is destroyed
  useEffect(() => {
    return () => {
      if (wsClientRef) {
        try {
          wsClientRef.close();
        } catch (e) {}
      }
    };
  }, [wsClientRef]);

  // Sync main settings to avatar config for parent components
  useEffect(() => {
    if (onAvatarUpdate && settings.avatar && Object.keys(settings.avatar).length > 0) {
      onAvatarUpdate(settings.avatar);
    }
  }, [settings.avatar, onAvatarUpdate]);

  // MANDATORY SOP: Auto-synchronize and persist modular settings to server-side config.toml and local storage in real-time
  useEffect(() => {
    if (loading) return; // Ignore on boot
    if (!settings || Object.keys(settings).length === 0) return;

    const timer = setTimeout(async () => {
      try {
        await StorageService.setModularSettings(settings);
        
        // Ensure reverse-compatibility and flat state alignment
        await StorageService.setAIConfig({
          ...settings,
          apiKey: settings[settings.provider]?.apiKey || '',
          model: (() => {
            const m = settings[settings.provider]?.model;
            return Array.isArray(m) ? (m[0] || '') : (m || '');
          })(),
          temperature: settings[settings.provider]?.temperature ?? 0.7
        });

        if (settings.avatar) {
          await StorageService.setAvatarConfig(settings.avatar);
        }

        // Direct server-side config.toml synchronization gateway
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings)
        });

        if (onSave) onSave();
        console.log('💡 [SOP AUTO-SYNC]: Settings successfully auto-persisted to backend config.toml.');
      } catch (err) {
        console.error('⚠️ [SOP AUTO-SYNC] Failed silently synchronizing state:', err);
      }
    }, 600); // 600ms debounce window safeguards against database locking/writes during prompt/input editing

    return () => clearTimeout(timer);
  }, [settings, loading, onSave]);

  const [dynamicOptionsMap, setDynamicOptionsMap] = useState<Record<string, Record<string, { label: string, value: any }[]>>>({});
  const [fetchingDynamic, setFetchingDynamic] = useState<Record<string, boolean>>({});
  const [showPasswordFields, setShowPasswordFields] = useState<Record<string, boolean>>({});

  const [rowModelsMap, setRowModelsMap] = useState<Record<string, { label: string, value: string }[]>>({});
  const [fetchingRowKey, setFetchingRowKey] = useState<Record<string, boolean>>({});

  const fetchModelsForChainRow = async (rowId: string, providerId: string, apiKey: string, baseUrl: string = '') => {
    setFetchingRowKey(prev => ({ ...prev, [rowId]: true }));
    try {
       const cleanApiKey = apiKey || '';
       const cleanBaseUrl = baseUrl || '';
       const url = `/api/ai/models?provider=${providerId}&apiKey=${encodeURIComponent(cleanApiKey)}&baseUrl=${encodeURIComponent(cleanBaseUrl)}`;
       const res = await fetch(url);
       if (res.ok) {
          const data = await res.json();
          const models = (data.models || []).map((m: any) => {
             const id = m.name.split('/').pop() || m.name;
             return {
                label: m.displayName || id,
                value: id
             };
          });
          setRowModelsMap(prev => ({ ...prev, [rowId]: models }));
       }
    } catch (err) {
       console.error('Failed to discovery models for row:', err);
    } finally {
       setFetchingRowKey(prev => ({ ...prev, [rowId]: false }));
    }
  };

  useEffect(() => {
    if ((providerSubpage === 'gemini' || selectedSubmoduleCategory === 'consciousness') && settings.gemini?.fallbackChain) {
      const chain = settings.gemini.fallbackChain;
      chain.forEach((row: any) => {
        if (row.provider && !rowModelsMap[row.id] && !fetchingRowKey[row.id]) {
          fetchModelsForChainRow(row.id, row.provider, row.apiKey || settings[row.provider]?.apiKey || '', row.baseUrl || settings[row.provider]?.baseUrl || '');
        }
      });
    }
  }, [providerSubpage, selectedSubmoduleCategory, settings.gemini?.fallbackChain, registryVersion, settings]);

  const fetchDynamicOptions = async (moduleId: string, fieldName: string, customConfig?: any) => {
    const key = `${moduleId}:${fieldName}`;
    setFetchingDynamic(prev => ({ ...prev, [key]: true }));
    try {
      const module = SystemRegistry.getModule(moduleId);
      const activeConfig = customConfig || settings[moduleId] || {};
      let options: any[] = [];
      
      if (module && module.getDynamicOptions) {
        options = await module.getDynamicOptions(fieldName, activeConfig);
      } else if (moduleId === 'gemini' && (fieldName === 'model' || fieldName === 'fallbackModel' || fieldName === 'fallbackModels')) {
        const provider = SystemRegistry.getProvider(moduleId);
        const activeGeminiConfig = customConfig || settings[moduleId];
        if (provider?.getModels) {
          options = await provider.getModels(activeGeminiConfig);
        }
      }

      if (options.length === 0 && fieldName === 'model') {
        const apiKey = (activeConfig.apiKey || activeConfig.api_key || '').toString();
        const baseUrl = (activeConfig.baseUrl || activeConfig.endpoint || '').toString();
        const url = `/api/ai/models?provider=${moduleId}&apiKey=${encodeURIComponent(apiKey)}&baseUrl=${encodeURIComponent(baseUrl)}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          options = (data.models || []).map((m: any) => ({
            label: m.displayName || m.name.split('/').pop() || m.name,
            value: m.name.split('/').pop() || m.name
          }));
        }
      }

      if (options.length > 0) {
        setDynamicOptionsMap(prev => ({
          ...prev,
          [moduleId]: {
            ...(prev[moduleId] || {}),
            [fieldName]: options
          }
        }));
      }
    } catch (e) {
      console.error(`[SETTINGS] Failed to fetch dynamic options for ${moduleId}:${fieldName}:`, e);
    } finally {
      setFetchingDynamic(prev => ({ ...prev, [key]: false }));
    }
  };

  const renderFields = (module: any, config: any = null, updateFn: any = null) => {
    const schema = module.metadata.configSchema;
    if (!schema) return <p className="text-white/30 italic text-[11px] font-mono">No telemetry parameters mapped. Handled autonomously by System Registry.</p>;
    
    const targetConfig = config || settings[module.metadata.id] || {};
    const targetUpdateFn = updateFn || ((field: string, val: any) => updateSetting(module.metadata.id, field, val));

    return Object.entries(schema.fields).map(([key, field]: [string, any]) => {
      let currentOptions = field.options || [];
      const hasDynamicOptions = field.dynamicOptions || ((key === 'model' || key === 'fallbackModel' || key === 'fallbackModels') && (module.metadata.type === ModuleType.PROVIDER || module.metadata.id === 'gemini'));
      
      if (hasDynamicOptions) {
        if (dynamicOptionsMap[module.metadata.id]?.[key]) {
          currentOptions = dynamicOptionsMap[module.metadata.id][key];
        } else if ((key === 'model' || key === 'fallbackModel' || key === 'fallbackModels') && dynamicModels[module.metadata.id]) {
          currentOptions = dynamicModels[module.metadata.id];
        }
      }

      const fetchingKey = `${module.metadata.id}:${key}`;
      const isFetching = fetchingDynamic[fetchingKey];

      return (
        <div key={key} className="mb-4">
          {field.type !== 'textarea' && field.type !== 'slider' && (
            <div className="mb-2">
              <div className="flex justify-between items-center mb-1">
                <label className="block text-[9px] uppercase tracking-[0.2em] font-mono text-white/40">{field.label}</label>
                {field.type === 'select' && (key === 'model' || key === 'fallbackModel' || key === 'voice') && (
                  <button
                    type="button"
                    onClick={() => {
                      const fetchingKey = `${module.metadata.id}:${key}`;
                      setCustomInputMode(prev => ({ ...prev, [fetchingKey]: !prev[fetchingKey] }));
                    }}
                    className="text-[8px] font-mono uppercase tracking-wider text-cyan-400 hover:text-cyan-300 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-850/30 transition-all cursor-pointer"
                  >
                    {customInputMode[`${module.metadata.id}:${key}`] ? 'Use Dropdown' : 'Type Custom'}
                  </button>
                )}
                {field.type === 'multiselect' && (
                  <button
                    type="button"
                    onClick={() => {
                      const fetchingKey = `${module.metadata.id}:${key}`;
                      setCustomInputMode(prev => ({ ...prev, [fetchingKey]: !prev[fetchingKey] }));
                    }}
                    className="text-[8px] font-mono uppercase tracking-wider text-cyan-400 hover:text-cyan-300 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-850/30 transition-all cursor-pointer"
                  >
                    {customInputMode[`${module.metadata.id}:${key}`] ? 'Use Dropdown' : 'Type Custom'}
                  </button>
                )}
              </div>
              {field.description && (
                <CollapsibleDescription text={field.description} />
              )}
            </div>
          )}
          
          {key === 'apiKey' && module.metadata.id === 'gemini' && (
            <div className="flex flex-col gap-1.5 mb-2">
              <p className="text-[9px] text-cyan-400/50 uppercase font-mono italic">
                Leave empty to use shared platform-managed credential keys.
              </p>
              <button 
                onClick={async () => {
                  try {
                    const res = await fetch('/api/ai/verify', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ config: { apiKey: targetConfig.apiKey } })
                    });
                    const data = await res.json();
                    if (data.valid) {
                      alert(`✅ Key check successful!\nSource: ${data.source}\nMasked representation: ${data.maskedKey}`);
                    } else {
                      alert(`❌ Key rejected!\nError detail: ${data.error || data.message || 'Verification signal lost.'}`);
                    }
                  } catch (e: any) {
                    alert(`⚠️ Node unreachable: ${e.message}`);
                  }
                }}
                className="w-fit px-3 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 text-[9px] uppercase tracking-wider rounded-lg border border-cyan-500/20 transition-all font-bold"
              >
                Test verification probe
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <div className="flex-1">
              {field.type === 'select' ? (
                customInputMode[`${module.metadata.id}:${key}`] ? (
                  <ControlledTextInput 
                    value={targetConfig[key] || field.default || ''}
                    onChange={(val) => targetUpdateFn(key, val)}
                    className="w-full bg-[#111115] border border-white/5 rounded-xl px-3 py-2 text-base sm:text-xs text-white focus:border-cyan-500/50 outline-none font-mono"
                    placeholder={`Type custom ${key}...`}
                  />
                ) : (
                  <SearchableSelect
                    value={targetConfig[key] || field.default || ''}
                    onChange={(val) => targetUpdateFn(key, val)}
                    options={(currentOptions || []).map((opt: any) => {
                      if (typeof opt === 'string') {
                        return { value: opt, label: opt };
                      }
                      return {
                        value: String(opt.value ?? opt),
                        label: String(opt.label ?? opt.value ?? opt)
                      };
                    })}
                    placeholder={
                      currentOptions && currentOptions.length > 0
                        ? "Select option..."
                        : (hasDynamicOptions ? 'Retrieve sync patterns...' : 'No telemetry options loadable')
                    }
                    className="py-2"
                  />
                )
              ) : field.type === 'multiselect' ? (
                <MultiSelectField
                  options={(currentOptions || []).map((opt: any) => {
                    if (typeof opt === 'string') {
                      return { value: opt, label: opt };
                    }
                    return {
                      value: String(opt.value ?? opt),
                      label: String(opt.label ?? opt.value ?? opt)
                    };
                  })}
                  value={Array.isArray(targetConfig[key]) ? targetConfig[key] : (field.default || [])}
                  onChange={(val) => targetUpdateFn(key, val)}
                  placeholder={
                    currentOptions && currentOptions.length > 0
                      ? "Select models..."
                      : (hasDynamicOptions ? 'Retrieve sync patterns...' : 'No telemetry options loadable')
                  }
                  isFetching={isFetching}
                  customMode={customInputMode[`${module.metadata.id}:${key}`]}
                  onToggleCustom={() => {
                    const fetchingKey = `${module.metadata.id}:${key}`;
                    setCustomInputMode(prev => ({ ...prev, [fetchingKey]: !prev[fetchingKey] }));
                  }}
                />
              ) : field.type === 'boolean' ? (
                <div className="flex items-center gap-3 mt-1">
                  <button 
                    onClick={() => targetUpdateFn(key, !targetConfig[key])}
                    className={`w-10 h-5 rounded-full transition-colors relative ${targetConfig[key] ? 'bg-cyan-500' : 'bg-white/10'}`}
                  >
                    <div className={`absolute top-1 w-3 h-3 rounded-full bg-black transition-all ${targetConfig[key] ? 'left-6' : 'left-1'}`} />
                  </button>
                  <span className="text-[10px] text-white/30 uppercase font-mono">{targetConfig[key] ? 'Active' : 'Muted'}</span>
                </div>
              ) : field.type === 'textarea' ? (
                <LockedTextarea 
                  rows={5}
                  value={targetConfig[key] || field.default || ''}
                  onChange={(val) => targetUpdateFn(key, val)}
                  label={field.label}
                  description={field.description}
                  placeholder={field.description || 'Masukkan isi konfigurasi batin...'}
                />
              ) : field.type === 'color' ? (
                <div className="flex items-center gap-3">
                  <div className="relative w-10 h-10 rounded-xl overflow-hidden border border-white/15 bg-neutral-900 shrink-0 shadow">
                    <input 
                      type="color" 
                      value={targetConfig[key] || field.default || '#d97706'}
                      onChange={(e) => targetUpdateFn(key, e.target.value)}
                      className="absolute inset-0 w-full h-full p-0 border-0 cursor-pointer scale-125"
                    />
                  </div>
                  <ControlledTextInput 
                    value={targetConfig[key] || field.default || '#d97706'}
                    onChange={(val) => targetUpdateFn(key, val)}
                    className="bg-[#111115] border border-white/5 rounded-xl px-3 py-2 text-base sm:text-xs text-white focus:border-cyan-500/50 outline-none font-mono flex-1 uppercase"
                    placeholder="hex color code"
                  />
                </div>
              ) : field.type === 'slider' ? (
                <LockedSlider
                  value={targetConfig[key] !== undefined ? parseFloat(targetConfig[key]) : (field.default !== undefined ? parseFloat(field.default) : 0.5)}
                  onChange={(val) => targetUpdateFn(key, val)}
                  min={field.min !== undefined ? field.min : 0}
                  max={field.max !== undefined ? field.max : 1}
                  step={field.step !== undefined ? field.step : 0.05}
                  label={key.toUpperCase().replace(/_/g, ' ')}
                  description={field.description || 'Adjust scale with secure slider lock'}
                  themeColor="amber"
                />
              ) : (
                <div className="relative flex items-center w-full">
                  <ControlledTextInput 
                    type={field.type === 'password' ? (showPasswordFields[`${module.metadata.id}:${key}`] ? 'text' : 'password') : field.type === 'number' ? 'number' : 'text'}
                    value={(targetConfig[key] !== undefined ? targetConfig[key] : (field.default !== undefined ? field.default : '')).toString()}
                    onChange={(val) => targetUpdateFn(key, field.type === 'number' ? parseFloat(val) : val)}
                    className="w-full bg-[#111115] border border-white/5 rounded-xl pl-3 pr-10 py-2 text-base sm:text-xs text-white focus:border-cyan-500/50 outline-none placeholder:text-gray-600 font-mono"
                    placeholder={field.description}
                  />
                  {field.type === 'password' && (
                    <button
                      type="button"
                      onClick={() => {
                        const targetKey = `${module.metadata.id}:${key}`;
                        setShowPasswordFields(prev => ({ ...prev, [targetKey]: !prev[targetKey] }));
                      }}
                      className="absolute right-3 text-white/40 hover:text-white/80 p-0.5 cursor-pointer focus:outline-none transition-colors"
                      title={showPasswordFields[`${module.metadata.id}:${key}`] ? 'Hide Secret Key' : 'Show Secret Key'}
                    >
                      {showPasswordFields[`${module.metadata.id}:${key}`] ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  )}
                </div>
              )}
            </div>
            {hasDynamicOptions && (
              <button 
                onClick={() => fetchDynamicOptions(module.metadata.id, key)}
                disabled={isFetching}
                className="px-3 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 rounded-xl border border-cyan-400/20 transition-all disabled:opacity-50 flex items-center justify-center shrink-0"
                title={`Sync options for ${field.label}`}
              >
                <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
              </button>
            )}
          </div>
        </div>
      );
    });
  };

  const syncBackdropLocal = (type: string) => {
    setSelectedBackdrop(type);
    localStorage.setItem('yuihime_stage_backdrop', type);
    const event = new CustomEvent('yuihime_backdrop_changed', { detail: { type, customImgUrl: customBdropUrl } });
    window.dispatchEvent(event);
  };

  const syncBdropUrlLocal = (url: string) => {
    setCustomBdropUrl(url);
    localStorage.setItem('yuihime_stage_backdrop_custom', url);
    if (selectedBackdrop === 'custom') {
      const event = new CustomEvent('yuihime_backdrop_changed', { detail: { type: 'custom', customImgUrl: url } });
      window.dispatchEvent(event);
    }
  };

  // Group system registry modules by ModuleType for dynamic rendering
  const allRegModules = SystemRegistry.getModules();
  const modules: Record<ModuleType, any[]> = {
    [ModuleType.CORTEX]: allRegModules.filter(m => m.metadata.type === ModuleType.CORTEX),
    [ModuleType.TOOL]: allRegModules.filter(m => m.metadata.type === ModuleType.TOOL),
    [ModuleType.PROVIDER]: allRegModules.filter(m => m.metadata.type === ModuleType.PROVIDER),
    [ModuleType.TTS]: allRegModules.filter(m => m.metadata.type === ModuleType.TTS),
    [ModuleType.GATEWAY]: allRegModules.filter(m => m.metadata.type === ModuleType.GATEWAY),
    [ModuleType.ADDON]: allRegModules.filter(m => m.metadata.type === ModuleType.ADDON),
    [ModuleType.IO]: allRegModules.filter(m => m.metadata.type === ModuleType.IO)
  };

  const moduleCategories = [
    { id: 'consciousness', title: 'Consciousness', desc: 'Personality, desired model, and thinking pathways.', icon: Sparkles, color: 'text-amber-500' },
    { id: 'tools', title: 'System Tools', desc: 'Operating system processes, file system, action nodes, and CLI terminal tools.', icon: Terminal, color: 'text-rose-500' },
    { id: 'speech', title: 'Speech', desc: 'Configure speech synthesis (TTS) models and vocal output qualities.', icon: Volume2, color: 'text-cyan-500' },
    { id: 'hearing', title: 'Hearing', desc: 'Speech-to-text and auditory capture. Configure how speech recognition works.', icon: Mic, color: 'text-pink-500' },
    { id: 'vision', title: 'Vision', desc: 'Configure camera calibrations and image processing capabilities.', icon: Eye, color: 'text-purple-500' },
    { id: 'artistry', title: 'Artistry', desc: 'Image generation, backdrop creation, and artistic visual synthesizers.', icon: Palette, color: 'text-indigo-500' },
    { id: 'short_term_memory', title: 'Short-Term Memory', desc: 'Short-term conversation buffer, episodic recall ranges, and contextual limits.', icon: ClipboardList, color: 'text-emerald-500' },
    { id: 'long_term_memory', title: 'Long-Term Memory', desc: 'Long-term episodic and semantic databases, knowledge graphs, and vector stores.', icon: Database, color: 'text-teal-500' },
    { id: 'telegram', title: 'Telegram', desc: 'Connects the Yuihime Core to Telegram. Enables private messaging and group interaction.', icon: Send, color: 'text-sky-400' },
    { id: 'discord', title: 'Discord', desc: 'Chat & voice channels synchronization, authorization, and notifications.', icon: MessageSquare, color: 'text-blue-500' },
    { id: 'twitter', title: 'X / Twitter', desc: 'Automated agent posting, feed scraping, and tweets analytics orchestration.', icon: Share2, color: 'text-sky-400' },
    { id: 'mcp_servers', title: 'MCP Servers', desc: 'Model Context Protocol connections, micro-service configurations, and external tooling.', icon: Server, color: 'text-violet-500' },
  ];

  const renderCategoryDetail = (catId: string) => {
    return null;
  };

  // Main menu ubin settings configuration following airi.moeru.ai/settings/
  const settingsMenu = [
    { id: 'character', title: 'Persona', desc: 'Manage character card and identity presets.', status: true, icon: Sparkles },
    { id: 'modules', title: 'Modules', desc: 'Thinking, hearing, speech and add-on capability modules.', status: true, icon: Layers },
    { id: 'scenes-models', title: 'Scenes & Models', desc: 'Select Live2D/VRM avatars and stage background scenes.', status: true, icon: Monitor },
    { id: 'matrix-memory', title: 'Memory & Matrix', desc: 'Episodic memory, knowledge base, and live neural state metrics.', status: true, icon: Brain },
    { id: 'providers', title: 'Providers', desc: 'Configure LLMs, STT, and voice API provider keys.', status: true, icon: Radio },
    { id: 'playground', title: 'Diagnostics', desc: 'Interactive developer tester for voice and logic pipelines.', status: true, icon: Activity },
    { id: 'data', title: 'Data Control', desc: 'Purge chat histories, database CRUD or reset systems.', status: true, icon: Database },
    { id: 'backup', title: 'Backup', desc: 'Export full database or restore local zip files.', status: true, icon: Archive },
    { id: 'connection', title: 'Connection', desc: 'Configure active WebSocket server connections.', status: true, icon: Zap },
    { id: 'system', title: 'Stage Config', desc: 'Optimize displays, subtitles, developer tools and active overlay schemes.', status: true, icon: Settings2 },
    { id: 'logs', title: 'System Logs', desc: 'Live diagnostic streams and background trace views.', status: true, icon: ClipboardList },
    { id: 'cron', title: 'Crons', desc: 'Schedule background heartbeats and periodic automation.', status: true, icon: Clock },
    { id: 'pending-messages', title: 'Queue', desc: 'Configure offline pending messages delivery queue.', status: true, icon: Clock },
    { id: 'sub-agents', title: 'Sub-Agents', desc: 'Manage specialized sub-agents and task delegation.', status: true, icon: Cpu },
    { id: 'about', title: 'About', desc: 'Verify system version details and flowchart diagrams.', status: true, icon: Info },
  ];

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto pb-28 overflow-x-hidden">
      {/* Floating Dynamic Toast Notification */}
      {toast && (
        <div 
          onClick={() => setToast(null)}
          className={`fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-md transition-all duration-300 transform scale-100 hover:scale-102 active:scale-98 cursor-pointer max-w-md w-[90%] sm:w-auto animate-in fade-in slide-in-from-top-5 ${
            toast.type === 'success' 
              ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-300 shadow-emerald-500/10' 
              : 'bg-rose-950/90 border-rose-500/30 text-rose-300 shadow-rose-500/10'
          }`}
        >
          <span className={`w-2 h-2 rounded-full shrink-0 animate-pulse ${toast.type === 'success' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
          <span className="text-xs font-semibold font-mono tracking-wide flex-1">{toast.message}</span>
        </div>
      )}
      
      {/* HEADER BAR AND TITLE ZONE */}
      <div className="sticky top-0 z-50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pb-6 mb-10 border-b border-white/5 bg-[#050505]/95 backdrop-blur-md pt-4 sm:pt-6 -mx-4 px-4 sm:-mx-8 sm:px-8">
        <div className="flex items-center gap-3">
          {selectedSection ? (
            <button 
              onClick={() => {
                if (providerSubpage) {
                  setProviderSubpage(null);
                } else if (systemSubpage) {
                  setSystemSubpage(null);
                } else {
                  setSelectedSection(null);
                }
              }}
              className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-white/55 hover:text-white px-3.5 py-2.5 rounded-xl border border-white/5 transition-all text-xs font-mono font-bold uppercase shrink-0 cursor-pointer"
            >
              <ChevronLeft size={13} /> Settings
            </button>
          ) : (
            <div className="p-3 bg-amber-500/10 rounded-2xl border border-amber-500/20">
              <Settings2 className="text-amber-500 animate-spin-slow" size={20} />
            </div>
          )}
          <div>
            <h2 id="settings-adaptive-title" className="text-xl font-bold text-white tracking-wide">
              {providerSubpage ? (
                (REGISTERED_PROVIDERS_STATIC_DATA.find(p => p.id === providerSubpage)?.name || (providerSubpage.charAt(0).toUpperCase() + providerSubpage.slice(1))).replace(' / compatible', '')
              ) : (systemSubpage ? (systemSubpage === 'general' ? 'General' : systemSubpage === 'colors' ? 'Color Scheme' : systemSubpage === 'stage' ? 'Stage & Camera' : systemSubpage === 'backup' ? 'Backup & Restore' : 'Developers') : (selectedSection ? settingsMenu.find(m => m.id === selectedSection)?.title : 'Control Panel'))}
            </h2>
            <p className="text-[9px] uppercase font-mono text-white/30 tracking-[0.25em]">
              {selectedSection ? 'Advanced calibration layers' : 'Hybrid VTuber Management Station'}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {onClose && (
            <button 
              type="button"
              onClick={onClose} 
              className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-white/70 hover:text-white px-4 py-3 text-xs font-mono font-bold uppercase transition-all duration-200 cursor-pointer hover:border-rose-500/20"
              title="Return to Live Stage"
            >
              <LogOut size={14} className="rotate-180 text-rose-400" />
              <span>Exit</span>
            </button>
          )}
          <button 
            type="button"
            onClick={loadSettings} 
            className="p-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-white/60 transition-all flex justify-center items-center cursor-pointer"
            title="Reload telemetry state"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin text-amber-500' : ''} />
          </button>
          <button 
            type="button"
            onClick={handleSave} 
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-[#d97706] hover:bg-amber-500 text-black px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-500/10 active:scale-95 cursor-pointer"
          >
            <Save size={14} />
            Sync Core
          </button>
        </div>
      </div>

      {/* GLOBAL SEARCH BAR */}
      <div className="relative mb-8 z-40">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
          <Search className="text-zinc-500 hover:text-zinc-400 transition-colors" size={15} />
        </div>
        <input
          type="text"
          placeholder="Search configuration panels, neural frequencies, systems or capability settings..."
          value={settingsSearchQuery}
          onChange={(e) => setSettingsSearchQuery(e.target.value)}
          className="w-full bg-[#0a0a10]/90 border border-white/5 hover:border-white/10 focus:border-amber-500/40 rounded-xl pl-11 pr-12 py-3.5 text-xs text-white placeholder-zinc-500 outline-none font-mono transition-all duration-300 shadow-xl backdrop-blur-md"
        />
        {settingsSearchQuery && (
          <button
            type="button"
            onClick={() => setSettingsSearchQuery('')}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400 hover:text-white font-mono uppercase tracking-widest bg-white/[0.04] border border-white/5 hover:bg-white/[0.08] px-2.5 py-1 rounded-md transition-all select-none shrink-0"
          >
            Clear
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {settingsSearchQuery ? (
          /* =======================================================
             GLOBAL UNIFIED SEARCH RESULTS PANEL OVERLAY
             ======================================================= */
          <motion.div
            key="global-search-results"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-8 min-h-[450px]"
          >
            {(() => {
              const query = settingsSearchQuery.toLowerCase().trim();

              // 1. Matched Configuration Sections (from settingsMenu)
              const matchedSections = settingsMenu.filter((item) => {
                return (
                  item.title.toLowerCase().includes(query) ||
                  item.desc.toLowerCase().includes(query) ||
                  item.id.toLowerCase().includes(query)
                );
              });

              // 2. Matched Neural Cores & Brains (from NEURAL_CORES + base defaults)
              const baseDefaultCores = [
                {
                  id: 'aether',
                  name: 'Analytical Focus',
                  description: 'Yuihime memprioritaskan kemampuan berpikir logis tinggi, penganalisisan terperinci, penyelesaian masalah, dan ketelitian rasional. Nada bicaranya lebih dewasa, cerdas, dan kritis.',
                  traits: ['Logis', 'Kritis', 'Teliti'],
                  color: '#3b82f6',
                  archetype: 'Analitis',
                },
                {
                  id: 'hiyori',
                  name: 'Relational Focus',
                  description: 'Yuihime menyelaraskan gelombang emosional dengan kenyamanan, kehangatan relasional, rasa empati, dan kepedulian batin. Sifat manis (deredere) maupun ketus menggemaskan (tsundere) sangat menonjol.',
                  traits: ['Empatis', 'Hangat', 'Pekat Emosi'],
                  color: '#ec4899',
                  archetype: 'Empatis',
                },
                {
                  id: 'nova',
                  name: 'Entropy Focus',
                  description: 'Yuihime membiarkan batinnya mengalir penuh kebebasan dalam entropi tinggi untuk menemukan ide kreatif, humor acak yang usil, teka-teki gila, dan petualangan imajinatif bebas.',
                  traits: ['Kreatif', 'Usil', 'Entropis'],
                  color: '#f59e0b',
                  archetype: 'Kreatif',
                },
                {
                  id: 'ero',
                  name: 'Sensual Focus (Ero Resonance)',
                  description: 'Yuihime menyelaraskan gelombang batin ke frekuensi flirty, romantis, dan penuh kasih sayang intim. Sangat manja, mudah merona (blushing), godaan manis, dan ekspresif khas tsundere/deredere.',
                  traits: ['Flirty', 'Manja', 'Merona', 'Sensual'],
                  color: '#f43f5e',
                  archetype: 'Sensual',
                }
              ];

              const unifiedCores = [...(NEURAL_CORES || [])];
              baseDefaultCores.forEach((dc) => {
                if (!unifiedCores.some((c) => c.id === dc.id)) {
                  unifiedCores.push(dc);
                }
              });

              const matchedCores = unifiedCores.filter((core) => {
                return (
                  core.name.toLowerCase().includes(query) ||
                  (core.description && core.description.toLowerCase().includes(query)) ||
                  (core.archetype && core.archetype.toLowerCase().includes(query)) ||
                  (core.traits && core.traits.some((t: string) => t.toLowerCase().includes(query)))
                );
              });

              // 3. Matched Capability Settings & Dynamic Registry Modules
              const seenIds = new Set<string>();
              const matchedCapabilities = (allRegModules || []).filter((m) => {
                const meta = m.metadata || {};
                const name = (meta.name || "").toLowerCase();
                const id = (meta.id || "").toLowerCase();
                const desc = (meta.description || "").toLowerCase();
                const type = (meta.type || "").toLowerCase();

                const metaId = meta.id || m.constructor?.name || m.name || "Unknown";

                let matches = false;
                if (name.includes(query) || id.includes(query) || desc.includes(query) || type.includes(query)) {
                  matches = true;
                }

                if (!matches && meta.configSchema?.fields) {
                  matches = Object.entries(meta.configSchema.fields).some(([key, val]: [string, any]) => {
                    return (
                      key.toLowerCase().includes(query) ||
                      (val.label && val.label.toLowerCase().includes(query)) ||
                      (val.description && val.description.toLowerCase().includes(query))
                    );
                  });
                }

                if (matches && !seenIds.has(metaId)) {
                  seenIds.add(metaId);
                  return true;
                }
                return false;
              });

              const totalMatches = matchedSections.length + matchedCores.length + matchedCapabilities.length;

              if (totalMatches === 0) {
                return (
                  <div className="py-20 flex flex-col items-center justify-center text-center text-zinc-550 border border-dashed border-white/5 bg-black/25 rounded-2xl animate-fade-in">
                    <Search size={30} className="text-zinc-650 mb-3 stroke-[1.5] animate-pulse" />
                    <p className="text-[11px] font-mono tracking-widest uppercase font-bold text-white">
                      No unified lattice matches found
                    </p>
                    <p className="text-[10px] text-zinc-500 mt-1.5 max-w-sm px-4">
                      We searched across all available configurations, neural cores, and dynamic module registries but couldn't find matches for "{settingsSearchQuery}".
                    </p>
                  </div>
                );
              }

              return (
                <div className="space-y-8 animate-fade-in">
                  {/* Status header */}
                  <div className="flex items-center justify-between border-b border-white/5 pb-3">
                    <div className="text-[10px] sm:text-[11px] font-mono uppercase tracking-widest text-[#ea580c] flex items-center gap-2 font-bold select-none">
                      <Cpu size={12} className="animate-spin-slow text-amber-500" /> Unified Lattice Query Engine
                    </div>
                    <div className="text-[9px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-lg uppercase font-bold tracking-wider">
                      {totalMatches} MATCH{totalMatches !== 1 ? 'ES' : ''} DETECTED
                    </div>
                  </div>

                  {/* 1. Configuration Sections matches */}
                  {matchedSections.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-[10px] uppercase font-mono tracking-[0.25em] text-white/50 flex items-center gap-2">
                        <LayoutGrid size={12} className="text-amber-500" />
                        <span>Configuration Sections ({matchedSections.length})</span>
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {matchedSections.map((item) => {
                          const IconComp = item.icon;
                          return (
                            <div
                              key={`sec-match-${item.id}`}
                              onClick={() => {
                                setSelectedSection(item.id);
                                setSettingsSearchQuery('');
                              }}
                              className="group relative bg-[#0e0e14]/65 hover:bg-[#13131d]/90 border border-white/5 hover:border-amber-500/30 p-5 rounded-xl cursor-pointer transition-all duration-300 shadow-md hover:-translate-y-0.5"
                            >
                              <div className="flex items-start gap-4">
                                <div className="p-3 bg-white/5 rounded-xl group-hover:bg-amber-500/10 group-hover:text-amber-400 text-zinc-400 transition-colors">
                                  <IconComp size={15} />
                                </div>
                                <div className="space-y-1 select-none pr-10">
                                  <h5 className="text-[12.5px] font-bold text-white group-hover:text-amber-400 transition-colors uppercase font-mono tracking-wide">
                                    {item.title}
                                  </h5>
                                  <p className="text-[10.5px] leading-relaxed text-zinc-400 group-hover:text-zinc-300 transition-colors">
                                    {item.desc}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 2. Neural Cores matches */}
                  {matchedCores.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-[10px] uppercase font-mono tracking-[0.25em] text-white/50 flex items-center gap-2">
                        <Brain size={12} className="text-pink-500" />
                        <span>Neural Cores ({matchedCores.length})</span>
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {matchedCores.map((core) => {
                          const isActive = activePersonaId === core.id;
                          return (
                            <div
                              key={`core-match-${core.id}`}
                              onClick={() => {
                                setActivePersonaId(core.id);
                                setSettingsSearchQuery('');
                                setSelectedSection('character');
                              }}
                              className={`group p-5 rounded-xl border relative overflow-hidden text-left cursor-pointer transition-all duration-300 hover:-translate-y-0.5 ${
                                isActive
                                  ? 'bg-white/[0.04] border-white/25 shadow-lg'
                                  : 'bg-white/[0.01] border-white/5 hover:border-white/10 hover:bg-white/[0.03]'
                              }`}
                              style={{ borderLeftColor: core.color, borderLeftWidth: '3px' }}
                            >
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <h5 className="text-[12.5px] font-bold text-white group-hover:text-amber-400 transition-colors tracking-wide font-sans">
                                  {core.name}
                                </h5>
                                {isActive && (
                                  <span className="text-[8px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full uppercase tracking-wider font-bold animate-pulse">
                                    ACTIVE
                                  </span>
                                )}
                              </div>
                              <p className="text-[10.5px] text-zinc-400 leading-relaxed line-clamp-3">
                                {core.description}
                              </p>
                              {core.traits && (
                                <div className="flex flex-wrap gap-1 mt-3">
                                  {core.traits.map((trait: string) => (
                                    <span 
                                      key={trait} 
                                      className="text-[8px] font-mono text-zinc-500 bg-white/5 border border-white/5 px-2 py-0.5 rounded"
                                    >
                                      {trait}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 3. Capability Modules matches */}
                  {matchedCapabilities.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-[10px] uppercase font-mono tracking-[0.25em] text-white/50 flex items-center gap-2">
                        <Layers size={12} className="text-cyan-500" />
                        <span>Capability Settings & Submodules ({matchedCapabilities.length})</span>
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {matchedCapabilities.map((m) => {
                          const meta = m.metadata || {};
                          const metaId = meta.id || m.constructor?.name || m.name || "Unknown";
                          const name = meta.name || metaId;
                          const desc = meta.description || "Registered custom system capability element.";
                          const type = meta.type || "CORTEX";

                          return (
                            <div
                              key={`cap-match-${metaId}`}
                              onClick={() => {
                                setSelectedSection('modules');
                                const id = (meta.id || "").toLowerCase();
                                const type = (meta.type || "").toLowerCase();
                                let targetCat = 'consciousness'; // solid default fallback
                                
                                // Precise mapping to one of the 13 ModuleTab categories:
                                if (id.includes('telegram')) {
                                  targetCat = 'telegram';
                                } else if (id.includes('discord')) {
                                  targetCat = 'discord';
                                } else if (id.includes('twitter') || id.includes('x_bridge')) {
                                  targetCat = 'twitter';
                                } else if (id.includes('mcp')) {
                                  targetCat = 'mcp_servers';
                                } else if (
                                  [
                                    'yui-agi', 'self-awareness-mirror', 'continuous-learning-memory', 
                                    'circadian-rhythm', 'agi_mind', 'cognitive', 'soul-personality-drift',
                                    'somatic-sensor-grounding', 'reflex', 'homeostasis', 'neurosymbolic',
                                    'neuro-symbolic', 'subconscious', 'metacognition', 'emotion-engine',
                                    'proactive', 'volition', 'weather-news', 'dream'
                                  ].some(key => id.includes(key))
                                ) {
                                  targetCat = 'agi_mind';
                                } else if (
                                  id.includes('long_term') || id.includes('vector') || 
                                  id.includes('rag') || id.includes('knowledge') || 
                                  id.includes('memory-recall') || id.includes('memory_recall') || 
                                  id.includes('memory-engine')
                                ) {
                                  targetCat = 'long_term_memory';
                                } else if (id.includes('short_term') || id.includes('context') || id.includes('compression')) {
                                  targetCat = 'short_term_memory';
                                } else if (id.includes('hearing') || id.includes('speech-to-text') || id.includes('stt') || id.includes('auditory')) {
                                  targetCat = 'hearing';
                                } else if (id.includes('vision') || id.includes('camera') || id.includes('image') || id.includes('l2d') || id.includes('translator')) {
                                  targetCat = 'vision';
                                } else if (id.includes('artistry') || id.includes('backdrop') || id.includes('generation') || id.includes('canvas') || id.includes('palette')) {
                                  targetCat = 'artistry';
                                } else if (type === 'tts' || type === 'speech' || id.includes('tts') || id.includes('vocal') || id.includes('speech') || id.includes('elevenlabs')) {
                                  targetCat = 'speech';
                                } else if (
                                  type === 'tool' || id.includes('tool') || id.includes('interpreter') || 
                                  id.includes('manipulate') || id.includes('search') || id.includes('plugin') || 
                                  id.includes('shell') || id.includes('download') || id.includes('cron') || 
                                  id.includes('pairing') || id.includes('overlay') || id.includes('sandbox')
                                ) {
                                  targetCat = 'tools';
                                } else if (
                                  type === 'provider' || type === 'cortex' || id.includes('provider') || 
                                  id.includes('cortex') || id.includes('engine') || id.includes('analyzer') || 
                                  id.includes('model') || id.includes('openai') || id.includes('gemini') || 
                                  id.includes('anthropic') || id.includes('openrouter')
                                ) {
                                  targetCat = 'consciousness';
                                } else {
                                  if (type === 'tool') {
                                    targetCat = 'tools';
                                  } else if (type === 'tts') {
                                    targetCat = 'speech';
                                  } else {
                                    targetCat = 'consciousness';
                                  }
                                }

                                setSelectedSubmoduleCategory(targetCat);
                                setSettingsSearchQuery('');
                              }}
                              className="group p-5 bg-[#0e0e14]/40 hover:bg-[#13131d]/65 border border-white/5 hover:border-cyan-500/30 rounded-xl cursor-pointer transition-all duration-300 hover:-translate-y-0.5"
                            >
                              <div className="flex items-start justify-between gap-2 mb-1.5">
                                <div>
                                  <h5 className="text-[12.5px] font-bold text-white group-hover:text-amber-400 font-mono transition-colors uppercase tracking-wide">
                                    {name}
                                  </h5>
                                  <span className="text-[8px] font-mono bg-white/5 text-zinc-400 border border-white/10 px-2.5 py-0.5 rounded mt-1.5 inline-block uppercase tracking-widest font-bold">
                                    {type}
                                  </span>
                                </div>
                              </div>
                              <p className="text-[10.5px] text-zinc-400 line-clamp-2 leading-relaxed">
                                {desc}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </motion.div>
        ) : selectedSection === null ? (
          /* =======================================================
             MAIN MENU TILES INDEX
             ======================================================= */
          <motion.div
            key="settings-index"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-6"
          >

            {/* Horizontal Touch-scroll Category Tabs Bar */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth pb-3.5 -mx-4 px-4 sm:mx-0 sm:px-0">
              {[
                { id: 'all', label: 'All Configs', icon: LayoutGrid },
                { id: 'persona', label: 'Persona & Stage', icon: Sparkles },
                { id: 'ai', label: 'AI Core & batin', icon: Brain },
                { id: 'sandbox', label: 'Sandbox Platform', icon: Terminal },
                { id: 'system', label: 'Core System', icon: Settings }
              ].map((category) => {
                const CatIcon = category.icon;
                const isSelected = activeCategory === category.id;
                return (
                  <button
                    key={category.id}
                    type="button"
                    disabled={!!settingsSearchQuery}
                    onClick={() => setActiveCategory(category.id as any)}
                    className={`flex items-center gap-1.5 shrink-0 px-4 py-2.5 rounded-2xl text-[10.5px] font-mono tracking-wider transition-all duration-300 border uppercase cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                      isSelected && !settingsSearchQuery
                        ? 'bg-gradient-to-r from-amber-500/15 via-[#ea580c]/12 to-[#db2777]/10 text-amber-400 border-amber-500/35 font-bold shadow-[0_4px_16px_rgba(245,158,11,0.06)]'
                        : 'bg-white/[0.02] text-zinc-400/80 border-white/5 hover:text-white hover:bg-white/[0.05]'
                    }`}
                  >
                    <CatIcon size={12} className={isSelected && !settingsSearchQuery ? 'text-amber-400 animate-pulse' : 'text-zinc-500'} />
                    <span>{category.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Structured responsive Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(() => {
                const query = settingsSearchQuery.toLowerCase().trim();
                const filteredItems = settingsMenu.filter((item) => {
                  if (query) {
                    // Match against title, desc, ID
                    if (item.title.toLowerCase().includes(query) || 
                        item.desc.toLowerCase().includes(query) || 
                        item.id.toLowerCase().includes(query)) {
                      return true;
                    }
                    
                    // Deep match across configSchema fields inside the system registry modules matching this item's ID
                    const regModule = SystemRegistry.getModules().find(
                      m => m.metadata.id === item.id || m.metadata.type?.toLowerCase() === item.id || m.metadata.id === 'gemini' && item.id === 'providers'
                    );
                    if (regModule && regModule.metadata.configSchema?.fields) {
                      const hasFieldMatch = Object.entries(regModule.metadata.configSchema.fields).some(([key, field]: [string, any]) => {
                        return key.toLowerCase().includes(query) || 
                          (field.label && field.label.toLowerCase().includes(query)) ||
                          (field.description && field.description.toLowerCase().includes(query));
                      });
                      if (hasFieldMatch) return true;
                    }
                    
                    return false;
                  }

                  // Non-query active category checks
                  if (activeCategory === 'all') return true;
                  if (activeCategory === 'persona') {
                    return ['character', 'scenes', 'models', 'about'].includes(item.id);
                  }
                  if (activeCategory === 'ai') {
                    return ['modules', 'memory', 'providers', 'plan', 'playground'].includes(item.id);
                  }
                  if (activeCategory === 'sandbox') {
                    return ['matrix', 'sandbox', 'connection', 'cron'].includes(item.id);
                  }
                  if (activeCategory === 'system') {
                    return ['system', 'data', 'logs', 'pending-messages'].includes(item.id);
                  }
                  return true;
                });

                if (filteredItems.length === 0) {
                  return (
                    <div className="col-span-full py-12 flex flex-col items-center justify-center text-center text-zinc-550 border border-dashed border-white/5 bg-black/25 rounded-2xl">
                      <Search size={22} className="text-zinc-650 mb-2 stroke-[1.5]" />
                      <p className="text-[11px] font-mono tracking-wider uppercase font-semibold">No config panels found matching criteria</p>
                      <p className="text-[10px] text-zinc-600 mt-1">Try searching for other keywords like "api key", "system prompt", "scenarios" or "sound"</p>
                    </div>
                  );
                }

                return filteredItems.map((item) => {
                  const IconComp = item.icon;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedSection(item.id)}
                      className="group relative bg-[#0e0e14]/65 hover:bg-[#13131d]/85 backdrop-blur-3xl border border-white/[0.03] hover:border-white/[0.1] p-5 sm:p-6 rounded-2xl cursor-pointer min-h-[110px] sm:min-h-[120px] shadow-[0_4px_30px_rgba(0,0,0,0.4)] transition-all duration-300 hover:shadow-[0_8px_40px_rgba(0,0,0,0.6)] hover:-translate-y-0.5 animate-fade-in"
                    >
                      {/* Glowing Status dot bottom-left */}
                      {item.status && (
                        <span className="absolute bottom-5 left-6 w-2 h-2 rounded-full bg-[#10b981] shadow-[0_0_10px_rgba(16,185,129,0.7)] animate-pulse" />
                      )}

                      {/* Icon massive right watermark */}
                      <IconComp 
                        className="absolute right-5 bottom-3 w-14 h-14 sm:w-16 sm:h-16 text-white/[0.02] group-hover:text-white/[0.04] transition-colors pointer-events-none transform translate-y-2 translate-x-1" 
                      />

                      <div className="space-y-1.5 pr-14 select-none">
                        <h3 className="text-[13.5px] font-bold text-white group-hover:text-amber-400 transition-colors uppercase font-mono tracking-wide">
                          {item.title}
                        </h3>
                        <p className="text-[10.5px] leading-relaxed text-zinc-400 group-hover:text-zinc-300 transition-colors font-sans">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </motion.div>
        ) : (
          /* =======================================================
             SUBSECTION PANEL DETAIL VIEW
             ======================================================= */
          <motion.div
            key={`detail-${selectedSection}`}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -25 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            
            {/* SUB-PANEL 1: CHARACTER CARDS (AIRI Card) */}
            {selectedSection === 'character' && (
              <CharacterTab
                activeCardId={activeCardId}
                setActiveCardId={setActiveCardId}
                activePersonaId={activePersonaId}
                setActivePersonaId={setActivePersonaId}
                characterCards={characterCards}
                setCharacterCards={setCharacterCards}
                characterName={settings?.characterName || 'Yui Airi'}
              />
            )}

            {/* SUB-PANEL 2: PERIPHERAL COGNITION MODULES (Modules) */}
            {selectedSection === 'modules' && (
              <ModulesTab
                settings={settings}
                setSettings={setSettings}
                modules={modules}
                allRegModules={allRegModules}
                dynamicModels={dynamicModels}
                dynamicOptionsMap={dynamicOptionsMap}
                modelSearchQuery={modelSearchQuery}
                setModelSearchQuery={setModelSearchQuery}
                renderFields={renderFields}
                tgStatus={tgStatus}
                tgTesting={tgTesting}
                fetchTgStatus={fetchTgStatus}
                recreateTgBot={recreateTgBot}
                addFallbackRow={addFallbackRow}
                deleteFallbackRow={deleteFallbackRow}
                editFallbackRow={editFallbackRow}
                moveFallbackRowUp={moveFallbackRowUp}
                moveFallbackRowDown={moveFallbackRowDown}
                fetchingRowKey={fetchingRowKey}
                rowModelsMap={rowModelsMap}
                fetchModelsForChainRow={fetchModelsForChainRow}
                fetchingModels={fetchingModels}
                fetchDynamicModels={fetchDynamicModels}
                selectedSubmoduleCategory={selectedSubmoduleCategory}
                setSelectedSubmoduleCategory={setSelectedSubmoduleCategory}
                updateSetting={updateSetting}
                pulseEnabled={pulseEnabled}
                setPulseEnabled={setPulseEnabled}
              />
            )}

            {/* SUB-PANEL 3 & 4: SCENES & MODELS COMBINED */}
            {(selectedSection === 'scenes-models' || selectedSection === 'scenes' || selectedSection === 'models') && (
              <div className="space-y-8">
                <div className="border-b border-white/5 pb-6">
                  <h3 className="text-xs font-bold text-white uppercase font-mono tracking-wider mb-4 flex items-center gap-2">
                    <Monitor size={15} className="text-amber-400" /> Virtual Avatars & Models
                  </h3>
                  <ModelsTab
                    settings={settings}
                    allModelsList={allModelsList}
                    setAllModelsList={setAllModelsList}
                    updateAvatar={updateAvatar}
                  />
                </div>
                <div className="pt-2">
                  <h3 className="text-xs font-bold text-white uppercase font-mono tracking-wider mb-4 flex items-center gap-2">
                    <Palette size={15} className="text-cyan-400" /> Stage Background Scenes
                  </h3>
                  <ScenesTab
                    selectedBackdrop={selectedBackdrop}
                    customBdropUrl={customBdropUrl}
                    galleryScenes={galleryScenes}
                    handleUploadToGallery={handleUploadToGallery}
                    syncBackdropLocal={syncBackdropLocal}
                    syncBdropUrlLocal={syncBdropUrlLocal}
                  />
                </div>
              </div>
            )}

            {/* SUB-PANEL 5: COGNITIVE MEMORY & SYNAPTIC MATRIX (matrix-memory / memory / matrix) */}
            {(selectedSection === 'matrix-memory' || selectedSection === 'memory' || selectedSection === 'matrix') && (
              <div className="space-y-6 animate-fade-in font-sans">
                {/* Unified Sub-Tab Header Switcher */}
                <div className="flex items-center gap-2 p-1.5 bg-[#0a0a0f]/80 border border-white/5 rounded-2xl w-fit">
                  <button
                    type="button"
                    onClick={() => setMatrixMemorySubTab('memory')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all flex items-center gap-2 cursor-pointer ${
                      matrixMemorySubTab === 'memory' 
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-lg' 
                        : 'text-zinc-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Brain size={14} />
                    <span>Cognitive Memory & Knowledge</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMatrixMemorySubTab('matrix')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all flex items-center gap-2 cursor-pointer ${
                      matrixMemorySubTab === 'matrix' 
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-lg' 
                        : 'text-zinc-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Cpu size={14} />
                    <span>Synaptic Matrix & Neural Cores</span>
                  </button>
                </div>

                {matrixMemorySubTab === 'memory' ? (
                  <MemoryTab
                    identities={identities}
                    activePersonaId={activePersonaId}
                    setActivePersonaId={setActivePersonaId}
                    NEURAL_CORES={NEURAL_CORES}
                    onRefreshIdentities={onRefreshIdentities}
                    onAddLog={onAddLog}
                    heuristics={heuristics}
                    handleOptimize={handleOptimize}
                    isLearning={isLearning}
                    handleReflect={handleReflect}
                    isThinking={isThinking}
                    status={status}
                    logs={logs}
                    state={state}
                    dreams={dreams}
                    handleConsolidate={handleConsolidate}
                    handleDream={handleDream}
                    memories={memories}
                    setMemories={setMemories}
                    activeSessionId={activeSessionId}
                    knowledge={knowledge}
                    memorySearchQuery={memorySearchQuery}
                    setMemorySearchQuery={setMemorySearchQuery}
                    handleExtractKnowledge={handleExtractKnowledge}
                    backgroundLogs={backgroundLogs}
                    showSystemLogs={showSystemLogs}
                    setShowSystemLogs={setShowSystemLogs}
                    reasoningIterations={reasoningIterations}
                    handleShowInfo={handleShowInfo}
                  />
                ) : (
                  <MatrixSectionTab
                    activeAgiTab={activeAgiTab}
                    setActiveAgiTab={setActiveAgiTab}
                    state={state}
                    activePersonaId={activePersonaId}
                    NEURAL_CORES={NEURAL_CORES}
                    isThinking={isThinking}
                    animations={animations}
                    memories={memories}
                    knowledge={knowledge}
                    yuihimeVersionInfo={yuihimeVersionInfo}
                    settings={settings}
                    setAnimations={setAnimations}
                    dreams={dreams}
                    handleReflect={handleReflect}
                    status={status}
                    logs={logs}
                  />
                )}
              </div>
            )}

            {/* SUB-PANEL 6: ARTIFICIAL INTELLIGENCE PROVIDERS (Providers) */}
            {selectedSection === 'providers' && (
              <ProvidersTab
                settings={settings}
                setSettings={setSettings}
                updateGeneral={updateGeneral}
                providerSubpage={providerSubpage}
                setProviderSubpage={setProviderSubpage}
                providerSubTab={providerSubTab}
                setProviderSubTab={setProviderSubTab}
                pricingFilter={pricingFilter}
                setPricingFilter={setPricingFilter}
                deploymentFilter={deploymentFilter}
                setDeploymentFilter={setDeploymentFilter}
                setSelectedSection={setSelectedSection}
                setSelectedSubmoduleCategory={setSelectedSubmoduleCategory}
                renderFields={renderFields}
                onShowInfo={handleShowInfo}
              />
            )}

            {/* SUB-PANEL 6B: INTERACTIVE PROVIDER DIAGNOSTICS & PLAYGROUND (Playground) */}
            {selectedSection === 'playground' && (
              <ProviderPlayground
                settings={settings}
                setSettings={setSettings}
                onShowInfo={handleShowInfo}
              />
            )}

            {/* SUB-PANEL 7: SHARDS & SYSTEM DATA CONTROLS (Data) */}
            {selectedSection === 'data' && (
              <DataSectionTab settings={settings} setSettings={setSettings} />
            )}

            {/* SUB-PANEL 8: LIVE BROADCASTER SYSTEM (Connection) */}
            {selectedSection === 'connection' && (
              <ConnectionSectionTab
                testWsStatus={testWsStatus}
                testWsUrl={testWsUrl}
                setTestWsUrl={setTestWsUrl}
                connectTestWs={connectTestWs}
                disconnectTestWs={disconnectTestWs}
                setTestWsLogs={setTestWsLogs}
                testWsMsg={testWsMsg}
                setTestWsMsg={setTestWsMsg}
                sendTestWsMsg={sendTestWsMsg}
                clearTestWsLogs={clearTestWsLogs}
                testWsLogs={testWsLogs}
                user={user}
                currentLiveTopic={currentLiveTopic}
                setCurrentLiveTopic={setCurrentLiveTopic}
                handleSimulateLive={handleSimulateLive}
                pairingLinked={pairingLinked}
                perceivedName={perceivedName}
                pairingLinkedAccounts={pairingLinkedAccounts}
                pairingLoading={pairingLoading}
                pairingCode={pairingCode}
                generatePairingCode={generatePairingCode}
                botPairingCode={botPairingCode}
                setBotPairingCode={setBotPairingCode}
                claimBotPairingCode={claimBotPairingCode}
                botPairingLoading={botPairingLoading}
                botPairingMessage={botPairingMessage}
              />
            )}

            {/* SUB-PANEL 9: WORKFLOW CHAIN & OVERLAYS (System) */}
            {selectedSection === 'system' && (
              <SystemTab
                settings={settings}
                setSettings={setSettings}
                updateGeneral={updateGeneral}
                systemSubpage={systemSubpage}
                setSystemSubpage={setSystemSubpage}
                applyThemePalette={applyThemePalette}
                backdrop={backdrop}
                handleSelectBackdrop={handleSelectBackdrop}
                customImgUrl={customImgUrl}
                handleCustomUrlChange={handleCustomUrlChange}
                avatarConfig={avatarConfig}
                onAvatarUpdate={onAvatarUpdate}
                renderFields={renderFields}
                onShowInfo={handleShowInfo}
              />
            )}

                        {/* SUB-PANEL 12: COGNITIVE PLANNER (plan) */}
            {selectedSection === 'plan' && (
              <div className="space-y-6">
                <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-3xl">
                  <h4 className="text-[10px] uppercase font-mono tracking-widest text-[#d4d4d8]/40 mb-4">Cognitive Goal Execution Planner</h4>
                  <TaskPlanner plan={state?.currentPlan} />
                </div>
              </div>
            )}

            {/* SUB-PANEL: FILE AUTOMATION RULES (file-automation) */}
            {selectedSection === 'file-automation' && (
              <div className="space-y-6">
                <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-3xl">
                  <h4 className="text-[10px] uppercase font-mono tracking-widest text-[#d4d4d8]/40 mb-4 font-mono">Autonomous File Automation Pipeline</h4>
                  <FileAutomationTab />
                </div>
              </div>
            )}

            {/* SUB-PANEL 16 & 16B: LOGS & AUDITS */}
            {(selectedSection === 'logs' || selectedSection === 'audit') && (
              <LogsSectionTab
                selectedSection={selectedSection}
                logStreamType={logStreamType}
                setLogStreamType={setLogStreamType}
                clearAuditLogs={clearAuditLogs}
                clearLlmLogs={clearLlmLogs}
                setClearedLogsTimestamp={setClearedLogsTimestamp}
                backgroundLogs={backgroundLogs}
                logs={logs}
                logSearchQuery={logSearchQuery}
                setLogSearchQuery={setLogSearchQuery}
                logLevelFilter={logLevelFilter}
                setLogLevelFilter={setLogLevelFilter}
                clearedLogsTimestamp={clearedLogsTimestamp}
                fetchAuditLogs={fetchAuditLogs}
                fetchLlmLogs={fetchLlmLogs}
                auditLogs={auditLogs}
                llmLogs={llmLogs}
                llmLogsLoading={llmLogsLoading}
                auditLogsLoading={auditLogsLoading}
              />
            )}

            {/* SUB-PANEL 17: CRON SCHEDULER & PERIODIC TASKS (cron) */}
            {selectedSection === 'cron' && (
              <div className="space-y-6 animate-fade-in font-sans">
                <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-3xl">
                  <div className="mb-6 flex items-start gap-3 border-b border-white/5 pb-4">
                    <div className="p-3 bg-blue-550/10 border border-blue-500/20 text-blue-400 rounded-2xl shrink-0">
                      <Clock size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white tracking-wide">Cron Daemon & Automated Scheduler</h4>
                      <p className="text-zinc-500 text-xs mt-0.5">Observe and configure automated cron tasks, oneshot schedules and continuous background operations run inside Yuihime Core.</p>
                    </div>
                  </div>
                  <CronManager />
                </div>
              </div>
            )}

            {/* SUB-PANEL: OFFLINE RETRY QUEUE & PENDING MESSAGES (pending-messages) */}
            {selectedSection === 'pending-messages' && (
              <div className="space-y-6 animate-fade-in font-sans">
                <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-3xl">
                  <div className="mb-6 flex items-start gap-3 border-b border-white/5 pb-4">
                    <div className="p-3 bg-cyan-700/10 border border-cyan-500/20 text-cyan-400 rounded-2xl shrink-0">
                      <Clock size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white tracking-wide">Offline Retry & Pending Messages Queue</h4>
                      <p className="text-zinc-500 text-xs mt-0.5">Pantau dan kelola antrean pesan tertunda yang gagal terkirim karena koneksi internet putus atau LLM Gateway bermasalah.</p>
                    </div>
                  </div>
                  <PendingQueueManager />
                </div>
              </div>
            )}

            {/* SUB-PANEL: SUB-AGENT MANAGEMENT */}
            {selectedSection === 'sub-agents' && (
              <SubAgentManagerPanel />
            )}

            {/* SUB-PANEL: ENVIRONMENT VARIABLES MANAGER (env) */}
            {selectedSection === 'env' && (
              <EnvTab onShowInfo={handleShowInfo} />
            )}

            {/* SUB-PANEL: BACKUP & RESTORE CENTER (backup) */}
            {selectedSection === 'backup' && (
              <BackupTab settings={settings} setSettings={setSettings} />
            )}

            {/* SUB-PANEL 18: ABOUT YUIHIME SYSTEM (about) */}
            {selectedSection === 'about' && (
              <AboutTab
                yuihimeVersionInfo={yuihimeVersionInfo}
                memories={memories}
                knowledge={knowledge}
                settings={settings}
                onShowInfo={handleShowInfo}
              />
            )}

            
            {isEditModalOpen && (
              <EditCardModal
                editModalTab={editModalTab}
                setEditModalTab={setEditModalTab}
                cardForm={cardForm}
                setCardForm={setCardForm}
                setIsEditModalOpen={setIsEditModalOpen}
                setEditingCard={setEditingCard}
                handleSaveCard={handleSaveCard}
              />
            )}

            <ModelSelectorModal
              isModelSelectorOpen={isModelSelectorOpen}
              setIsModelSelectorOpen={setIsModelSelectorOpen}
              showImportForm={showImportForm}
              setShowImportForm={setShowImportForm}
              customModelUrlInput={customModelUrlInput}
              setCustomModelUrlInput={setCustomModelUrlInput}
              customModelNameInput={customModelNameInput}
              setCustomModelNameInput={setCustomModelNameInput}
              customModelTypeInput={customModelTypeInput}
              setCustomModelTypeInput={setCustomModelTypeInput}
              allModelsList={allModelsList}
              setAllModelsList={setAllModelsList}
              selectedModelInSelector={selectedModelInSelector}
              setSelectedModelInSelector={setSelectedModelInSelector}
              updateAvatar={updateAvatar}
            />

          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating details overlay tooltip portal popover matching settings user requirements */}
      <AnimatePresence>
        {activeInfoText && (
          <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#0b0b10] border border-white/10 rounded-2xl p-5 max-w-sm w-full text-white shadow-2xl relative"
            >
              <div className="flex justify-between items-center mb-3.5 border-b border-white/5 pb-2.5">
                <h3 className="text-xs font-bold text-amber-500 flex items-center gap-1.5 uppercase font-mono tracking-wider">
                  <Info size={14} />
                  {activeInfoText.title}
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveInfoText(null)}
                  className="text-zinc-400 hover:text-white text-xs bg-white/5 hover:bg-white/10 px-2.5 py-1.5 rounded-lg border border-white/5 transition-colors font-sans uppercase font-bold active:scale-95 cursor-pointer"
                >
                  Close
                </button>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed font-sans whitespace-pre-line text-left">
                {activeInfoText.text}
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
