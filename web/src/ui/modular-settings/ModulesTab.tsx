import React, { useState } from 'react';
import { ModuleType } from '@shared/include/types';
import { SystemRegistry } from '@shared/core/registry';
import { 
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Sparkles, Cpu, Radio, Brain, Zap, Terminal, Plus, Trash2, Clock, 
  RefreshCw, Search, Layers, Volume2, Mic, Eye, Palette, 
  ClipboardList, Database, Send, MessageSquare, Share2, Server 
} from 'lucide-react';
import { motion } from 'motion/react';
import { VoiceCalibration } from './voiceCalibration';
import { SearchableSelect } from '../../components/SearchableSelect';

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
  // Local UI states transferred from parent to reduce clutter & increase modularity
  const [modelsCollapsed, setModelsCollapsed] = useState<boolean>(true);
  const [customTools, setCustomTools] = useState<any[]>([]);
  const [customToolsLoading, setCustomToolsLoading] = useState<boolean>(false);
  const [showCustomToolForm, setShowCustomToolForm] = useState<boolean>(false);
  const [customToolError, setCustomToolError] = useState<string | null>(null);

  // Custom tool dynamic form states
  const [newToolId, setNewToolId] = useState<string>('');
  const [newToolName, setNewToolName] = useState<string>('');
  const [newToolDesc, setNewToolDesc] = useState<string>('');
  const [newToolActionType, setNewToolActionType] = useState<string>('code');
  const [newToolActionCode, setNewToolActionCode] = useState<string>('// JS Sandbox code (access args, return object)\nconst { targetUrl } = args;\nreturn { status: "success", targetUrl };');
  const [newToolParams, setNewToolParams] = useState<Array<{ name: string; type: 'string' | 'number' | 'boolean'; required: boolean; description: string }>>([]);

  // Helper to patch nested gemini settings used by the Orchestrator
  const updateGeminiSetting = (field: string, value: any) => {
    setSettings((prev: any) => ({
      ...prev,
      gemini: { ...(prev.gemini || {}), [field]: value }
    }));
  };

  // Fetch custom tools
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
    
    // Compile JSON Schema from our params list
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
        // Reset form
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
    if (!window.confirm(`Are you sure you want to delete custom tool "${id}"?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/tools/custom/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        fetchCustomTools();
      }
    } catch (err) {
      console.error('[UI] Failed to delete custom tool:', err);
    }
  };

  React.useEffect(() => {
    fetchCustomTools();
  }, []);
  const [credentialsCollapsed, setCredentialsCollapsed] = useState<boolean>(true);
  const [expandedModels, setExpandedModels] = useState<Record<string, boolean>>({});
  const [speechActiveTab, setSpeechActiveTab] = useState<'setup' | 'calibration'>('setup');
  const [regexTestInput, setRegexTestInput] = useState<string>('');
  const [cortexQuery, setCortexQuery] = useState<string>('');
  const [cortexFilter, setCortexFilter] = useState<'all' | 'cognition' | 'memory' | 'perception' | 'utility'>('all');

  // Hoisted Artistry backdrop custom states to top level of component
  const [artPrompt, setArtPrompt] = useState('');
  const [isArtGenerating, setIsArtGenerating] = useState(false);
  const [artResult, setArtResult] = useState<string | null>(() => {
    return localStorage.getItem('yuihime_stage_backdrop_custom') || null;
  });
  const [errorArt, setErrorArt] = useState('');

  const moduleCategories = [
    { id: 'consciousness', title: 'Consciousness', desc: 'Personality, desired model, and thinking pathways.', icon: Sparkles, color: 'text-amber-500' },
    { id: 'agi_mind', title: 'AGI Mind Engine', desc: 'Manage neurotransmitters, core emotional homeostasis, the self-awareness mirror, and adaptive learning.', icon: Brain, color: 'text-amber-400' },
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
    switch (catId) {
      case 'consciousness': {
        const providers = modules[ModuleType.PROVIDER] || [];
        const cortices = modules[ModuleType.CORTEX] || [];
        const activeProvider = providers.find((p: any) => p.metadata.id === settings.provider);

        // Find model options
        const schema = activeProvider?.metadata.configSchema;
        const modelFieldDef = schema?.fields?.model;
        const providerId = activeProvider?.metadata?.id;
        let modelOptions: any[] = [];
        
        // Prioritize dynamicModels fetched from the AI API connection
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

        // Temporary module options to render fields excluding "model"
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

        const getProviderUrl = (id: string) => {
          switch (id) {
            case 'gemini': return 'gemini.google.com';
            case 'openrouter': return 'openrouter.ai';
            case 'openai': return 'api.openai.com';
            case 'anthropic': return 'anthropic.com';
            case 'puter': return 'puter.com';
            default: return 'localhost:11434';
          }
        };

        // Check if provider is fully configured
        const isConfiguredProvider = (pId: string) => {
          const config = settings[pId];
          if (config && config.enabled === false) return false;
          if (pId === 'local' || pId === 'puter' || pId === 'puter-neural-provider') return true;
          if (!config) return false;
          return !!(config.apiKey || config.api_key || config.enabled || config.accessToken || config.botToken || config.token);
        };

        const getModelDescription = (val: string) => {
          const modelLower = val.toLowerCase();
          if (modelLower.includes('qwen')) {
            return "Qwen3.7-Max is the flagship model in Alibaba's Qwen3.7 series. It supports text input and output, and is optimized for complex reasoning, multilingual processing, and diverse chat scenarios.";
          }
          if (modelLower.includes('grok')) {
            return "Grok Build 0.1 is xAI's fast coding model trained specifically for agentic software engineering and long-context processing with exceptional instruction following.";
          }
          if (modelLower.includes('gemini-3.5-flash') || modelLower.includes('gemini-3.5') || modelLower.includes('gemini-3-flash')) {
            return "Google's next-generation lightweight, ultra-fast model designed for low latency, high-efficiency conversational agents and real-time execution flows.";
          }
          if (modelLower.includes('gemini-1.5-flash')) {
            return "Google Gemini Flash-tier model with deeply advanced reasoning, comprehensive multi-modal support, and fast response times.";
          }
          if (modelLower.includes('gemini-2.0-flash')) {
            return "Google's signature performance-focused model. Balanced rate limit profile, optimized for structured tool call pipelines and agent loops.";
          }
          if (modelLower.includes('gemini-2.5-pro') || modelLower.includes('gemini-3.1-pro') || modelLower.includes('gemini-pro')) {
            return "Google's highly advanced frontier reasoning model, ideal for complex coding tasks, extensive analyses, and multi-step agent reasoning iterations.";
          }
          if (modelLower.includes('gpt-4o')) {
            return "OpenAI's flagship multimodal model, exhibiting extreme speed and unmatched performance on general knowledge, math, and code generation tasks.";
          }
          if (modelLower.includes('claude-3-5-sonnet')) {
            return "Anthropic's state-of-the-art model. Sets new industry benchmarks for graduate-level reasoning, undergraduate-level knowledge, and coding proficiency.";
          }
          if (modelLower.includes('local') || modelLower.includes('llama') || modelLower.includes('ollama')) {
            return "Locally hosted custom neural network model. Completely offline, zero-latency local loop, and absolute privacy for kognisi processing.";
          }
          return "Dynamic AI brain model from the configured provider, optimized for agentic workflows, complex tool interactions, and personality manifestation.";
        };

        const handleDeleteProviderConfig = (pId: string) => {
          setSettings((prev: any) => {
            const updatedConfig = { ...prev[pId] };
            if ('apiKey' in updatedConfig) updatedConfig.apiKey = '';
            if ('api_key' in updatedConfig) updatedConfig.api_key = '';
            if ('accessToken' in updatedConfig) updatedConfig.accessToken = '';
            if ('access_token' in updatedConfig) updatedConfig.access_token = '';
            updatedConfig.enabled = false;
            
            const newSettings = {
              ...prev,
              [pId]: updatedConfig
            };
            
            let newProvider = prev.provider;
            if (prev.provider === pId) {
              const remains = providers.find((pr: any) => pr.metadata.id !== pId && isConfiguredProvider(pr.metadata.id));
              newProvider = remains ? remains.metadata.id : 'gemini';
            }
            return {
              ...newSettings,
              provider: newProvider
            };
          });
          
          setTimeout(async () => {
            try {
              const config = settings[pId] || {};
              const emptyConfig = {
                ...config,
                apiKey: '',
                api_key: '',
                accessToken: '',
                access_token: '',
                enabled: false
              };
              await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  provider: pId === settings.provider ? 'gemini' : settings.provider,
                  config: emptyConfig
                })
              });
            } catch (err) {
              console.error("Failed to sync cleared config to server:", err);
            }
          }, 100);
        };

        const configuredProviders = providers.filter((p: any) => isConfiguredProvider(p.metadata.id));

        return (
          <div className="space-y-6">
            {/* Nav Path indicator */}
            <div className="flex items-center gap-1.5 text-[10px] uppercase font-mono tracking-wider text-white/30">
              <span>Settings</span>
              <ChevronRight size={10} />
              <span className="text-amber-500 font-semibold">Consciousness</span>
            </div>

            {/* Section 1: Providers selection cards */}
            <div className="bg-[#0e0e14]/55 border border-white/5 p-4 sm:p-6 rounded-2xl space-y-4">
              <div>
                <h4 className="text-xs font-bold text-white tracking-wide">Providers</h4>
                <p className="text-[10px] text-white/30 uppercase mt-0.5">Select the suitable LLM provider for consciousness</p>
              </div>

              {/* Horizontal Scroll row for Providers config */}
              <div className="flex flex-nowrap gap-3 overflow-x-auto pb-2.5 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                {configuredProviders.map((p: any) => {
                  const isSelected = settings.provider === p.metadata.id;
                  
                  return (
                    <div
                      key={p.metadata.id}
                      onClick={() => setSettings((prev: any) => ({ ...prev, provider: p.metadata.id }))}
                      className={`relative p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between w-[145px] sm:w-[180px] h-[95px] select-none shrink-0 ${
                        isSelected 
                          ? 'bg-[#0ea5e9]/[0.02] border-[#0ea5e9]/40 text-white shadow-[0_0_15px_rgba(14,165,233,0.08)]' 
                          : 'bg-[#07070a]/40 hover:bg-[#111118]/70 border-white/5 text-white/70 hover:text-white'
                      }`}
                    >
                      {/* Top Buttons Row */}
                      <div className="flex items-center justify-between w-full">
                        {/* Radio indicator */}
                        {isSelected ? (
                          <div className="w-4 h-4 rounded-full bg-[#0ea5e9]/10 border border-[#0ea5e9]/40 flex items-center justify-center">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#0ea5e9] shadow-[0_0_8px_rgba(14,165,233,0.8)]" />
                          </div>
                        ) : (
                          <div className="w-4 h-4 rounded-full border border-white/10" />
                        )}

                        {/* Delete config button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProviderConfig(p.metadata.id);
                          }}
                          className="p-1 hover:bg-white/10 rounded-lg text-white/30 hover:text-red-400 transition-all cursor-pointer shrink-0"
                          title="Clear provider settings"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      {/* Info block */}
                      <div className="mt-2 min-w-0">
                        <h5 className="text-[11px] font-bold truncate leading-tight">{p.metadata.name}</h5>
                        <p className="text-[9px] font-mono text-white/30 mt-0.5 truncate">{getProviderUrl(p.metadata.id)}</p>
                      </div>
                    </div>
                  );
                })}

                {/* PLUS shortcut button to quickly open Providers Tab */}
                <div
                  onClick={() => {
                    // Quick trigger parent state directly via a custom custom-event or similar
                    window.dispatchEvent(new CustomEvent('yuihime_goto_section', { detail: 'providers' }));
                  }}
                  className="relative p-4 rounded-xl border border-dashed border-white/10 hover:border-[#0ea5e9]/30 hover:bg-white/[0.02] cursor-pointer transition-all flex items-center justify-center w-[145px] sm:w-[180px] h-[95px] select-none text-white/30 hover:text-[#0ea5e9]/80 group shrink-0"
                  title="Shortcut to configure more providers"
                >
                  <div className="flex items-center justify-center w-7 h-7 rounded-full border border-current transition-all">
                    <Plus size={14} className="group-hover:scale-110 transition-transform" />
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Model Search and Options Grid */}
            {!activeProvider && (
              <div className="bg-[#0e0e14]/55 border border-dashed border-white/5 p-6 rounded-2xl text-center space-y-2">
                <p className="text-zinc-550 text-xs font-mono">No active AI Provider chosen. Select your active provider from the carousel above.</p>
              </div>
            )}

            {activeProvider && (
              <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl space-y-4">
                <div className="flex justify-between items-center bg-black/10 p-1.5 px-3 rounded-xl border border-white/[0.03]">
                  <div>
                    <h4 className="text-xs font-bold text-white tracking-wide">Model</h4>
                    <p className="text-[10px] text-white/30 uppercase mt-0.5">Select a default model from the provider</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => fetchDynamicModels(activeProvider.metadata.id)}
                    disabled={fetchingModels}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 hover:text-amber-400 font-mono font-bold text-[9px] uppercase tracking-wider rounded-lg border border-amber-500/20 transition-all cursor-pointer disabled:opacity-40"
                    title="Query provider API for active available models"
                  >
                    <RefreshCw size={11} className={fetchingModels ? "animate-spin" : ""} />
                    {fetchingModels ? 'Syncing...' : 'Fetch API'}
                  </button>
                </div>

                {/* Search input field */}
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30">
                    <Search size={14} />
                  </span>
                  <input
                    type="text"
                    value={modelSearchQuery}
                    onChange={e => setModelSearchQuery(e.target.value)}
                    placeholder="Search models..."
                    className="w-full bg-[#07070a] border border-white/5 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500/30 font-sans"
                  />
                </div>

                {/* Collapsible Model grid list */}
                <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 transition-all duration-300 ${!modelsCollapsed ? 'max-h-[380px] overflow-y-auto pr-1.5 scrollbar-thin' : ''}`}>
                  {filteredOptions.length > 0 ? (
                    (modelsCollapsed ? filteredOptions.slice(0, 2) : filteredOptions).map((opt: any) => {
                      const isSelected = currentActiveModel === opt.value;
                      
                      return (
                        <div
                          key={opt.value}
                          onClick={() => updateSetting(activeProvider.metadata.id, 'model', opt.value)}
                          className={`relative p-4 rounded-xl border cursor-pointer select-none transition-all flex items-start gap-3.5 ${
                            isSelected 
                              ? 'bg-[#0ea5e9]/[0.02] border-[#0ea5e9]/30 text-white shadow-[0_0_12px_rgba(14,165,233,0.05)]' 
                              : 'bg-[#07070a]/30 hover:bg-[#111118]/65 border-white/5 text-white/70 hover:text-white'
                          }`}
                        >
                          {/* Radio indicator */}
                          <div className="mt-0.5">
                            {isSelected ? (
                              <div className="w-4 h-4 rounded-full bg-[#0ea5e9]/10 border border-[#0ea5e9]/40 flex items-center justify-center shrink-0">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#0ea5e9] shadow-[0_0_8px_rgba(14,165,233,0.8)]" />
                              </div>
                            ) : (
                              <div className="w-4 h-4 rounded-full border border-white/20 shrink-0" />
                            )}
                          </div>

                          {/* Info Column */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <h5 className="text-[11px] font-bold tracking-tight text-white/90 truncate">{opt.label}</h5>
                              
                              <span className="font-mono text-[7px] px-1.5 py-0.5 bg-white/5 border border-white/10 rounded-md text-white/40 shrink-0 uppercase">
                                {opt.value.toLowerCase().includes('local') || opt.value.toLowerCase().includes('localhost') ? 'Local' : 'Cloud'}
                              </span>
                            </div>

                            <p className="text-[8px] font-mono text-white/20 mt-0.5 truncate">{opt.value}</p>

                            <p className="text-[10px] text-zinc-400 mt-2 leading-relaxed font-sans">
                              {expandedModels[opt.value] 
                                ? getModelDescription(opt.value) 
                                : (getModelDescription(opt.value).length > 95 
                                    ? getModelDescription(opt.value).slice(0, 95) + '...' 
                                    : getModelDescription(opt.value))}
                            </p>

                            {/* Show More toggle link */}
                            {getModelDescription(opt.value).length > 95 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedModels(prev => ({ ...prev, [opt.value]: !prev[opt.value] }));
                                }}
                                className="mt-1 pb-1 inline-flex items-center gap-1 text-[9px] font-semibold text-cyan-400/80 hover:text-cyan-300 cursor-pointer transition-colors"
                              >
                                {expandedModels[opt.value] ? 'Show less' : 'Show more'}
                                {expandedModels[opt.value] ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="col-span-full text-center py-6 border border-dashed border-white/5 rounded-xl font-mono text-[10px] text-white/20">
                      No models matching your criteria detected.
                    </div>
                  )}
                </div>

                {/* Expand / Collapse Control */}
                {filteredOptions.length > 2 && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setModelsCollapsed(!modelsCollapsed)}
                      className="w-full py-2.5 bg-[#07070a]/50 hover:bg-[#111118]/80 text-white/50 hover:text-white border border-white/5 hover:border-white/10 rounded-xl flex items-center justify-center gap-1.5 font-mono text-[10px] uppercase font-bold tracking-wider cursor-pointer transition-all"
                    >
                      {modelsCollapsed ? 'Expand' : 'Collapse'}
                      {modelsCollapsed ? <ChevronDown size={12} className="text-white/40" /> : <ChevronUp size={12} className="text-white/40" />}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Section 3: Remainder temporary settings of the active provider */}
            {tempModule && tempModule.metadata.configSchema && Object.keys(tempModule.metadata.configSchema.fields || {}).length > 0 && (
              <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl space-y-4">
                <div 
                  className="flex justify-between items-center border-b border-white/5 pb-2 cursor-pointer select-none group"
                  onClick={() => setCredentialsCollapsed(!credentialsCollapsed)}
                >
                  <div>
                    <h4 className="text-xs font-bold text-white tracking-wide flex items-center gap-2">
                      Integration Credentials & Details
                      <span className="text-[9px] text-zinc-500 font-normal">({credentialsCollapsed ? "Hidden" : "Visible"})</span>
                    </h4>
                    <p className="text-[10px] text-white/30 uppercase mt-0.5">Parameters for direct sync orchestration</p>
                  </div>
                  <div className="flex items-center gap-2 text-zinc-400 group-hover:text-white transition-colors">
                    <span className="text-[10px] font-mono font-semibold tracking-wider uppercase">
                      {credentialsCollapsed ? 'Expand' : 'Collapse'}
                    </span>
                    {credentialsCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                  </div>
                </div>
                
                {!credentialsCollapsed && (
                  <div className="space-y-4 pt-1">
                    {renderFields(tempModule)}
                  </div>
                )}
              </div>
            )}

            {/* Parallel Multi-Provider Mode */}
            <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl space-y-6">
              <div>
                <h4 className="text-sm font-bold text-white tracking-wide font-sans flex items-center gap-2">
                  <Zap size={16} className="text-cyan-400" />
                  Parallel Multi-Provider Mode
                </h4>
                <p className="text-[10px] text-zinc-400 font-mono mt-1 leading-relaxed uppercase">
                  Fire multiple providers concurrently and use the fastest successful response. Improves latency resilience. Concurrency is capped (default 3, max 8) to avoid API rate-limit storms.
                </p>
              </div>
              <div className="flex flex-col gap-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!(settings.gemini?.parallelProviders)}
                    onChange={(e) => updateGeminiSetting('parallelProviders', e.target.checked)}
                    className="accent-cyan-500 w-4 h-4 cursor-pointer"
                  />
                  <span className="text-[11px] text-white/80 font-mono">Enable parallel provider requests</span>
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-white/80 font-mono whitespace-nowrap">Max concurrency</span>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={Number(settings.gemini?.parallelConcurrency) || 3}
                    onChange={(e) => updateGeminiSetting('parallelConcurrency', Math.max(1, Math.min(8, Number(e.target.value) || 3)))}
                    className="w-20 bg-[#07070a]/60 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white font-mono focus:outline-none focus:border-cyan-500/40"
                  />
                  <span className="text-[9px] text-zinc-500 font-mono">(1-8)</span>
                </div>
              </div>
            </div>

            {/* Key Reset Rule Scheduler */}
            <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl space-y-6">
              <div>
                <h4 className="text-sm font-bold text-white tracking-wide font-sans flex items-center gap-2">
                  <Clock size={16} className="text-cyan-400" />
                  API Key Reset Schedule (Quota Rule)
                </h4>
                <p className="text-[10px] text-zinc-400 font-mono mt-1 leading-relaxed uppercase">
                  Automatically clears cooled keys when a provider resets its quota. e.g. Google AI Studio free tier resets at 00:00 UTC daily. Rules apply to all providers listed.
                </p>
              </div>

              {(() => {
                const rules: any[] = settings.gemini?.keyResetRules || [];
                const updateRules = (next: any[]) => updateGeminiSetting('keyResetRules', next);
                return (
                  <div className="space-y-3">
                    {rules.length === 0 && (
                      <p className="text-zinc-[#555] text-[11px] font-mono">No reset rules configured.</p>
                    )}
                    {rules.map((rule: any, idx: number) => (
                      <div key={idx} className="bg-[#07070a]/60 border border-white/5 p-4 rounded-xl flex flex-wrap items-center gap-3">
                        <input
                          type="text"
                          value={rule.provider || ''}
                          placeholder="provider"
                          onChange={(e) => {
                            const copy = [...rules];
                            copy[idx] = { ...copy[idx], provider: e.target.value };
                            updateRules(copy);
                          }}
                          className="w-28 bg-[#0e0e14]/60 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white font-mono focus:outline-none focus:border-cyan-500/40"
                        />
                        <select
                          value={rule.type || 'daily-utc'}
                          onChange={(e) => {
                            const copy = [...rules];
                            copy[idx] = { ...copy[idx], type: e.target.value };
                            updateRules(copy);
                          }}
                          className="bg-[#0e0e14]/60 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white font-mono focus:outline-none focus:border-cyan-500/40"
                        >
                          <option value="daily-utc">daily-utc</option>
                          <option value="interval">interval</option>
                        </select>
                        {rule.type === 'daily-utc' ? (
                          <label className="flex items-center gap-2 text-[11px] text-white/80 font-mono">
                            at UTC hour
                            <input
                              type="number"
                              min={0}
                              max={23}
                              value={Number(rule.atHour ?? 0)}
                              onChange={(e) => {
                                const copy = [...rules];
                                copy[idx] = { ...copy[idx], atHour: Math.max(0, Math.min(23, Number(e.target.value) || 0)) };
                                updateRules(copy);
                              }}
                              className="w-16 bg-[#0e0e14]/60 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white font-mono focus:outline-none focus:border-cyan-500/40"
                            />
                          </label>
                        ) : (
                          <label className="flex items-center gap-2 text-[11px] text-white/80 font-mono">
                            every (ms)
                            <input
                              type="number"
                              min={60000}
                              value={Number(rule.everyMs ?? 86400000)}
                              onChange={(e) => {
                                const copy = [...rules];
                                copy[idx] = { ...copy[idx], everyMs: Math.max(60000, Number(e.target.value) || 86400000) };
                                updateRules(copy);
                              }}
                              className="w-32 bg-[#0e0e14]/60 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white font-mono focus:outline-none focus:border-cyan-500/40"
                            />
                          </label>
                        )}
                        <button
                          type="button"
                          onClick={() => updateRules(rules.filter((_, i) => i !== idx))}
                          className="ml-auto p-1 text-red-400/70 hover:text-red-400 bg-white/5 hover:bg-red-500/10 rounded cursor-pointer"
                          title="Remove rule"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => updateRules([...rules, { provider: settings.provider || 'gemini', type: 'daily-utc', atHour: 0 }])}
                      className="px-4 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 text-[10px] uppercase tracking-wider font-mono font-bold rounded-xl border border-cyan-500/20 transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <Plus size={12} /> Add Reset Rule
                    </button>
                  </div>
                );
              })()}
            </div>

            {/* Dynamic AI Resilience Pipeline Fallback Setup */}
            <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl space-y-6">
              <div>
                <h4 className="text-sm font-bold text-white tracking-wide font-sans flex items-center gap-2">
                  <Layers size={16} className="text-cyan-400" />
                  Dynamic AI Resilience Pipeline (Multi-Provider Fallback Setup)
                </h4>
                <p className="text-[10px] text-zinc-400 font-mono mt-1 leading-relaxed uppercase">
                  Add multiple dynamic fallback settings across any configured provider (Add Mode). If the primary provider, model, or API Key fails or hits rate-limit (429), Yuihime cascades sequentially through the fallback steps listed below.
                </p>
              </div>

              <div className="space-y-4">
                {!(settings.gemini?.fallbackChain && settings.gemini.fallbackChain.length > 0) ? (
                  <div className="border border-dashed border-white/5 bg-[#0e0e14]/25 p-6 rounded-xl text-center space-y-3">
                    <p className="text-zinc-[#555] text-[11px] font-mono">No custom fallback settings configured.</p>
                    <button
                      type="button"
                      onClick={addFallbackRow}
                      className="px-4 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 text-[10px] uppercase tracking-wider font-mono font-bold rounded-xl border border-cyan-500/20 transition-all cursor-pointer flex items-center gap-1.5 mx-auto"
                    >
                      <Plus size={12} /> Add Fallback Step
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(settings.gemini.fallbackChain || []).map((row: any, idx: number) => {
                      const currentModels = rowModelsMap[row.id] || [];
                      const isFetchingRow = fetchingRowKey[row.id];
                      return (
                        <div key={row.id} className="bg-[#07070a]/60 border border-white/5 p-4 rounded-xl relative space-y-3 group hover:border-zinc-800 transition-all">
                          
                          {/* Row Control Header */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] bg-cyan-950 text-cyan-400 px-2.5 py-0.5 rounded-full font-mono uppercase font-bold">
                                Step #{idx + 1}
                              </span>
                              <span className="text-[9px] text-[#fbbf24] font-mono uppercase tracking-[0.15em] font-bold">
                                Fallback Configuration
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => moveFallbackRowUp(idx)}
                                disabled={idx === 0}
                                className="p-1 text-white/40 hover:text-white bg-white/5 hover:bg-white/10 rounded disabled:opacity-30 cursor-pointer"
                                title="Move Up"
                              >
                                <ChevronUp size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveFallbackRowDown(idx)}
                                disabled={idx === (settings.gemini.fallbackChain.length - 1)}
                                className="p-1 text-white/40 hover:text-white bg-white/5 hover:bg-white/10 rounded disabled:opacity-30 cursor-pointer"
                                title="Move Down"
                              >
                                <ChevronDown size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteFallbackRow(row.id)}
                                className="p-1 text-red-400/60 hover:text-red-400 bg-red-950/10 hover:bg-red-950/20 rounded ml-1.5 cursor-pointer"
                                title="Delete"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>

                          {/* Fields Grid */}
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            {/* Provider Field */}
                            <div>
                              <label className="block text-[8px] uppercase tracking-[0.15em] font-mono text-white/40 mb-1">
                                Provider
                              </label>
                              <SearchableSelect
                                value={row.provider || 'gemini'}
                                onChange={prov => {
                                  editFallbackRow(row.id, 'provider', prov);
                                  fetchModelsForChainRow(row.id, prov, row.apiKey || settings[prov]?.apiKey || '', row.baseUrl || settings[prov]?.baseUrl || '');
                                }}
                                options={[
                                  { value: 'gemini', label: 'Google Gemini' },
                                  { value: 'openai', label: 'OpenAI / compatible' },
                                  { value: 'anthropic', label: 'Anthropic Claude' },
                                  { value: 'openrouter', label: 'OpenRouter AI' },
                                  { value: 'deepseek', label: 'DeepSeek AI' },
                                  { value: 'groq', label: 'Groq Engine' },
                                  { value: 'ollama', label: 'Local Ollama' },
                                  { value: 'custom', label: 'Custom Provider' },
                                  ...(providers || [])
                                    .filter((p: any) => !['gemini', 'openai', 'anthropic', 'openrouter', 'deepseek', 'groq', 'ollama', 'custom'].includes(p.metadata.id))
                                    .map((p: any) => ({
                                      value: p.metadata.id,
                                      label: p.metadata.name
                                    }))
                                ]}
                                placeholder="Select provider..."
                                className="bg-[#111115] border-white/5 text-xs focus:border-cyan-500/55"
                              />
                            </div>

                            {/* Model Field */}
                            <div>
                              <div className="flex justify-between items-center mb-1">
                                <label className="text-[8px] uppercase tracking-[0.15em] font-mono text-white/40">
                                  Model
                                </label>
                                <button
                                  type="button"
                                  onClick={() => fetchModelsForChainRow(row.id, row.provider || 'gemini', row.apiKey || settings[row.provider || 'gemini']?.apiKey || '', row.baseUrl || settings[row.provider || 'gemini']?.baseUrl || '')}
                                  className="text-[8px] font-mono text-cyan-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                                  title="Refresh model list"
                                >
                                  <RefreshCw size={8} className={isFetchingRow ? 'animate-spin' : ''} />
                                  {isFetchingRow ? 'Loading...' : 'Fetch'}
                                </button>
                              </div>
                              <div className="flex gap-1.5 flex-col">
                                <SearchableSelect
                                  value={row.model || ''}
                                  onChange={val => editFallbackRow(row.id, 'model', val)}
                                  options={
                                    currentModels.length > 0 
                                      ? currentModels.map((m: any) => ({
                                          value: m.value,
                                          label: m.label
                                        }))
                                      : [
                                          { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
                                          { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
                                          { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite' },
                                          { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
                                          { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
                                          { value: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku' }
                                        ]
                                  }
                                  placeholder="Select fallback model..."
                                  className="bg-[#111115] border-white/5 text-xs focus:border-cyan-500/55"
                                />
                                {/* Custom Model input fallback */}
                                <input
                                  type="text"
                                  value={row.model || ''}
                                  placeholder="Or type model name manually..."
                                  onChange={e => editFallbackRow(row.id, 'model', e.target.value)}
                                  className="w-full bg-[#111115] border border-white/5 rounded-xl px-2.5 py-1 text-[10px] font-mono text-zinc-300 outline-none"
                                />
                              </div>
                            </div>

                            {/* Base URL Override */}
                            <div>
                              <label className="block text-[8px] uppercase tracking-[0.15em] font-mono text-white/40 mb-1">
                                Base URL Override
                              </label>
                              <input
                                type="text"
                                value={row.baseUrl || ''}
                                onChange={e => editFallbackRow(row.id, 'baseUrl', e.target.value)}
                                onBlur={e => fetchModelsForChainRow(row.id, row.provider || 'gemini', row.apiKey || settings[row.provider || 'gemini']?.apiKey || '', e.target.value)}
                                placeholder="e.g., https://api.deepseek.com/v1"
                                className="w-full bg-[#111115] border border-white/5 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none focus:border-cyan-500/55 font-mono"
                              />
                            </div>

                            {/* API Key Override */}
                            <div>
                              <label className="block text-[8px] uppercase tracking-[0.15em] font-mono text-white/40 mb-1">
                                API Key Override
                              </label>
                              <input
                                type="password"
                                value={row.apiKey || ''}
                                onChange={e => editFallbackRow(row.id, 'apiKey', e.target.value)}
                                onBlur={e => fetchModelsForChainRow(row.id, row.provider || 'gemini', e.target.value || settings[row.provider || 'gemini']?.apiKey || '', row.baseUrl || settings[row.provider || 'gemini']?.baseUrl || '')}
                                placeholder="Use main provider key..."
                                className="w-full bg-[#111115] border border-white/5 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none focus:border-cyan-500/55 font-mono"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={addFallbackRow}
                      className="w-full py-2.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 rounded-xl text-[10px] uppercase tracking-wider font-mono text-cyan-400 font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 mt-2"
                    >
                      <Plus size={14} /> Add Fallback Layer
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      }
      case 'speech': {
        const ttsModules = modules[ModuleType.TTS] || [];
        return (
          <div className="space-y-6">
            {/* Top Navigation Row */}
            <div className="flex gap-2 pb-1 border-b border-white/5">
              <button
                type="button"
                onClick={() => setSpeechActiveTab('setup')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold tracking-wide capitalize transition-all cursor-pointer ${
                  speechActiveTab === 'setup'
                    ? 'bg-[#c5a880]/15 border border-amber-500/20 text-amber-500'
                    : 'bg-white/5 border border-white/5 text-zinc-400 hover:bg-white/10 hover:text-white'
                }`}
              >
                Engine Setup
              </button>
              <button
                type="button"
                onClick={() => setSpeechActiveTab('calibration')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold tracking-wide capitalize transition-all cursor-pointer flex items-center gap-1.5 ${
                  speechActiveTab === 'calibration'
                    ? 'bg-[#c5a880]/15 border border-amber-500/20 text-amber-500'
                    : 'bg-white/5 border border-white/5 text-zinc-400 hover:bg-white/10 hover:text-white font-normal'
                }`}
              >
                <Sparkles size={12} className="text-amber-500" />
                Voice Calibration
              </button>
            </div>

            {speechActiveTab === 'setup' ? (
              <>
                <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl">
                  <h4 className="text-[10px] uppercase font-mono tracking-widest text-[#fbbf24] mb-4">Voice Synthesis Engines (TTS)</h4>
                  <div className="space-y-3">
                    {ttsModules.map((p: any) => (
                      <div key={p.metadata.id} className="border border-white/5 bg-[#07070a]/90 p-4 rounded-xl flex items-center justify-between">
                        <div>
                          <h5 className="text-xs font-bold text-white">{p.metadata.name}</h5>
                          <p className="text-[10px] text-white/35 mt-0.5">{p.metadata.description}</p>
                        </div>
                        <button 
                          type="button"
                          onClick={() => setSettings((prev: any) => ({ ...prev, ttsProvider: p.metadata.id }))}
                          className={`px-3 py-1 bg-white/5 hover:bg-white/10 uppercase font-mono text-[9px] border border-white/5 rounded-lg transition-colors cursor-pointer ${settings.ttsProvider === p.metadata.id ? 'text-amber-500 font-bold border-amber-500/20' : 'text-white/40'}`}
                        >
                          {settings.ttsProvider === p.metadata.id ? 'ACTIVE' : 'SELECT'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-4">
                  {ttsModules.map((c: any) => (
                    settings.ttsProvider === c.metadata.id && (
                      <div key={c.metadata.id} className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl">
                        <h4 className="text-[10px] uppercase font-mono tracking-widest text-white/40 mb-4">{c.metadata.name} Settings</h4>
                        {renderFields(c)}
                      </div>
                    )
                  ))}
                </div>
              </>
            ) : (
              <VoiceCalibration
                settings={settings}
                setSettings={setSettings}
                modules={modules}
              />
            )}
          </div>
        );
      }
      case 'hearing': {
        const updateHearing = (field: string, val: any) => {
          setSettings((prev: any) => ({
            ...prev,
            hearing: { ...(prev.hearing || {}), [field]: val }
          }));
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
          <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl">
            <h4 className="text-[10px] uppercase font-mono tracking-widest text-white/40 mb-4">Auditory Capture & STT Thresholds</h4>
            {renderFields(hearingModule, hearingConfig, updateHearing)}
          </div>
        );
      }
      case 'vision': {
        const updateVision = (field: string, val: any) => {
          setSettings((prev: any) => ({
            ...prev,
            vision: { ...(prev.vision || {}), [field]: val }
          }));
        };
        const visionConfig = settings.vision || { enabled: false, interval: 3000, modelType: 'gemini-3.5-flash' };
        const visionModule = allRegModules.find(m => m.metadata.id === 'vision') || {
          metadata: { id: 'vision' },
          configSchema: {
            fields: {
              enabled: { label: 'Avatar Virtual Sight (Frame Analysis)', type: 'boolean', default: false },
              interval: { label: 'Snapshot Frequency Rate (ms)', type: 'slider', min: 1000, max: 15000, step: 500, default: 3000 },
              modelType: {
                label: 'Vision Backbone Node',
                type: 'select',
                default: 'gemini-3.5-flash',
                options: [
                  { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
                  { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
                  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
                  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
                  { value: 'gpt-4o', label: 'GPT-4o' }
                ]
              }
            }
          }
        };
        return (
          <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl">
            <h4 className="text-[10px] uppercase font-mono tracking-widest text-white/40 mb-4">Optical Intelligence Calibration</h4>
            {renderFields(visionModule, visionConfig, updateVision)}
          </div>
        );
      }
      case 'artistry': {
        const updateArtistry = (field: string, val: any) => {
          setSettings((prev: any) => ({
            ...prev,
            artistry: { ...(prev.artistry || {}), [field]: val }
          }));
        };
        const artConfig = settings.artistry || { engine: 'imagen3', ratio: '16:9', negativePrompt: '' };
        const artistryModule = allRegModules.find(m => m.metadata.id === 'artistry') || {
          metadata: { id: 'artistry' },
          configSchema: {
            fields: {
              engine: {
                label: 'Creative Imaging Node',
                type: 'select',
                default: 'imagen3',
                options: [
                  { value: 'imagen3', label: 'Imagen 3' },
                  { value: 'flux-schnell', label: 'FLUX Schnell' },
                  { value: 'midjourney-v6', label: 'Midjourney v6 API' }
                ]
              },
              ratio: {
                label: 'Aspect Ratio Constraints',
                type: 'select',
                default: '16:9',
                options: [
                  { value: '16:9', label: '16:9 Cinematic' },
                  { value: '1:1', label: '1:1 Square Art' },
                  { value: '9:16', label: '9:16 vertical stream backdrop' }
                ]
              },
              negativePrompt: { label: 'Style Bias Restriction Filter (Negative prompt)', type: 'textarea', default: '' }
            }
          }
        };

        const handleSynthesisBackdrop = async () => {
          if (!artPrompt.trim()) return;
          setIsArtGenerating(true);
          setErrorArt('');
          try {
            const response = await fetch('/api/ai/image-generation', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prompt: artPrompt,
                ratio: artConfig.ratio,
                engine: artConfig.engine,
                negativePrompt: artConfig.negativePrompt
              })
            });

            const data = await response.json();
            if (!response.ok) {
              throw new Error(data.error || 'Failed to generate backdrop.');
            }

            setArtResult(data.url);
            localStorage.setItem('yuihime_stage_backdrop', 'custom');
            localStorage.setItem('yuihime_stage_backdrop_custom', data.url);

            // Emit dynamic change event to NeuralBackdrop
            window.dispatchEvent(new CustomEvent('yuihime_backdrop_changed', {
              detail: { type: 'custom', customImgUrl: data.url }
            }));
          } catch (e: any) {
            console.error(e);
            setErrorArt(e.message || 'Backdrop generation failed.');
          } finally {
            setIsArtGenerating(false);
          }
        };

        return (
          <div className="space-y-6">
            <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl">
              <h4 className="text-[10px] uppercase font-mono tracking-widest text-[#fbbf24] mb-4">Artistic Canvas Synthesizer Configs</h4>
              {renderFields(artistryModule, artConfig, updateArtistry)}
            </div>

            <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl space-y-4">
              <h4 className="text-[10px] uppercase font-mono tracking-widest text-indigo-400">Interactive Backdrop Generator (Imagen 3)</h4>
              <p className="text-[11px] text-zinc-400 font-sans leading-relaxed">
                Enter description to synthesize a brand-new Live background. Yuihime will immediately load it to her stage!
              </p>

              <div>
                <textarea
                  value={artPrompt}
                  onChange={(e) => setArtPrompt(e.target.value)}
                  placeholder="e.g. A gorgeous cyber-punk bedroom with neon lights, lo-fi aesthetic, starry night visible through a massive glass window, highly detailed anime style"
                  className="w-full h-24 bg-[#07070a]/95 border border-white/10 rounded-xl p-3 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50 resize-box font-sans leading-relaxed"
                />
              </div>

              {errorArt && (
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/25 rounded-xl text-rose-400 text-xs font-mono">
                  ⚠️ Error: {errorArt}
                </div>
              )}

              <div className="flex gap-4">
                <button
                  onClick={handleSynthesisBackdrop}
                  disabled={isArtGenerating || !artPrompt.trim()}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold tracking-wide transition-all ${
                    isArtGenerating || !artPrompt.trim()
                      ? 'bg-indigo-600/20 text-indigo-400/40 cursor-not-allowed border border-indigo-500/10'
                      : 'bg-[#6366f1] hover:bg-[#4f46e5] active:bg-[#4338ca] text-white border border-indigo-500/40 hover:shadow-[0_0_15px_rgba(99,102,241,0.45)] cursor-pointer'
                  }`}
                >
                  {isArtGenerating ? 'Generating Art Assets...' : 'Generate and Apply Backdrop'}
                </button>

                {artResult && (
                  <button
                    onClick={() => {
                      localStorage.setItem('yuihime_stage_backdrop', 'matrix');
                      localStorage.removeItem('yuihime_stage_backdrop_custom');
                      setArtResult(null);
                      window.dispatchEvent(new CustomEvent('yuihime_backdrop_changed', {
                        detail: { type: 'matrix', customImgUrl: '' }
                      }));
                    }}
                    className="px-4 py-2.5 bg-[#171725] hover:bg-[#1f1f31] border border-white/5 hover:border-white/10 rounded-xl text-xs font-mono text-zinc-400 transition-colors"
                  >
                    Reset to Matrix Background
                  </button>
                )}
              </div>

              {artResult && (
                <div className="border border-white/10 rounded-xl overflow-hidden p-2 bg-[#07070a]/95">
                  <div className="text-[10px] uppercase font-mono tracking-widest text-zinc-500 mb-2">Active Generated Backdrop Preview</div>
                  <img
                    src={artResult}
                    alt="Active synthesis background"
                    referrerPolicy="no-referrer"
                    className="w-full rounded-lg max-h-[220px] object-cover bg-black border border-white/5"
                  />
                </div>
              )}
            </div>
          </div>
        );
      }
      case 'short_term_memory': {
        const updateSTM = (field: string, val: any) => {
          setSettings((prev: any) => ({
            ...prev,
            stm: { ...(prev.stm || {}), [field]: val }
          }));
        };
        const stmConfig = settings.stm || { recallBufferSize: 15, autoSummarizeThreshold: 20 };
        const shortTermMemoryModule = allRegModules.find(m => m.metadata.id === 'short_term_memory') || {
          metadata: { id: 'short_term_memory' },
          configSchema: {
            fields: {
              recallBufferSize: { label: 'Short-Term Message Recency Limit', type: 'slider', min: 5, max: 100, step: 5, default: 15 },
              autoSummarizeThreshold: { label: 'Auto Summarization Queue Trigger (msg counts)', type: 'slider', min: 10, max: 150, step: 10, default: 20 }
            }
          }
        };
        return (
          <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl">
            <h4 className="text-[10px] uppercase font-mono tracking-widest text-white/40 mb-4">Episodic Recency Buffer limits</h4>
            {renderFields(shortTermMemoryModule, stmConfig, updateSTM)}
          </div>
        );
      }
      case 'long_term_memory': {
        const recallModule = modules[ModuleType.TOOL]?.find(m => m.metadata.id === 'memory-recall');
        const updateLTM = (field: string, val: any) => {
          setSettings((prev: any) => ({
            ...prev,
            ltm: { ...(prev.ltm || {}), [field]: val }
          }));
        };
        const ltmConfig = settings.ltm || { vectorDatabase: 'sqlite_vss', indexThreshold: 0.72 };
        const longTermMemoryModule = allRegModules.find(m => m.metadata.id === 'long_term_memory') || {
          metadata: { id: 'long_term_memory' },
          configSchema: {
            fields: {
              vectorDatabase: {
                label: 'Semantic DB Backbone Engine',
                type: 'select',
                default: 'sqlite_vss',
                options: [
                  { value: 'sqlite_vss', label: 'SQLite VSS (Embedded Vector Store)' },
                  { value: 'pinecone', label: 'Pinecone Cloud Node' },
                  { value: 'chromadb', label: 'Local ChromaDB container' }
                ]
              },
              indexThreshold: { label: 'Semantic Similarity Match Confidence Filter', type: 'slider', min: 0.1, max: 1.0, step: 0.01, default: 0.72 }
            }
          }
        };
        return (
          <div className="space-y-6">
            {recallModule && (
              <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl">
                <h4 className="text-[10px] uppercase font-mono tracking-widest text-[#fbbf24] mb-4">Semantic Memory Recall Module</h4>
                {renderFields(recallModule)}
              </div>
            )}
            <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl">
              <h4 className="text-[10px] uppercase font-mono tracking-widest text-white/40 mb-4">Vector Database & Knowledge Graph Configs</h4>
              {renderFields(longTermMemoryModule, ltmConfig, updateLTM)}
            </div>
          </div>
        );
      }
      case 'telegram': {
        const telegramModule = allRegModules.find(m => m.metadata.id === 'telegram_bridge');
        return (
          <div className="space-y-6">
            <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl">
              <h4 className="text-[10px] uppercase font-mono tracking-widest text-sky-400 mb-4">Telegram Neural Link Setup</h4>
              {telegramModule && renderFields(telegramModule)}
            </div>

            <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div>
                  <h4 className="text-xs font-semibold uppercase font-mono tracking-wider text-sky-400">Telegram Bot Diagnostic & Control Shield</h4>
                  <p className="text-[10px] text-white/50">Run direct network loopback tests & recreate bot instances.</p>
                </div>
                <div className="flex gap-1.5 sm:gap-2 text-[10px]">
                  <button
                    onClick={fetchTgStatus}
                    disabled={tgTesting}
                    className="px-2.5 py-1.5 font-mono font-medium rounded-lg border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 active:scale-95 transition-all text-sky-400 disabled:opacity-50"
                  >
                    {tgTesting ? "Testing..." : "Test Connection"}
                  </button>
                  <button
                    onClick={() => recreateTgBot(false)}
                    disabled={tgTesting}
                    className="px-2.5 py-1.5 font-mono font-medium rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 active:scale-95 transition-all text-red-500 disabled:opacity-50"
                  >
                    Reinitialize Bot
                  </button>
                  <button
                    onClick={() => recreateTgBot(true)}
                    disabled={tgTesting}
                    className="px-2.5 py-1.5 font-mono font-medium rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 active:scale-95 transition-all text-amber-500 disabled:opacity-50"
                    title="Flush webhook queue and clear pending Telegram notifications"
                  >
                    Flush & Reinit
                  </button>
                </div>
              </div>

              {tgStatus ? (
                <div className="space-y-3 font-mono text-[11px] leading-relaxed">
                  <div className={`p-3 rounded-lg border ${tgStatus.initialized ? 'bg-emerald-500/5 border-emerald-500/15 text-emerald-400' : 'bg-rose-500/5 border-rose-500/15 text-rose-400'}`}>
                    <p className="font-semibold text-xs mb-1">
                      {tgStatus.initialized ? "● BOT DAEMON ON-LINE" : "○ BOT DAEMON OFF-LINE / ERROR"}
                    </p>
                    <p className="text-[10px] opacity-80">{tgStatus.message}</p>
                  </div>

                  {tgStatus.botInfo && (
                    <div className="grid grid-cols-2 gap-2 p-3 bg-white/[0.02] border border-white/5 rounded-lg text-white/70">
                      <div>
                        <span className="text-white/40">Username:</span> @{tgStatus.botInfo.username}
                      </div>
                      <div>
                        <span className="text-white/40">Name:</span> {tgStatus.botInfo.first_name}
                      </div>
                      <div>
                        <span className="text-white/40">Bot ID:</span> {tgStatus.botInfo.id}
                      </div>
                      <div>
                        <span className="text-white/40">Can Join Groups:</span> {tgStatus.botInfo.can_join_groups ? 'Yes' : 'No'}
                      </div>
                    </div>
                  )}

                  {tgStatus.webhookInfo && (
                    <div className="p-3 bg-white/[0.02] border border-white/5 rounded-lg space-y-1 text-white/70">
                      <div>
                        <span className="text-white/40">Webhook Connection URL:</span>
                        <div className="mt-1 p-1.5 bg-[#050508] border border-white/5 rounded text-[10px] select-all truncate text-sky-300">
                          {tgStatus.webhookInfo.url || "None (Long polling active)"}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-1 pt-1.5 text-[10px]">
                        <div>
                          <span className="text-white/40">Pending Updates:</span> {tgStatus.webhookInfo.pending_update_count}
                        </div>
                        <div>
                          <span className="text-white/40">Max Connections:</span> {tgStatus.webhookInfo.max_connections || 'N/A'}
                        </div>
                      </div>
                    </div>
                  )}

                  {tgStatus.error && (
                    <div className="p-3 bg-rose-500/5 border border-rose-500/10 text-rose-400 text-[10px] rounded-lg">
                      <span className="font-semibold block mb-1">Raw Connection Exception:</span>
                      <pre className="whitespace-pre-wrap leading-tight">{tgStatus.error}</pre>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-6 text-white/30 text-xs font-mono">
                  No diagnostic data. Click "Test Connection" to fetch live status.
                </div>
              )}
            </div>
          </div>
        );
      }
      case 'discord': {
        const discordModule = allRegModules.find(m => m.metadata.id === 'discord_bridge');
        return (
          <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl">
            <h4 className="text-[10px] uppercase font-mono tracking-widest text-blue-400 mb-4">Discord Sync Conduit Setup</h4>
            {discordModule && renderFields(discordModule)}
          </div>
        );
      }
      case 'twitter': {
        const twitterModule = allRegModules.find(m => m.metadata.id === 'twitter_bridge');
        return (
          <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl">
            <h4 className="text-[10px] uppercase font-mono tracking-widest text-[#38bdf8] mb-4">X (Twitter) Autonomous Conduits</h4>
            {twitterModule && renderFields(twitterModule)}
          </div>
        );
      }
      case 'mcp_servers': {
        const mcpModule = allRegModules.find(m => m.metadata.id === 'mcp_servers');
        return (
          <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl">
            <h4 className="text-[10px] uppercase font-mono tracking-widest text-[#a78bfa] mb-4">Model Context Protocol Connections</h4>
            {mcpModule && renderFields(mcpModule)}
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
        const toolExecutorConfig = settings['tool-executor'] || {
          timeoutMs: 60000,
          shellTimeoutMs: 120000,
          retryLimit: 2,
          enableManualCheck: true
        };
        return (
          <div className="space-y-6">
            {toolExecutorModule && (
              <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl">
                <h4 className="text-[10px] uppercase font-mono tracking-widest text-[#10b981] mb-2">Limits & Retries Policy</h4>
                <p className="text-[11px] text-zinc-400 mb-6 font-sans leading-relaxed">
                  Configure tool execution timeouts, command safety barriers, and auto-retry tolerances for deep cognitive cycles.
                </p>
                <div className="space-y-4">
                  {renderFields(toolExecutorModule, toolExecutorConfig, updateToolExecutor)}
                </div>
              </div>
            )}

            <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl">
              <h4 className="text-[10px] uppercase font-mono tracking-widest text-amber-500 mb-2">Autonomous Action & Command Toolchain</h4>
              <p className="text-[11px] text-zinc-400 mb-6 font-sans leading-relaxed">
                Operating tools for YUIAGI. Grant clean permission to query files, monitor terminal outputs, and execute Linux commands otonomously.
              </p>
              
              <div className="space-y-5">
                {toolsList.length > 0 ? (
                  toolsList.map((t: any) => (
                    <div key={t.metadata.id} className="border border-white/5 bg-[#07070a]/90 p-5 rounded-2xl relative overflow-hidden group">
                      <div className="flex items-center justify-between border-b border-white/[0.04] pb-3 mb-3">
                        <div>
                          <h5 className="text-[13px] font-bold text-white tracking-wide flex items-center gap-2">
                            {t.metadata.name}
                            <span className="text-[9px] font-mono text-white/30 font-medium">({t.metadata.id})</span>
                          </h5>
                          <p className="text-[11px] text-zinc-400 mt-0.5">{t.metadata.description}</p>
                        </div>
                        <span className="px-2.5 py-1 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg text-[8px] font-mono font-bold uppercase tracking-wider">SYSTEM TOOL</span>
                      </div>
                      
                      {t.metadata.configSchema ? (
                        <div className="space-y-4 pt-1">
                          {renderFields(t)}
                        </div>
                      ) : (
                        <div className="p-3 bg-white/[0.02] rounded-xl border border-white/[0.03] text-[10px] text-zinc-500 font-mono">
                          ⚡ Autonomous engine-bound tool - Needs no manual configuration variables (Internal Linux Binding active).
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 border border-dashed border-white/5 rounded-2xl font-mono text-[10px] text-zinc-500">
                    No action tools registered in the Core system registry.
                  </div>
                )}
              </div>
            </div>

            {/* Custom Tools Registry & Dynamic Schema Builder */}
            <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-white/[0.04] pb-4">
                <div className="text-left">
                  <h4 className="text-[10px] uppercase font-mono tracking-widest text-amber-500 mb-1 flex items-center gap-2">
                    <Sparkles size={11} className="text-amber-400" />
                    Custom Tools Registry & Schema Builder
                  </h4>
                  <p className="text-[11px] text-zinc-400 font-sans leading-relaxed">
                    Generate new OpenAPI-compliant function definitions on-the-fly. Define input schemas, write dynamic sandbox execution scripts, and save directly to the agent registry.
                  </p>
                </div>
                {!showCustomToolForm && (
                  <button
                    type="button"
                    onClick={() => setShowCustomToolForm(true)}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-black text-[10px] font-mono tracking-wider uppercase font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
                  >
                    <Plus size={12} strokeWidth={2.5} /> Generate Tool
                  </button>
                )}
              </div>

              {customToolError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-mono rounded-xl text-left">
                  ⚠️ Error: {customToolError}
                </div>
              )}

              {/* Dynamic Builder Form */}
              {showCustomToolForm && (
                <div className="border border-amber-500/20 bg-[#07070a]/90 p-5 rounded-2xl space-y-5 animate-fade-in relative text-left">
                  <div className="flex justify-between items-center border-b border-white/[0.04] pb-3">
                    <h5 className="text-xs font-bold text-amber-400 font-mono tracking-wide">
                      ⚡ On-the-Fly Schema Generator
                    </h5>
                    <button
                      type="button"
                      onClick={() => setShowCustomToolForm(false)}
                      className="text-[10px] text-zinc-500 hover:text-white font-mono cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5 text-left">
                      <label className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider font-mono">Tool ID (lowercase, underscore)</label>
                      <input
                        type="text"
                        placeholder="e.g. scrape_web"
                        value={newToolId}
                        onChange={(e) => setNewToolId(e.target.value)}
                        className="w-full bg-black/40 border border-white/5 hover:border-white/10 focus:border-amber-500/40 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-700 outline-none font-mono"
                      />
                    </div>
                    <div className="space-y-1.5 text-left">
                      <label className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider font-mono">Display Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Scrape Web Content"
                        value={newToolName}
                        onChange={(e) => setNewToolName(e.target.value)}
                        className="w-full bg-black/40 border border-white/5 hover:border-white/10 focus:border-amber-500/40 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-700 outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 text-left">
                    <label className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider font-mono">Description (for the AI Brain to know when to call it)</label>
                    <textarea
                      placeholder="e.g. Scrapes markdown text from a specific URL address for web reading."
                      value={newToolDesc}
                      onChange={(e) => setNewToolDesc(e.target.value)}
                      rows={2}
                      className="w-full bg-black/40 border border-white/5 hover:border-white/10 focus:border-amber-500/40 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-700 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5 text-left md:col-span-1">
                      <label className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider font-mono">Execution Action</label>
                      <select
                        value={newToolActionType}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewToolActionType(val);
                          if (val === 'code') {
                            setNewToolActionCode('// JS Sandbox code (access args, return object)\nconst { targetUrl } = args;\nreturn { status: "success", targetUrl };');
                          } else if (val === 'shell') {
                            setNewToolActionCode('echo "Running build command for {{project_name}}..."');
                          } else if (val === 'webhook') {
                            setNewToolActionCode('https://api.example.com/hooks/notify?channel={{channel_id}}');
                          }
                        }}
                        className="w-full bg-black/40 border border-white/5 hover:border-white/10 focus:border-amber-500/40 rounded-xl px-3 py-2 text-xs text-white outline-none cursor-pointer font-mono"
                      >
                        <option value="code">JavaScript Sandbox</option>
                        <option value="shell">Shell/Bash Script</option>
                        <option value="webhook">Webhook Trigger</option>
                      </select>
                    </div>

                    <div className="space-y-1.5 text-left md:col-span-2">
                      <label className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider font-mono">
                        {newToolActionType === 'code' ? 'JavaScript Sandbox Body' : newToolActionType === 'shell' ? 'Bash Command Template' : 'Webhook Endpoint URL'}
                      </label>
                      <textarea
                        value={newToolActionCode}
                        onChange={(e) => setNewToolActionCode(e.target.value)}
                        rows={4}
                        className="w-full bg-[#050508] border border-white/5 hover:border-white/10 focus:border-amber-500/40 rounded-xl px-3 py-2 text-xs text-amber-200 outline-none font-mono"
                      />
                    </div>
                  </div>

                  {/* Parameter Builder */}
                  <div className="space-y-3 pt-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider font-mono">Input Parameter Fields (JSON Schema)</span>
                      <button
                        type="button"
                        onClick={addParamField}
                        className="text-[9px] text-amber-400 font-mono hover:text-white flex items-center gap-1 cursor-pointer"
                      >
                        <Plus size={10} /> Add Parameter
                      </button>
                    </div>

                    {newToolParams.length === 0 ? (
                      <div className="p-3 bg-white/[0.01] border border-dashed border-white/5 rounded-xl text-center text-[10px] text-zinc-600 font-mono select-none">
                        No parameters defined. Tool will have no inputs.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                        {newToolParams.map((param, idx) => (
                          <div key={idx} className="bg-black/30 p-3 rounded-xl border border-white/5 flex flex-wrap md:flex-nowrap items-center gap-2 text-xs">
                            <input
                              type="text"
                              placeholder="Key Name"
                              value={param.name}
                              onChange={(e) => updateParamField(idx, 'name', e.target.value)}
                              className="bg-[#050508] border border-white/5 rounded-lg px-2.5 py-1 w-full md:w-[120px] text-white placeholder-zinc-700 font-mono"
                            />
                            <select
                              value={param.type}
                              onChange={(e) => updateParamField(idx, 'type', e.target.value)}
                              className="bg-[#050508] border border-white/5 rounded-lg px-2.5 py-1 text-white outline-none font-mono"
                            >
                              <option value="string">string</option>
                              <option value="number">number</option>
                              <option value="boolean">boolean</option>
                            </select>
                            <label className="flex items-center gap-1.5 shrink-0 select-none cursor-pointer">
                              <input
                                type="checkbox"
                                checked={param.required}
                                onChange={(e) => updateParamField(idx, 'required', e.target.checked)}
                                className="accent-amber-500"
                              />
                              <span className="text-[10px] text-zinc-500 font-mono">Required</span>
                            </label>
                            <input
                              type="text"
                              placeholder="Parameter description..."
                              value={param.description}
                              onChange={(e) => updateParamField(idx, 'description', e.target.value)}
                              className="bg-[#050508] border border-white/5 rounded-lg px-2.5 py-1 flex-1 text-zinc-300 placeholder-zinc-700 min-w-[150px]"
                            />
                            <button
                              type="button"
                              onClick={() => removeParamField(idx)}
                              className="p-1 hover:bg-white/5 text-rose-500 rounded cursor-pointer shrink-0"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.04]">
                    <button
                      type="button"
                      onClick={() => setShowCustomToolForm(false)}
                      className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-mono uppercase rounded-xl transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveCustomTool}
                      className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-black text-[10px] font-mono uppercase font-bold rounded-xl transition-all cursor-pointer"
                    >
                      Register Tool Schema
                    </button>
                  </div>
                </div>
              )}

              {/* Custom Tools List */}
              <div className="space-y-4">
                <span className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider font-mono block text-left">Registered Custom Tools ({customTools.length})</span>
                
                {customToolsLoading ? (
                  <div className="text-center py-8 font-mono text-[10px] text-zinc-500">
                    Syncing custom tools from registry...
                  </div>
                ) : customTools.length === 0 ? (
                  <div className="text-center py-10 border border-dashed border-white/5 rounded-2xl font-mono text-[10px] text-zinc-500 select-none">
                    No custom tools saved in registry. Click "Generate Tool" to create your first on-the-fly definition.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {customTools.map((t: any) => (
                      <div key={t.id} className="border border-amber-500/10 bg-[#07070a]/90 p-5 rounded-2xl relative overflow-hidden group text-left">
                        <div className="flex items-center justify-between border-b border-white/[0.04] pb-3 mb-3">
                          <div>
                            <h5 className="text-[13px] font-bold text-amber-400 tracking-wide flex items-center gap-2">
                              {t.name}
                              <span className="text-[9px] font-mono text-white/30 font-medium">({t.id})</span>
                            </h5>
                            <p className="text-[11px] text-zinc-400 mt-0.5">{t.description}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg text-[8px] font-mono font-bold uppercase tracking-wider">
                              {t.actionType === 'code' ? 'JS Sandbox' : t.actionType === 'shell' ? 'Shell Script' : 'Webhook API'}
                            </span>
                            <button
                              type="button"
                              onClick={() => deleteCustomTool(t.id)}
                              className="p-1 hover:bg-red-500/10 text-red-400 rounded transition-colors cursor-pointer"
                              title="Delete Custom Tool"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        {/* Parameter Schema Display */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[10px] text-zinc-500 font-mono mt-3">
                          <div className="space-y-1">
                            <span className="text-[9.5px] uppercase font-bold text-zinc-400">Tool Parameters Schema:</span>
                            <pre className="bg-[#050508]/60 p-2.5 rounded-xl border border-white/5 text-[9px] text-cyan-400 overflow-x-auto max-h-[120px] scrollbar-thin">
                              {JSON.stringify(t.parameters, null, 2)}
                            </pre>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[9.5px] uppercase font-bold text-zinc-400">Execution Script / Code:</span>
                            <pre className="bg-[#050508]/60 p-2.5 rounded-xl border border-white/5 text-[9px] text-amber-200 overflow-x-auto max-h-[120px] scrollbar-thin whitespace-pre-wrap break-all">
                              {t.actionCode}
                            </pre>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      }
      case 'agi_mind': {
        const agiModule = allRegModules.find(m => m.metadata.id === 'yui-agi');
        const mirrorModule = allRegModules.find(m => m.metadata.id === 'self-awareness-mirror');
        const continuousModule = allRegModules.find(m => m.metadata.id === 'continuous-learning-memory');
        const cortices = modules[ModuleType.CORTEX] || [];
        const updateAgi = (field: string, val: any) => {
          updateSetting('yui-agi', field, val);
        };
        const updateMirror = (field: string, val: any) => {
          updateSetting('self-awareness-mirror', field, val);
        };
        const updateContinuous = (field: string, val: any) => {
          updateSetting('continuous-learning-memory', field, val);
        };

        const agiConfig = settings['yui-agi'] || {};
        const mirrorConfig = settings['self-awareness-mirror'] || {};
        const continuousConfig = settings['continuous-learning-memory'] || {};

        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Quick Status Info Card of YUIAGI */}
              <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/15 p-6 rounded-2xl space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-amber-500/10 rounded-xl text-amber-500 border border-amber-500/20">
                    <Brain className="animate-pulse" size={24} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white font-sans">Primary AGI Cognitive Circuit</h3>
                    <p className="text-[10px] text-zinc-400 font-mono">YUIAGI & MHCP-v1 OFFLINE</p>
                  </div>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                  Modular generalist intelligence system powered by neurotransmitter homeostasis, computational suffering evaluation, and anti-catastrophic-forgetting (EWC) protection.
                </p>
              </div>

              {/* Advanced Reasoning Info Card */}
              <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl space-y-4">
                <div className="flex items-center gap-2 text-cyan-400">
                  <Sparkles size={18} />
                  <h4 className="text-xs font-mono uppercase tracking-wider font-bold">Autonomous Learning Focus</h4>
                </div>
                <div className="space-y-2 text-xs text-zinc-400 font-sans leading-relaxed">
                  <p>• <strong>Situational Adaptation:</strong> Q-learning updates core behavioral strategies based on conversational emotional vibes.</p>
                  <p>• <strong>Contextual Metacognition:</strong> Self-awareness mirror evaluates inner authenticity before dispatching messages.</p>
                  <p>• <strong>High Reasoning:</strong> Optimizes MHCP-v1 therapeutic templates and Aether Deep cognitive processing.</p>
                </div>
              </div>
            </div>

            {/* BACKGROUND COGNITIVE CONTROLLERS */}
            <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl space-y-4">
              <div className="flex items-center gap-2 text-amber-400">
                <Radio size={18} className="animate-pulse" />
                <h4 className="text-xs font-mono uppercase tracking-wider font-bold">BACKGROUND COGNITION CONTROLLERS</h4>
              </div>
              <p className="text-[10px] text-zinc-400 font-mono uppercase leading-relaxed">
                Manage cognitive processes, background learning, and autonomous mental loops operating outside active chat windows.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {/* 1. Autonomous Thought Pulse */}
                <div className="bg-[#07070a]/60 border border-white/5 p-4 rounded-xl flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-bold text-white font-sans">Autonomous Thought Pulse</h5>
                      <span className={`text-[8px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${pulseEnabled ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                        {pulseEnabled ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-400 mt-1.5 leading-relaxed font-sans">
                      Cognitive cycle that triggers Yuihime to think independently, reflect on emotional states, and consolidate background memories (requires background LLM Provider allocation).
                    </p>
                  </div>
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => setPulseEnabled && setPulseEnabled(!pulseEnabled)}
                      className={`px-4 py-1.5 rounded-xl font-mono text-[9px] uppercase font-bold tracking-wider cursor-pointer border transition-all ${
                        pulseEnabled 
                          ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/25' 
                          : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/25'
                      }`}
                    >
                      {pulseEnabled ? 'DEACTIVATE PULSE' : 'ACTIVATE PULSE'}
                    </button>
                  </div>
                </div>

                {/* 2. Subconscious Offline Synapse Training */}
                <div className="bg-[#07070a]/60 border border-white/5 p-4 rounded-xl flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-bold text-white font-sans">Offline Background Training</h5>
                      <span className={`text-[8px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${(agiConfig.enableOfflineTraining !== false) ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                        {(agiConfig.enableOfflineTraining !== false) ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-400 mt-1.5 leading-relaxed font-sans">
                      Enables background memory consolidations (simulated neural backprop) to crystallize and mature adaptive communication patterns.
                    </p>
                  </div>
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => updateAgi('enableOfflineTraining', agiConfig.enableOfflineTraining === false)}
                      className={`px-4 py-1.5 rounded-xl font-mono text-[9px] uppercase font-bold tracking-wider cursor-pointer border transition-all ${
                        (agiConfig.enableOfflineTraining !== false)
                          ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/25' 
                          : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/25'
                      }`}
                    >
                      {(agiConfig.enableOfflineTraining !== false) ? 'DEACTIVATE TRAINING' : 'ACTIVATE TRAINING'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* AGI CORE SETTINGS */}
            {agiModule && (
              <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl">
                <h4 className="text-[10px] uppercase font-mono tracking-widest text-[#fbbf24] mb-4 flex items-center gap-2">
                  <Brain size={14} className="text-amber-400" /> PRIMARY HOMEOSTASIS CIRCUIT (YUI-AGI)
                </h4>
                {renderFields(agiModule, agiConfig, updateAgi)}
              </div>
            )}

            {/* MIRROR SETTINGS */}
            {mirrorModule && (
              <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl">
                <h4 className="text-[10px] uppercase font-mono tracking-widest text-[#22d3ee] mb-4 flex items-center gap-2">
                  <Eye size={14} className="text-cyan-400" /> SELF-AWARENESS EVALUATION MIRROR
                </h4>
                {renderFields(mirrorModule, mirrorConfig, updateMirror)}
              </div>
            )}

             {/* EWC CONTINUOUS LEARNING SETTINGS */}
             {continuousModule && (
               <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl">
                 <h4 className="text-[10px] uppercase font-mono tracking-widest text-emerald-400 mb-4 flex items-center gap-2">
                   <Layers size={14} className="text-emerald-500" /> PREVENT CATASTROPHIC FORGETTING (EWC)
                 </h4>
                 {renderFields(continuousModule, continuousConfig, updateContinuous)}
               </div>
             )}

             {/* OPTION A: CUSTOM REGEX SENTIMENT & MOOD MATRIX AUGMENTER */}
             <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl space-y-6">
               <div className="flex items-center justify-between">
                 <div className="flex items-center gap-2">
                   <Cpu size={16} className="text-amber-400 animate-pulse" />
                   <h4 className="text-[10px] uppercase font-mono tracking-widest text-[#fbbf24]">Custom Sentiment Regex & Mood Matrix</h4>
                 </div>
                 <button
                   type="button"
                   onClick={() => {
                     const newRule = {
                       id: 'rule_' + Math.random().toString(36).substr(2, 9),
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
                   className="flex items-center gap-1 px-3 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-xl text-[10px] font-mono uppercase tracking-wider transition-all border border-amber-500/25 cursor-pointer"
                 >
                   <Plus size={12} /> Add New Rule
                 </button>
               </div>

               <div className="text-[10px] text-zinc-400 leading-relaxed font-sans">
                 Configure regex patterns to map user input directly to Yuihime emotional fluctuations. Toggle priority to bypass default sentiment classifiers entirely.
               </div>

               {/* Suffix Saringan Batin */}
               <div className="border-t border-white/5 pt-4 space-y-2">
                 <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                   Thought Suffix Controller
                 </label>
                 <input
                   type="text"
                   className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500 transition-all font-mono"
                   placeholder="e.g. (Sentiment Calibrated)"
                   value={settings.thoughtProcessSuffix || ''}
                   onChange={(e) => {
                     setSettings((prev: any) => ({
                       ...prev,
                       thoughtProcessSuffix: e.target.value
                     }));
                   }}
                 />
                 <div className="text-[9px] text-zinc-500">
                   This text is appended to the end of Yuihime's inner thought process string.
                 </div>
               </div>

               {/* List Rules */}
               <div className="space-y-4 pt-2">
                 {(Array.isArray(settings.emotionRegexRules) ? settings.emotionRegexRules : []).map((rule: any) => (
                   <div key={rule.id} className="p-4 bg-white/[0.02] border border-white/5 rounded-xl space-y-3 relative group">
                     <button
                       type="button"
                       onClick={() => {
                         setSettings((prev: any) => ({
                           ...prev,
                           emotionRegexRules: (Array.isArray(prev.emotionRegexRules) ? prev.emotionRegexRules : []).filter((r: any) => r.id !== rule.id)
                         }));
                       }}
                       className="absolute top-4 right-4 text-zinc-500 hover:text-rose-400 transition-colors duration-150 cursor-pointer"
                       title="Delete Pattern"
                     >
                       <Trash2 size={14} />
                     </button>

                     <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                       {/* Regex input */}
                       <div className="space-y-1">
                         <label className="text-[9px] font-mono uppercase text-zinc-400">Regex Pattern</label>
                         <input
                           type="text"
                           className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 font-mono focus:outline-none focus:border-amber-500"
                           placeholder="e.g. sayang|babe|kangen"
                           value={rule.pattern || ''}
                           onChange={(e) => {
                             setSettings((prev: any) => ({
                               ...prev,
                               emotionRegexRules: (prev.emotionRegexRules || []).map((r: any) => r.id === rule.id ? { ...r, pattern: e.target.value } : r)
                             }));
                           }}
                         />
                       </div>

                       {/* Sensitivity */}
                       <div className="space-y-1">
                         <label className="text-[9px] font-mono uppercase text-zinc-400 flex justify-between">
                           <span>Sensitivity</span>
                           <span className="text-amber-400">{rule.sensitivity || 1.0}</span>
                         </label>
                         <input
                           type="range"
                           min="0.1"
                           max="2.0"
                           step="0.05"
                           className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-amber-500 mt-2.5"
                           value={rule.sensitivity || 1.0}
                           onChange={(e) => {
                             setSettings((prev: any) => ({
                               ...prev,
                               emotionRegexRules: (prev.emotionRegexRules || []).map((r: any) => r.id === rule.id ? { ...r, sensitivity: parseFloat(e.target.value) } : r)
                             }));
                           }}
                         />
                       </div>

                       {/* Override baseline */}
                       <div className="flex items-center gap-2 pt-4">
                         <input
                           type="checkbox"
                           id={`cb_${rule.id}`}
                           className="w-3.5 h-3.5 rounded border-white/10 bg-white/5 text-amber-500 focus:ring-0 focus:ring-offset-0 cursor-pointer animate-none"
                           checked={!!rule.isPriority}
                           onChange={(e) => {
                             setSettings((prev: any) => ({
                               ...prev,
                               emotionRegexRules: (prev.emotionRegexRules || []).map((r: any) => r.id === rule.id ? { ...r, isPriority: e.target.checked } : r)
                             }));
                           }}
                         />
                         <label htmlFor={`cb_${rule.id}`} className="text-[9px] font-mono uppercase text-zinc-300 cursor-pointer select-none">
                           Prioritize This Rule (Bypass Sentiment)
                         </label>
                       </div>
                     </div>

                     {/* Mood impact editors */}
                     <div className="space-y-1.5 pt-1 border-t border-white/[0.04]">
                       <span className="text-[8px] font-mono uppercase text-zinc-500">Emotional Impact Modifiers (OCC Matrix)</span>
                       <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-1.5">
                         {['joy', 'anger', 'sadness', 'stress', 'irritation', 'excitement', 'playfulness'].map((mood) => {
                           const val = rule.moodImpact?.[mood] || 0;
                           return (
                             <div key={mood} className="bg-black/20 border border-white/5 rounded-lg p-1 px-1.5 flex flex-col justify-between items-center">
                               <span className="text-[7px] font-mono text-zinc-400 capitalize">{mood}</span>
                               <input
                                 type="number"
                                 className="w-full bg-transparent border-0 text-center p-0 text-[10px] text-white focus:ring-0 font-mono"
                                 value={val}
                                 onChange={(e) => {
                                   const parsedVal = parseInt(e.target.value) || 0;
                                   setSettings((prev: any) => ({
                                     ...prev,
                                     emotionRegexRules: (prev.emotionRegexRules || []).map((r: any) => {
                                       if (r.id === rule.id) {
                                         return {
                                           ...r,
                                           moodImpact: {
                                             ...(r.moodImpact || {}),
                                             [mood]: parsedVal
                                           }
                                         };
                                       }
                                       return r;
                                     })
                                   }));
                                 }}
                               />
                             </div>
                           );
                         })}
                       </div>
                     </div>
                   </div>
                 ))}

                 {(Array.isArray(settings.emotionRegexRules) ? settings.emotionRegexRules : []).length === 0 && (
                   <div className="text-center py-6 bg-white/[0.01] border border-dashed border-white/5 rounded-xl font-mono text-[9px] text-zinc-500">
                     No regex rules registered. Click "Add New Rule" to get started.
                   </div>
                 )}
               </div>

               {/* Lab Sandbox Tester */}
               <div className="bg-black/30 border border-white/5 p-4 rounded-xl space-y-3">
                 <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest text-cyan-400 font-bold">
                   <Terminal size={12} /> Regex Testing Console (Lab Sandbox)
                 </div>
                 <div className="flex gap-2">
                   <input
                     type="text"
                     className="flex-1 bg-black/55 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-cyan-500 transition-all font-mono"
                     placeholder="Type a test phrase..."
                     value={regexTestInput}
                     onChange={(e) => setRegexTestInput(e.target.value)}
                   />
                   <button
                     type="button"
                     onClick={() => {
                       const rules = Array.isArray(settings.emotionRegexRules) ? settings.emotionRegexRules : [];
                       const match = rules.find((rule: any) => {
                         try {
                           const regex = new RegExp(rule.pattern, "i");
                           return regex.test(regexTestInput);
                         } catch (e) {
                           return false;
                         }
                       });
                       const res = match
                         ? `[MATCH] Matching! Emotional Trigger: ${String(match.emotion).toUpperCase()} (Sensitivity: ${match.sensitivity || 1.0}). Matching Pattern: "${match.pattern}"`
                         : "[NO MATCH] No regex pattern matched the current phrase.";
                       alert(res);
                     }}
                     className="px-4 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 rounded-lg text-[10px] font-mono uppercase tracking-wider transition-all border border-cyan-500/25 cursor-pointer active:scale-95"
                   >
                     Test Pattern
                   </button>
                 </div>
                 <div className="text-[8px] text-zinc-500">
                   Type a test phrase above and click "Test Pattern" to verify if your regular expressions trigger the correct emotional modifiers and inner states.
                 </div>
               </div>
             </div>

            {/* Other System Cortices Config under AGI Mind Engine tab */}
            {cortices.length > 0 && (() => {
              // Categorization helper
              const getCortexCategory = (id: string, name: string): 'cognition' | 'memory' | 'perception' | 'utility' => {
                const cleanId = id.toLowerCase();
                const cleanName = name.toLowerCase();
                if (
                  cleanId.includes('agi') || 
                  cleanId.includes('mind') || 
                  cleanId.includes('reason') || 
                  cleanId.includes('learning') || 
                  cleanId.includes('emotion') || 
                  cleanId.includes('soul') || 
                  cleanId.includes('cortex') ||
                  cleanId.includes('verifier') ||
                  cleanName.includes('emotion') ||
                  cleanName.includes('reasoning') ||
                  cleanName.includes('mirror') ||
                  cleanName.includes('cortex')
                ) {
                  return 'cognition';
                }
                if (
                  cleanId.includes('memory') || 
                  cleanId.includes('rag') || 
                  cleanId.includes('knowledge') || 
                  cleanId.includes('recall') ||
                  cleanName.includes('memory') ||
                  cleanName.includes('knowledge') ||
                  cleanName.includes('rag')
                ) {
                  return 'memory';
                }
                if (
                  cleanId.includes('vision') || 
                  cleanId.includes('sensor') || 
                  cleanId.includes('hearing') || 
                  cleanId.includes('tts') || 
                  cleanId.includes('expression') || 
                  cleanId.includes('voice') || 
                  cleanId.includes('stream') ||
                  cleanName.includes('vision') ||
                  cleanName.includes('stream') ||
                  cleanName.includes('voice') ||
                  cleanName.includes('expression')
                ) {
                  return 'perception';
                }
                return 'utility';
              };

              // Apply searching and filtering
              const filteredCortices = cortices.filter((c: any) => {
                const name = c.metadata.name || '';
                const id = c.metadata.id || '';
                const desc = c.metadata.description || '';
                
                // Search query match
                const queryMatch = 
                  name.toLowerCase().includes(cortexQuery.toLowerCase()) ||
                  id.toLowerCase().includes(cortexQuery.toLowerCase()) ||
                  desc.toLowerCase().includes(cortexQuery.toLowerCase());
                
                if (!queryMatch) return false;

                // Category filter match
                if (cortexFilter === 'all') return true;
                return getCortexCategory(id, name) === cortexFilter;
              });

              return (
                <div className="space-y-4 border-t border-white/5 pt-6">
                  {/* Cortex Directory Search, Filter, and Stats Dashboard */}
                  <div className="bg-[#0e0e14]/30 border border-white/5 rounded-2xl p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h4 className="text-[10px] uppercase font-mono tracking-widest text-[#fbbf24] font-bold">Neural Cortices Directory</h4>
                        <p className="text-[9px] text-zinc-500 uppercase mt-0.5 font-mono">
                          Showing {filteredCortices.length} of {cortices.length} neural modules
                        </p>
                      </div>

                      {/* Export All Cortices Configuration Button */}
                      <button
                        type="button"
                        onClick={async () => {
                          const bulkConfig: Record<string, any> = {};
                          cortices.forEach((c: any) => {
                            bulkConfig[c.metadata.id] = settings[c.metadata.id] || {};
                          });
                          try {
                            await navigator.clipboard.writeText(JSON.stringify(bulkConfig, null, 2));
                            alert("✅ All Cortices settings copied to clipboard!");
                          } catch (err) {
                            console.error('Failed to copy bulk settings:', err);
                          }
                        }}
                        className="w-fit flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-[#fbbf24] border border-amber-500/20 rounded-xl text-[9px] font-mono uppercase tracking-widest transition-all cursor-pointer active:scale-95 shrink-0"
                      >
                        <Share2 size={11} />
                        <span>Export All Settings ({cortices.length})</span>
                      </button>
                    </div>

                    {/* Search Field & Category Selector */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                      {/* Search box */}
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Search Cortex engines (e.g., memory, emotion)..."
                          value={cortexQuery}
                          onChange={(e) => setCortexQuery(e.target.value)}
                          className="w-full bg-[#111115] border border-white/5 rounded-xl pl-9 pr-8 py-2 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50 transition-all font-mono"
                        />
                        <Search size={12} className="absolute left-3.5 top-3 text-zinc-500" />
                        {cortexQuery && (
                          <button
                            onClick={() => setCortexQuery('')}
                            className="absolute right-3.5 top-2 hover:text-white text-zinc-500 text-xs font-mono cursor-pointer"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      {/* Filter Chips */}
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {[
                          { id: 'all', label: 'All' },
                          { id: 'cognition', label: '🧠 Cognition' },
                          { id: 'memory', label: '🗄️ Memory' },
                          { id: 'perception', label: '👁️ Perception' },
                          { id: 'utility', label: '🛠️ Utility' }
                        ].map((tab) => {
                          const count = tab.id === 'all' 
                            ? cortices.length 
                            : cortices.filter((c: any) => getCortexCategory(c.metadata.id, c.metadata.name) === tab.id).length;

                          return (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => setCortexFilter(tab.id as any)}
                              className={`px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer text-[9px] font-mono uppercase tracking-wider flex items-center gap-1.5 select-none ${
                                cortexFilter === tab.id
                                  ? 'bg-amber-500/15 border-amber-500/30 text-[#fbbf24] font-bold shadow-[0_0_8px_rgba(251,191,36,0.08)]'
                                  : 'bg-black/25 border-white/5 text-zinc-400 hover:border-white/10 hover:text-zinc-300'
                              }`}
                            >
                              <span>{tab.label}</span>
                              <span className={`text-[8px] px-1 rounded-md ${
                                cortexFilter === tab.id ? 'bg-amber-500/25 text-amber-300' : 'bg-white/5 text-zinc-500'
                              }`}>{count}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Rendered Cortices List */}
                  <div className="space-y-4">
                    {filteredCortices.map((c: any) => (
                      <div key={c.metadata.id} className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl relative overflow-hidden group">
                        <div className="flex items-center justify-between border-b border-white/[0.03] pb-3 mb-4 gap-4 flex-wrap">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] uppercase font-mono tracking-widest text-[#fbbf24] font-extrabold">{c.metadata.name}</span>
                              <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 uppercase">
                                v{c.metadata.version || '1.0'}
                              </span>
                              <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-cyan-700/10 border border-cyan-800/20 text-cyan-400 uppercase">
                                {getCortexCategory(c.metadata.id, c.metadata.name)}
                              </span>
                            </div>
                            {c.metadata.description && (
                              <p className="text-[9px] text-zinc-500 mt-1 font-sans max-w-2xl leading-normal">
                                {c.metadata.description}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Copy and Share config for this single cortex */}
                            <button
                              type="button"
                              onClick={async () => {
                                const config = settings[c.metadata.id] || {};
                                try {
                                  await navigator.clipboard.writeText(JSON.stringify({ id: c.metadata.id, name: c.metadata.name, config }, null, 2));
                                  alert(`✅ Config ${c.metadata.name} copied to clipboard successfully!`);
                                } catch (err) {
                                  console.error('Clipboard copy failed:', err);
                                }
                              }}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white border border-white/5 hover:border-white/10 rounded-lg text-[9px] font-mono uppercase tracking-wider transition-all cursor-pointer active:scale-95"
                              title="Copy config for this cortex module"
                            >
                              <Share2 size={10} />
                              <span>Share</span>
                            </button>
                          </div>
                        </div>

                        {renderFields(c)}
                      </div>
                    ))}

                    {filteredCortices.length === 0 && (
                      <div className="text-center py-12 bg-black/20 border border-dashed border-white/5 rounded-2xl font-mono text-[10px] text-zinc-500">
                        No Cortex Engines matched your search or filters.
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        );
      }
      default:
        return <p className="text-white/30 italic text-xs font-mono">Telemetry link offline. Choose active channel.</p>;
    }
  };

  return (
    <div>
      {selectedSubmoduleCategory ? (
        <div className="space-y-5">
          {/* Back header button */}
          <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <button
              type="button"
              onClick={() => setSelectedSubmoduleCategory(null)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-xl text-[10px] sm:text-xs font-mono uppercase tracking-wider transition-all cursor-pointer border border-white/5"
            >
              <ChevronLeft size={14} /> Back to Modules
            </button>
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#fbbf24] font-bold">
              {moduleCategories.find(c => c.id === selectedSubmoduleCategory)?.title}
            </span>
          </div>
          
          {renderCategoryDetail(selectedSubmoduleCategory)}
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <h4 className="text-xs font-bold text-white tracking-wide">YuiHime Modules</h4>
            <p className="text-[10px] text-white/35 uppercase mt-0.5">Control visual parameters, dynamic model, TTS and bridges</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
            {moduleCategories.map((cat) => {
              const Icon = cat.icon;
              return (
                <div
                  key={cat.id}
                  onClick={() => setSelectedSubmoduleCategory(cat.id)}
                  className="p-3 sm:p-5 rounded-2xl bg-[#0e0e14]/55 hover:bg-[#151520]/75 border border-white/5 hover:border-white/10 cursor-pointer select-none transition-all group flex items-center sm:block sm:h-[150px] relative overflow-hidden"
                >
                  <div className={`p-2.5 bg-white/[0.02] rounded-xl border border-white/[0.05] ${cat.color} group-hover:scale-105 transition-transform shrink-0`}>
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0 sm:mt-3 pl-3 sm:pl-0">
                    <h5 className="text-xs font-extrabold text-white tracking-wide group-hover:text-amber-500 transition-colors">
                      {cat.title}
                    </h5>
                    <p className="hidden sm:block text-[10px] text-zinc-400 mt-1 lines-clamp-2 leading-relaxed">
                      {cat.desc}
                    </p>
                  </div>
                  <ChevronRight size={14} className="text-white/20 group-hover:text-white/60 transition-colors ml-auto sm:absolute sm:top-5 sm:right-5" />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
