import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Brain, ChevronRight, Activity, Terminal } from 'lucide-react';

interface Iteration {
  iteration: number;
  thought: string;
  observations: any[];
}

export const ReasoningDisplay: React.FC<{ iterations?: Iteration[] }> = ({ iterations }) => {
  if (!iterations || iterations.length === 0) return null;

  return (
    <div id="reasoning-display" className="space-y-4 max-w-2xl mx-auto mt-8 mb-20 pointer-events-auto">
      <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-2">
         <Activity size={14} className="text-amber-500 animate-pulse" />
         <span className="text-[10px] uppercase tracking-[0.3em] text-white/30 font-mono flex-1">Neural_Reasoning_Trace</span>
         {iterations.some(it => it.thought.toLowerCase().includes('research') || it.thought.toLowerCase().includes('searching')) && (
           <motion.div 
             initial={{ opacity: 0, x: 10 }}
             animate={{ opacity: 1, x: 0 }}
             className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded text-[8px] text-indigo-400 uppercase font-mono tracking-tighter"
           >
              <div className="w-1 h-1 bg-indigo-500 rounded-full animate-ping" />
              Autonomous Research Active
           </motion.div>
         )}
         {iterations.some(it => it.thought.toLowerCase().includes('[system_signal]')) && (
           <div className="bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded text-[8px] text-amber-500 uppercase font-mono tracking-tighter">
              Deep Thought Cycle
           </div>
         )}
      </div>
      
      <AnimatePresence>
        {iterations.map((it, idx) => (
          <motion.div 
            key={it.iteration}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.5, delay: idx * 0.1 }}
            className="bg-black/40 backdrop-blur-md border border-white/5 rounded-2xl p-6 relative overflow-hidden group"
          >
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
               <Terminal size={40} />
            </div>
            
            <div className="flex items-center gap-3 mb-4">
               <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 text-[10px] font-mono">
                  0{it.iteration}
               </div>
               <div className="h-[1px] flex-1 bg-white/5"></div>
            </div>

            <div className="grid gap-6">
               <div className="space-y-2">
                  <div className="text-[9px] uppercase tracking-widest text-white/20 font-mono">Thought_Process</div>
                  <p className="text-sm text-white/70 italic font-serif leading-relaxed tracking-wide">
                     {it.thought}
                  </p>
               </div>

               {it.observations && it.observations.length > 0 && (
                 <div className="space-y-3">
                    <div className="text-[9px] uppercase tracking-widest text-white/20 font-mono">Sensor_Feedback</div>
                    <div className="grid gap-2">
                       {it.observations.map((obs, i) => (
                         <div key={i} className="bg-white/[0.02] border border-white/5 p-3 rounded-xl flex items-start gap-3">
                            <ChevronRight size={14} className="text-amber-500/50 mt-0.5" />
                            <div className="flex-1">
                               <div className="text-[9px] font-mono text-white/40 mb-1">SRC: {obs.tool}</div>
                               <div className="text-xs text-white/60 font-mono break-all line-clamp-3 overflow-hidden text-ellipsis">
                                  {typeof obs.observation === 'string' ? obs.observation : JSON.stringify(obs.observation)}
                               </div>
                            </div>
                         </div>
                       ))}
                    </div>
                 </div>
               )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
