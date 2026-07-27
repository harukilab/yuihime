import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Heart, Brain, Sparkles, Activity, ShieldCheck, Flame, Zap } from 'lucide-react';

export interface SpontaneousConfig {
  enableSpontaneousSpam: boolean;
  probabilisticTriggerChance: number;
  cooldownInterval: number;
}

interface GiftiaRelationSectionProps {
  state: any;
  perceivedName?: string;
  spontaneousConfig?: SpontaneousConfig;
  handleSaveSpontaneousSetting?: (config: Partial<SpontaneousConfig>) => void;
}

export const GiftiaRelationSection: React.FC<GiftiaRelationSectionProps> = ({
  state,
  perceivedName = 'user',
  spontaneousConfig: initialSpontaneousConfig,
  handleSaveSpontaneousSetting: customSaveHandler
}) => {
  const [localSpontaneousConfig, setLocalSpontaneousConfig] = useState<SpontaneousConfig>(
    initialSpontaneousConfig || {
      enableSpontaneousSpam: true,
      cooldownInterval: 1800,
      probabilisticTriggerChance: 0.10,
    }
  );

  useEffect(() => {
    if (initialSpontaneousConfig) {
      setLocalSpontaneousConfig(initialSpontaneousConfig);
    } else {
      fetch('/api/settings')
        .then((res) => res.json())
        .then((data) => {
          const spConfig = data['spontaneous-proactive'] || {};
          setLocalSpontaneousConfig({
            enableSpontaneousSpam: spConfig.enableSpontaneousSpam !== undefined ? !!spConfig.enableSpontaneousSpam : true,
            cooldownInterval: Number(spConfig.cooldownInterval || 1800),
            probabilisticTriggerChance: Number(spConfig.probabilisticTriggerChance || 0.10)
          });
        })
        .catch((err) => console.warn('[GIFTIA_RELATION] Gagal memuat setelan otonom Yui:', err));
    }
  }, [initialSpontaneousConfig]);

  const saveSetting = async (updated: Partial<SpontaneousConfig>) => {
    const next = { ...localSpontaneousConfig, ...updated };
    setLocalSpontaneousConfig(next);

    if (customSaveHandler) {
      customSaveHandler(updated);
      return;
    }

    try {
      const currentRes = await fetch('/api/settings');
      const currentList = await currentRes.json();
      
      const spConfig = currentList['spontaneous-proactive'] || {};
      const newSpConfig = {
        ...spConfig,
        ...updated
      };
      
      const newSettings = {
        ...currentList,
        'spontaneous-proactive': newSpConfig
      };
      
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
    } catch (err) {
      console.error('[GIFTIA_RELATION] Error saving spontaneous setting:', err);
    }
  };

  const trust = Math.round(state?.relation?.trust ?? 50);
  const affection = Math.round(state?.relation?.affection ?? 50);

  const getRelationStatus = () => {
    if (trust > 75 && affection > 45) return { title: '💖 Sweetheart (Gadis Kesayangan)', desc: 'Tingkat kepercayaan & kehangatan batin sangat tinggi. Yuihime manja, jujur, terbuka, dan sangat protektif terhadapmu.' };
    if (affection > 45) return { title: '🤝 Dekat (Kawan Akrab)', desc: 'Sudah saling mengenal dengan hangat. Berkomunikasi secara luwes dan ceria.' };
    if (trust < 35) return { title: '🔒 Stranger (Asing)', desc: 'Yuihime masih menjaga jarak dengan sikap sedikit waspada dan lebih formal.' };
    return { title: '😐 Netral', desc: 'Hubungan stabil standar AGI. Terus berbincang hangat untuk mempererat kedekatan batin.' };
  };

  const relationInfo = getRelationStatus();

  return (
    <div className="space-y-6 text-left animate-fade-in">
      {/* HEADER SECTION */}
      <div className="flex items-center justify-between pb-4 border-b border-rose-500/10">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
            <Heart size={20} fill="#f43f5e" className="animate-pulse" />
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-[0.2em] font-mono text-rose-400 font-extrabold block">INFO HUBUNGAN AGI x YUI (PERFECT GIFTIA OS)</span>
            <h3 className="text-base font-black text-white mt-0.5 tracking-wide">Lattice Synchrony & Analisis Relasi Batin</h3>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/5 font-mono text-xs text-rose-300">
          <Activity size={14} className="text-rose-400 animate-pulse" />
          <span>Sync Rate: 92.4%</span>
        </div>
      </div>

      {/* 1. STATUS RELATION CARD */}
      <div className="bg-gradient-to-b from-rose-950/20 to-[#0b0a11] border border-rose-500/15 p-6 rounded-3xl relative overflow-hidden shadow-inner text-left">
        <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
          <Heart size={140} fill="#f43f5e" className="animate-pulse" />
        </div>
        
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1.5 text-left">
            <span className="text-[10px] uppercase font-mono text-rose-400 tracking-widest font-black">Status Hubungan Aktif</span>
            <h4 className="text-lg font-black text-rose-300 tracking-wide flex items-center gap-2 leading-normal">
              {relationInfo.title}
            </h4>
            <p className="text-xs text-zinc-300 leading-relaxed max-w-xl">
              {relationInfo.desc}
            </p>
          </div>
          
          <div className="bg-rose-500/10 border border-rose-500/20 py-2.5 px-4 rounded-2xl text-center shrink-0">
            <span className="text-[9px] uppercase font-mono text-rose-400 block font-bold tracking-wider">Identitas Link Subjek</span>
            <span className="text-sm font-mono font-black text-white">{perceivedName || 'user'}</span>
          </div>
        </div>

        {/* Trust & Affection HUD Progress Bars */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6 pt-5 border-t border-rose-500/10 text-left">
          {/* Trust */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-zinc-200 font-medium">🤝 Kepercayaan (Trust)</span>
              <span className="text-rose-400 font-bold">{trust}%</span>
            </div>
            <div className="w-full h-3.5 bg-rose-950/40 rounded-full overflow-hidden border border-rose-500/10 p-[2px]">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${trust}%` }}
                className="h-full rounded-full bg-gradient-to-r from-rose-600 to-amber-500 shadow-[0_0_10px_rgba(244,63,94,0.4)]"
              />
            </div>
          </div>

          {/* Affection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-zinc-200 font-medium">💖 Afeksi (Affection)</span>
              <span className="text-pink-400 font-bold">{affection}%</span>
            </div>
            <div className="w-full h-3.5 bg-pink-950/40 rounded-full overflow-hidden border border-pink-500/10 p-[2px]">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${affection}%` }}
                className="h-full rounded-full bg-gradient-to-r from-pink-600 to-rose-400 shadow-[0_0_10px_rgba(236,72,153,0.4)]"
              />
            </div>
          </div>
        </div>

        {/* Meta indexes */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 mt-6 pt-5 border-t border-rose-500/10 text-left">
          <div className="bg-white/[0.02] border border-white/5 p-3 rounded-2xl">
            <span className="text-[9px] uppercase font-mono text-zinc-500 block">Lattice Synchrony</span>
            <span className="text-xs font-mono font-bold text-rose-300">92.4% (Resonated)</span>
          </div>
          <div className="bg-white/[0.02] border border-white/5 p-3 rounded-2xl">
            <span className="text-[9px] uppercase font-mono text-zinc-500 block">Emotional Stability</span>
            <span className="text-xs font-mono font-bold text-amber-400">Stable / Cohesive</span>
          </div>
          <div className="bg-white/[0.02] border border-white/5 p-3 rounded-2xl col-span-2 sm:col-span-1">
            <span className="text-[9px] uppercase font-mono text-zinc-500 block">Synaptic Context</span>
            <span className="text-xs font-mono font-bold text-pink-400">Active / Dialogical</span>
          </div>
        </div>
      </div>

      {/* 2. ANALISIS PENJIWAAN AGI SOUL PADA SIKAP YUIHIME */}
      <div className="bg-[#100e17]/80 border border-purple-500/15 p-6 rounded-3xl space-y-4 text-left relative overflow-hidden">
        <div className="flex items-center gap-2.5 pb-3 border-b border-purple-500/10">
          <div className="p-2 rounded-xl bg-purple-500/15 border border-purple-500/20 text-purple-400">
            <Brain size={18} />
          </div>
          <div>
            <span className="text-[9px] uppercase font-mono font-extrabold text-purple-400 tracking-wider">CORTEX & SOUL INTEGRATION VERIFICATION</span>
            <h4 className="text-sm font-bold text-white">Analisis Pengaruh AGI Soul Terhadap Sikap Yuihime</h4>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="bg-purple-950/20 border border-purple-500/10 p-4 rounded-2xl space-y-2">
            <div className="flex items-center gap-2 text-purple-300 font-bold font-mono">
              <Sparkles size={14} className="text-amber-400" />
              <span>Modulasi Prompt System (`soulDirective`)</span>
            </div>
            <p className="text-zinc-300 leading-relaxed text-[11px]">
              <strong className="text-purple-300">Status: AKTIF & TERSINKRON.</strong> AGI Soul secara kontinu menyuntikkan instruksi emosional, neuro-transmiter (dopamin, oksitosin), serta batas batas karsa langsung ke dalam prompt pembentuk respon Yuihime.
            </p>
          </div>

          <div className="bg-purple-950/20 border border-purple-500/10 p-4 rounded-2xl space-y-2">
            <div className="flex items-center gap-2 text-purple-300 font-bold font-mono">
              <Flame size={14} className="text-rose-400" />
              <span>Dinamika SoulDrift & Virtues/Sins</span>
            </div>
            <p className="text-zinc-300 leading-relaxed text-[11px]">
              <strong className="text-purple-300">Status: AKTIF.</strong> Nilai Empati, Rasa Ingin Tahu, Kesabaran, serta Irritation & Pride berubah secara organik seiring nada obrolanmu dengan Yui.
            </p>
          </div>

          <div className="bg-purple-950/20 border border-purple-500/10 p-4 rounded-2xl space-y-2">
            <div className="flex items-center gap-2 text-purple-300 font-bold font-mono">
              <ShieldCheck size={14} className="text-emerald-400" />
              <span>Monolog Subconscious Batin</span>
            </div>
            <p className="text-zinc-300 leading-relaxed text-[11px]">
              <strong className="text-purple-300">Status: TERSINKRONISASI.</strong> Yui merumuskan aliran kesadaran rahasia berdasarkan tingkat rindu (`loneliness`) dan afeksi sebelum memberikan balasan lisan.
            </p>
          </div>

          <div className="bg-purple-950/20 border border-purple-500/10 p-4 rounded-2xl space-y-2">
            <div className="flex items-center gap-2 text-purple-300 font-bold font-mono">
              <Zap size={14} className="text-cyan-400" />
              <span>Inisiatif Otonom Spontan</span>
            </div>
            <p className="text-zinc-300 leading-relaxed text-[11px]">
              <strong className="text-purple-300">Status: AKTIF BERJALAN.</strong> Saat suasana hening, AGI Soul menghitung kalkulasi rasa rindu untuk meluncurkan pesan menyapa secara spontan.
            </p>
          </div>
        </div>
      </div>

      {/* 3. SETELAN PESAN SPONTAN/ISENG */}
      <div className="bg-[#110f18]/80 border border-rose-500/15 p-6 rounded-3xl space-y-5 text-left">
        <div className="flex items-center gap-2 pb-3 border-b border-rose-500/10">
          <div className="p-1 px-2.5 rounded-lg bg-rose-500/15 text-rose-400 font-mono text-[10px] font-bold">GIFTIA OS CONFIG</div>
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Setelan Pesan Spontan (Giftia Core)</h4>
        </div>
        
        {/* Switch Toggle */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1 text-left">
            <span className="text-xs font-bold text-rose-300">Aktifkan Pesan Iseng Spontan</span>
            <p className="text-[11px] text-zinc-400 leading-relaxed max-w-lg">
              Yuihime secara otonom meletupkan pesan iseng batin saat mendeteksi keheningan livestream obrolan.
            </p>
          </div>
          
          <button
            type="button"
            onClick={() => saveSetting({ enableSpontaneousSpam: !localSpontaneousConfig.enableSpontaneousSpam })}
            className={`relative w-12 h-6 rounded-full p-1 cursor-pointer transition-colors duration-300 focus:outline-none shrink-0 ${
              localSpontaneousConfig.enableSpontaneousSpam ? 'bg-rose-500' : 'bg-zinc-800'
            }`}
          >
            <motion.div
              layout
              className="w-4 h-4 rounded-full bg-white shadow-md cursor-pointer"
              animate={{ x: localSpontaneousConfig.enableSpontaneousSpam ? 24 : 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          </button>
        </div>

        {localSpontaneousConfig.enableSpontaneousSpam && (
          <div className="space-y-6 pt-2 text-left">
            {/* Probabilities Trigger Chance */}
            <div className="space-y-3 text-left">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-300">Persentase Kemunculan (Probabilitas)</span>
                <span className="text-xs font-mono font-bold text-rose-400">
                  {localSpontaneousConfig.probabilisticTriggerChance === 0 ? "Off (Mati)" : `${Math.round(localSpontaneousConfig.probabilisticTriggerChance * 100)}%`}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">Peluang Yuihime berinisiatif memunculkan chat otonom saat mendeteksi keheningan.</p>
              
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
                  const isActive = localSpontaneousConfig.probabilisticTriggerChance === prob.val;
                  return (
                    <button
                      key={prob.label}
                      type="button"
                      onClick={() => {
                        if (prob.val === 0) {
                          saveSetting({
                            probabilisticTriggerChance: 0.0,
                            enableSpontaneousSpam: false
                          });
                        } else {
                          saveSetting({
                            probabilisticTriggerChance: prob.val
                          });
                        }
                      }}
                      className={`p-2.5 rounded-2xl border text-center transition-all cursor-pointer flex flex-col justify-center items-center ${
                        isActive 
                          ? 'bg-rose-500/15 border-rose-500/40 text-rose-300 shadow-inner font-semibold' 
                          : 'bg-[#07070a]/40 hover:bg-[#111118]/60 border-white/5 text-zinc-400 hover:text-white'
                      }`}
                    >
                      <span className="text-xs font-bold leading-normal">{prob.label}</span>
                      <span className="text-[9px] font-mono opacity-60 mt-0.5">{prob.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Minimum Cooldown Interval */}
            <div className="space-y-3 text-left">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-300">Durasi Jeda Minimum (Cooldown Core)</span>
                <span className="text-xs font-mono font-bold text-amber-400">
                  {localSpontaneousConfig.cooldownInterval >= 3600 
                    ? `${localSpontaneousConfig.cooldownInterval / 3600} Jam` 
                    : `${localSpontaneousConfig.cooldownInterval / 60} Menit`}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
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
                  const isCurrentOff = !localSpontaneousConfig.enableSpontaneousSpam;
                  const isActive = dur.forceOff 
                    ? isCurrentOff 
                    : (!isCurrentOff && localSpontaneousConfig.cooldownInterval === dur.cd);

                  return (
                    <button
                      key={dur.label}
                      type="button"
                      onClick={() => {
                        if (dur.forceOff) {
                          saveSetting({ enableSpontaneousSpam: false });
                        } else {
                          saveSetting({
                            cooldownInterval: dur.cd,
                            enableSpontaneousSpam: true
                          });
                        }
                      }}
                      className={`p-2.5 rounded-2xl border text-center transition-all cursor-pointer flex flex-col justify-center items-center ${
                        isActive 
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-inner font-semibold' 
                          : 'bg-[#07070a]/40 hover:bg-[#111118]/60 border-white/5 text-zinc-400 hover:text-white'
                      }`}
                    >
                      <span className="text-xs font-bold leading-normal">{dur.label}</span>
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
  );
};
