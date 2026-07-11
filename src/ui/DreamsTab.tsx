import React from 'react';
import { motion } from 'motion/react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { Dream } from '../include/types';

interface DreamsTabProps {
  dreams: Dream[];
  handleConsolidate: () => void;
  handleDream: () => void;
  isThinking: boolean;
}

export const DreamsTab: React.FC<DreamsTabProps> = ({ dreams, handleConsolidate, handleDream, isThinking }) => {
  return (
    <motion.div 
      key="dreams"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 p-4 md:p-12 overflow-y-auto flex flex-col z-10 scrollbar-hide"
    >
      <div className="max-w-5xl mx-auto">
        <header className="mb-16 flex flex-col md:flex-row justify-between items-start gap-6">
          <div>
            <h2 className="text-xs uppercase tracking-[0.3em] text-amber-500/60 mb-2 font-mono">Process 0x02 // Latent Space</h2>
            <h1 className="text-4xl font-serif text-white italic tracking-wide">Synthesis Space</h1>
            <p className="text-white/40 text-sm mt-4 max-w-sm font-sans tracking-wide leading-relaxed">Synthesizing high-level abstractions from the current memory buffer.</p>
          </div>
        {dreams.length >= 3 && (
          <button 
            onClick={handleConsolidate}
            disabled={isThinking}
            className="px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-[10px] uppercase tracking-[0.2em] text-white/60 hover:text-white hover:bg-white/10 transition-all flex items-center gap-3 disabled:opacity-50"
          >
            <RefreshCw size={14} className={isThinking ? 'animate-spin' : ''} />
            Consolidate Neural Matrix
          </button>
        )}
      </header>

      {dreams.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="w-64 h-64 border border-dashed border-white/10 rounded-full flex items-center justify-center group cursor-pointer" onClick={handleDream}>
             <div className="text-center group-hover:scale-105 transition-transform duration-500">
               <div className="text-amber-500 font-serif italic text-3xl mb-1 group-hover:text-amber-400">Initialize...</div>
               <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Latent Dreaming</div>
             </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl">
          {(dreams || []).map((d, i) => (
            <div key={d.id || `dream-${i}`} className="bg-white/[0.03] p-8 rounded-3xl border border-white/5 relative overflow-hidden group hover:border-amber-500/30 transition-colors">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-1000" />
              <h3 className="text-2xl font-serif text-white mb-6 italic tracking-wide">{d.concept}</h3>
              <div className="space-y-4">
                {(d.abstractions || []).map((a, i) => (
                  <div key={i} className="flex gap-4 items-start text-sm text-white/60 font-sans tracking-wide leading-relaxed group-hover:text-white/80 transition-colors">
                    <span className="text-amber-500 mt-1.5 w-1 h-1 rounded-full shrink-0" />
                    <p>{a}</p>
                  </div>
                ))}
              </div>
              <div className="mt-8 flex justify-between items-end border-t border-white/5 pt-4">
                <div className="text-[10px] font-mono text-white/20 uppercase tracking-widest">Strength: {((d.strength ?? 0) * 100).toFixed(1)}%</div>
                <Sparkles size={14} className="text-amber-500/40" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    </motion.div>
  );
};
