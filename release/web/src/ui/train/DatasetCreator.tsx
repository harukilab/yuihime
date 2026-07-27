import React, { useState, useEffect } from 'react';
import { Play, Pause, RefreshCw, AlertTriangle, Terminal, Layers, Clock, Settings, Save } from 'lucide-react';
import { SearchableSelect } from '../../components/SearchableSelect';

interface DatasetCreatorProps {
  onRefreshMemories?: () => void;
}

export const DatasetCreator: React.FC<DatasetCreatorProps> = ({
  onRefreshMemories
}) => {
  const [synthConfig, setSynthConfig] = useState<{
    isEnabled: boolean;
    intervalSeconds: number;
    maxRetries: number;
    systemPrompt: string;
    thoughtTemplate: string;
    provider?: string;
    model?: string;
  } | null>(null);

  const [availableModels, setAvailableModels] = useState<{ value: string; label: string }[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState<boolean>(false);
  const [useCustomModelInput, setUseCustomModelInput] = useState<boolean>(false);
  const [synthState, setSynthState] = useState<{
    status: 'idle' | 'running' | 'paused' | 'error';
    totalRaw: number;
    synthesized: number;
    pending: number;
    retryCount: number;
    lastError: string;
    lastRunTimestamp: number;
  } | null>(null);
  const [synthLogs, setSynthLogs] = useState<string[]>([]);
  const [isSynthSaving, setIsSynthSaving] = useState(false);

  const fetchModelsForProvider = async (providerId: string) => {
    if (!providerId) return;
    setIsFetchingModels(true);
    try {
      const res = await fetch(`/api/ai/models?provider=${providerId}`);
      if (res.ok) {
        const data = await res.json();
        const models = (data.models || []).map((m: any) => {
          const id = m.name.split('/').pop() || m.name;
          return {
            label: m.displayName || id,
            value: m.name || id
          };
        });
        setAvailableModels(models);
      } else {
        setAvailableModels([]);
      }
    } catch (err) {
      console.error('Failed to fetch models for synthesizer:', err);
      setAvailableModels([]);
    } finally {
      setIsFetchingModels(false);
    }
  };

  useEffect(() => {
    if (synthConfig?.provider) {
      fetchModelsForProvider(synthConfig.provider);
    }
  }, [synthConfig?.provider]);

  const fetchSynthStatus = async () => {
    try {
      const res = await fetch("/api/cortex/synthesizer/status");
      if (res.ok) {
        const body = await res.json();
        if (body.success) {
          setSynthConfig(body.config);
          setSynthState(body.state);
          setSynthLogs(body.logs || []);
        }
      }
    } catch (err) {
      console.error("Failed to fetch synthesizer status:", err);
    }
  };

  useEffect(() => {
    fetchSynthStatus();
    const timer = setInterval(() => {
      fetchSynthStatus();
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const saveSynthConfig = async (updatedFields: any) => {
    setIsSynthSaving(true);
    try {
      const res = await fetch("/api/cortex/synthesizer/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedFields),
      });
      if (res.ok) {
        const body = await res.json();
        if (body.success) {
          setSynthConfig(body.config);
          setSynthState(body.state);
        }
      }
    } catch (err) {
      console.error("Failed to save synthesizer config:", err);
    } finally {
      setIsSynthSaving(false);
    }
  };

  const handleSynthControl = async (action: 'start' | 'stop' | 'reset' | 'retry_pool') => {
    try {
      const res = await fetch("/api/cortex/synthesizer/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const body = await res.json();
        if (body.success) {
          setSynthState(body.state);
          setSynthLogs(body.logs || []);
        }
      }
    } catch (err) {
      console.error("Failed to invoke synthesizer daemon control:", err);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start text-left animate-fade-in">
      
      {/* LEFT COLUMN: Controls */}
      <div className="lg:col-span-1 space-y-6">
        <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-3xl space-y-6">
          <div className="border-b border-white/5 pb-3">
            <span className="text-[10px] uppercase font-mono tracking-widest text-zinc-400 block font-bold mb-1">CORTEX OPTIMIZER</span>
            <h3 className="text-sm font-bold text-white">Daemon Control Panel</h3>
          </div>

          {/* Status Indicators */}
          <div className="flex items-center justify-between bg-black/30 border border-white/5 p-4 rounded-2xl">
            <div>
              <span className="text-[9px] uppercase font-mono text-zinc-400 block">DAEMON STATUS</span>
              <div className="flex items-center gap-2 mt-1">
                <span className={`w-2 h-2 rounded-full ${synthState?.status === 'running' ? 'bg-emerald-500 animate-ping' : 'bg-rose-500'}`} />
                <span className="text-xs font-bold text-white uppercase font-mono">{synthState?.status || "idle"}</span>
              </div>
            </div>
            <div className="flex gap-1.5">
              {synthState?.status === 'running' ? (
                <button
                  type="button"
                  onClick={() => handleSynthControl('stop')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-lg active:scale-95"
                >
                  <Pause size={12} /> Pause
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSynthControl('start')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-[#10b981] text-black rounded-xl text-xs font-bold transition-all cursor-pointer shadow-lg active:scale-95"
                >
                  <Play size={12} fill="currentColor" /> Resume
                </button>
              )}
            </div>
          </div>

          {/* Throttling options */}
          <div className="space-y-2">
            <label className="text-[10.5px] font-mono font-bold text-zinc-400 uppercase flex justify-between">
              <span>Pacing Delay</span>
              <span className="text-rose-500 font-extrabold">{synthConfig?.intervalSeconds || 15} Seconds</span>
            </label>
            <div className="grid grid-cols-4 gap-1.5 bg-[#07070a] p-1 rounded-xl border border-white/5">
              {[5, 10, 15, 30].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => saveSynthConfig({ intervalSeconds: sec })}
                  className={`py-1 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer ${
                    synthConfig?.intervalSeconds === sec
                      ? 'bg-rose-500 text-white shadow-md'
                      : 'text-zinc-500 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>
            <p className="text-[9px] text-zinc-500 leading-normal">
              Highly recommended to avoid API limit triggers on free provider plans.
            </p>
          </div>

          {/* Retries */}
          <div className="space-y-2">
            <label className="text-[10.5px] font-mono font-bold text-zinc-400 uppercase flex justify-between">
              <span>Failure Tolerance</span>
              <span className="text-white">{synthConfig?.maxRetries || 3}x</span>
            </label>
            <div className="grid grid-cols-4 gap-1.5 bg-[#07070a] p-1 rounded-xl border border-white/5">
              {[1, 2, 3, 5].map((tries) => (
                <button
                  key={tries}
                  type="button"
                  onClick={() => saveSynthConfig({ maxRetries: tries })}
                  className={`py-1 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer ${
                    synthConfig?.maxRetries === tries
                      ? 'bg-zinc-700 text-white'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                  }`}
                >
                  {tries}x
                </button>
              ))}
            </div>
          </div>

          {/* AI Providers */}
          <div className="space-y-2">
            <label className="text-[10.5px] font-mono font-bold text-zinc-400 uppercase flex justify-between">
              <span>LLM Provider</span>
            </label>
            <select
              value={synthConfig?.provider || "gemini"}
              onChange={(e) => saveSynthConfig({ provider: e.target.value })}
              className="w-full bg-[#050508] border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-[#ef4444] cursor-pointer transition-all"
            >
              <option value="gemini">Google Gemini</option>
              <option value="openai">OpenAI / Compatible</option>
              <option value="anthropic">Anthropic Claude</option>
              <option value="openrouter">OpenRouter AI Hub</option>
              <option value="groq">Groq High-Speed LPU</option>
              <option value="ollama">Ollama (Local Offline)</option>
            </select>
          </div>

          {/* SFT Model selections */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-[10.5px] font-mono font-bold text-zinc-400 uppercase">
              <span>Model Selected</span>
              <button
                type="button"
                onClick={() => setUseCustomModelInput(!useCustomModelInput)}
                className="text-[9px] text-zinc-400 hover:text-white transition-colors"
              >
                {useCustomModelInput ? "Select List" : "Manual Input"}
              </button>
            </div>

            {useCustomModelInput ? (
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="e.g. gemini-2.5-pro"
                  value={synthConfig?.model || ""}
                  onChange={(e) => saveSynthConfig({ model: e.target.value })}
                  className="w-full bg-[#050508] border border-[#ef4444]/20 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:border-[#ef4444] outline-none"
                />
              </div>
            ) : (
              <SearchableSelect
                options={availableModels}
                value={synthConfig?.model || ""}
                onChange={(val) => saveSynthConfig({ model: val })}
                placeholder={isFetchingModels ? "Loading models list..." : "Search model..."}
                disabled={isFetchingModels}
              />
            )}
          </div>
        </div>
      </div>

      {/* MIDDLE & RIGHT PANEL: Stats & Real-time Daemon Logs */}
      <div className="lg:col-span-2 space-y-6">
        
        {/* Tracker stats card */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[#0e0e14]/55 border border-white/5 p-4 rounded-2xl">
            <span className="text-[8px] font-mono text-zinc-400 block uppercase">Raw Chat Logs</span>
            <span className="text-xl font-bold text-white block mt-1">{synthState?.totalRaw || 0}</span>
          </div>
          <div className="bg-[#0e0e14]/55 border border-white/5 p-4 rounded-2xl">
            <span className="text-[8px] font-mono text-emerald-450 block uppercase">Synthesized SFT</span>
            <span className="text-xl font-bold text-emerald-400 block mt-1">{synthState?.synthesized || 0}</span>
          </div>
          <div className="bg-[#0e0e14]/55 border border-white/5 p-4 rounded-2xl">
            <span className="text-[8px] font-mono text-amber-500 block uppercase">Pending Tasks</span>
            <span className="text-xl font-bold text-amber-500 block mt-1">{synthState?.pending || 0}</span>
          </div>
          <div className="bg-[#0e0e14]/55 border border-white/5 p-4 rounded-2xl">
            <span className="text-[8px] font-mono text-zinc-400 block uppercase">Retry Count</span>
            <span className="text-xl font-bold text-zinc-300 block mt-1">{synthState?.retryCount || 0}</span>
          </div>
        </div>

        {/* Configurations Prompt overrides and System Settings */}
        <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-3xl space-y-4">
          <div className="flex justify-between items-center border-b border-white/5 pb-3">
            <div className="flex items-center gap-1.5">
              <Settings size={14} className="text-zinc-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wide">Synthesis Configuration Parameters</span>
            </div>
            {isSynthSaving && <span className="text-[9px] font-mono text-zinc-500">Auto-Saving...</span>}
          </div>

          <div className="space-y-4 text-xs">
            <div className="space-y-1">
              <span className="text-[10px] text-zinc-400 font-mono block uppercase">Base System Prompt Override</span>
              <textarea
                rows={3}
                value={synthConfig?.systemPrompt || ""}
                onChange={(e) => saveSynthConfig({ systemPrompt: e.target.value })}
                className="w-full bg-[#07070a] border border-white/5 rounded-xl p-2.5 text-[10px] text-zinc-300 font-mono focus:outline-none focus:border-rose-500 resize-none leading-normal"
                placeholder="Core instructor parameters..."
              />
            </div>

            <div className="space-y-1">
              <span className="text-[10px] text-zinc-400 font-mono block uppercase">Thought Output Layout template</span>
              <textarea
                rows={2}
                value={synthConfig?.thoughtTemplate || ""}
                onChange={(e) => saveSynthConfig({ thoughtTemplate: e.target.value })}
                className="w-full bg-[#07070a] border border-white/5 rounded-xl p-2.5 text-[10px] text-zinc-300 font-mono focus:outline-none focus:border-rose-500 resize-none leading-normal"
                placeholder="Instructing standard thoughts..."
              />
            </div>
          </div>
        </div>

        {/* Realtime Daemon Logs Output Console */}
        <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-3xl space-y-4 text-left">
          <div className="flex justify-between items-center border-b border-white/5 pb-3">
            <div className="flex items-center gap-2">
              <Terminal size={15} className="text-rose-500" />
              <span className="text-xs font-bold text-white uppercase tracking-wide">Daemon Live Activity stream</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handleSynthControl('retry_pool')}
                className="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-white font-mono text-[9px] uppercase tracking-wider rounded-lg transition-all cursor-pointer border border-white/5 flex items-center gap-1"
              >
                <RefreshCw size={10} /> Retry pool
              </button>
              <button
                onClick={() => handleSynthControl('reset')}
                className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-mono text-[9px] uppercase tracking-wider rounded-lg transition-all cursor-pointer border border-rose-500/10 flex items-center gap-1"
              >
                Reset Engine
              </button>
            </div>
          </div>

          <div className="bg-[#040406] border border-white/5 rounded-2xl p-4 h-56 overflow-y-auto font-mono text-[9px] leading-relaxed text-zinc-400 space-y-1">
            {synthLogs.length === 0 ? (
              <span className="italic text-zinc-650">Awaiting daemon trigger activity logs...</span>
            ) : (
              synthLogs.map((log, index) => (
                <div key={index} className="text-zinc-300 select-text">
                  &gt; {log}
                </div>
              ))
            )}
          </div>

          {synthState?.lastError && (
            <div className="p-3 bg-rose-500/5 border border-rose-500/10 rounded-xl text-[9.5px] text-rose-400 font-mono leading-normal flex gap-2">
              <AlertTriangle className="shrink-0 mt-0.5" size={13} />
              <div>
                <span className="font-extrabold block mb-0.5">LAST RECORDED FAILURE:</span>
                {synthState.lastError}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
