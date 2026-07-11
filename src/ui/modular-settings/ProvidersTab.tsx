import React from 'react';
import { 
  AlertTriangle, ChevronLeft, ChevronRight, Star, Cpu, 
  Database, Cloud, Terminal, Monitor, Brain, Radio, 
  Smartphone, Activity, Code, Zap, Server, Flame, Layers, 
  Smile, Compass, Clock, Search, GitBranch, Settings, 
  Volume2, VolumeX, Play, Mic, Gamepad2, Music, Palette, 
  Sparkles, Info, Plus, Trash2, ChevronUp, ChevronDown, RefreshCw, X
} from 'lucide-react';
import { REGISTERED_PROVIDERS_STATIC_DATA } from './settingsConstants';
import { SystemRegistry } from '../../core/registry';
import { ModuleType } from '../../include/types';
import { LockedSlider } from '../../components/LockedSlider';

interface ProvidersTabProps {
  settings: any;
  setSettings: React.Dispatch<React.SetStateAction<any>>;
  updateGeneral: (field: string, val: any) => void;
  providerSubpage: string | null;
  setProviderSubpage: (val: string | null) => void;
  providerSubTab: 'chat' | 'speech' | 'transcription' | 'artistry';
  setProviderSubTab: (val: 'chat' | 'speech' | 'transcription' | 'artistry') => void;
  pricingFilter: 'all' | 'free' | 'paid';
  setPricingFilter: (val: 'all' | 'free' | 'paid') => void;
  deploymentFilter: 'all' | 'local' | 'cloud';
  setDeploymentFilter: (val: 'all' | 'local' | 'cloud') => void;
  setSelectedSection: (val: string) => void;
  setSelectedSubmoduleCategory: (val: string) => void;
  renderFields: (module: any, configValue: any, onChange: (field: string, val: any) => void) => React.ReactNode;
  onShowInfo?: (title: string, text: string) => void;
}

export const ProvidersTab: React.FC<ProvidersTabProps> = ({
  settings,
  setSettings,
  updateGeneral,
  providerSubpage,
  setProviderSubpage,
  providerSubTab,
  setProviderSubTab,
  pricingFilter,
  setPricingFilter,
  deploymentFilter,
  setDeploymentFilter,
  setSelectedSection,
  setSelectedSubmoduleCategory,
  renderFields,
  onShowInfo
}) => {
  const [rowModelsMap, setRowModelsMap] = React.useState<Record<string, { label: string, value: string }[]>>({});
  const [fetchingRowKey, setFetchingRowKey] = React.useState<Record<string, boolean>>({});
  const [showBanner, setShowBanner] = React.useState(true);

  // States to support testing TTS settings within its module setup
  const [testSpeechText, setTestSpeechText] = React.useState('Hello! Nice to meet you. I hope you are having a wonderful day~');
  const [isTestingTts, setIsTestingTts] = React.useState(false);
  const [ttsTestError, setTtsTestError] = React.useState<string | null>(null);

  const handlePlaytestTts = async (providerId: string) => {
    if (!testSpeechText.trim() || isTestingTts) return;
    setIsTestingTts(true);
    setTtsTestError(null);
    try {
      const ttsModule = SystemRegistry.getTTS(providerId);
      if (!ttsModule) {
        throw new Error(`TTS module '${providerId}' not found in registry.`);
      }
      
      const currentConfig = settings[providerId] || {};
      await ttsModule.speak(testSpeechText, currentConfig);
    } catch (err: any) {
      console.error('[TTS-PLAYTEST-ERROR]', err);
      setTtsTestError(err.message || 'Failed to playtest vocal synthesis.');
    } finally {
      setIsTestingTts(false);
    }
  };

  const fetchModelsForChainRow = async (rowId: string, providerId: string, apiKey: string) => {
    setFetchingRowKey(prev => ({ ...prev, [rowId]: true }));
    try {
       const cleanApiKey = apiKey || '';
       const url = `/api/ai/models?provider=${providerId}&apiKey=${encodeURIComponent(cleanApiKey)}`;
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

  React.useEffect(() => {
    if (providerSubpage === 'gemini' && settings.gemini?.fallbackChain) {
      const chain = settings.gemini.fallbackChain;
      chain.forEach((row: any) => {
        if (row.provider && !rowModelsMap[row.id] && !fetchingRowKey[row.id]) {
          fetchModelsForChainRow(row.id, row.provider, row.apiKey || settings[row.provider]?.apiKey || '');
        }
      });
    }
  }, [providerSubpage, settings.gemini?.fallbackChain]);

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

  return (
    <div className="space-y-6">
      {providerSubpage === null ? (
        <div className="space-y-6">
          {/* Upper Amber Alert Notice */}
          {showBanner && (
            <div className="bg-amber-500/[0.02] border border-amber-500/10 p-4 sm:p-5 rounded-2xl flex gap-3 animate-fade-in relative overflow-hidden font-sans">
              <div className="absolute top-0 left-0 h-full w-1 bg-amber-500" />
              <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 pr-6">
                <div className="flex justify-between items-start gap-4">
                  <h4 className="text-xs font-bold text-white tracking-wide">First time here?</h4>
                  {onShowInfo && (
                    <button
                      type="button"
                      onClick={() => onShowInfo(
                        "LLM Provider Setup Guidelines",
                        "Airi requires at least one Chat provider to be configured to think. Choose your primary LLM interface such as Google Gemini, OpenRouter, or Anthropic, and enter your secrets directly. No keys are ever exposed outside the secure sandboxed container."
                      )}
                      className="flex items-center gap-1 bg-white/5 hover:bg-white/10 text-amber-500 hover:text-amber-400 px-2 py-1 rounded-lg border border-white/5 transition-all text-[9px] font-mono cursor-pointer font-bold shrink-0"
                    >
                      <Info size={11} /> Details
                    </button>
                  )}
                </div>
                <p className="text-[11px] leading-relaxed text-zinc-400 mt-1">
                  At least one Chat provider (Gemini, OpenRouter, etc.) must be configured.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBanner(false)}
                className="absolute top-3 right-3 text-zinc-500 hover:text-white transition-colors cursor-pointer"
                title="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Integrated Pill Menus / Primary Categories Tab Row */}
          <div className="flex flex-wrap items-center gap-2 border-b border-white/5 pb-3 font-sans">
            {(['chat', 'speech', 'transcription', 'artistry'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setProviderSubTab(tab)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold tracking-wide capitalize transition-all cursor-pointer ${
                  providerSubTab === tab 
                    ? 'bg-[#c5a880]/15 border border-amber-500/20 text-amber-500' 
                    : 'bg-white/5 border border-white/5 text-zinc-400 hover:bg-white/10 hover:text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Filtering Menus Row (Pricing & Deployment filters) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#0e0e14]/30 border border-white/5 p-4 rounded-xl font-sans">
            <div className="flex items-center gap-4">
              {/* Pricing Filters */}
              <div>
                <span className="block text-[8px] uppercase tracking-widest font-mono text-white/30 mb-1">Pricing structure</span>
                <div className="flex gap-1">
                  {(['all', 'free', 'paid'] as const).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPricingFilter(mode)}
                      className={`px-2.5 py-1 text-[9px] font-mono rounded-md border capitalize transition-all cursor-pointer ${
                        pricingFilter === mode 
                          ? 'bg-amber-500/10 border-amber-500/20 text-amber-500 font-bold' 
                          : 'bg-[#07070a]/40 border-white/5 text-zinc-500 hover:text-white'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Deployment Filters */}
              <div>
                <span className="block text-[8px] uppercase tracking-widest font-mono text-white/30 mb-1">Deployment node</span>
                <div className="flex gap-1">
                  {(['all', 'local', 'cloud'] as const).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setDeploymentFilter(mode)}
                      className={`px-2.5 py-1 text-[9px] font-mono rounded-md border capitalize transition-all cursor-pointer ${
                        deploymentFilter === mode 
                          ? 'bg-amber-500/10 border-amber-500/20 text-amber-500 font-bold' 
                          : 'bg-[#07070a]/40 border-white/5 text-zinc-500 hover:text-white'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Summary Tag */}
            <span className="text-[9px] font-mono text-[#d4d4d8]/40 lowercase italic">
              showing {
                (() => {
                  const cards = REGISTERED_PROVIDERS_STATIC_DATA.filter(c => {
                    if (c.tab !== providerSubTab) return false;
                    if (pricingFilter !== 'all' && c.pricing !== pricingFilter) return false;
                    if (deploymentFilter !== 'all' && c.deployment !== deploymentFilter) return false;
                    return true;
                  });
                  return cards.length;
                })()
              } registry profiles
            </span>
          </div>

          {/* Integrated Providers Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-sans">
            {(() => {
              const cardsList = REGISTERED_PROVIDERS_STATIC_DATA.filter(c => {
                if (c.tab !== providerSubTab) return false;
                if (pricingFilter !== 'all' && c.pricing !== pricingFilter) return false;
                if (deploymentFilter !== 'all' && c.deployment !== deploymentFilter) return false;
                return true;
              });

              if (cardsList.length === 0) {
                return (
                  <div className="col-span-2 text-center py-10 border border-dashed border-white/5 bg-[#0e0e14]/20 rounded-2xl font-mono text-[11px] text-zinc-500">
                    No matching provider profiles in the active registry.
                  </div>
                );
              }

              return cardsList.map(card => {
                const IconComp = card.icon;
                // Check active state
                let isActive = false;
                if (card.tab === 'chat') {
                  isActive = settings.provider === card.id;
                } else if (card.tab === 'speech') {
                  isActive = settings.ttsProvider === card.id || (!settings.ttsProvider && card.id === 'browser_speech');
                } else {
                  // Checked if credential configured
                  isActive = !!(settings[card.id]?.apiKey || settings[card.id]?.enabled);
                }

                return (
                  <div
                    key={card.id}
                    onClick={() => setProviderSubpage(card.id)}
                    className="group bg-[#0e0e14]/55 hover:bg-[#13131d]/85 border border-white/5 hover:border-white/10 p-3.5 sm:p-5 rounded-2xl cursor-pointer shadow-[0_4px_25px_rgba(0,0,0,0.3)] hover:shadow-[0_8px_35px_rgba(0,0,0,0.5)] transition-all duration-300 flex items-center sm:items-start gap-3 select-none"
                  >
                    <div className={`p-2.5 sm:p-3 rounded-xl border shrink-0 ${isActive ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-white/5 border-white/5 text-zinc-400 opacity-60'}`}>
                      <IconComp size={16} className="sm:w-[18px] sm:h-[18px]" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h5 className="text-xs font-bold text-white group-hover:text-amber-500 transition-colors truncate">{card.name}</h5>
                        <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-zinc-650'}`} />
                      </div>
                      <p className="hidden sm:block text-[10px] text-zinc-400/80 mt-1 line-clamp-2 leading-relaxed">{card.desc}</p>
                      <p className="hidden sm:block text-[8px] font-mono text-[#d4d4d8]/20 mt-2 truncate">{card.url}</p>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end gap-1 font-mono text-[8px] shrink-0 ml-auto">
                      <span className={`px-1.5 py-0.5 rounded-md ${card.pricing === 'free' ? 'bg-emerald-500/10 border border-emerald-400/20 text-emerald-400' : 'bg-orange-500/10 border border-orange-400/20 text-orange-400'}`}>
                        {card.pricing}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded-md ${card.deployment === 'local' ? 'bg-emerald-500/10 border border-emerald-400/20 text-emerald-400' : 'bg-cyan-500/10 border border-cyan-400/20 text-cyan-400'}`}>
                        {card.deployment}
                      </span>
                    </div>
                  </div>
                );
              });
            })()}
          </div>

          {/* Creativity Temperature */}
          <LockedSlider
            value={settings.temperature || 0.7}
            onChange={val => updateGeneral('temperature', val)}
            min={0}
            max={2}
            step={0.05}
            label="Model Creativity Temperature"
            description="Controls creativity temperature across all primary provider modules"
            themeColor="cyan"
          />
        </div>
      ) : (
        /* SPECIFIC CONFIG PAGE OR DYNAMIC TELEMETRY CALIBRATION */
        <div className="space-y-6 animate-fade-in font-sans">
          {/* Top Back path buttons and header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <button
              type="button"
              onClick={() => setProviderSubpage(null)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-xl text-[10px] sm:text-xs font-mono uppercase tracking-wider transition-all cursor-pointer"
            >
              <ChevronLeft size={14} /> Back to Providers
            </button>
            <div className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-[#fbbf24] font-bold">
              <span>Settings</span>
              <ChevronRight size={10} />
              <span>{providerSubpage.toUpperCase()}</span>
            </div>
          </div>

          {/* Dynamically render fields from actual modules or hardcoded fallbacks */}
          {(() => {
            const staticProvider = REGISTERED_PROVIDERS_STATIC_DATA.find(p => p.id === providerSubpage);
            let registeredModule = SystemRegistry.getProviders().find(p => p.metadata.id === providerSubpage) ||
                                    SystemRegistry.getTTS(providerSubpage);
            
            if (!registeredModule && staticProvider) {
              let fields: Record<string, any> = {};
              
              if (staticProvider.tab === 'chat') {
                if (staticProvider.id === 'official_chat') {
                  fields = {
                    apiKey: { type: 'password', label: 'Local Module Access Key', description: 'Enter local key token for client alignment (Optional).' },
                    model: { type: 'select', label: 'Local Intelligence Grade', default: 'airi-lite', options: [{ value: 'airi-heavy', label: 'AIRI Heavy (Routes to Active LLM)' }, { value: 'airi-lite', label: 'AIRI Lite (Routes to Gemini/Local NLP)' }, { value: 'airi-vision', label: 'AIRI Vision (Routes to Vision Node)' }] }
                  };
                } else if (staticProvider.id === 'aihubmix') {
                  fields = {
                    apiKey: { type: 'password', label: 'AIHubMix Authorized Key', description: 'Access API key from aihubmix.com.' },
                    model: { type: 'select', label: 'Model Designation', default: 'gpt-4o-mini', options: [{ value: 'gpt-4o', label: 'gpt-4o' }, { value: 'gpt-4o-mini', label: 'gpt-4o-mini' }, { value: 'claude-3-5-sonnet', label: 'claude-3-5-sonnet' }] }
                  };
                } else if (staticProvider.id === 'azure_openai') {
                  fields = {
                    apiKey: { type: 'password', label: 'Azure Key Credential' },
                    resourceName: { type: 'string', label: 'Resource Region Server Name', default: '' },
                    deploymentName: { type: 'string', label: 'Model Deployment Name', default: '' },
                    apiVersion: { type: 'string', label: 'API SDK Version Tag', default: '2024-02-15-preview' }
                  };
                } else if (staticProvider.id === 'ollama') {
                  fields = {
                    apiUrl: { type: 'string', label: 'Ollama endpoint server connection', default: 'http://localhost:11434' },
                    model: { type: 'string', label: 'Llama/Model designation ID', default: 'llama3' }
                  };
                } else if (staticProvider.id === 'lmstudio') {
                  fields = {
                    apiUrl: { type: 'string', label: 'LM Studio standard proxy URL endpoint', default: 'http://localhost:1234/v1' },
                    model: { type: 'string', label: 'Target Model Signature', default: 'meta-llama-3-8b-instruct' }
                  };
                } else if (staticProvider.id === 'deepseek') {
                  fields = {
                    apiKey: { type: 'password', label: 'DeepSeek Authorized API Key' },
                    model: { type: 'select', label: 'Model Variant Name', default: 'deepseek-chat', options: [{ value: 'deepseek-chat', label: 'DeepSeek Chat' }, { value: 'deepseek-coder', label: 'DeepSeek Coder' }] }
                  };
                } else if (staticProvider.id === 'openai_compatible') {
                  fields = {
                    apiUrl: { type: 'string', label: 'API Base url / proxy endpoint Address', default: 'https://api.openai.com/v1' },
                    apiKey: { type: 'password', label: 'Access Authorization token Key' },
                    model: { type: 'string', label: 'Custom Model identifier string', default: '' }
                  };
                } else if (staticProvider.id === 'xiaomi_mimo_chat') {
                  fields = {
                    apiKey: { type: 'password', label: 'Xiaomi MiMo key Token' },
                    model: { type: 'string', label: 'Preferred AI model', default: 'mimo-gpt-4o' }
                  };
                } else if (staticProvider.id === '302_ai') {
                  fields = {
                    apiKey: { type: 'password', label: '302.AI Key Auth' },
                    model: { type: 'string', label: 'Host Model Name', default: 'gpt-4o' }
                  };
                } else if (staticProvider.id === 'volc_coding' || staticProvider.id === 'byteplus_coding') {
                  fields = {
                    apiKey: { type: 'password', label: 'Credential Access API Key' },
                    model: { type: 'string', label: 'Deployment Endpoint ID', default: '' }
                  };
                } else if (staticProvider.id === 'byteplus') {
                  fields = {
                    apiKey: { type: 'password', label: 'BytePlus developer API token' },
                    model: { type: 'string', label: 'Deployment ID', default: '' }
                  };
                } else if (staticProvider.id === 'n1n') {
                  fields = {
                    apiKey: { type: 'password', label: 'n1n JWT developer token string' },
                    model: { type: 'string', label: 'Target model ID', default: '' }
                  };
                } else if (staticProvider.id === 'azure_ai_foundry') {
                  fields = {
                    apiKey: { type: 'password', label: 'Azure AI Foundry API security credential' },
                    apiUrl: { type: 'string', label: 'Endpoint Base Address URL' }
                  };
                } else if (staticProvider.id === 'bedrock') {
                  fields = {
                    accessKeyId: { type: 'string', label: 'AWS Access Key Identification String' },
                    secretAccessKey: { type: 'password', label: 'AWS Secret Access Encryption Key' },
                    region: { type: 'string', label: 'Deployment Region Zone Code', default: 'us-east-1' },
                    model: { type: 'select', label: 'Active bedrock model', default: 'anthropic.claude-3-sonnet-20240229-v1:0', options: [{ value: 'anthropic.claude-3-sonnet-20240229-v1:0', label: 'Claude 3 Sonnet' }, { value: 'meta.llama3-8b-instruct-v1:0', label: 'Llama 3 Instruct' }] }
                  };
                } else if (staticProvider.id === 'cerebras') {
                  fields = {
                    apiKey: { type: 'password', label: 'Cerebras Cloud core developer API Key' },
                    model: { type: 'select', label: 'Super-low latency model model', default: 'llama3.1-8b', options: [{ value: 'llama3.1-8b', label: 'llama3.1-8b (Super latency)' }, { value: 'llama3.1-70b', label: 'llama3.1-70b' }] }
                  };
                } else if (staticProvider.id === 'cloudflare_ai') {
                  fields = {
                    accountId: { type: 'string', label: 'CF Account identifier' },
                    apiToken: { type: 'password', label: 'CF Workers AI Access authorization Token' }
                  };
                } else if (staticProvider.id === 'comet_api_chat') {
                  fields = {
                    apiKey: { type: 'password', label: 'Comet API secret authorization' },
                    model: { type: 'string', label: 'Model identification ID', default: 'gpt-4o' }
                  };
                } else if (staticProvider.id === 'featherless') {
                  fields = {
                    apiKey: { type: 'password', label: 'Featherless token Key' },
                    model: { type: 'string', label: 'Target open model', default: '' }
                  };
                } else if (staticProvider.id === 'fireworks') {
                  fields = {
                    apiKey: { type: 'password', label: 'Fireworks cloud key token' },
                    model: { type: 'string', label: 'Fireworks Model signature option', default: '' }
                  };
                } else if (staticProvider.id === 'groq') {
                  fields = {
                    apiKey: { type: 'password', label: 'Groq extreme speed API Key token' },
                    model: { type: 'select', label: 'Ultra high-speed Model select', default: 'llama-3-70b', options: [{ value: 'llama-3.1-70b-versatile', label: 'Llama 3.1 70b' }, { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8b' }, { value: 'gemma2-9b-it', label: 'Gemma 2 9b' }] }
                  };
                } else if (staticProvider.id === 'minimax') {
                  fields = {
                    apiKey: { type: 'password', label: 'MiniMax key client secret' },
                    groupId: { type: 'string', label: 'MiniMax authorized Group corporate ID' },
                    model: { type: 'select', label: 'Model version selection', default: 'abab6.5-chat', options: [{ value: 'abab6.5-chat', label: 'abab6.5-chat' }, { value: 'abab6.5g-chat', label: 'abab6.5g-chat' }] }
                  };
                } else if (staticProvider.id === 'minimax_global') {
                  fields = {
                    apiKey: { type: 'password', label: 'MiniMax Global API Token Key' },
                    model: { type: 'string', label: 'Linguistic Model Signature', default: '' }
                  };
                } else if (staticProvider.id === 'mistral') {
                  fields = {
                    apiKey: { type: 'password', label: 'Mistral API auth dev token' },
                    model: { type: 'select', label: 'Mistral model series selection', default: 'mistral-large-latest', options: [{ value: 'mistral-large-latest', label: 'Mistral Large' }, { value: 'mistral-medium-latest', label: 'Mistral Medium' }, { value: 'open-mixtral-8x22b', label: 'Mixtral 8x22B' }] }
                  };
                } else if (staticProvider.id === 'modelscope') {
                  fields = {
                    apiKey: { type: 'password', label: 'ModelScope access Token ID' },
                    model: { type: 'string', label: 'Target Model configuration', default: '' }
                  };
                } else if (staticProvider.id === 'moonshot') {
                  fields = {
                    apiKey: { type: 'password', label: 'Moonshot AI / Kimi developer API Key' },
                    model: { type: 'select', label: 'Moonshot model depth context length', default: 'moonshot-v1-8k', options: [{ value: 'moonshot-v1-8k', label: 'moonshot-v1-8k' }, { value: 'moonshot-v1-32k', label: 'moonshot-v1-32k' }, { value: 'moonshot-v1-128k', label: 'moonshot-v1-128k' }] }
                  };
                } else if (staticProvider.id === 'novita') {
                  fields = {
                    apiKey: { type: 'password', label: 'Novita API Client Key Token' },
                    model: { type: 'string', label: 'Model selection', default: '' }
                  };
                } else if (staticProvider.id === 'perplexity') {
                  fields = {
                    apiKey: { type: 'password', label: 'Perplexity service API Key' },
                    model: { type: 'select', label: 'Model generation variant', default: 'llama-3.1-sonar-small-128k-online', options: [{ value: 'llama-3.1-sonar-small-128k-online', label: 'Sonar Small Online' }, { value: 'llama-3.1-sonar-large-128k-online', label: 'Sonar Large Online text' }] }
                  };
                } else if (staticProvider.id === 'together_ai') {
                  fields = {
                    apiKey: { type: 'password', label: 'Together.ai workspace Developer Token' },
                    model: { type: 'string', label: 'Custom Model reference signature', default: '' }
                  };
                } else if (staticProvider.id === 'z_ai') {
                  fields = {
                    apiKey: { type: 'password', label: 'Z.ai access Key Token' },
                    model: { type: 'string', label: 'Speech active model translation ID', default: '' }
                  };
                } else if (staticProvider.id === 'xai') {
                  fields = {
                    apiKey: { type: 'password', label: 'xAI security developer Access key token' },
                    model: { type: 'select', label: 'Preferred model stream type', default: 'grok-beta', options: [{ value: 'grok-beta', label: 'Grok-Beta' }, { value: 'grok-vision-beta', label: 'Grok Vision Beta' }] }
                  };
                } else if (staticProvider.id === 'openai') {
                  fields = {
                    apiKey: { type: 'password', label: 'OpenAI Developer Client API Key' },
                    model: { type: 'select', label: 'Standard linguistic level', default: 'gpt-4o-mini', options: [{ value: 'gpt-4o-mini', label: 'gpt-4o-mini (Lightweight core)' }, { value: 'gpt-4o', label: 'gpt-4o (Reasoning capability)' }] }
                  };
                } else if (staticProvider.id === 'anthropic') {
                  fields = {
                    apiKey: { type: 'password', label: 'Anthropic Client authorization Key' },
                    model: { type: 'select', label: 'Claude linguistic reasoning model', default: 'claude-3-5-sonnet-20240620', options: [{ value: 'claude-3-5-sonnet-20240620', label: 'Claude 3.5 Sonnet' }, { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus (Full depth)' }] }
                  };
                } else if (staticProvider.id === 'gemini') {
                  fields = {
                    apiKey: { type: 'password', label: 'Google AI Studio Gemini API Key' },
                    model: { type: 'select', label: 'Active Gemini model', default: 'gemini-3.5-flash', options: [{ value: 'gemini-3.5-flash', label: 'gemini-3.5-flash (Default Lightweight)' }, { value: 'gemini-3.1-pro-preview', label: 'gemini-3.1-pro-preview (Heavy Reasoning)' }, { value: 'gemini-3.1-flash-lite', label: 'gemini-3.1-flash-lite (Ultra-fast speed)' }, { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash (Older Generation)' }] }
                  };
                }
              } else if (staticProvider.tab === 'speech') {
                if (staticProvider.id === 'official_speech') {
                  fields = {
                    apiKey: { type: 'password', label: 'Official credentials access API token' },
                    model: { type: 'string', label: 'Vocal profile code', default: 'airi-melodious' }
                  };
                } else if (staticProvider.id === 'official_streaming_speech') {
                  fields = {
                    apiKey: { type: 'password', label: 'Official credentials access API token' },
                    model: { type: 'string', label: 'Vocal profile code', default: 'airi-melodious-stream' }
                  };
                } else if (staticProvider.id === 'none_speech') {
                  fields = {};
                } else if (staticProvider.id === 'browser_speech') {
                  fields = {
                    voice: { type: 'string', label: 'Language Accent identifier name to select browser speech engine', default: 'en-US' }
                  };
                } else if (staticProvider.id === 'openai_speech') {
                  fields = {
                    apiKey: { type: 'password', label: 'OpenAI authorization Client API Key' },
                    voice: { type: 'select', label: 'Vocal profile matching OpenAI specifications', default: 'alloy', options: [{ value: 'alloy', label: 'Alloy' }, { value: 'echo', label: 'Echo' }, { value: 'fable', label: 'Fable' }, { value: 'onyx', label: 'Onyx' }, { value: 'nova', label: 'Nova' }, { value: 'shimmer', label: 'Shimmer' }] },
                    model: { type: 'select', label: 'Audio synthesis standard', default: 'tts-1', options: [{ value: 'tts-1', label: 'tts-1 (Stream speed)' }, { value: 'tts-1-hd', label: 'tts-1-hd (High Fidelity)' }] }
                  };
                } else if (staticProvider.id === 'openai_compatible_speech') {
                  fields = {
                    apiUrl: { type: 'string', label: 'Base endpoint URL Address for TTS proxy', default: 'https://api.openai.com/v1' },
                    apiKey: { type: 'password', label: 'Speech API key token' },
                    voice: { type: 'string', label: 'Custom Voice target name', default: '' },
                    model: { type: 'string', label: 'Custom Model tag name', default: 'tts-1' }
                  };
                } else if (staticProvider.id === 'elevenlabs') {
                  fields = {
                    apiKey: { type: 'password', label: 'ElevenLabs Authorized Account Client API Key' },
                    voice: { type: 'string', label: 'Vocal cloning Profile voiceId signature', default: '21m00Tcm4TlvDq8ikWAM' },
                    model: { type: 'select', label: 'Audio generations standard classification', default: 'eleven_monolingual_v1', options: [{ value: 'eleven_monolingual_v1', label: 'eleven_monolingual_v1' }, { value: 'eleven_multilingual_v2', label: 'eleven_multilingual_v2' }] }
                  };
                } else if (staticProvider.id === 'deepgram_speech') {
                  fields = {
                    apiKey: { type: 'password', label: 'Deepgram Account API Security Key' },
                    voice: { type: 'select', label: 'Vocal profile accent designation list', default: 'aura-asteria-en', options: [{ value: 'aura-asteria-en', label: 'Asteria Core English' }, { value: 'aura-luna-en', label: 'Luna Accent english' }, { value: 'aura-stella-en', label: 'Stella female english' }] }
                  };
                } else if (staticProvider.id === 'azure_speech') {
                  fields = {
                    apiKey: { type: 'password', label: 'Azure speech service key' },
                    region: { type: 'string', label: 'Azure region Server identifier', default: 'eastus' },
                    voice: { type: 'string', label: 'Azure Standard speech voice synthesis ID', default: 'en-US-JennyNeural' }
                  };
                } else if (staticProvider.id === 'bilibili_index_tts') {
                  fields = {
                    apiUrl: { type: 'string', label: 'IndexTTS websocket or custom endpoint host Address', default: 'https://api.index-tts.example.com/' }
                  };
                } else if (staticProvider.id === 'alibaba_studio_speech') {
                  fields = {
                    apiKey: { type: 'password', label: 'Alibaba Cloud token' },
                    voice: { type: 'string', label: 'Voice clone name ID', default: 'cosyvoice-v2' }
                  };
                } else if (staticProvider.id === 'volcano_speech') {
                  fields = {
                    apiKey: { type: 'password', label: 'Volcano Speech key token' },
                    voice: { type: 'string', label: 'Voice code properties', default: 'volcano' }
                  };
                } else if (staticProvider.id === 'minimax_speech') {
                  fields = {
                    apiKey: { type: 'password', label: 'MiniMax service access token' },
                    voice: { type: 'string', label: 'MiniMax voice signature ID', default: 'minimax-speech-v1' }
                  };
                } else if (staticProvider.id === 'openrouter_speech') {
                  fields = {
                    apiKey: { type: 'password', label: 'OpenRouter Account Authorized credential token' },
                    voice: { type: 'string', label: 'Model TTS Voice ID configuration', default: '' }
                  };
                } else if (staticProvider.id === 'xiaomi_mimo_speech') {
                  fields = {
                    apiKey: { type: 'password', label: 'Xiaomi key Token' },
                    voice: { type: 'string', label: 'Preferred Sound Voice configuration pack', default: '' }
                  };
                } else if (staticProvider.id === 'comet_api_speech') {
                  fields = {
                    apiKey: { type: 'password', label: 'Comet voice system token API key' }
                  };
                } else if (staticProvider.id === 'player2_speech') {
                  fields = {
                    apiKey: { type: 'password', label: 'Player2 API credential' },
                    voice: { type: 'string', label: 'Preferred player model sound key description', default: 'player-2-core' }
                  };
                } else if (staticProvider.id === 'kokoro_local') {
                  fields = {
                    voice: { type: 'select', label: 'Kokoro Local Voice Model Profile', default: 'af_bella', options: [{ value: 'af_bella', label: 'Bella (US Female)' }, { value: 'af_sarah', label: 'Sarah (US Female)' }, { value: 'am_adam', label: 'Adam (US Male)' }, { value: 'bf_emma', label: 'Emma (UK Female)' }] }
                  };
                } else if (staticProvider.id === 'custom_api_speech') {
                  fields = {
                    apiUrl: { type: 'string', label: 'Local API standard Address endpoint URL (e.g. GPT-SoVITS)', default: 'http://127.0.0.1:9001/tts' },
                    method: { type: 'select', label: 'HTTP Connection method Protocol', default: 'GET', options: [{ value: 'GET', label: 'HTTP GET standard query format' }, { value: 'POST', label: 'HTTP POST JSON string format' }] },
                    voice: { type: 'string', label: 'Voice custom character or path parameter key', default: '' },
                    extraHeaders: { type: 'textarea', label: 'Secure identification HTTP headers (Optional JSON format)', default: '{}' }
                  };
                }
              } else if (staticProvider.tab === 'transcription') {
                if (staticProvider.id === 'browser_hearing') {
                  fields = {
                    lang: { type: 'string', label: 'STT default dialect capture accent code', default: 'en-US' }
                  };
                } else if (staticProvider.id === 'openai_whisper') {
                  fields = {
                    apiKey: { type: 'password', label: 'OpenAI Client security API key' }
                  };
                } else if (staticProvider.id === 'openai_compatible_transcription') {
                  fields = {
                    apiKey: { type: 'password', label: 'STT Authorized client API Key' },
                    apiUrl: { type: 'string', label: 'Transcription Base URL proxy endpoint', default: 'https://api.openai.com/v1' }
                  };
                } else if (staticProvider.id === 'aliyun_nls_transcription') {
                  fields = {
                    apiKey: { type: 'password', label: 'Aliyun developer credentials API key' }
                  };
                } else if (staticProvider.id === 'web_speech_api') {
                  fields = {
                    lang: { type: 'string', label: 'System WebSpeech capture accent language locale code', default: 'en-US' }
                  };
                } else if (staticProvider.id === 'comet_api_transcription') {
                  fields = {
                    apiKey: { type: 'password', label: 'Comet API transcript key' }
                  };
                } else if (staticProvider.id === 'xiaomi_mimo_transcription') {
                  fields = {
                    apiKey: { type: 'password', label: 'MiMo transcription key' }
                  };
                }
              } else if (staticProvider.tab === 'artistry') {
                if (staticProvider.id === 'comfyui') {
                  fields = {
                    apiUrl: { type: 'string', label: 'ComfyUI Local IP URL Address', default: 'http://127.0.0.1:8188' },
                    workflow: { type: 'textarea', label: 'Workflow API Node Config map payload properties', placeholder: 'Paste JSON representation...' }
                  };
                } else if (staticProvider.id === 'replicate') {
                  fields = {
                    apiKey: { type: 'password', label: 'Replicate service key client Token' },
                    model: { type: 'select', label: 'FLUX generation model size', default: 'black-forest-labs/flux-schnell', options: [{ value: 'black-forest-labs/flux-schnell', label: 'FLUX Schnell' }, { value: 'black-forest-labs/flux-dev', label: 'FLUX Dev' }] }
                  };
                } else if (staticProvider.id === 'nano_banana') {
                  fields = {
                    apiKey: { type: 'password', label: 'Google Gemini Studio AI verification API Key' }
                  };
                }
              }

              registeredModule = {
                metadata: {
                  id: staticProvider.id,
                  name: staticProvider.name,
                  type: staticProvider.tab === 'chat' ? ModuleType.PROVIDER : (staticProvider.tab === 'speech' ? ModuleType.TTS : ModuleType.CORTEX),
                  description: staticProvider.desc,
                  configSchema: { fields }
                }
              } as any;
            }
            
            const isOptionalKeyProvider = ['local', 'browser_speech', 'browser_hearing', 'ollama', 'lmstudio', 'comfyui', 'none_speech'].includes(providerSubpage || '');
            const hasCredentials = !!(settings[providerSubpage]?.apiKey || settings[providerSubpage]?.api_key || settings[providerSubpage]?.token) || isOptionalKeyProvider;

            const handleValidationPing = async () => {
              try {
                const config = settings[providerSubpage] || {};
                const res = await fetch('/api/ai/verify', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ provider: providerSubpage, config })
                });
                const data = await res.json();
                if (data.valid) {
                  alert(`✅ Connection verified successfully with ${providerSubpage.toUpperCase()}!\nDetails: ${data.maskedKey || 'Ok'}`);
                } else {
                  alert(`❌ Health Verification failed: ${data.error || 'Server rejected key credentials.'}`);
                }
              } catch (e: any) {
                alert(`⚠️ Sync server offline: ${e.message}`);
              }
            };

            return (
              <div className="space-y-6">
                {registeredModule ? (
                  <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
                      <div>
                        <h4 className="text-sm font-bold text-white tracking-wide">{registeredModule.metadata.name} Configurations</h4>
                        <p className="text-[10px] text-white/30 mt-0.5 uppercase">Self-defining configuration schema</p>
                      </div>
                      
                      {(() => {
                        const isChat = staticProvider?.tab === 'chat' || ['gemini', 'openai', 'anthropic', 'openrouter', 'local', 'custom'].includes(registeredModule.metadata.id);
                        const isTTS = staticProvider?.tab === 'speech' || ['elevenlabs', 'browser_speech', 'openai_speech', 'gemini_speech', 'openrouter_speech'].includes(registeredModule.metadata.id);
                        
                        if (isChat) {
                          const isActive = settings.provider === registeredModule.metadata.id;
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                setSettings((prev: any) => {
                                  const pId = registeredModule.metadata.id;
                                  return {
                                    ...prev,
                                    provider: pId,
                                    [pId]: {
                                      ...(prev[pId] || {}),
                                      enabled: true
                                    }
                                  };
                                });
                              }}
                              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border font-mono text-[9px] uppercase tracking-wider transition-all font-bold select-none cursor-pointer ${
                                isActive
                                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.06)]'
                                  : 'bg-white/5 border-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
                              }`}
                            >
                              <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-[#f59e0b] shadow-[0_0_8px_rgba(245,158,11,0.8)]' : 'bg-transparent border border-zinc-500'}`} />
                              Activate provider
                            </button>
                          );
                        } else if (isTTS) {
                          const isActive = settings.ttsProvider === registeredModule.metadata.id || (!settings.ttsProvider && registeredModule.metadata.id === 'browser_speech');
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                setSettings((prev: any) => ({ ...prev, ttsProvider: registeredModule.metadata.id }));
                              }}
                              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border font-mono text-[9px] uppercase tracking-wider transition-all font-bold select-none cursor-pointer ${
                                isActive
                                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.06)]'
                                  : 'bg-white/5 border-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
                              }`}
                            >
                              <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-[#10b981] shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-transparent border border-zinc-500'}`} />
                              Activate voice
                            </button>
                          );
                        }
                        
                        return null;
                      })()}
                    </div>

                    <div className="space-y-4">
                      {renderFields(
                        registeredModule,
                        settings[registeredModule.metadata.id] || {},
                        (field: string, val: any) => {
                          setSettings((prev: any) => {
                            const pId = registeredModule.metadata.id;
                            return {
                              ...prev,
                              [pId]: {
                                ...(prev[pId] || {}),
                                [field]: val,
                                enabled: true
                              }
                            };
                          });
                        }
                      )}
                    </div>

                    {staticProvider?.tab === 'speech' && (
                      <div className="mt-6 border-t border-white/5 pt-5 space-y-3 font-sans">
                        <div className="flex items-center gap-1.5 text-[10px] tracking-wider uppercase text-amber-500 font-mono font-bold">
                          <Volume2 size={12} /> Live Voice Playtest Panel
                        </div>
                        <p className="text-[10px] text-zinc-400 leading-relaxed">
                          Test the vocal synthesis capabilities of Airi ({staticProvider.name}) directly before enabling it globally.
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={testSpeechText}
                            onChange={(e) => setTestSpeechText(e.target.value)}
                            placeholder="Type test speech text here..."
                            className="flex-1 bg-black/40 border border-white/5 rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-600 outline-none focus:border-amber-500/50 font-sans"
                          />
                          <button
                            type="button"
                            onClick={() => handlePlaytestTts(registeredModule.metadata.id)}
                            disabled={isTestingTts || !testSpeechText.trim()}
                            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-white/5 disabled:text-zinc-650 font-bold font-mono text-[10px] text-black px-4 py-1.5 rounded-xl transition-all cursor-pointer select-none"
                          >
                            {isTestingTts ? (
                              <>
                                <RefreshCw size={11} className="animate-spin" />
                                <span>Generating...</span>
                              </>
                            ) : (
                              <>
                                <Play size={11} fill="currentColor" />
                                <span>Coba Suara</span>
                              </>
                            )}
                          </button>
                        </div>
                        {ttsTestError && (
                          <p className="text-[10px] text-rose-400 font-mono italic">⚠️ Gagal: {ttsTestError}</p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl text-center text-zinc-500 font-mono text-xs">
                    Could not identify module specification metadata in registry index list.
                  </div>
                )}

                {/* Secure Vault Info Footer inside credentials setup path */}
                <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                  <div className="flex gap-3 text-left">
                    <div className={`p-2 rounded-xl mt-0.5 shrink-0 ${hasCredentials ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-500'}`}>
                      <Server size={18} />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-white tracking-wide">
                        {isOptionalKeyProvider ? 'Provider active & ready (No credentials required)' : (hasCredentials ? 'Configuration validated successfully' : 'Configuration partially validated')}
                      </h5>
                      <p className="text-[10.5px] leading-relaxed text-zinc-450 mt-1">
                        {isOptionalKeyProvider ? 'This service is offline-first, free, or uses optional keys.' : (hasCredentials ? 'Key formatted and resolved' : 'Waiting for connection verification keys')}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 sm:self-auto self-end">
                    <button
                      type="button"
                      onClick={handleValidationPing}
                      className="px-3.5 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl border border-white/5 transition-all text-[10px] font-bold uppercase cursor-pointer"
                    >
                      Ping API
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => {
                        // Dynamically route to correct sub-module category
                        let targetCategory = 'consciousness';
                        if (staticProvider?.tab === 'speech') {
                          targetCategory = 'speech';
                        } else if (staticProvider?.tab === 'transcription') {
                          targetCategory = 'hearing';
                        } else if (staticProvider?.tab === 'artistry') {
                          targetCategory = 'artistry';
                        }

                        // Dispatch secure transition event
                        window.dispatchEvent(new CustomEvent('yuihime_goto_section', {
                          detail: { section: 'modules', category: targetCategory }
                        }));

                        // Propagate component state changes immediately
                        setProviderSubpage(null);
                        setSelectedSection('modules');
                        setSelectedSubmoduleCategory(targetCategory);
                      }}
                      className="px-4 py-2 rounded-xl border bg-amber-500/20 border-amber-500/30 text-amber-500 hover:bg-amber-500/30 transition-all text-[10px] font-bold uppercase cursor-pointer"
                    >
                      {staticProvider?.tab === 'speech' ? 'Select Voice →' : (staticProvider?.tab === 'transcription' ? 'Select Hearing →' : (staticProvider?.tab === 'artistry' ? 'Select Artistry →' : 'Select Model →'))}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};
