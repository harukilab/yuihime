/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ShieldAlert } from 'lucide-react';

interface DataSectionTabProps {
  settings: any;
  setSettings: (val: any) => void;
}

export const DataSectionTab: React.FC<DataSectionTabProps> = ({ settings, setSettings }) => {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
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

      {/* Chat Sessions Card Segment */}
      <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl space-y-4">
        <div>
          <h5 className="text-sm font-bold text-white tracking-wide">Chats</h5>
          <p className="text-[11px] text-zinc-500">Export or import conversation sessions.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button 
            type="button"
            onClick={async () => {
              try {
                const [historyRes, memoriesRes] = await Promise.all([
                  fetch('/api/storage/history'),
                  fetch('/api/storage/memories')
                ]);
                const history = await historyRes.json();
                const memories = await memoriesRes.json();
                
                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ history, memories }, null, 2));
                const downloadAnchor = document.createElement('a');
                downloadAnchor.setAttribute("href", dataStr);
                downloadAnchor.setAttribute("download", `yuihime_chat_export_${Date.now()}.json`);
                document.body.appendChild(downloadAnchor);
                downloadAnchor.click();
                downloadAnchor.remove();
                setToast({ message: "Conversations exported successfully! ✨", type: 'success' });
              } catch (err: any) {
                setToast({ message: `Export failed: ${err.message}`, type: 'error' });
              }
            }}
            className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white/80 text-xs font-bold uppercase tracking-wider rounded-xl border border-white/5 transition-all text-center cursor-pointer font-sans"
          >
            Export chats
          </button>
          <button 
            type="button"
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.json';
              input.onchange = async (e: any) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = async (evt: any) => {
                  try {
                    const parsed = JSON.parse(evt.target.result);
                    if (!parsed.history && !parsed.memories) {
                      setToast({ message: "Invalid JSON format. File must contain 'history' or 'memories'.", type: 'error' });
                      return;
                    }

                    const res = await fetch('/api/storage/import', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        history: parsed.history || [],
                        memories: parsed.memories || []
                      })
                    });
                    const data = await res.json();
                    if (data.success) {
                      setToast({ message: "Chats successfully imported! Reloading...", type: 'success' });
                      setTimeout(() => window.location.reload(), 1500);
                    } else {
                      setToast({ message: `Import failed: ${data.error || 'Unknown error'}`, type: 'error' });
                    }
                  } catch (err: any) {
                    setToast({ message: `Read error: ${err.message}`, type: 'error' });
                  }
                };
                reader.readAsText(file);
              };
              input.click();
            }}
            className="flex-1 py-3 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 text-xs font-bold uppercase tracking-wider rounded-xl border border-teal-500/20 transition-all text-center cursor-pointer font-sans"
          >
            Import chats
          </button>
          <button 
            type="button"
            onClick={async () => {
              if (confirm("SEVERE ALERT: Are you absolutely sure you wish to permanently erase ALL stored chat histories and memories?")) {
                try {
                  const res = await fetch('/api/storage/purge', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mode: 'soft' })
                  });
                  const data = await res.json();
                  if (data.success) {
                    setToast({ message: "Chat history cleared successfully! Reloading...", type: 'success' });
                    setTimeout(() => window.location.reload(), 1500);
                  } else {
                    setToast({ message: `Purge failed: ${data.error}`, type: 'error' });
                  }
                } catch (err: any) {
                  setToast({ message: `Connection error: ${err.message}`, type: 'error' });
                }
              }
            }}
            className="py-3 px-5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold uppercase tracking-wider rounded-xl border border-rose-500/20 transition-all text-center cursor-pointer font-sans"
          >
            Purge chats
          </button>
        </div>
      </div>

      {/* Models Card Segment */}
      <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl space-y-4">
        <div>
          <h5 className="text-sm font-bold text-white tracking-wide">Avatars</h5>
          <p className="text-[11px] text-zinc-500">Reset Live2D/VRM custom avatar mappings.</p>
        </div>
        <button 
          type="button"
          onClick={() => {
            if (confirm("Remove models list registry mappings from localStorage web-cache?")) {
              localStorage.removeItem('yuihime_cached_models_v2');
              setToast({ message: "Model list wiped successfully! Reloading...", type: 'success' });
              setTimeout(() => window.location.reload(), 1500);
            }
          }}
          className="w-full sm:w-auto py-3 px-6 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold uppercase tracking-wider rounded-xl border border-rose-500/20 transition-all cursor-pointer font-sans"
        >
          Reset avatars
        </button>
      </div>

      {/* Modules Card Segment */}
      <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl space-y-4">
        <div>
          <h5 className="text-sm font-bold text-white tracking-wide">Parameters</h5>
          <p className="text-[11px] text-zinc-500">Reset active modular configurations back to defaults.</p>
        </div>
        <button 
          type="button"
          onClick={async () => {
            if (confirm("Reset dynamic neural routing and modular weights settings back to default configurations?")) {
              try {
                const preservedSettings = {
                  official_chat: settings.official_chat,
                  openrouter: settings.openrouter,
                  aihubmix: settings.aihubmix,
                  gemini: settings.gemini,
                  openai: settings.openai,
                  anthropic: settings.anthropic,
                  elevenlabs: settings.elevenlabs,
                  groq: settings.groq,
                  ollama: settings.ollama,
                  lmstudio: settings.lmstudio,
                };
                
                const res = await fetch('/api/settings', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(preservedSettings)
                });
                await res.json();
                setToast({ message: "Modules successfully reset to defaults! Reloading...", type: 'success' });
                setTimeout(() => window.location.reload(), 1500);
              } catch (err: any) {
                setToast({ message: `Reset failed: ${err.message}`, type: 'error' });
              }
            }
          }}
          className="w-full sm:w-auto py-3 px-6 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 text-xs font-bold uppercase tracking-wider rounded-xl border border-amber-500/20 transition-all cursor-pointer font-sans"
        >
          Reset modules
        </button>
      </div>

      {/* DANGER ZONE RED BORDERED BLOCK */}
      <div className="border border-rose-500/30 bg-rose-500/[0.02] p-6 rounded-2xl space-y-5 animate-fade-in">
        <div className="border-b border-rose-500/10 pb-2">
          <h4 className="text-sm font-bold text-rose-400 tracking-wide flex items-center gap-2 font-sans">
            <ShieldAlert size={16} /> Danger zone
          </h4>
          <p className="text-[11px] text-zinc-500 mt-0.5 font-sans">Irreversible. Export back-up snapshots beforehand.</p>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-white/5 pb-4">
          <div>
            <h5 className="text-xs font-bold text-white tracking-wide font-sans">API Credentials</h5>
            <p className="text-[10px] text-zinc-500 mt-1 font-sans">Wipe all stored API keys and custom providers settings.</p>
          </div>
          <button 
            type="button"
            onClick={() => {
              if (confirm("IRREVERSIBLE ALERT: Wipe all stored credentials, API Keys, and customized models settings?")) {
                setSettings({});
                setToast({ message: "Provider credentials cleared successfully!", type: 'success' });
              }
            }}
            className="py-2.5 px-5 bg-rose-600 hover:bg-rose-700 text-white text-[10px] uppercase font-mono tracking-widest rounded-xl transition-all cursor-pointer font-bold shrink-0 shadow-lg"
          >
            Clear credentials
          </button>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h5 className="text-xs font-bold text-white tracking-wide font-sans">Total Factory Reset</h5>
            <p className="text-[10px] text-zinc-500 mt-1 font-sans">Erase all localStorage, cached avatars, and full local states.</p>
          </div>
          <button 
            type="button"
            onClick={() => {
              if (confirm("TOTAL DESTRUCTION: This will completely clean all localStorage and indexDB registers. Wipe clean now?")) {
                localStorage.clear();
                setToast({ message: "Full database wiped. Redirecting...", type: 'success' });
                setTimeout(() => window.location.reload(), 1500);
              }
            }}
            className="py-2.5 px-5 bg-rose-600 hover:bg-rose-700 text-white text-[10px] uppercase font-mono tracking-widest rounded-xl transition-all cursor-pointer font-bold shrink-0 shadow-lg"
          >
            Wipe all data
          </button>
        </div>
      </div>
    </div>
  );
};
