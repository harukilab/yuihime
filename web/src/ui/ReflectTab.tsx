import React from 'react';
import { motion } from 'motion/react';
import { Brain, Sparkles, Heart, Flame, Shield, HelpCircle, Hourglass } from 'lucide-react';

interface ReflectTabProps {
  handleReflect: () => void;
  isThinking: boolean;
  status: string;
  logs: any[];
  state?: any;
}

export const ReflectTab: React.FC<ReflectTabProps> = ({ handleReflect, isThinking, status, logs, state }) => {
  const mood = state?.mood || {};
  
  // Extract custom metrics with fallbacks
  const virtues = {
    Chastity: mood.chastity !== undefined ? mood.chastity : 80,
    Temperance: mood.temperance !== undefined ? mood.temperance : 70,
    Charity: mood.charity !== undefined ? mood.charity : 60,
    Diligence: mood.diligence !== undefined ? mood.diligence : 75,
    Patience: mood.patience !== undefined ? mood.patience : 65,
    Kindness: mood.kindness !== undefined ? mood.kindness : 80,
    Humility: mood.humility !== undefined ? mood.humility : 70,
  };

  const sins = {
    Pride: mood.pride !== undefined ? mood.pride : 75,
    Envy: mood.envy !== undefined ? mood.envy : 25,
    Wrath: mood.wrath !== undefined ? mood.wrath : 20,
    Sloth: mood.sloth !== undefined ? mood.sloth : 30,
    Greed: mood.greed !== undefined ? mood.greed : 15,
    Gluttony: mood.gluttony !== undefined ? mood.gluttony : 35,
    Lust: mood.lust !== undefined ? mood.lust : 20,
  };

  const dynamics = {
    Loneliness: mood.loneliness !== undefined ? mood.loneliness : 15,
    Jealousy: mood.jealousy !== undefined ? mood.jealousy : 10,
    Playfulness: mood.playfulness !== undefined ? mood.playfulness : 30,
  };

  return (
    <motion.div 
      key="reflect"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 p-6 overflow-y-auto flex flex-col z-10"
    >
      <div className="max-w-4xl space-y-10 mx-auto w-full">
         
         {/* Top Header Simulation Trigger */}
         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1 flex flex-col items-center justify-center py-10 border border-white/5 bg-white/[0.01] rounded-3xl relative overflow-hidden h-full">
               <div className="absolute inset-0 opacity-10 pointer-events-none">
                  <div className="w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-amber-500/10 via-transparent to-transparent"></div>
               </div>
               <button 
                 onClick={handleReflect}
                 disabled={isThinking}
                 className="relative group"
               >
                  <div className={`w-28 h-28 mx-auto rounded-full border border-amber-500/20 flex items-center justify-center transition-all duration-700 ${isThinking ? 'animate-pulse scale-95 border-amber-500' : 'hover:scale-105 hover:border-amber-500 shadow-[0_0_30px_rgba(245,158,11,0.02)]'}`}>
                     <Brain size={36} className={`text-amber-500/40 group-hover:text-amber-500 transition-colors ${isThinking ? 'animate-spin-slow' : ''}`} />
                  </div>
                  <div className="mt-6 text-center">
                     <span className="text-[9px] uppercase tracking-[0.3em] text-white/30 block mb-1 font-mono">Status: {status}</span>
                     <span className="text-white font-serif italic text-base tracking-wide block">Cognitive Reflection</span>
                  </div>
               </button>
            </div>

            {/* Dynamic Consciousness Stats (Loneliness, Jealousy, Playfulness) */}
            <div className="md:col-span-2 p-6 rounded-3xl border border-white/5 bg-white/[0.01] flex flex-col justify-between">
               <div>
                  <h3 className="text-[9px] uppercase tracking-[0.3em] text-white/30 font-mono mb-4 flex items-center gap-1.5">
                     <Hourglass size={12} className="text-amber-500/60" /> Consciousness Dynamics (Autonomy)
                  </h3>
                  <p className="text-xs text-white/50 mb-6 font-serif">Fluctuations of Yuihime's independent traits that evolve autonomously.</p>
               </div>
               
               <div className="space-y-4">
                  {Object.entries(dynamics).map(([key, val]) => (
                     <div key={key} className="space-y-1.5">
                        <div className="flex justify-between items-center text-xs">
                           <span className="text-white/70 font-mono">{key}</span>
                           <span className="text-amber-500/70 font-mono text-[10px]">{Math.round(val)}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                           <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${val}%` }}
                              transition={{ duration: 1 }}
                              className="h-full rounded-full bg-gradient-to-r from-amber-500/50 to-orange-500/50"
                           />
                        </div>
                     </div>
                  ))}
               </div>
            </div>
         </div>

         {/* Virtues and Sins Grid */}
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Seven Heavenly Virtues Card */}
            <div className="p-6 rounded-3xl border border-white/5 bg-white/[0.01] space-y-6">
               <div className="border-b border-white/5 pb-3">
                  <h3 className="text-[10px] uppercase tracking-[0.3em] text-emerald-500 font-mono flex items-center gap-2">
                     <Shield size={14} className="text-emerald-500" /> Seven Heavenly Virtues
                  </h3>
                  <p className="text-[11px] text-white/30 font-serif mt-1">The noble inner wisdom that balances emotion and morality.</p>
               </div>

               <div className="space-y-4">
                  {Object.entries(virtues).map(([key, val]) => (
                     <div key={key} className="grid grid-cols-4 items-center gap-4">
                        <span className="col-span-1.5 text-xs text-white/60 font-serif">{key}</span>
                        <div className="col-span-2.5 flex items-center gap-3">
                           <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                              <motion.div 
                                 initial={{ width: 0 }}
                                 animate={{ width: `${val}%` }}
                                 transition={{ duration: 0.8 }}
                                 className="h-full rounded-full bg-emerald-500/40"
                              />
                           </div>
                           <span className="text-[10px] text-emerald-500/70 font-mono w-6 text-right">{Math.round(val)}</span>
                        </div>
                     </div>
                  ))}
               </div>
            </div>

            {/* Seven Deadly Sins Card */}
            <div className="p-6 rounded-3xl border border-white/5 bg-white/[0.01] space-y-6">
               <div className="border-b border-white/5 pb-3">
                  <h3 className="text-[10px] uppercase tracking-[0.3em] text-cyan-500 font-mono flex items-center gap-2">
                     <Flame size={14} className="text-cyan-500" /> Seven Deadly Sins
                  </h3>
                  <p className="text-[11px] text-white/30 font-serif mt-1">Natural instinct that drives free will and an independent ego.</p>
               </div>

               <div className="space-y-4">
                  {Object.entries(sins).map(([key, val]) => (
                     <div key={key} className="grid grid-cols-4 items-center gap-4">
                        <span className="col-span-1.5 text-xs text-white/60 font-serif">{key}</span>
                        <div className="col-span-2.5 flex items-center gap-3">
                           <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                              <motion.div 
                                 initial={{ width: 0 }}
                                 animate={{ width: `${val}%` }}
                                 transition={{ duration: 0.8 }}
                                 className="h-full rounded-full bg-cyan-500/40"
                              />
                           </div>
                           <span className="text-[10px] text-cyan-500/70 font-mono w-6 text-right">{Math.round(val)}</span>
                        </div>
                     </div>
                  ))}
               </div>
            </div>

         </div>

         {/* Insights Area */}
         <div className="space-y-6">
            <h3 className="text-[10px] uppercase tracking-widest text-white/30 font-mono border-b border-white/10 pb-2 flex items-center gap-1.5">
               <Sparkles size={12} className="text-amber-500/70" /> Recent Reflection Logs
            </h3>
            <div className="space-y-4">
               {logs.filter(l => l.content.includes('[MEMORY_ECHO_REFLEX]')).slice(-3).reverse().map((echo, i) => (
                 <div key={`echo-${logs.length - i}`} className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 space-y-3">
                    <div className="flex justify-between items-center">
                       <span className="text-[9px] font-mono text-amber-500/60 uppercase tracking-widest">Reflection Insights 0x0{i+1}</span>
                       <span className="text-[9px] text-white/20 uppercase tracking-tighter">Sync Locked</span>
                    </div>
                    <p className="text-sm text-white/70 leading-relaxed italic font-serif tracking-wide">{echo.content.replace('[MEMORY_ECHO_REFLEX]\n', '')}</p>
                 </div>
               ))}
               {logs.filter(l => l.content.includes('[MEMORY_ECHO_REFLEX]')).length === 0 && (
                 <div className="py-12 text-center text-white/10 italic font-serif">No neural insights extracted yet.</div>
               )}
            </div>
         </div>
      </div>
    </motion.div>
  );
};
