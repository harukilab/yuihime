import React from 'react';
import { motion } from 'motion/react';
import { RefreshCw, Brain, Copy, Check, Download } from 'lucide-react';
import { ReasoningDisplay } from './ReasoningDisplay';

interface ArchiveTabProps {
  logs: any[];
  backgroundLogs: any[];
  memories: any[];
  showSystemLogs: boolean;
  setShowSystemLogs: (val: boolean) => void;
  reasoningIterations: any[];
  activeSessionId?: string;
}

export const ArchiveTab: React.FC<ArchiveTabProps> = ({ logs, backgroundLogs, memories, showSystemLogs, setShowSystemLogs, reasoningIterations, activeSessionId = 'default' }) => {
  const [copiedAll, setCopiedAll] = React.useState(false);
  const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null);
  const [visibleCount, setVisibleCount] = React.useState(20);

  // Combine transient session logs with persistent database memories
  // We avoid duplicates by timestamp/content if needed, but simple combine is usually okay for trace
  const memoryLogs = memories
    .filter(m => {
      const isSystem = m.speaker === 'System' || m.context === 'cron_trigger';
      const isSocialMedia = m.context && (m.context.startsWith('tg_') || m.context.startsWith('dc_'));
      const isOurContext = m.context === `web_${activeSessionId}` || m.context === activeSessionId;
      return isOurContext && !isSocialMedia;
    })
    .map(m => ({
      type: (m.speaker === 'agent' || m.speaker === 'System') ? 'agent' : 'user', // Heuristic
      content: m.content,
      timestamp: m.timestamp,
      isSystem: m.type === 'fact' || m.speaker === 'System' || (m.content && (m.content.startsWith('[') || m.content.includes('[SYSTEM') || m.content.includes('[TOOL') || m.content.includes('[CORTEX') || m.content.includes('[PHASE') || m.content.includes('[LOG]') || m.content.includes('Tool [')))
    }));

  const allLogs = showSystemLogs 
    ? [...logs, ...backgroundLogs, ...memoryLogs]
    : [...logs, ...memoryLogs.filter(m => !m.isSystem)];

  // Sort and remove duplicates based on text + timestamp (crude but effective)
  const uniqueLogs = Array.from(new Map(allLogs.map(l => [`${l.timestamp}-${l.content}`, l])).values())
    .sort((a, b) => a.timestamp - b.timestamp);

  const totalLogsCount = uniqueLogs.length;
  const slicedLogs = uniqueLogs.slice(-visibleCount);
  const hiddenLogsCount = totalLogsCount - visibleCount;

  const cleanDisplayContent = (text: any) => {
    let str = String(text || '');
    if (str.trim().startsWith('{') && str.trim().endsWith('}')) {
      try {
        const parsed = JSON.parse(str);
        if (parsed.messages && Array.isArray(parsed.messages) && parsed.messages[0]) {
          str = parsed.messages[0].content || '';
        } else if (parsed.content) {
          str = parsed.content;
        }
      } catch {
        // Not JSON
      }
    }
    return str
      .replace(/\[PRE-PROCESS: ENFORCE_JSON_ONLY\]/g, '')
      .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
      .replace(/<\/?final_answer>/gi, '')
      .trim();
  };

  const downloadDataset = () => {
    // Collect all chat-relevant logs (ignore system logs)
    const chatLogs = uniqueLogs.filter(log => !log.isSystem && (log.type === 'user' || log.type === 'agent'));
    
    // Map logs into proper JSONL format
    const jsonlLines = chatLogs.map(log => {
      const contentStr = String(log.content || '').trim();
      
      // If we already formatted it in preparation during the session, output directly
      if (contentStr.startsWith('{') && contentStr.endsWith('}')) {
        try {
          const parsed = JSON.parse(contentStr);
          if (parsed.messages && Array.isArray(parsed.messages)) {
            return JSON.stringify(parsed);
          }
        } catch {
          // not valid JSON
        }
      }
      
      // Wrap as typical OpenAI conversational chat format line
      const role = log.type === 'user' ? 'user' : 'assistant';
      return JSON.stringify({
        messages: [
          { role, content: contentStr }
        ]
      });
    });

    const fileContent = jsonlLines.join('\n');
    const blob = new Blob([fileContent], { type: 'application/x-jsonlines;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `yuihime_session_${activeSessionId || 'default'}_dataset.jsonl`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const copyAllToClipboard = () => {
    if (uniqueLogs.length === 0) return;
    const formatted = uniqueLogs.map((log) => {
      const time = new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const sender = log.type === 'user' ? 'Biological' : log.isSystem ? 'Kernel' : 'Echo';
      const cleanContent = cleanDisplayContent(log.content);
      return `[${time}] ${sender}:\n${cleanContent}\n`;
    }).join('\n');
    
    navigator.clipboard.writeText(formatted);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const copyIndividual = (text: string, index: number) => {
    navigator.clipboard.writeText(cleanDisplayContent(text));
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <motion.div 
      key="archive"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 p-4 md:p-12 overflow-y-auto z-10 scrollbar-hide"
    >
      <div className="max-w-5xl mx-auto">
        <header className="mb-12 flex flex-col md:flex-row md:items-end md:justify-between gap-6 pb-6 border-b border-white/5">
          <div>
            <h2 className="text-[10px] uppercase tracking-[0.4em] text-amber-500/50 mb-2 font-mono">Archive // Global Buffer</h2>
            <h1 className="text-4xl md:text-6xl font-serif text-white italic tracking-tight">Signal History</h1>
            <p className="text-white/40 text-xs md:text-sm mt-4 max-w-sm font-sans tracking-wide leading-relaxed italic">
              Biological command sequences and neural resonance patterns.
            </p>
          </div>
          {uniqueLogs.length > 0 && (
            <div className="flex flex-wrap gap-3 self-start md:self-end">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={downloadDataset}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 hover:bg-cyan-500/10 hover:border-cyan-500/40 text-cyan-400 hover:text-cyan-300 text-xs font-mono uppercase tracking-widest transition-all cursor-pointer"
              >
                <Download size={14} />
                <span>Unduh Dataset</span>
              </motion.button>
              
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={copyAllToClipboard}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20 text-white/80 hover:text-white text-xs font-mono uppercase tracking-widest transition-all cursor-pointer"
              >
                {copiedAll ? (
                  <>
                    <Check size={14} className="text-emerald-500" />
                    <span>Sinyal Tersalin</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} className="text-amber-500" />
                    <span>Salin Semua Sinyal</span>
                  </>
                )}
              </motion.button>
            </div>
          )}
        </header>

        {/* Neural Reasoning Trace Section */}
        {reasoningIterations && reasoningIterations.length > 0 && (
          <div className="mb-12">
            <div className="flex items-center gap-2 mb-6">
              <div className="p-1.5 bg-amber-500/10 rounded-lg border border-amber-500/20">
                <Brain size={16} className="text-amber-500" />
              </div>
              <h3 className="text-xs uppercase tracking-[0.3em] font-mono text-white/50">Neural Reasoning Trace</h3>
            </div>
            <div className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-6 max-h-[400px] overflow-y-auto scrollbar-hide">
              <ReasoningDisplay iterations={reasoningIterations} />
            </div>
          </div>
        )}

        <div className="space-y-4">
          {hiddenLogsCount > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center p-6 mb-6 rounded-3xl bg-white/[0.01] border border-white/5 text-center"
            >
              <span className="text-[10px] uppercase font-mono tracking-widest text-white/30 mb-3">
                Tersembunyi {hiddenLogsCount} sinyal kognitif terdahulu
              </span>
              <div className="flex flex-wrap gap-3 justify-center">
                <button
                  onClick={() => setVisibleCount(prev => prev + 25)}
                  className="px-4 py-2 text-[10px] font-mono uppercase tracking-widest text-amber-500/80 hover:text-amber-400 bg-amber-500/[0.04] hover:bg-amber-500/[0.08] border border-amber-500/20 hover:border-amber-500/40 rounded-xl transition-all cursor-pointer"
                >
                  + Muat 25 Sinyal
                </button>
                <button
                  onClick={() => setVisibleCount(totalLogsCount)}
                  className="px-4 py-2 text-[10px] font-mono uppercase tracking-widest text-white/50 hover:text-white bg-white/[0.02] hover:bg-white/[0.06] border border-white/10 hover:border-white/20 rounded-xl transition-all cursor-pointer"
                >
                  Tampilkan Semua ({totalLogsCount})
                </button>
              </div>
            </motion.div>
          )}

          {slicedLogs.length > 0 ? (
            slicedLogs.map((log, i) => (
              <motion.div 
                key={`${log.timestamp}-${i}`} 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.01, 0.5) }}
                className={`group flex flex-col ${log.type === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div className={`text-[9px] font-mono mb-1 text-white/20 group-hover:text-white/40 transition-colors ${log.type === 'user' ? 'mr-4' : 'ml-4'}`}>
                  {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </div>
                <div className={`relative max-w-[90%] md:max-w-2xl p-5 rounded-2xl md:rounded-3xl transition-all border ${
                  log.type === 'user' 
                    ? 'bg-amber-500/5 border-amber-500/20 text-white rounded-tr-none' 
                    : 'bg-white/[0.02] border-white/5 text-white/80 rounded-tl-none group-hover:bg-white/[0.04] group-hover:border-white/10'
                }`}>
                  <div className="flex items-center justify-between gap-8 mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-1 h-1 rounded-full ${log.type === 'user' ? 'bg-amber-500 animate-pulse' : 'bg-cyan-500'}`} />
                      <div className="text-[9px] uppercase tracking-[0.2em] text-white/30 font-mono">
                        {log.type === 'user' ? 'Biological' : log.isSystem ? 'Kernel' : 'Echo'}
                      </div>
                    </div>
                    <button
                      onClick={() => copyIndividual(log.content, i)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 bg-white/[0.04] hover:bg-white/15 rounded-lg text-white/40 hover:text-white/80 relative"
                      title="Salin pesan ini"
                    >
                      {copiedIndex === i ? (
                        <Check size={12} className="text-emerald-500" />
                      ) : (
                        <Copy size={12} />
                      )}
                    </button>
                  </div>
                  <p className={`text-sm md:text-base ${log.type === 'agent' && !log.isSystem ? 'font-serif italic leading-relaxed' : 'font-sans leading-normal opacity-90'}`}>
                    {cleanDisplayContent(log.content)}
                  </p>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="py-40 text-center bg-white/[0.02] border border-dashed border-white/5 rounded-[2rem]">
               <RefreshCw size={32} className="mx-auto text-white/10 mb-6 animate-spin-slow" />
               <p className="text-white/20 font-serif italic text-lg tracking-wider">Synchronization buffer depleted.</p>
               <p className="text-white/10 text-[10px] mt-2 uppercase tracking-widest font-mono">Waiting for neural activity...</p>
            </div>
          )}
        </div>
        
        <div className="h-24" />
      </div>
    </motion.div>
  );
};
