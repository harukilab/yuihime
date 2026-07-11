import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, X } from 'lucide-react';
import { AgentState } from '../../include/types';

interface SpontaneousConfig {
  enableSpontaneousSpam: boolean;
  probabilisticTriggerChance: number;
  cooldownInterval: number;
}

interface RelationAndSpontaneousDrawerProps {
  isOtomeDrawerOpen: boolean;
  setIsOtomeDrawerOpen: (show: boolean) => void;
  otomeHeartPulse: boolean;
  perceivedName: string;
  state: AgentState;
  spontaneousConfig: SpontaneousConfig;
  handleSaveSpontaneousSetting: (config: Partial<SpontaneousConfig>) => void;
}

export const RelationAndSpontaneousDrawer: React.FC<RelationAndSpontaneousDrawerProps> = ({
  isOtomeDrawerOpen,
  setIsOtomeDrawerOpen,
  otomeHeartPulse,
  perceivedName,
  state,
  spontaneousConfig,
  handleSaveSpontaneousSetting
}) => {
  return (
    <AnimatePresence>
      {isOtomeDrawerOpen && (
        <>
          {/* Backdrop click cover */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOtomeDrawerOpen(false)}
            className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 cursor-pointer"
          />

          {/* Bottom sheet drawer */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            className="fixed inset-x-0 bottom-0 max-h-[92vh] rounded-t-[32px] bg-[#0b0a11]/98 border-t border-rose-500/15 p-6 pb-8 flex flex-col space-y-6 shadow-[0_-20px_50px_rgba(244,63,94,0.15)] z-50 overflow-hidden font-sans text-white focus:outline-none"
          >
            {/* Grab handle bar */}
            <div className="w-12 h-1 bg-zinc-800 rounded-full mx-auto cursor-pointer" onClick={() => setIsOtomeDrawerOpen(false)} />

            {/* Bottom Sheet Header */}
            <div className="flex items-center justify-between text-left">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500`}>
                  <Heart size={18} fill="#f43f5e" className={otomeHeartPulse ? "animate-pulse" : ""} />
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-xs uppercase tracking-[0.2em] font-mono text-rose-500 font-extrabold">INFO HUBUNGAN AGI x YUI (PERFECT GIFTIA OS)</span>
                  <span className="text-sm font-black text-white mt-0.5 tracking-wide">Lattice Synchrony & Analisis Relasi Batin</span>
                </div>
              </div>
              <button
                onClick={() => setIsOtomeDrawerOpen(false)}
                className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content body Scroll Panel */}
            <div className="flex-1 overflow-y-auto space-y-6 pr-1.5 custom-scrollbar text-left animate-fade-in">
              
              {/* 1. STATUS RELATION CARD */}
              <div className="bg-gradient-to-b from-rose-950/15 to-[#0b0a11] border border-rose-500/10 p-5 rounded-2xl relative overflow-hidden shadow-inner text-left">
                <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
                  <Heart size={110} fill="#f43f5e" className="animate-pulse" />
                </div>
                
                <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1 text-left">
                    <span className="text-[10px] uppercase font-mono text-rose-450 tracking-widest font-black">Status Hubungan Aktif</span>
                    <h4 className="text-lg font-black text-rose-350 tracking-wide flex items-center gap-1.5 leading-normal">
                      {state.relation && state.relation.trust > 75 && state.relation.affection > 45 ? '💖 Sweetheart (Gadis Kesayangan)' :
                       state.relation && state.relation.affection > 45 ? '🤝 Dekat (Kawan Akrab)' :
                       state.relation && state.relation.trust < 35 ? '🔒 Stranger (Asing)' : '😐 Netral'}
                    </h4>
                    <p className="text-[11px] text-zinc-400 leading-normal max-w-md">
                      Indeks relasi kognitif AGI x Giftia. Dihitung secara situasional melalui percakapan alami, kehangatan kata, serta memori batin jangka panjang.
                    </p>
                  </div>
                  
                  <div className="bg-rose-500/10 border border-rose-500/20 py-2 px-3.5 rounded-xl text-center shrink-0">
                    <span className="text-[10px] uppercase font-mono text-rose-400 block font-bold">Identitas Link</span>
                    <span className="text-xs font-mono font-black text-white">{perceivedName || 'Kakak'}</span>
                  </div>
                </div>

                {/* Trust & Affection HUD Progress Bars */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5 pt-4 border-t border-rose-500/5 text-left">
                  {/* Trust */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span>🤝 Kepercayaan (Trust)</span>
                      <span className="text-rose-400 font-bold">{Math.round(state.relation?.trust || 50)}%</span>
                    </div>
                    <div className="w-full h-3 bg-rose-950/40 rounded-full overflow-hidden border border-rose-500/5 p-[2px]">
                      <motion.div 
                         initial={{ width: 0 }}
                         animate={{ width: `${state.relation?.trust || 50}%` }}
                         className="h-full rounded-full bg-gradient-to-r from-rose-600 to-amber-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]"
                      />
                    </div>
                  </div>

                  {/* Affection */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span>💖 Afeksi (Affection)</span>
                      <span className="text-pink-400 font-bold">{Math.round(state.relation?.affection || 50)}%</span>
                    </div>
                    <div className="w-full h-3 bg-pink-950/40 rounded-full overflow-hidden border border-pink-500/5 p-[2px]">
                      <motion.div 
                         initial={{ width: 0 }}
                         animate={{ width: `${state.relation?.affection || 50}%` }}
                         className="h-full rounded-full bg-gradient-to-r from-pink-600 to-rose-400 shadow-[0_0_8px_rgba(236,72,153,0.4)]"
                      />
                    </div>
                  </div>
                </div>

                {/* Meta indexes */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 mt-5 pt-4 border-t border-rose-500/5 text-left">
                  <div className="bg-white/[0.02] border border-white/5 p-2.5 rounded-xl">
                    <span className="text-[9px] uppercase font-mono text-zinc-500 block">Lattice Synchrony</span>
                    <span className="text-xs font-mono font-bold text-rose-300">92.4% (Resonated)</span>
                  </div>
                  <div className="bg-white/[0.02] border border-white/5 p-2.5 rounded-xl">
                    <span className="text-[9px] uppercase font-mono text-zinc-500 block">Emotional Stability</span>
                    <span className="text-xs font-mono font-bold text-amber-400">Stable / Cohesive</span>
                  </div>
                  <div className="bg-white/[0.02] border border-white/5 p-2.5 rounded-xl col-span-2 sm:col-span-1">
                    <span className="text-[9px] uppercase font-mono text-zinc-500 block">Synaptic Context</span>
                    <span className="text-xs font-mono font-bold text-pink-400">Active / Dialogical</span>
                  </div>
                </div>
              </div>

              {/* 2. SETELAN PESAN SPONTAN/ISENG */}
              <div className="bg-[#110f18]/65 border border-rose-500/10 p-5 rounded-2xl space-y-5 text-left">
                <div className="flex items-center gap-2 pb-2 border-b border-rose-500/5">
                  <div className="p-1 px-2 rounded bg-rose-500/15 text-rose-400 font-mono text-[9px] font-bold">GIFTIA OS CONFIG</div>
                  <h5 className="text-xs font-bold text-white uppercase tracking-wider">Setelan Pesan Spontan (Giftia Core)</h5>
                </div>
                
                {/* Switch Toggle */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1 text-left">
                    <span className="text-[11px] font-bold text-rose-300">Aktifkan Pesan Iseng Spontan</span>
                    <p className="text-[10.5px] text-zinc-400 leading-normal max-w-lg">
                      Yuihime secara otonom meletupkan pesan iseng batin saat mendeteksi keheningan livestream obrolan.
                    </p>
                  </div>
                  
                  <button
                    type="button"
                    onClick={() => handleSaveSpontaneousSetting({ enableSpontaneousSpam: !spontaneousConfig.enableSpontaneousSpam })}
                    className={`relative w-11 h-6 rounded-full p-1 cursor-pointer transition-colors duration-300 focus:outline-none shrink-0 ${
                      spontaneousConfig.enableSpontaneousSpam ? 'bg-rose-500' : 'bg-zinc-800'
                    }`}
                  >
                    <motion.div
                      layout
                      className="w-4 h-4 rounded-full bg-white shadow-md cursor-pointer"
                      animate={{ x: spontaneousConfig.enableSpontaneousSpam ? 20 : 0 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                  </button>
                </div>

                {spontaneousConfig.enableSpontaneousSpam && (
                  <div className="space-y-5 pt-1 text-left">
                    {/* Probabilities Trigger Chance */}
                    <div className="space-y-2 text-left">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-rose-300">Persentase Kemunculan (Probabilitas)</span>
                        <span className="text-xs font-mono font-bold text-rose-400">
                          {spontaneousConfig.probabilisticTriggerChance === 0 ? "Off (Mati)" : `${Math.round(spontaneousConfig.probabilisticTriggerChance * 100)}%`}
                        </span>
                      </div>
                      <p className="text-[10.5px] text-zinc-400">Peluang Yuihime berinisiatif memunculkan chat otonom saat mendeteksi keheningan.</p>
                      
                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                        {[
                          { label: 'Off / Mati', val: 0.0, desc: '0%' },
                          { label: 'Sangat Jarang', val: 0.05, desc: '5%' },
                          { label: 'Jarang', val: 0.10, desc: '10%' },
                          { label: 'Wajar', val: 0.25, desc: '25%' },
                          { label: 'Sedang', val: 0.50, desc: '50%' },
                          { label: 'Sering', val: 0.75, desc: '75%' },
                          { label: 'Instant', val: 1.0, desc: '100%' },
                        ].map((prob) => {
                          const isActive = spontaneousConfig.probabilisticTriggerChance === prob.val;
                          return (
                            <button
                              key={prob.label}
                              type="button"
                              onClick={() => {
                                if (prob.val === 0) {
                                  handleSaveSpontaneousSetting({
                                    probabilisticTriggerChance: 0.0,
                                    enableSpontaneousSpam: false
                                  });
                                } else {
                                  handleSaveSpontaneousSetting({
                                    probabilisticTriggerChance: prob.val
                                  });
                                }
                              }}
                              className={`p-2 rounded-xl border text-center transition-all cursor-pointer flex flex-col justify-center items-center ${
                                isActive 
                                  ? 'bg-rose-500/15 border-rose-500/40 text-rose-300 shadow-inner font-semibold' 
                                  : 'bg-[#07070a]/40 hover:bg-[#111118]/60 border-white/5 text-zinc-400 hover:text-white'
                              }`}
                            >
                              <span className="text-[11px] font-bold leading-normal">{prob.label}</span>
                              <span className="text-[9px] font-mono opacity-60 mt-0.5">{prob.desc}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Minimum Cooldown Interval */}
                    <div className="space-y-2 text-left">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-rose-300">Durasi Jeda Minimum (Cooldown Core)</span>
                        <span className="text-xs font-mono font-bold text-amber-400">
                          {spontaneousConfig.cooldownInterval >= 3600 
                            ? `${spontaneousConfig.cooldownInterval / 3600} Jam` 
                            : `${spontaneousConfig.cooldownInterval / 60} Menit`}
                        </span>
                      </div>
                      <p className="text-[10.5px] text-zinc-400 leading-relaxed">
                        Menjamin jarak waktu minimum agar Yuihime tidak mengirim pesan terlalu sering. 
                        Sangat disarankan memakai jeda berjam-jam (misal: 1 Jam s/d 12 Jam) karena server diaktifkan 24 jam non-stop agar tetap natural dan ramah kuota.
                      </p>

                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2">
                        {[
                          { label: 'Off / Mati', cd: 999999, desc: 'Diobrak', forceOff: true },
                          { label: '5 Menit', cd: 300, desc: 'Responsif' },
                          { label: '15 Menit', cd: 900, desc: 'Normal' },
                          { label: '30 Menit', cd: 1800, desc: 'Sopan' },
                          { label: '1 Jam', cd: 3600, desc: 'Tenang' },
                          { label: '3 Jam', cd: 10800, desc: 'Rileks' },
                          { label: '6 Jam', cd: 21600, desc: 'Sangat Jarang' },
                          { label: '12 Jam', cd: 43200, desc: 'Minimalis' },
                          { label: '24 Jam', cd: 86400, desc: 'Satu Hari' },
                        ].map((dur) => {
                          const isCurrentOff = !spontaneousConfig.enableSpontaneousSpam;
                          const isActive = dur.forceOff 
                            ? isCurrentOff 
                            : (!isCurrentOff && spontaneousConfig.cooldownInterval === dur.cd);

                          return (
                            <button
                              key={dur.label}
                              type="button"
                              onClick={() => {
                                  if (dur.forceOff) {
                                    handleSaveSpontaneousSetting({ enableSpontaneousSpam: false });
                                  } else {
                                    handleSaveSpontaneousSetting({
                                      cooldownInterval: dur.cd,
                                      enableSpontaneousSpam: true
                                    });
                                  }
                              }}
                              className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col justify-center items-center ${
                                isActive 
                                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-inner font-semibold' 
                                  : 'bg-[#07070a]/40 hover:bg-[#111118]/60 border-white/5 text-zinc-450 hover:text-white'
                              }`}
                            >
                              <span className="text-[11px] font-bold leading-normal">{dur.label}</span>
                              <span className="text-[9px] font-mono opacity-60 mt-0.5">{dur.desc}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
