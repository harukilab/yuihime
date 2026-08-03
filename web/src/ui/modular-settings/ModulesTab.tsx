import React, { useState, useEffect } from 'react';
import { ModuleType } from '@shared/include/types';
import { 
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Sparkles, Cpu, Radio, Brain, Zap, Terminal, Plus, Trash2, Clock, 
  RefreshCw, Search, Layers, Volume2, Mic, Eye, Palette, 
  ClipboardList, Database, Send, MessageSquare, Share2, Server,
  Sliders, ShieldAlert, SlidersHorizontal, CheckCircle2, Bot, Sliders as SlidersIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { VoiceCalibration } from './voiceCalibration';
import { SearchableSelect } from '../../components/SearchableSelect';
import { genId } from '@shared/core/idGen';

// Frontend fallback module schemas for gateway bridges.
// On Vite builds, SystemRegistry.getModules() may not auto-register the daemon
// driver files, so the Telegram/Discord/Twitter sub-menus would render empty.
// These mirrors guarantee the config forms always render with full fields.
const fallbackTelegramModule = {
  metadata: {
    id: 'telegram_bridge',
    name: 'Telegram Neural Link',
    description: 'Connects the Yuihime Core to Telegram. Enables private messaging and group interaction with identity persistence.',
    version: '2.0.0',
    type: ModuleType.GATEWAY,
    configSchema: {
      fields: {
        botToken: {
          type: 'password',
          label: 'Telegram Bot Token',
          description: 'Bearer token dari @BotFather',
          default: ''
        },
        enabled: {
          type: 'boolean',
          label: 'Channel Activation',
          default: true
        },
        autoAcknowledge: {
          type: 'boolean',
          label: 'Auto Acknowledge',
          description: 'Tampilkan status mengetik atau reaksi agar pengguna tahu Yui sedang membaca.',
          default: true
        },
        reactionEmojis: {
          type: 'string',
          label: 'Reaction Emojis',
          description: 'Emoji dipisahkan koma untuk variasi reaksi.',
          default: '❤️,🔥,🥰,👍,😁'
        },
        respondInGroups: {
          type: 'boolean',
          label: 'Respond in Groups',
          default: true,
          description: 'Apakah mendengarkan dan merespons pesan di chat grup.'
        },
        adminId: {
          type: 'string',
          label: 'Primary Admin ID',
          description: 'Telegram User ID untuk izin tingkat lanjut.',
          default: ''
        },
        apiRoot: {
          type: 'string',
          label: 'Custom API Root URL',
          description: 'URL gateway Telegram khusus untuk mengatasi pemblokiran ISP (contoh https://api.telegram.org).',
          default: 'https://api.telegram.org'
        },
        connectTimeout: {
          type: 'number',
          label: 'Connect Timeout (ms)',
          description: 'Timeout untuk membuat koneksi ke API Telegram.',
          default: 15000
        },
        readTimeout: {
          type: 'number',
          label: 'Read Timeout (ms)',
          description: 'Timeout untuk membaca respons dari API Telegram.',
          default: 30000
        },
        maxRetries: {
          type: 'number',
          label: 'Max Launch Retries',
          description: 'Jumlah percobaan ulang saat bot gagal diluncurkan karena kesalahan jaringan.',
          default: 5
        },
        proxyUrl: {
          type: 'string',
          label: 'Proxy URL',
          description: 'Proxy HTTP/HTTPS opsional untuk permintaan API Telegram (contoh http://proxy:8080).',
          default: ''
        }
      }
    }
  },
  run: async () => ({ status: 'daemon-managed' })
};

const fallbackDiscordModule = {
  metadata: {
    id: 'discord_bridge',
    name: 'Discord Neural Link',
    description: 'Connects the Yuihime Core to Discord. Enables server integration and identity cross-mapping.',
    version: '1.0.0',
    type: ModuleType.GATEWAY,
    configSchema: {
      fields: {
        botToken: {
          type: 'password',
          label: 'Discord Bot Token',
          description: 'Token dari Discord Developer Portal',
          default: ''
        },
        enabled: {
          type: 'boolean',
          label: 'Channel Activation',
          default: true
        },
        autoAcknowledge: {
          type: 'boolean',
          label: 'Auto Acknowledge',
          description: 'Tampilkan status mengetik atau reaksi agar pengguna tahu Yui sedang membaca.',
          default: true
        },
        reactionEmojis: {
          type: 'string',
          label: 'Reaction Emojis',
          description: 'Emoji dipisahkan koma untuk variasi reaksi.',
          default: '❤️,✨,💫,🌸'
        },
        guildId: {
          type: 'string',
          label: 'Primary Guild ID',
          description: 'Server utama untuk perintah administratif.',
          default: ''
        },
        voiceChannelId: {
          type: 'string',
          label: 'Automated Stream Voice Lounge (Channel ID)',
          description: 'Channel suara otomatis untuk sesi streaming.',
          default: ''
        }
      }
    }
  },
  run: async () => ({ status: 'daemon-managed' })
};

const fallbackTwitterModule = {
  metadata: {
    id: 'twitter_bridge',
    name: 'X / Twitter Autonomous Conduits',
    description: 'Automated tweets posting, feed scraping & conduits.',
    version: '1.0.0',
    type: ModuleType.GATEWAY,
    configSchema: {
      fields: {
        enabled: {
          type: 'boolean',
          label: 'Channel Activation',
          default: true
        },
        apiKey: {
          type: 'string',
          label: 'Consumer Key API (X Account)',
          description: 'Consumer Key dari Twitter/X.',
          default: ''
        },
        apiSecret: {
          type: 'password',
          label: 'Consumer Secret API',
          description: 'Consumer Secret dari Twitter/X.',
          default: ''
        },
        accessToken: {
          type: 'string',
          label: 'Access Token',
          description: 'Access Token akun X.',
          default: ''
        },
        accessTokenSecret: {
          type: 'password',
          label: 'Access Token Secret',
          description: 'Access Token Secret akun X.',
          default: ''
        }
      }
    }
  },
  run: async () => ({ status: 'daemon-managed' })
};

interface ModulesTabProps {
  settings: any;
  setSettings: React.Dispatch<React.SetStateAction<any>>;
  modules: Record<string, any[]>;
  allRegModules: any[];
  dynamicModels: Record<string, any[]>;
  dynamicOptionsMap: any;
  modelSearchQuery: string;
  setModelSearchQuery: (val: string) => void;
  renderFields: (module: any, config?: any, updateFn?: any) => React.ReactNode;
  
  // Telegram status/control methods
  tgStatus: any;
  tgTesting: boolean;
  fetchTgStatus: () => void;
  recreateTgBot: (flush: boolean) => void;

  // Fallback chain state & control methods
  addFallbackRow: () => void;
  deleteFallbackRow: (id: string) => void;
  editFallbackRow: (id: string, field: string, value: any) => void;
  moveFallbackRowUp: (index: number) => void;
  moveFallbackRowDown: (index: number) => void;
  fetchingRowKey: Record<string, boolean>;
  rowModelsMap: Record<string, any[]>;
  fetchModelsForChainRow: (id: string, provider: string, apiKey: string, baseUrl: string) => void;

  // Sync / loading indicators
  fetchingModels: boolean;
  fetchDynamicModels: (providerId: string) => void;

  // Selected subcategory state
  selectedSubmoduleCategory: string | null;
  setSelectedSubmoduleCategory: (val: string | null) => void;

  updateSetting: (pId: string, key: string, val: any) => void;
  pulseEnabled?: boolean;
  setPulseEnabled?: (val: boolean) => void;
}

export const ModulesTab: React.FC<ModulesTabProps> = ({
  settings,
  setSettings,
  modules,
  allRegModules,
  dynamicModels,
  dynamicOptionsMap,
  modelSearchQuery,
  setModelSearchQuery,
  renderFields,
  tgStatus,
  tgTesting,
  fetchTgStatus,
  recreateTgBot,
  addFallbackRow,
  deleteFallbackRow,
  editFallbackRow,
  moveFallbackRowUp,
  moveFallbackRowDown,
  fetchingRowKey,
  rowModelsMap,
  fetchModelsForChainRow,
  fetchingModels,
  fetchDynamicModels,
  selectedSubmoduleCategory,
  setSelectedSubmoduleCategory,
  updateSetting,
  pulseEnabled,
  setPulseEnabled,
}) => {
  // Navigation & Search UI states
  const [categorySearch, setCategorySearch] = useState('');
  const [activeGroupFilter, setActiveGroupFilter] = useState<string>('all');
  
  // Local sub-tab states for complex categories
  const [consciousnessSubTab, setConsciousnessSubTab] = useState<'models' | 'resilience' | 'credentials'>('models');
  const [agiSubTab, setAgiSubTab] = useState<'core' | 'awareness' | 'rules' | 'cortices'>('core');
  const [toolsSubTab, setToolsSubTab] = useState<'system' | 'custom' | 'policy'>('system');
  const [speechActiveTab, setSpeechActiveTab] = useState<'setup' | 'calibration'>('setup');

  // Other local UI states
  const [modelsCollapsed, setModelsCollapsed] = useState<boolean>(true);
  const [customTools, setCustomTools] = useState<any[]>([]);
  const [customToolsLoading, setCustomToolsLoading] = useState<boolean>(false);
  const [showCustomToolForm, setShowCustomToolForm] = useState<boolean>(false);
  const [customToolError, setCustomToolError] = useState<string | null>(null);

  // Custom tool builder states
  const [newToolId, setNewToolId] = useState<string>('');
  const [newToolName, setNewToolName] = useState<string>('');
  const [newToolDesc, setNewToolDesc] = useState<string>('');
  const [newToolActionType, setNewToolActionType] = useState<string>('code');
  const [newToolActionCode, setNewToolActionCode] = useState<string>('// JS Sandbox code (access args, return object)\nconst { targetUrl } = args;\nreturn { status: "success", targetUrl };');
  const [newToolParams, setNewToolParams] = useState<Array<{ name: string; type: 'string' | 'number' | 'boolean'; required: boolean; description: string }>>([]);

  const [credentialsCollapsed, setCredentialsCollapsed] = useState<boolean>(false);
  const [expandedModels, setExpandedModels] = useState<Record<string, boolean>>({});
  const [regexTestInput, setRegexTestInput] = useState<string>('');
  const [cortexQuery, setCortexQuery] = useState<string>('');
  const [cortexFilter, setCortexFilter] = useState<'all' | 'cognition' | 'memory' | 'perception' | 'utility'>('all');

  const updateGeminiSetting = (field: string, value: any) => {
    setSettings((prev: any) => ({
      ...prev,
      gemini: { ...(prev.gemini || {}), [field]: value }
    }));
  };

  const fetchCustomTools = async () => {
    try {
      setCustomToolsLoading(true);
      const res = await fetch('/api/tools/custom');
      const data = await res.json();
      if (data.success && data.tools) {
        setCustomTools(data.tools);
      }
    } catch (err) {
      console.error('[UI] Failed to fetch custom tools:', err);
    } finally {
      setCustomToolsLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomTools();
  }, []);

  const addParamField = () => {
    setNewToolParams([...newToolParams, { name: '', type: 'string', required: true, description: '' }]);
  };

  const removeParamField = (idx: number) => {
    setNewToolParams(newToolParams.filter((_, i) => i !== idx));
  };

  const updateParamField = (idx: number, field: string, value: any) => {
    const updated = [...newToolParams];
    updated[idx] = { ...updated[idx], [field]: value };
    setNewToolParams(updated);
  };

  const saveCustomTool = async () => {
    if (!newToolId || !newToolName || !newToolDesc) {
      setCustomToolError("Please fill out ID, Name, and Description.");
      return;
    }
    
    const properties: Record<string, any> = {};
    const required: string[] = [];
    
    for (const param of newToolParams) {
      if (!param.name) continue;
      properties[param.name] = {
        type: param.type,
        description: param.description || `The ${param.name} parameter`
      };
      if (param.required) {
        required.push(param.name);
      }
    }

    const toolDef = {
      id: newToolId.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      name: newToolName,
      description: newToolDesc,
      version: '1.0.0',
      type: 'tool',
      parameters: {
        type: 'object',
        properties,
        ...(required.length > 0 ? { required } : {})
      },
      actionType: newToolActionType,
      actionCode: newToolActionCode
    };

    try {
      setCustomToolError(null);
      const res = await fetch('/api/tools/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toolDef)
      });
      const data = await res.json();
      if (data.success) {
        setNewToolId('');
        setNewToolName('');
        setNewToolDesc('');
        setNewToolActionType('code');
        setNewToolActionCode('// JS Sandbox code (access args, return object)\nconst { targetUrl } = args;\nreturn { status: "success", targetUrl };');
        setNewToolParams([]);
        setShowCustomToolForm(false);
        fetchCustomTools();
      } else {
        setCustomToolError(data.error || "Failed to save tool.");
      }
    } catch (err: any) {
      setCustomToolError(err.message || "Network error.");
    }
  };

  const deleteCustomTool = async (id: string) => {
    if (!window.confirm(`Are you sure you want to delete custom tool "${id}"?`)) return;
    try {
      const res = await fetch(`/api/tools/custom/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) fetchCustomTools();
    } catch (err) {
      console.error('[UI] Failed to delete custom tool:', err);
    }
  };

  // Module Category Definitions
  const moduleCategories = [
    { id: 'consciousness', group: 'core', title: 'Consciousness', desc: 'Personality, provider, models, & resilience pipeline', icon: Sparkles, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { id: 'agi_mind', group: 'core', title: 'AGI Mind Engine', desc: 'Neurotransmitters, self-awareness, EWC, & emotion rules', icon: Brain, color: 'text-orange-400', bg: 'bg-orange-500/10' },
    { id: 'speech', group: 'perception', title: 'Speech (TTS)', desc: 'Configure voice synthesis models & voice calibration', icon: Volume2, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
    { id: 'hearing', group: 'perception', title: 'Hearing (STT)', desc: 'Speech-to-text, microphone thresholds & voice capture', icon: Mic, color: 'text-pink-400', bg: 'bg-pink-500/10' },
    { id: 'vision', group: 'perception', title: 'Vision', desc: 'Camera frame analysis, optical model & intervals', icon: Eye, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { id: 'artistry', group: 'perception', title: 'Artistry', desc: 'Image generation engine, ratio, & style filters', icon: Palette, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
    { id: 'short_term_memory', group: 'memory', title: 'Short-Term Memory', desc: 'Recency buffers, episodic limits & auto-summarization', icon: ClipboardList, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { id: 'long_term_memory', group: 'memory', title: 'Long-Term Memory', desc: 'Vector databases, knowledge graph & semantic recall', icon: Database, color: 'text-teal-400', bg: 'bg-teal-500/10' },
    { id: 'telegram', group: 'bridges', title: 'Telegram Bridge', desc: 'Telegram bot integration, diagnostics & webhook control', icon: Send, color: 'text-sky-400', bg: 'bg-sky-500/10' },
    { id: 'discord', group: 'bridges', title: 'Discord Bridge', desc: 'Discord bot synchronization, permissions & channels', icon: MessageSquare, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { id: 'twitter', group: 'bridges', title: 'X / Twitter', desc: 'Automated tweets posting, feed scraping & conduits', icon: Share2, color: 'text-sky-400', bg: 'bg-sky-500/10' },
    { id: 'mcp_servers', group: 'bridges', title: 'MCP Servers', desc: 'Model Context Protocol connections & external microservices', icon: Server, color: 'text-violet-400', bg: 'bg-violet-500/10' },
    { id: 'tools', group: 'system', title: 'System Tools', desc: 'Command tools, Linux sandbox, custom schema builder', icon: Terminal, color: 'text-rose-400', bg: 'bg-rose-500/10' },
  ];

  const categoryGroups = [
    { id: 'all', label: 'All Modules' },
    { id: 'core', label: '🧠 Core AI' },
    { id: 'perception', label: '👁️ Perception & Output' },
    { id: 'memory', label: '🗄️ Memory Systems' },
    { id: 'bridges', label: '🔌 Bridges & Links' },
    { id: 'system', label: '🛠️ System & Tools' },
  ];

  const filteredCategories = moduleCategories.filter(cat => {
    const matchesGroup = activeGroupFilter === 'all' || cat.group === activeGroupFilter;
    const matchesSearch = !categorySearch || 
      cat.title.toLowerCase().includes(categorySearch.toLowerCase()) || 
      cat.desc.toLowerCase().includes(categorySearch.toLowerCase()) ||
      cat.id.toLowerCase().includes(categorySearch.toLowerCase());
    return matchesGroup && matchesSearch;
  });

  const renderCategoryDetail = (catId: string) => {
    switch (catId) {
      case 'consciousness': {
        const providers = modules[ModuleType.PROVIDER] || [];
        const cortices = modules[ModuleType.CORTEX] || [];
        const activeProvider = providers.find((p: any) => p.metadata.id === settings.provider);

        const schema = activeProvider?.metadata.configSchema;
        const modelFieldDef = schema?.fields?.model;
        const providerId = activeProvider?.metadata?.id;
        let modelOptions: any[] = [];
        
        if (providerId && dynamicModels[providerId] && dynamicModels[providerId].length > 0) {
          modelOptions = dynamicModels[providerId];
        } else if (providerId && dynamicOptionsMap[providerId]?.model && dynamicOptionsMap[providerId]?.model.length > 0) {
          modelOptions = dynamicOptionsMap[providerId].model;
        } else if (modelFieldDef?.options && modelFieldDef.options.length > 0) {
          modelOptions = modelFieldDef.options;
        } else {
          modelOptions = (activeProvider?.metadata?.models || []).map((m: string) => ({ label: m, value: m }));
        }

        const filteredOptions = modelOptions.filter((opt: any) =>
          opt.label.toLowerCase().includes(modelSearchQuery.toLowerCase()) ||
          opt.value.toLowerCase().includes(modelSearchQuery.toLowerCase())
        );

        const currentActiveModel = settings[activeProvider?.metadata?.id]?.model || modelFieldDef?.default || '';

        const tempModule = activeProvider ? {
          ...activeProvider,
          metadata: {
            ...activeProvider.metadata,
            configSchema: {
              ...activeProvider.metadata.configSchema,
              fields: Object.fromEntries(
                Object.entries(activeProvider.metadata.configSchema?.fields || {}).filter(([k]) => k !== 'model')
              )
            }
          }
        } : null;

        const isConfiguredProvider = (pId: string) => {
          const config = settings[pId];
          if (config && config.enabled === false) return false;
          if (pId === 'local') return true;
          if (!config) return false;
          return !!(config.apiKey || config.api_key || config.enabled || config.accessToken || config.botToken || config.token);
        };

        const getModelDescription = (val: string) => {
          const modelLower = val.toLowerCase();
          if (modelLower.includes('qwen')) return "Qwen3.7-Max: High performance reasoning & coding model.";
          if (modelLower.includes('grok')) return "Grok Build 0.1: Fast long-context agentic model.";
          if (modelLower.includes('gemini-3.5-flash') || modelLower.includes('gemini-3.5') || modelLower.includes('gemini-3-flash')) return "Gemini 3.5 Flash: Next-gen lightweight, low latency model.";
          if (modelLower.includes('gemini-1.5-flash')) return "Gemini 1.5 Flash: Multi-modal, balanced speed model.";
          if (modelLower.includes('gemini-2.0-flash')) return "Gemini 2.0 Flash: High performance tool-calling model.";
          if (modelLower.includes('gemini-2.5-pro') || modelLower.includes('gemini-3.1-pro') || modelLower.includes('gemini-pro')) return "Gemini Pro: Frontier reasoning model for complex tasks.";
          if (modelLower.includes('gpt-4o')) return "GPT-4o: Flagship multimodal model.";
          if (modelLower.includes('claude-3-5-sonnet')) return "Claude 3.5 Sonnet: Benchmark reasoning & code generation.";
          if (modelLower.includes('local') || modelLower.includes('llama') || modelLower.includes('ollama')) return "Local LLM: Private, zero-latency offline model.";
          return "Dynamic AI brain model from configured provider.";
        };

        const handleDeleteProviderConfig = (pId: string) => {
          setSettings((prev: any) => {
            const updatedConfig = { ...prev[pId] };
            if ('apiKey' in updatedConfig) updatedConfig.apiKey = '';
            if ('api_key' in updatedConfig) updatedConfig.api_key = '';
            updatedConfig.enabled = false;
            return {
              ...prev,
              [pId]: updatedConfig,
              provider: prev.provider === pId ? 'gemini' : prev.provider
            };
          });
        };

        const configuredProviders = providers.filter((p: any) => isConfiguredProvider(p.metadata.id));

        return (
          <div className="space-y-5">
            {/* Consciousness Sub-Tabs */}
            <div className="flex flex-wrap gap-2 p-1 bg-black/40 border border-white/5 rounded-xl">
              {[
                { id: 'models', label: '🤖 Active Provider & Models', icon: Sparkles },
                { id: 'resilience', label: '⚡ Parallel Mode & Fallbacks', icon: Zap },
                { id: 'credentials', label: '🔑 Provider Credentials', icon: SlidersIcon },
              ].map(st => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setConsciousnessSubTab(st.id as any)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-mono font-bold uppercase transition-all cursor-pointer ${
                    consciousnessSubTab === st.id
                      ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400 shadow-sm'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span>{st.label}</span>
                </button>
              ))}
            </div>

            {/* Sub-Tab 1: Provider & Models */}
            {consciousnessSubTab === 'models' && (
              <div className="space-y-5">
                {/* Active Provider Carousel */}
                <div className="bg-[#0e0e14]/55 border border-white/5 p-5 rounded-2xl space-y-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="text-xs font-bold text-white">Active LLM Provider</h4>
                      <p className="text-[10px] text-zinc-400 uppercase font-mono mt-0.5">Select the primary provider for YuiHime</p>
                    </div>
                  </div>

                  <div className="flex flex-nowrap gap-3 overflow-x-auto pb-2 scrollbar-thin">
                    {configuredProviders.map((p: any) => {
                      const isSelected = settings.provider === p.metadata.id;
                      return (
                        <div
                          key={p.metadata.id}
                          onClick={() => setSettings((prev: any) => ({ ...prev, provider: p.metadata.id }))}
                          className={`relative p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between w-[160px] h-[90px] select-none shrink-0 ${
                            isSelected 
                              ? 'bg-amber-500/10 border-amber-500/40 text-white shadow-[0_0_15px_rgba(245,158,11,0.1)]' 
                              : 'bg-black/40 hover:bg-white/5 border-white/5 text-zinc-400 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center justify-between w-full">
                            <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${isSelected ? 'border-amber-400 bg-amber-400/20' : 'border-white/20'}`}>
                              {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                            </div>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleDeleteProviderConfig(p.metadata.id); }}
                              className="p-1 hover:bg-red-500/20 rounded text-zinc-500 hover:text-red-400 transition-colors"
                              title="Clear provider settings"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                          <div>
                            <h5 className="text-[11px] font-bold text-white truncate">{p.metadata.name}</h5>
                            <p className="text-[9px] font-mono text-zinc-500 uppercase mt-0.5">{p.metadata.id}</p>
                          </div>
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => window.dispatchEvent(new CustomEvent('yuihime_goto_section', { detail: 'providers' }))}
                      className="p-3.5 rounded-xl border border-dashed border-white/10 hover:border-amber-500/30 bg-black/20 hover:bg-white/5 cursor-pointer transition-all flex items-center justify-center w-[160px] h-[90px] shrink-0 text-zinc-500 hover:text-amber-400 gap-2 font-mono text-[10px] uppercase font-bold"
                    >
                      <Plus size={14} /> Configure More
                    </button>
                  </div>
                </div>

                {/* Model Selector List */}
                {activeProvider && (
                  <div className="bg-[#0e0e14]/55 border border-white/5 p-5 rounded-2xl space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-white/5 pb-3">
                      <div>
                        <h4 className="text-xs font-bold text-white flex items-center gap-2">
                          <span>Primary Model</span>
                          <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 uppercase">
                            {activeProvider.metadata.name}
                          </span>
                        </h4>
                        <p className="text-[10px] text-zinc-400 uppercase font-mono mt-0.5">Select a model or fetch latest models from API</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => fetchDynamicModels(activeProvider.metadata.id)}
                        disabled={fetchingModels}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-mono font-bold text-[9px] uppercase tracking-wider rounded-lg border border-amber-500/20 transition-all cursor-pointer disabled:opacity-40 shrink-0"
                      >
                        <RefreshCw size={11} className={fetchingModels ? "animate-spin" : ""} />
                        {fetchingModels ? 'Syncing...' : 'Fetch API Models'}
                      </button>
                    </div>

                    <div className="relative">
                      <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                      <input
                        type="text"
                        value={modelSearchQuery}
                        onChange={e => setModelSearchQuery(e.target.value)}
                        placeholder="Search models..."
                        className="w-full bg-black/40 border border-white/5 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-amber-500/40 font-mono"
                      />
                    </div>

                    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2.5 transition-all ${!modelsCollapsed ? 'max-h-[380px] overflow-y-auto pr-1 scrollbar-thin' : ''}`}>
                      {(modelsCollapsed ? filteredOptions.slice(0, 4) : filteredOptions).map((opt: any) => {
                        const isSelected = currentActiveModel === opt.value;
                        return (
                          <div
                            key={opt.value}
                            onClick={() => updateSetting(activeProvider.metadata.id, 'model', opt.value)}
                            className={`p-3 rounded-xl border cursor-pointer select-none transition-all flex items-start gap-3 ${
                              isSelected 
                                ? 'bg-amber-500/10 border-amber-500/40 text-white shadow-sm' 
                                : 'bg-black/30 hover:bg-white/5 border-white/5 text-zinc-400 hover:text-white'
                            }`}
                          >
                            <div className={`mt-0.5 w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${isSelected ? 'border-amber-400 bg-amber-400/20' : 'border-white/20'}`}>
                              {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <h5 className="text-[11px] font-bold text-white truncate">{opt.label}</h5>
                                <span className="text-[7px] font-mono px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-zinc-400 uppercase shrink-0">
                                  {opt.value.toLowerCase().includes('local') ? 'Local' : 'Cloud'}
                                </span>
                              </div>
                              <p className="text-[8px] font-mono text-zinc-500 truncate mt-0.5">{opt.value}</p>
                              <p className="text-[9.5px] text-zinc-400 mt-1 font-sans leading-tight">
                                {getModelDescription(opt.value)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {filteredOptions.length > 4 && (
                      <button
                        type="button"
                        onClick={() => setModelsCollapsed(!modelsCollapsed)}
                        className="w-full py-2 bg-black/30 hover:bg-white/5 text-zinc-400 hover:text-white border border-white/5 rounded-xl flex items-center justify-center gap-1.5 font-mono text-[10px] uppercase font-bold transition-all cursor-pointer"
                      >
                        {modelsCollapsed ? `Show All (${filteredOptions.length} models)` : 'Show Fewer Models'}
                        {modelsCollapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Sub-Tab 2: Resilience & Fallbacks */}
            {consciousnessSubTab === 'resilience' && (
              <div className="space-y-5">
                {/* Parallel Multi-Provider Mode */}
                <div className="bg-[#0e0e14]/55 border border-white/5 p-5 rounded-2xl space-y-4">
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center gap-2">
                      <Zap size={14} className="text-cyan-400" /> Parallel Multi-Provider Requests
                    </h4>
                    <p className="text-[10px] text-zinc-400 font-mono mt-1 uppercase">
                      Fire requests concurrently across providers to minimize latency. First success wins.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-6 pt-1">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!(settings.gemini?.parallelProviders)}
                        onChange={(e) => updateGeminiSetting('parallelProviders', e.target.checked)}
                        className="accent-cyan-500 w-4 h-4 cursor-pointer"
                      />
                      <span className="text-[11px] text-white font-mono">Enable Parallel Provider Execution</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-zinc-400 font-mono uppercase">Max Concurrency:</span>
                      <input
                        type="number"
                        min={1}
                        max={8}
                        value={Number(settings.gemini?.parallelConcurrency) || 3}
                        onChange={(e) => updateGeminiSetting('parallelConcurrency', Math.max(1, Math.min(8, Number(e.target.value) || 3)))}
                        className="w-16 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-xs text-white font-mono text-center"
                      />
                    </div>
                  </div>
                </div>

                {/* Fallback Chain Pipeline */}
                <div className="bg-[#0e0e14]/55 border border-white/5 p-5 rounded-2xl space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="text-xs font-bold text-white flex items-center gap-2">
                        <Layers size={14} className="text-amber-400" /> Multi-Provider Fallback Pipeline
                      </h4>
                      <p className="text-[10px] text-zinc-400 font-mono mt-0.5 uppercase">
                        Cascading fallback chain if primary provider errors or hits quota limits (429)
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addFallbackRow}
                      className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-[9px] uppercase font-mono font-bold rounded-xl border border-amber-500/20 transition-all cursor-pointer flex items-center gap-1"
                    >
                      <Plus size={12} /> Add Fallback Step
                    </button>
                  </div>

                  {!(settings.gemini?.fallbackChain && settings.gemini.fallbackChain.length > 0) ? (
                    <div className="border border-dashed border-white/5 bg-black/20 p-6 rounded-xl text-center text-[10px] font-mono text-zinc-500">
                      No custom fallback steps configured. Click "Add Fallback Step" to build your resilience chain.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {(settings.gemini.fallbackChain || []).map((row: any, idx: number) => (
                        <div key={row.id} className="bg-black/30 border border-white/5 p-3.5 rounded-xl space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded font-mono font-bold uppercase border border-amber-500/20">
                              Step #{idx + 1}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => moveFallbackRowUp(idx)}
                                disabled={idx === 0}
                                className="p-1 text-zinc-400 hover:text-white bg-white/5 rounded disabled:opacity-30 cursor-pointer"
                              >
                                <ChevronUp size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveFallbackRowDown(idx)}
                                disabled={idx === (settings.gemini.fallbackChain.length - 1)}
                                className="p-1 text-zinc-400 hover:text-white bg-white/5 rounded disabled:opacity-30 cursor-pointer"
                              >
                                <ChevronDown size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteFallbackRow(row.id)}
                                className="p-1 text-rose-400 hover:bg-rose-500/10 rounded cursor-pointer ml-1"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
                            <div>
                              <label className="text-[8px] uppercase font-mono text-zinc-500 block mb-1">Provider</label>
                              <SearchableSelect
                                value={row.provider || 'gemini'}
                                onChange={prov => editFallbackRow(row.id, 'provider', prov)}
                                options={[
                                  { value: 'gemini', label: 'Google Gemini' },
                                  { value: 'openai', label: 'OpenAI' },
                                  { value: 'anthropic', label: 'Anthropic Claude' },
                                  { value: 'openrouter', label: 'OpenRouter' },
                                  { value: 'groq', label: 'Groq' },
                                  { value: 'ollama', label: 'Local Ollama' }
                                ]}
                              />
                            </div>
                            <div>
                              <label className="text-[8px] uppercase font-mono text-zinc-500 block mb-1">Model Name</label>
                              <input
                                type="text"
                                value={row.model || ''}
                                placeholder="e.g. gemini-2.5-flash"
                                onChange={e => editFallbackRow(row.id, 'model', e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500/40"
                              />
                            </div>
                            <div>
                              <label className="text-[8px] uppercase font-mono text-zinc-500 block mb-1">API Key Override</label>
                              <input
                                type="password"
                                value={row.apiKey || ''}
                                placeholder="Use provider key..."
                                onChange={e => editFallbackRow(row.id, 'apiKey', e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500/40"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sub-Tab 3: Credentials */}
            {consciousnessSubTab === 'credentials' && (
              <div className="bg-[#0e0e14]/55 border border-white/5 p-5 rounded-2xl space-y-4">
                <div>
                  <h4 className="text-xs font-bold text-white">Integration Credentials & Parameters</h4>
                  <p className="text-[10px] text-zinc-400 font-mono uppercase mt-0.5">Configure API Keys and endpoints for provider modules</p>
                </div>
                {tempModule && tempModule.metadata.configSchema ? (
                  <div className="pt-2">{renderFields(tempModule)}</div>
                ) : (
                  <p className="text-xs font-mono text-zinc-500">Select an active provider to edit credentials.</p>
                )}
              </div>
            )}
          </div>
        );
      }

      case 'agi_mind': {
        const agiModule = allRegModules.find(m => m.metadata.id === 'yui-agi');
        const mirrorModule = allRegModules.find(m => m.metadata.id === 'self-awareness-mirror');
        const continuousModule = allRegModules.find(m => m.metadata.id === 'continuous-learning-memory');
        const cortices = modules[ModuleType.CORTEX] || [];

        const updateAgi = (field: string, val: any) => updateSetting('yui-agi', field, val);
        const updateMirror = (field: string, val: any) => updateSetting('self-awareness-mirror', field, val);
        const updateContinuous = (field: string, val: any) => updateSetting('continuous-learning-memory', field, val);

        const agiConfig = settings['yui-agi'] || {};
        const mirrorConfig = settings['self-awareness-mirror'] || {};
        const continuousConfig = settings['continuous-learning-memory'] || {};

        return (
          <div className="space-y-5">
            {/* AGI Mind Sub-Tabs */}
            <div className="flex flex-wrap gap-2 p-1 bg-black/40 border border-white/5 rounded-xl">
              {[
                { id: 'core', label: '🧠 Cognitive Core & Controllers' },
                { id: 'awareness', label: '👁️ Self-Awareness & EWC' },
                { id: 'rules', label: '⚡ Emotion Regex Rules' },
                { id: 'cortices', label: '📂 Neural Cortices Directory' },
              ].map(st => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setAgiSubTab(st.id as any)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-mono font-bold uppercase transition-all cursor-pointer ${
                    agiSubTab === st.id
                      ? 'bg-orange-500/15 border border-orange-500/30 text-orange-400'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            {agiSubTab === 'core' && (
              <div className="space-y-5">
                {/* Background Cognition Controllers */}
                <div className="bg-[#0e0e14]/55 border border-white/5 p-5 rounded-2xl space-y-4">
                  <h4 className="text-xs font-bold text-white flex items-center gap-2">
                    <Radio size={14} className="text-orange-400 animate-pulse" /> Background Cognition Controllers
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="bg-black/30 border border-white/5 p-4 rounded-xl flex items-center justify-between">
                      <div>
                        <h5 className="text-xs font-bold text-white">Autonomous Thought Pulse</h5>
                        <p className="text-[9.5px] text-zinc-400 mt-1">Independent thinking & memory reflection</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPulseEnabled && setPulseEnabled(!pulseEnabled)}
                        className={`px-3 py-1.5 rounded-lg text-[9px] font-mono uppercase font-bold border transition-all cursor-pointer ${
                          pulseEnabled ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'
                        }`}
                      >
                        {pulseEnabled ? 'ACTIVE' : 'INACTIVE'}
                      </button>
                    </div>

                    <div className="bg-black/30 border border-white/5 p-4 rounded-xl flex items-center justify-between">
                      <div>
                        <h5 className="text-xs font-bold text-white">Offline Synapse Training</h5>
                        <p className="text-[9.5px] text-zinc-400 mt-1">Background memory backpropagation</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateAgi('enableOfflineTraining', agiConfig.enableOfflineTraining === false)}
                        className={`px-3 py-1.5 rounded-lg text-[9px] font-mono uppercase font-bold border transition-all cursor-pointer ${
                          (agiConfig.enableOfflineTraining !== false) ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'
                        }`}
                      >
                        {(agiConfig.enableOfflineTraining !== false) ? 'ACTIVE' : 'INACTIVE'}
                      </button>
                    </div>
                  </div>
                </div>

                {agiModule && (
                  <div className="bg-[#0e0e14]/55 border border-white/5 p-5 rounded-2xl">
                    <h4 className="text-xs font-bold text-white mb-3">Primary Homeostasis Circuit (YUI-AGI)</h4>
                    {renderFields(agiModule, agiConfig, updateAgi)}
                  </div>
                )}
              </div>
            )}

            {agiSubTab === 'awareness' && (
              <div className="space-y-5">
                {mirrorModule && (
                  <div className="bg-[#0e0e14]/55 border border-white/5 p-5 rounded-2xl">
                    <h4 className="text-xs font-bold text-white mb-3 flex items-center gap-2">
                      <Eye size={14} className="text-cyan-400" /> Self-Awareness Evaluation Mirror
                    </h4>
                    {renderFields(mirrorModule, mirrorConfig, updateMirror)}
                  </div>
                )}

                {continuousModule && (
                  <div className="bg-[#0e0e14]/55 border border-white/5 p-5 rounded-2xl">
                    <h4 className="text-xs font-bold text-white mb-3 flex items-center gap-2">
                      <Layers size={14} className="text-emerald-400" /> Prevent Catastrophic Forgetting (EWC)
                    </h4>
                    {renderFields(continuousModule, continuousConfig, updateContinuous)}
                  </div>
                )}
              </div>
            )}

            {agiSubTab === 'rules' && (
              <div className="bg-[#0e0e14]/55 border border-white/5 p-5 rounded-2xl space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="text-xs font-bold text-white">Custom Emotion Regex Rules & Mood Matrix</h4>
                    <p className="text-[10px] text-zinc-400 font-mono uppercase mt-0.5">Map regex patterns directly to emotional shifts</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const newRule = {
                        id: 'rule_' + genId(9),
                        pattern: '',
                        sensitivity: 1.0,
                        isPriority: false,
                        moodImpact: { joy: 0, anger: 0, sadness: 0, stress: 0, irritation: 0, excitement: 0, playfulness: 0 }
                      };
                      setSettings((prev: any) => ({
                        ...prev,
                        emotionRegexRules: [...(Array.isArray(prev.emotionRegexRules) ? prev.emotionRegexRules : []), newRule]
                      }));
                    }}
                    className="px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 rounded-xl text-[9px] font-mono font-bold uppercase border border-orange-500/20 cursor-pointer flex items-center gap-1"
                  >
                    <Plus size={12} /> Add Rule
                  </button>
                </div>

                {/* Regex testing sandbox */}
                <div className="bg-black/30 border border-white/5 p-3.5 rounded-xl space-y-2">
                  <span className="text-[9px] font-mono text-orange-400 uppercase font-bold block">Regex Tester Sandbox</span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-1 text-xs text-white font-mono"
                      placeholder="Type test string..."
                      value={regexTestInput}
                      onChange={e => setRegexTestInput(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const rules = Array.isArray(settings.emotionRegexRules) ? settings.emotionRegexRules : [];
                        const match = rules.find((rule: any) => {
                          try { return new RegExp(rule.pattern, "i").test(regexTestInput); } catch (e) { return false; }
                        });
                        alert(match ? `[MATCH] Rule "${match.pattern}" matched!` : '[NO MATCH] No rule matched.');
                      }}
                      className="px-3 py-1 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 rounded-lg text-[9px] font-mono uppercase font-bold border border-orange-500/20 cursor-pointer"
                    >
                      Test
                    </button>
                  </div>
                </div>

                {/* Rules List */}
                <div className="space-y-3">
                  {(Array.isArray(settings.emotionRegexRules) ? settings.emotionRegexRules : []).map((rule: any) => (
                    <div key={rule.id} className="p-3 bg-black/30 border border-white/5 rounded-xl space-y-2 relative">
                      <button
                        type="button"
                        onClick={() => {
                          setSettings((prev: any) => ({
                            ...prev,
                            emotionRegexRules: (prev.emotionRegexRules || []).filter((r: any) => r.id !== rule.id)
                          }));
                        }}
                        className="absolute top-3 right-3 text-zinc-500 hover:text-rose-400"
                      >
                        <Trash2 size={13} />
                      </button>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pr-8">
                        <div>
                          <label className="text-[8px] uppercase font-mono text-zinc-500 block">Regex Pattern</label>
                          <input
                            type="text"
                            className="w-full bg-black/40 border border-white/10 rounded px-2.5 py-1 text-xs text-white font-mono"
                            placeholder="e.g. sayang|kangen"
                            value={rule.pattern || ''}
                            onChange={e => {
                              setSettings((prev: any) => ({
                                ...prev,
                                emotionRegexRules: (prev.emotionRegexRules || []).map((r: any) => r.id === rule.id ? { ...r, pattern: e.target.value } : r)
                              }));
                            }}
                          />
                        </div>
                        <div className="flex items-center gap-2 pt-3">
                          <input
                            type="checkbox"
                            checked={!!rule.isPriority}
                            onChange={e => {
                              setSettings((prev: any) => ({
                                ...prev,
                                emotionRegexRules: (prev.emotionRegexRules || []).map((r: any) => r.id === rule.id ? { ...r, isPriority: e.target.checked } : r)
                              }));
                            }}
                            className="accent-orange-500"
                          />
                          <span className="text-[9px] font-mono text-zinc-300 uppercase">Priority Override</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {agiSubTab === 'cortices' && (
              <div className="bg-[#0e0e14]/55 border border-white/5 p-5 rounded-2xl space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-white">Neural Cortices Directory ({cortices.length})</h4>
                    <p className="text-[10px] text-zinc-400 font-mono uppercase mt-0.5">Specialized cognitive cortices operating in YuiHime</p>
                  </div>
                  <div className="relative w-full sm:w-64">
                    <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                      type="text"
                      placeholder="Search cortices..."
                      value={cortexQuery}
                      onChange={e => setCortexQuery(e.target.value)}
                      className="w-full bg-black/40 border border-white/5 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  {cortices
                    .filter((c: any) => (c.metadata.name || '').toLowerCase().includes(cortexQuery.toLowerCase()))
                    .map((c: any) => (
                      <div key={c.metadata.id} className="bg-black/30 border border-white/5 p-4 rounded-xl space-y-2">
                        <h5 className="text-xs font-bold text-white">{c.metadata.name}</h5>
                        <p className="text-[10px] text-zinc-400">{c.metadata.description}</p>
                        {renderFields(c)}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        );
      }

      case 'tools': {
        const toolsList = modules[ModuleType.TOOL] || [];
        const toolExecutorModule = allRegModules.find(m => m.metadata.id === 'tool-executor');
        const updateToolExecutor = (field: string, val: any) => {
          setSettings((prev: any) => ({
            ...prev,
            'tool-executor': { ...(prev['tool-executor'] || {}), [field]: val }
          }));
        };
        const toolExecutorConfig = settings['tool-executor'] || {};

        return (
          <div className="space-y-5">
            {/* System Tools Sub-Tabs */}
            <div className="flex flex-wrap gap-2 p-1 bg-black/40 border border-white/5 rounded-xl">
              {[
                { id: 'system', label: '🛠️ System Action Tools' },
                { id: 'custom', label: '⚡ Custom Schema Builder' },
                { id: 'policy', label: '🛡️ Execution Limits & Policy' },
              ].map(st => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setToolsSubTab(st.id as any)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-mono font-bold uppercase transition-all cursor-pointer ${
                    toolsSubTab === st.id
                      ? 'bg-rose-500/15 border border-rose-500/30 text-rose-400'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            {toolsSubTab === 'system' && (
              <div className="bg-[#0e0e14]/55 border border-white/5 p-5 rounded-2xl space-y-4">
                <h4 className="text-xs font-bold text-white">Registered System Tools ({toolsList.length})</h4>
                <div className="space-y-3">
                  {toolsList.map((t: any) => (
                    <div key={t.metadata.id} className="bg-black/30 border border-white/5 p-4 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-bold text-white">{t.metadata.name} <span className="text-[9px] font-mono text-zinc-500">({t.metadata.id})</span></h5>
                        <span className="text-[8px] font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold uppercase">System Tool</span>
                      </div>
                      <p className="text-[10px] text-zinc-400">{t.metadata.description}</p>
                      {t.metadata.configSchema && renderFields(t)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {toolsSubTab === 'custom' && (
              <div className="bg-[#0e0e14]/55 border border-white/5 p-5 rounded-2xl space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="text-xs font-bold text-white">Custom Tools Registry ({customTools.length})</h4>
                    <p className="text-[10px] text-zinc-400 font-mono uppercase mt-0.5">Generate custom OpenAPI tools with JS sandbox or shell commands</p>
                  </div>
                  {!showCustomToolForm && (
                    <button
                      type="button"
                      onClick={() => setShowCustomToolForm(true)}
                      className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white font-mono font-bold text-[10px] uppercase rounded-xl transition-all cursor-pointer flex items-center gap-1"
                    >
                      <Plus size={12} /> Generate Tool
                    </button>
                  )}
                </div>

                {showCustomToolForm && (
                  <div className="bg-black/40 border border-rose-500/30 p-4 rounded-xl space-y-3 text-xs">
                    <h5 className="font-bold text-rose-400 font-mono">⚡ On-The-Fly Schema Generator</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Tool ID (e.g. scrape_web)"
                        value={newToolId}
                        onChange={e => setNewToolId(e.target.value)}
                        className="bg-black/50 border border-white/10 rounded px-3 py-1.5 text-white font-mono"
                      />
                      <input
                        type="text"
                        placeholder="Display Name"
                        value={newToolName}
                        onChange={e => setNewToolName(e.target.value)}
                        className="bg-black/50 border border-white/10 rounded px-3 py-1.5 text-white"
                      />
                    </div>
                    <textarea
                      placeholder="Tool description..."
                      value={newToolDesc}
                      onChange={e => setNewToolDesc(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded p-2 text-white text-xs"
                      rows={2}
                    />
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setShowCustomToolForm(false)} className="px-3 py-1 bg-zinc-800 text-zinc-300 rounded font-mono">Cancel</button>
                      <button type="button" onClick={saveCustomTool} className="px-3 py-1 bg-rose-500 text-white font-bold rounded font-mono">Save Tool</button>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  {customTools.map((t: any) => (
                    <div key={t.id} className="bg-black/30 border border-white/5 p-4 rounded-xl flex items-center justify-between">
                      <div>
                        <h5 className="text-xs font-bold text-white">{t.name} <span className="text-[9px] font-mono text-zinc-500">({t.id})</span></h5>
                        <p className="text-[10px] text-zinc-400">{t.description}</p>
                      </div>
                      <button type="button" onClick={() => deleteCustomTool(t.id)} className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {toolsSubTab === 'policy' && (
              <div className="bg-[#0e0e14]/55 border border-white/5 p-5 rounded-2xl space-y-4">
                <h4 className="text-xs font-bold text-white">Limits & Retries Policy</h4>
                {toolExecutorModule && renderFields(toolExecutorModule, toolExecutorConfig, updateToolExecutor)}
              </div>
            )}
          </div>
        );
      }

      case 'speech': {
        const ttsModules = modules[ModuleType.TTS] || [];
        return (
          <div className="space-y-5">
            <div className="flex gap-2 border-b border-white/5 pb-2">
              <button
                type="button"
                onClick={() => setSpeechActiveTab('setup')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all ${speechActiveTab === 'setup' ? 'bg-cyan-500/15 border border-cyan-500/30 text-cyan-400' : 'text-zinc-400 hover:text-white'}`}
              >
                Engine Setup
              </button>
              <button
                type="button"
                onClick={() => setSpeechActiveTab('calibration')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all ${speechActiveTab === 'calibration' ? 'bg-cyan-500/15 border border-cyan-500/30 text-cyan-400' : 'text-zinc-400 hover:text-white'}`}
              >
                Voice Calibration
              </button>
            </div>

            {speechActiveTab === 'setup' ? (
              <div className="space-y-4">
                <div className="bg-[#0e0e14]/55 border border-white/5 p-5 rounded-2xl space-y-3">
                  <h4 className="text-xs font-bold text-white">Voice Synthesis Engines (TTS)</h4>
                  <div className="space-y-2">
                    {ttsModules.map((p: any) => (
                      <div key={p.metadata.id} className="bg-black/30 border border-white/5 p-3.5 rounded-xl flex items-center justify-between">
                        <div>
                          <h5 className="text-xs font-bold text-white">{p.metadata.name}</h5>
                          <p className="text-[10px] text-zinc-400">{p.metadata.description}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSettings((prev: any) => ({ ...prev, ttsProvider: p.metadata.id }))}
                          className={`px-3 py-1 rounded text-[9px] font-mono uppercase font-bold border transition-all ${settings.ttsProvider === p.metadata.id ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' : 'bg-white/5 text-zinc-400'}`}
                        >
                          {settings.ttsProvider === p.metadata.id ? 'ACTIVE' : 'SELECT'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {ttsModules.map((c: any) => (
                  settings.ttsProvider === c.metadata.id && (
                    <div key={c.metadata.id} className="bg-[#0e0e14]/55 border border-white/5 p-5 rounded-2xl space-y-3">
                      <h4 className="text-xs font-bold text-white">{c.metadata.name} Settings</h4>
                      {renderFields(c)}
                    </div>
                  )
                ))}
              </div>
            ) : (
              <VoiceCalibration settings={settings} setSettings={setSettings} modules={modules} />
            )}
          </div>
        );
      }

      case 'hearing': {
        const updateHearing = (field: string, val: any) => {
          setSettings((prev: any) => ({ ...prev, hearing: { ...(prev.hearing || {}), [field]: val } }));
        };
        const hearingConfig = settings.hearing || { enabled: true, threshold: 35, silenceDuration: 1500 };
        const hearingModule = allRegModules.find(m => m.metadata.id === 'hearing') || {
          metadata: { id: 'hearing' },
          configSchema: {
            fields: {
              enabled: { label: 'Voice Activation Capture', type: 'boolean', default: true },
              threshold: { label: 'Microphone Sensitivity Threshold (dB)', type: 'slider', min: 10, max: 100, step: 1, default: 35 },
              silenceDuration: { label: 'End of Speech Silence Trigger (ms)', type: 'slider', min: 500, max: 4000, step: 100, default: 1500 }
            }
          }
        };
        return (
          <div className="bg-[#0e0e14]/55 border border-white/5 p-5 rounded-2xl space-y-4">
            <h4 className="text-xs font-bold text-white">Auditory Capture & Speech-to-Text</h4>
            {renderFields(hearingModule, hearingConfig, updateHearing)}
          </div>
        );
      }

      case 'vision': {
        const updateVision = (field: string, val: any) => {
          setSettings((prev: any) => ({ ...prev, vision: { ...(prev.vision || {}), [field]: val } }));
        };
        const visionConfig = settings.vision || {};
        const visionModule = allRegModules.find(m => m.metadata.id === 'vision') || {
          metadata: { id: 'vision' },
          configSchema: {
            fields: {
              enabled: { label: 'Avatar Virtual Sight', type: 'boolean', default: false },
              interval: { label: 'Snapshot Frequency Rate (ms)', type: 'slider', min: 1000, max: 15000, step: 500, default: 3000 }
            }
          }
        };
        return (
          <div className="bg-[#0e0e14]/55 border border-white/5 p-5 rounded-2xl space-y-4">
            <h4 className="text-xs font-bold text-white">Optical Sight Calibration</h4>
            {renderFields(visionModule, visionConfig, updateVision)}
          </div>
        );
      }

      case 'artistry': {
        const updateArtistry = (field: string, val: any) => {
          setSettings((prev: any) => ({ ...prev, artistry: { ...(prev.artistry || {}), [field]: val } }));
        };
        const artConfig = settings.artistry || {};
        const artistryModule = allRegModules.find(m => m.metadata.id === 'artistry') || {
          metadata: { id: 'artistry' },
          configSchema: {
            fields: {
              ratio: { label: 'Aspect Ratio', type: 'select', default: '16:9', options: [{ value: '16:9', label: '16:9' }, { value: '1:1', label: '1:1' }] },
              negativePrompt: { label: 'Negative Prompt Filter', type: 'textarea', default: '' }
            }
          }
        };
        return (
          <div className="bg-[#0e0e14]/55 border border-white/5 p-5 rounded-2xl space-y-4">
            <h4 className="text-xs font-bold text-white">Artistic Canvas Synthesizer</h4>
            {renderFields(artistryModule, artConfig, updateArtistry)}
          </div>
        );
      }

      case 'short_term_memory': {
        const updateSTM = (field: string, val: any) => {
          setSettings((prev: any) => ({ ...prev, stm: { ...(prev.stm || {}), [field]: val } }));
        };
        const stmConfig = settings.stm || {};
        const shortTermMemoryModule = allRegModules.find(m => m.metadata.id === 'short_term_memory') || {
          metadata: { id: 'short_term_memory' },
          configSchema: {
            fields: {
              recallBufferSize: { label: 'Short-Term Recency Buffer', type: 'slider', min: 5, max: 100, step: 5, default: 15 }
            }
          }
        };
        return (
          <div className="bg-[#0e0e14]/55 border border-white/5 p-5 rounded-2xl space-y-4">
            <h4 className="text-xs font-bold text-white">Episodic Recency Buffer</h4>
            {renderFields(shortTermMemoryModule, stmConfig, updateSTM)}
          </div>
        );
      }

      case 'long_term_memory': {
        const recallModule = modules[ModuleType.TOOL]?.find(m => m.metadata.id === 'memory-recall');
        const updateLTM = (field: string, val: any) => {
          setSettings((prev: any) => ({ ...prev, ltm: { ...(prev.ltm || {}), [field]: val } }));
        };
        const ltmConfig = settings.ltm || {};
        const longTermMemoryModule = allRegModules.find(m => m.metadata.id === 'long_term_memory') || {
          metadata: { id: 'long_term_memory' },
          configSchema: {
            fields: {
              vectorDatabase: { label: 'Vector DB Engine', type: 'select', default: 'sqlite_vss', options: [{ value: 'sqlite_vss', label: 'SQLite VSS' }] }
            }
          }
        };
        return (
          <div className="space-y-4">
            {recallModule && (
              <div className="bg-[#0e0e14]/55 border border-white/5 p-5 rounded-2xl space-y-3">
                <h4 className="text-xs font-bold text-white">Semantic Memory Recall Module</h4>
                {renderFields(recallModule)}
              </div>
            )}
            <div className="bg-[#0e0e14]/55 border border-white/5 p-5 rounded-2xl space-y-3">
              <h4 className="text-xs font-bold text-white">Vector Database Config</h4>
              {renderFields(longTermMemoryModule, ltmConfig, updateLTM)}
            </div>
          </div>
        );
      }

      case 'telegram': {
        const telegramModule = allRegModules.find(m => m.metadata.id === 'telegram_bridge') || fallbackTelegramModule;
        return (
          <div className="space-y-5">
            <div className="bg-[#0e0e14]/55 border border-white/5 p-5 rounded-2xl space-y-3">
              <h4 className="text-xs font-bold text-sky-400">Telegram Neural Link</h4>
              {renderFields(telegramModule)}
            </div>

            <div className="bg-[#0e0e14]/55 border border-white/5 p-5 rounded-2xl space-y-3">
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <h4 className="text-xs font-bold text-sky-400">Telegram Bot Diagnostic</h4>
                <div className="flex gap-2">
                  <button onClick={fetchTgStatus} disabled={tgTesting} className="px-2.5 py-1 bg-sky-500/10 text-sky-400 rounded text-[9px] font-mono uppercase border border-sky-500/20">
                    {tgTesting ? "Testing..." : "Test Link"}
                  </button>
                  <button onClick={() => recreateTgBot(false)} disabled={tgTesting} className="px-2.5 py-1 bg-red-500/10 text-red-400 rounded text-[9px] font-mono uppercase border border-red-500/20">
                    Reinit
                  </button>
                </div>
              </div>
              {tgStatus && (
                <div className="p-3 bg-black/30 border border-white/5 rounded-xl font-mono text-[10px] text-zinc-300">
                  <p className="font-bold">{tgStatus.initialized ? "● BOT ONLINE" : "○ BOT OFFLINE"}</p>
                  <p className="text-zinc-500">{tgStatus.message}</p>
                </div>
              )}
            </div>
          </div>
        );
      }

      case 'discord': {
        const discordModule = allRegModules.find(m => m.metadata.id === 'discord_bridge') || fallbackDiscordModule;
        return (
          <div className="bg-[#0e0e14]/55 border border-white/5 p-5 rounded-2xl space-y-3">
            <h4 className="text-xs font-bold text-blue-400">Discord Sync Conduit</h4>
            {renderFields(discordModule)}
          </div>
        );
      }

      case 'twitter': {
        const twitterModule = allRegModules.find(m => m.metadata.id === 'twitter_bridge') || fallbackTwitterModule;
        return (
          <div className="bg-[#0e0e14]/55 border border-white/5 p-5 rounded-2xl space-y-3">
            <h4 className="text-xs font-bold text-sky-400">X / Twitter Autonomous Conduits</h4>
            {renderFields(twitterModule)}
          </div>
        );
      }

      case 'mcp_servers': {
        const mcpModule = allRegModules.find(m => m.metadata.id === 'mcp_servers');
        return (
          <div className="bg-[#0e0e14]/55 border border-white/5 p-5 rounded-2xl space-y-3">
            <h4 className="text-xs font-bold text-violet-400">Model Context Protocol Connections</h4>
            {mcpModule && renderFields(mcpModule)}
          </div>
        );
      }

      default:
        return <p className="text-zinc-500 text-xs font-mono">Select a module category.</p>;
    }
  };

  return (
    <div className="space-y-5">
      {selectedSubmoduleCategory ? (
        <div className="space-y-4">
          {/* Top Bar Navigation with Quick Category Switcher */}
          <div className="bg-[#0e0e14]/80 border border-white/5 p-3 rounded-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setSelectedSubmoduleCategory(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-mono uppercase tracking-wider transition-all cursor-pointer border border-white/5 shrink-0"
            >
              <ChevronLeft size={14} /> All Modules
            </button>

            {/* Quick Category Switcher Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              {moduleCategories.map(cat => {
                const isActive = cat.id === selectedSubmoduleCategory;
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedSubmoduleCategory(cat.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase whitespace-nowrap transition-all cursor-pointer border ${
                      isActive 
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-400' 
                        : 'bg-black/30 border-white/5 text-zinc-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon size={11} className={isActive ? 'text-amber-400' : 'text-zinc-500'} />
                    <span>{cat.title}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Render category detail */}
          {renderCategoryDetail(selectedSubmoduleCategory)}
        </div>
      ) : (
        /* Modules Top Overview View */
        <div className="space-y-5">
          {/* Header & Search */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h4 className="text-sm font-bold text-white tracking-wide font-sans">YuiHime Modules</h4>
              <p className="text-[10px] text-zinc-400 uppercase font-mono mt-0.5">Control brain, perception, memory, and communications</p>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search modules..."
                value={categorySearch}
                onChange={e => setCategorySearch(e.target.value)}
                className="w-full bg-black/40 border border-white/5 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500/40 font-mono"
              />
            </div>
          </div>

          {/* Group Filter Tabs */}
          <div className="flex flex-wrap gap-1.5 p-1 bg-black/30 border border-white/5 rounded-xl">
            {categoryGroups.map(grp => (
              <button
                key={grp.id}
                type="button"
                onClick={() => setActiveGroupFilter(grp.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all cursor-pointer ${
                  activeGroupFilter === grp.id
                    ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {grp.label}
              </button>
            ))}
          </div>

          {/* Grid of Categories */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {filteredCategories.map(cat => {
              const Icon = cat.icon;
              return (
                <div
                  key={cat.id}
                  onClick={() => setSelectedSubmoduleCategory(cat.id)}
                  className="p-4 rounded-2xl bg-[#0e0e14]/55 hover:bg-[#151520]/80 border border-white/5 hover:border-amber-500/30 cursor-pointer select-none transition-all group relative overflow-hidden flex flex-col justify-between h-[130px]"
                >
                  <div className="flex items-center justify-between">
                    <div className={`p-2 rounded-xl border border-white/10 ${cat.bg} ${cat.color} group-hover:scale-105 transition-transform`}>
                      <Icon size={18} />
                    </div>
                    <ChevronRight size={14} className="text-zinc-500 group-hover:text-amber-400 transition-colors" />
                  </div>

                  <div>
                    <h5 className="text-xs font-bold text-white group-hover:text-amber-400 transition-colors">
                      {cat.title}
                    </h5>
                    <p className="text-[10px] text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                      {cat.desc}
                    </p>
                  </div>
                </div>
              );
            })}

            {filteredCategories.length === 0 && (
              <div className="col-span-full text-center py-10 bg-black/20 border border-dashed border-white/5 rounded-2xl font-mono text-xs text-zinc-500">
                No modules match your search or filter.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
