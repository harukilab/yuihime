import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, Activity, Terminal, Database, Search, X } from 'lucide-react';
import { CoreKnowledge } from '../include/types';

interface KnowledgeTabProps {
  knowledge: CoreKnowledge[];
  handleExtractKnowledge: () => void;
  isThinking: boolean;
  logs?: any[];
  backgroundLogs?: any[];
}

export const KnowledgeTab: React.FC<KnowledgeTabProps> = ({ 
  knowledge, 
  handleExtractKnowledge, 
  isThinking,
  logs = [],
  backgroundLogs = []
}) => {
  const [view, setView] = useState<'concepts' | 'logs'>('concepts');
  const [showSystemLogs, setShowSystemLogs] = useState(false);

  return (
    <motion.div 
      key="knowledge"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 p-4 md:p-12 overflow-y-auto"
    >
      <div className="max-w-5xl mx-auto w-full">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-12">
          <div>
            <h2 className="text-xs uppercase tracking-[0.3em] text-white/30 mb-2 font-mono italic">Cognitive Inventory // yui-database</h2>
            <h1 className="text-4xl font-serif text-white italic tracking-wide">Learned Matrix</h1>
          </div>

          <div className="flex bg-white/5 p-1 rounded-xl border border-white/5 self-end">
            <button 
              onClick={() => setView('concepts')}
              className={`px-4 py-2 rounded-lg text-[10px] uppercase font-mono tracking-widest transition-all ${view === 'concepts' ? 'bg-amber-500 text-black font-bold' : 'text-white/40 hover:text-white'}`}
            >
              <Database size={14} className="inline mr-2" /> Concepts
            </button>
            <button 
              onClick={() => setView('logs')}
              className={`px-4 py-2 rounded-lg text-[10px] uppercase font-mono tracking-widest transition-all ${view === 'logs' ? 'bg-amber-500 text-black font-bold' : 'text-white/40 hover:text-white'}`}
            >
              <Terminal size={14} className="inline mr-2" /> Neural Logs
            </button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {view === 'concepts' ? (
            <motion.div
              key="concepts-view"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-8"
            >
              <div className="flex justify-end">
                <button 
                  onClick={handleExtractKnowledge}
                  disabled={isThinking}
                  className="flex items-center gap-2 px-6 py-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-500 text-[10px] font-mono uppercase tracking-widest hover:bg-amber-500/20 transition-all disabled:opacity-30"
                >
                  <RefreshCw size={14} className={isThinking ? 'animate-spin' : ''} />
                  Refresh Matrix
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {knowledge.map((k) => (
                  <div key={k.id} className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-amber-500/30 transition-all group">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500">
                           <Activity size={18} />
                        </div>
                        <div>
                          <h3 className="text-white font-medium">{k.topic}</h3>
                          <p className="text-[10px] text-white/30 font-mono uppercase tracking-tight">Confidence: {((k.confidence ?? 0) * 100).toFixed(1)}%</p>
                        </div>
                      </div>
                      <span className="text-[9px] text-white/20 font-mono">{new Date(k.updatedAt).toLocaleDateString()}</span>
                    </div>
                    <p className="text-sm text-white/60 leading-relaxed italic">{k.content}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {k.sourceMemoryIds.map((sid) => (
                        <span key={sid} className="text-[9px] bg-white/5 px-2 py-0.5 rounded text-white/30 font-mono">MEM_{sid.slice(-4)}</span>
                      ))}
                    </div>
                  </div>
                ))}
                {knowledge.length === 0 && (
                  <div className="col-span-full py-24 text-center border border-dashed border-white/10 rounded-3xl">
                     <p className="text-white/20 font-serif italic text-xl">No knowledge has been extracted from the neural stream yet.</p>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="logs-view"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-6"
            >
              <div className="flex justify-between items-center bg-white/5 p-4 rounded-xl border border-white/5">
                <div className="text-[10px] uppercase font-mono text-white/40 tracking-widest">Global Telemetry Stream</div>
                <div className="flex items-center gap-3">
                  <label className="text-[9px] uppercase font-mono text-white/20">Show Internal Cycles</label>
                  <button 
                    onClick={() => setShowSystemLogs(!showSystemLogs)}
                    className={`w-10 h-5 rounded-full transition-all relative ${showSystemLogs ? 'bg-amber-500' : 'bg-white/10'}`}
                  >
                    <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${showSystemLogs ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>
              </div>

              <div className="bg-black/40 rounded-2xl border border-white/5 overflow-hidden">
                <div className="max-h-[600px] overflow-y-auto p-4 space-y-2 font-mono custom-scrollbar">
                  {(showSystemLogs ? backgroundLogs : logs).length === 0 ? (
                    <div className="py-12 text-center text-white/20 italic text-sm">No telemetry detected in this band.</div>
                  ) : (
                    (showSystemLogs ? backgroundLogs : logs).map((log, i) => (
                      <div key={i} className="flex gap-4 items-start text-[10px] p-2 hover:bg-white/[0.02] rounded transition-colors group">
                        <span className="text-white/10 shrink-0 w-16">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                        <span className={`shrink-0 w-12 font-bold ${log.type === 'user' ? 'text-blue-400' : 'text-amber-500/80'}`}>{log.type.toUpperCase()}</span>
                        <span className="text-white/60 group-hover:text-white/90 transition-colors whitespace-pre-wrap">{log.content}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
