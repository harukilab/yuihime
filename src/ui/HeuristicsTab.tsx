import React from 'react';
import { motion } from 'motion/react';
import { RefreshCw, Cpu } from 'lucide-react';

interface HeuristicsTabProps {
  heuristics: any[];
  handleOptimize: () => void;
  isLearning: boolean;
}

export const HeuristicsTab: React.FC<HeuristicsTabProps> = ({ heuristics, handleOptimize, isLearning }) => {
  return (
    <motion.div 
      key="heuristics"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="flex-1 p-6 overflow-y-auto flex flex-col z-10"
    >
      <div className="flex justify-end mb-6">
        <button 
          onClick={handleOptimize}
          disabled={isLearning}
          className="px-6 py-2 bg-white/5 border border-white/10 rounded-xl flex items-center gap-4 hover:bg-white/10 hover:border-amber-500/30 transition-all group disabled:opacity-30"
        >
          <RefreshCw size={14} className={`${isLearning ? 'animate-spin text-amber-500' : 'text-white/40 group-hover:text-amber-500'}`} />
          <span className="text-[10px] uppercase tracking-widest font-bold font-mono">Run Optimization</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
        {(!heuristics || heuristics.length === 0) && (
           <div className="col-span-full border-2 border-dashed border-white/5 py-40 rounded-[2rem] text-center bg-white/[0.01]">
              <Cpu size={48} className="mx-auto text-white/5 mb-6" />
              <h3 className="font-serif italic text-2xl text-white/20 mb-2 lowercase">heuristics.buffer.null</h3>
              <p className="text-xs text-white/10 uppercase tracking-[0.2em]">Strategy pool is currently empty. Execute interactions to seed.Buffer</p>
           </div>
        )}
        {(heuristics || []).map((s) => (
          <div key={s.id} className="bg-white/[0.03] p-8 rounded-[2rem] border border-white/5 relative overflow-hidden group hover:border-emerald-500/20 transition-all">
            <div className="absolute top-0 right-0 p-6 pointer-events-none">
               <div className="text-[40px] font-serif italic text-white/[0.02] leading-none select-none uppercase">{s.topic.split('_')[0]}</div>
            </div>
            
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-2 h-2 rounded-full ${s.confidence > 0.8 ? 'bg-emerald-500' : s.confidence > 0.5 ? 'bg-amber-500' : 'bg-red-500'} shadow-[0_0_8px_rgba(16,185,129,0.2)]`} />
              <h4 className="text-[10px] font-mono text-white/40 uppercase tracking-widest">{s.topic}</h4>
            </div>

            <p className="text-sm text-white/80 font-sans tracking-wide leading-relaxed mb-8 min-h-[4.5rem] italic">{s.instruction}</p>

            <div className="space-y-4">
              <div className="flex justify-between items-center text-[9px] font-mono uppercase tracking-tighter">
                 <span className="text-white/20">Confidence_Factor</span>
                 <span className="text-white/80">{((s.confidence ?? 0) * 100).toFixed(0)}%</span>
              </div>
              <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                 <motion.div 
                   initial={{ width: 0 }}
                   animate={{ width: `${(s.confidence ?? 0) * 100}%` }}
                   className={`h-full ${s.confidence > 0.8 ? 'bg-emerald-500' : 'bg-amber-500/50'}`}
                 />
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-white/5 flex justify-between items-center text-[10px] font-mono uppercase text-white/30">
              <div className="flex gap-4">
                 <span className="text-emerald-500/40">S:{s.successCount}</span>
                 <span className="text-red-500/40">F:{s.failureCount}</span>
              </div>
              <span>Opt: {new Date(s.lastOptimized).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
};
