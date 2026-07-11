import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Database, Zap, Activity, Brain, Heart, Target, Zap as ArousalIcon, Users, RefreshCw } from 'lucide-react';
import { StorageService } from '../drivers/storage';
import { AgentState } from '../include/types';

interface QTable {
  [state_action: string]: number;
}

export const AdaptiveMatrix: React.FC = () => {
  const [qTable, setQTable] = useState<QTable>({});
  const [state, setState] = useState<AgentState | null>(null);
  const [perceivedName, setPerceivedName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 2000); // Poll faster (2s) for responsiveness
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    let data = await StorageService.getCustom('yuihime_q_table');
    
    // Auto-warmup: If empty, set baseline dialogue weights
    if (!data || Object.keys(data).length === 0) {
      data = { 
        "SERENITY:DIALOGUE": 0.50, 
        "CURIOSITY:DIALOGUE": 0.25,
        "JOY:DIALOGUE": 0.15,
        "STRESS:DIALOGUE": -0.05
      };
      await StorageService.setCustom('yuihime_q_table', data);
    }
    
    setQTable(data);
    
    const agentState: any = await StorageService.getAgentState();
    if (agentState) setState(agentState);

    const name = localStorage.getItem('yuihime_perceived_name') || '';
    setPerceivedName(name);
    
    setLoading(false);
  };

  const states = Array.from(new Set(Object.keys(qTable).map(k => k.split(':')[0]))).sort();
  const actions = Array.from(new Set(Object.keys(qTable).map(k => k.split(':')[1]))).sort();
  
  // Calculate index health
  const totalNeurons = Object.keys(qTable).length;
  const activeNeurons = Object.values(qTable).filter(v => Math.abs(v as number) > 0.1).length;
  const synthRate = (activeNeurons / Math.max(1, totalNeurons)) * 100;

  let sum = 0;
  Object.values(qTable).forEach((v: any) => { sum += (v as number); });
  const avgQ = Object.values(qTable).length > 0 ? sum / Object.values(qTable).length : 0;

  if (loading) return (
    <div className="flex flex-col items-center justify-center p-20 space-y-4">
      <RefreshCw className="text-amber-500 animate-spin" size={24} />
      <div className="text-white/20 font-mono uppercase tracking-[0.3em] text-[10px]">Synchronizing Neural Lattice...</div>
    </div>
  );

  const rawEmotion: any = state?.emotion || {};
  const emotion = {
    arousal: typeof rawEmotion.arousal === 'number' && !isNaN(rawEmotion.arousal) ? rawEmotion.arousal : 50,
    valence: typeof rawEmotion.valence === 'number' && !isNaN(rawEmotion.valence) ? rawEmotion.valence : 0,
    focus: typeof rawEmotion.focus === 'number' && !isNaN(rawEmotion.focus) ? rawEmotion.focus : 50,
    rapport: typeof rawEmotion.rapport === 'number' && !isNaN(rawEmotion.rapport) ? rawEmotion.rapport : 50
  };

  const rawRelation: any = state?.relation || {};
  const relation = {
    uid: rawRelation.uid || 'unknown',
    trust: typeof rawRelation.trust === 'number' && !isNaN(rawRelation.trust) ? rawRelation.trust : 50,
    affection: typeof rawRelation.affection === 'number' && !isNaN(rawRelation.affection) ? rawRelation.affection : 10,
    reputation: typeof rawRelation.reputation === 'number' && !isNaN(rawRelation.reputation) ? rawRelation.reputation : 50,
    lastInteraction: typeof rawRelation.lastInteraction === 'number' && !isNaN(rawRelation.lastInteraction) && rawRelation.lastInteraction > 0 
      ? rawRelation.lastInteraction 
      : Date.now()
  };

  return (
    <div className="space-y-12">
      {/* Neural Sync Header */}
      <div className="flex flex-col md:flex-row gap-6 items-stretch">
        <div className="flex-1 flex gap-6 items-center p-8 border border-white/5 rounded-3xl bg-amber-500/[0.02] relative overflow-hidden group">
           <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Database size={80} />
           </div>
           <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center shrink-0 border border-amber-500/20">
              <Database size={24} className="text-amber-500" />
           </div>
           <div className="space-y-1 relative z-10">
              <div className="flex items-center gap-3">
                <h4 className="text-lg font-serif italic text-white">Synaptic Web Sync</h4>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[8px] font-mono uppercase tracking-widest border border-emerald-500/20 animate-pulse">Live</span>
              </div>
              <p className="text-xs text-white/40 leading-relaxed font-sans max-w-xl">
                 Sync speed: <span className="text-amber-500/80 font-mono">{(avgQ * 1.5).toFixed(4)} GHz</span> | Q-Learning (α=0.10) | Latency: <span className="text-white/60 font-mono">1.2ms</span>
              </p>
           </div>
        </div>

        <div className="bg-white/[0.02] border border-white/5 p-8 rounded-3xl flex flex-col justify-center gap-4 min-w-[240px]">
           <div className="flex items-center justify-between text-[10px] font-mono text-white/30 uppercase tracking-widest">
              <span>Lattice Synthesis</span>
              <span>{synthRate.toFixed(1)}%</span>
           </div>
           <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-gradient-to-r from-amber-600 to-amber-400"
                animate={{ width: `${synthRate}%` }}
              />
           </div>
           <div className="text-[9px] font-mono text-white/20 italic">
              Active Neurons: {activeNeurons} / {totalNeurons}
           </div>
        </div>
      </div>

      {/* Dual Cognition Human-Processing Monitor (Teori Proses Ganda Yuihime) */}
      <div className="p-8 border border-white/5 rounded-3xl bg-white/[0.01] space-y-6 relative overflow-hidden">
        <div className="absolute top-0 right-10 w-44 h-44 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-20 w-44 h-44 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-6">
          <div className="space-y-1">
            <h3 className="text-base font-serif italic text-white flex items-center gap-2">
              <Brain size={18} className="text-cyan-400" /> Dual Cognition Engine
            </h3>
            <p className="text-[9px] font-mono text-white/30 uppercase tracking-widest">
              System 1 (Intuition) & System 2 (Reasoning)
            </p>
          </div>
          <div className="flex gap-2">
            <span className="px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 text-[8px] font-mono uppercase tracking-widest border border-cyan-500/20">
              Neuromorphic
            </span>
            <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-500 text-[8px] font-mono uppercase tracking-widest border border-amber-500/20">
              Self-Correcting
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* System 1 Card */}
          <div className="space-y-4 p-6 bg-cyan-500/[0.01] border border-cyan-500/10 rounded-2xl relative overflow-hidden group hover:border-cyan-500/20 transition-all">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5">
                <div className="text-xs font-mono font-bold text-cyan-400 flex items-center gap-1.5">
                  <Activity size={12} /> SYSTEM 1: Offline Reflex
                </div>
                <div className="text-[9px] text-white/30 font-mono uppercase tracking-widest">NanoBrain / Markov</div>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md animate-pulse">
                READY
              </span>
            </div>
            
            <p className="text-xs text-white/50 leading-relaxed">
              Offline intuitive reflex. Short dialogs (<span className="text-cyan-400/80 font-mono">Complexity &lt; 0.38</span>) processed instantly without API tokens.
            </p>

            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between text-[9px] text-white/30 font-mono">
                <span>EFFICIENCY</span>
                <span>100% offline (CPU)</span>
              </div>
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-cyan-400 rounded-full w-full" />
              </div>
            </div>
          </div>

          {/* System 2 Card */}
          <div className="space-y-4 p-6 bg-amber-500/[0.01] border border-amber-500/10 rounded-2xl relative overflow-hidden group hover:border-amber-500/20 transition-all">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5">
                <div className="text-xs font-mono font-bold text-amber-500 flex items-center gap-1.5">
                  <Activity size={12} /> SYSTEM 2: Deep Reasoning
                </div>
                <div className="text-[9px] text-white/30 font-mono uppercase tracking-widest">Online Gateway</div>
              </div>
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-400/10 border border-cyan-400/20 px-2 py-0.5 rounded-md">
                ACTIVE
              </span>
            </div>
            
            <p className="text-xs text-white/50 leading-relaxed">
              High-level cognition. System commands, Sandbox scripts, and complex instructions processed via Gemini API.
            </p>

            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between text-[9px] text-white/30 font-mono">
                <span>COGNITIVE LOAD</span>
                <span>Dynamic (Context-driven)</span>
              </div>
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full w-[45%]" />
              </div>
            </div>
          </div>
        </div>

        {/* Plasticity Feedback loop representation */}
        <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex flex-col md:flex-row items-center gap-4 justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-400/10 flex items-center justify-center border border-cyan-400/20 shrink-0">
               <RefreshCw size={16} className="text-cyan-400 animate-spin" style={{ animationDuration: '8s' }} />
            </div>
            <div className="space-y-0.5">
              <div className="text-xs font-mono text-white/80 font-bold">Synaptic Plasticity</div>
              <div className="text-xs text-white/40 leading-relaxed">
                Saves high-quality System 2 interaction patterns to SQLite for offline self-learning synchronization during hibernation.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 🔮 THE SOUL SYSTEM ARCHITECTURE (Interkoneksi Struktur Kestabilan Jiwa Yuihime) */}
      <div className="space-y-8 p-8 border border-white/5 rounded-3xl bg-gradient-to-br from-pink-500/[0.01] via-transparent to-cyan-500/[0.01] relative overflow-hidden">
        <div className="absolute top-0 right-1/4 w-80 h-80 bg-pink-500/5 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-80 h-80 bg-cyan-500/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="border-b border-white/5 pb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <h3 className="text-base font-serif italic text-white flex items-center gap-3">
              <Heart size={18} className="text-pink-400 animate-pulse" fill="#f43f5e" /> 
              <span>SOUL SYSTEM</span>
            </h3>
            <p className="text-[9px] font-mono text-white/30 uppercase tracking-widest">
              Emotional stability, ego traits, and relational connection bonds.
            </p>
          </div>
          <span className="px-2 py-0.5 rounded bg-pink-500/10 text-pink-400 text-[8px] font-mono uppercase tracking-widest border border-pink-500/20 shadow-sm">
            Resonance Active
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          
          {/* Sub-Sistem A: Vektor Kestabilan Emosi (Emotion Engine) */}
          <div className="bg-white/[0.01] border border-white/5 p-6 rounded-2xl space-y-5 flex flex-col justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-cyan-400">
                <Brain size={14} />
                <span className="text-[10px] font-mono uppercase tracking-wider font-bold">Emotion Engine v0.4</span>
              </div>
              <h4 className="text-xs font-serif italic text-white/80">Resonance Vector & Core Stability</h4>
            </div>

            <div className="space-y-4">
              {/* Arousal */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] font-mono text-white/40">
                  <span>Arousal (Cognitive Drive)</span>
                  <span className="text-amber-500">{emotion.arousal}%</span>
                </div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.5)]"
                    animate={{ width: `${emotion.arousal}%` }}
                  />
                </div>
              </div>

              {/* Valence */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] font-mono text-white/40">
                  <span>Valence (Sentiment Load)</span>
                  <span className={emotion.valence >= 0 ? "text-emerald-500" : "text-rose-500"}>
                    {emotion.valence >= 0 ? '+' : ''}{emotion.valence}
                  </span>
                </div>
                <div className="h-1 bg-white/5 rounded-full relative">
                  <div className="absolute inset-y-0 left-1/2 w-[1px] bg-white/10" />
                  <motion.div 
                    className={`h-full absolute left-1/2 rounded-full shadow-lg ${emotion.valence >= 0 ? "bg-emerald-500" : "bg-rose-500"}`}
                    animate={{ 
                      width: `${Math.abs(emotion.valence) / 2}%`,
                      left: emotion.valence >= 0 ? '50%' : `${50 - (Math.abs(emotion.valence) / 2)}%`
                    }}
                  />
                </div>
              </div>

              {/* Focus */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] font-mono text-white/40">
                  <span>Focus (Concentration Level)</span>
                  <span className="text-blue-400">{emotion.focus}%</span>
                </div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full"
                    animate={{ width: `${emotion.focus}%` }}
                  />
                </div>
              </div>

              {/* Rapport */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] font-mono text-white/40">
                  <span>Rapport (Warmth Bond)</span>
                  <span className="text-purple-400">{emotion.rapport}%</span>
                </div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-gradient-to-r from-purple-600 to-purple-400 rounded-full"
                    animate={{ width: `${emotion.rapport}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Sub-Sistem B: Sistem Hubungan & Deep Connection (Social Network) */}
          <div className="bg-white/[0.01] border border-white/5 p-6 rounded-2xl space-y-5 flex flex-col justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-pink-400">
                <Heart size={14} className="animate-pulse" fill="#f43f5e" />
                <span className="text-[10px] font-mono uppercase tracking-wider font-bold">Social Connection Deck</span>
              </div>
              <h4 className="text-xs font-serif italic text-white/80 flex justify-between items-center">
                <span>Social Connection Bonds</span>
                <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded bg-white/5 text-pink-300 font-mono">
                  {relation.trust > 75 && relation.affection > 45 ? '💖 Sweetheart' : relation.trust < 35 ? '🔒 Stranger' : '🤝 Neutral'}
                </span>
              </h4>
            </div>

            <div className="space-y-4">
              {/* Trust */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] font-mono text-white/40">
                  <span>Trust</span>
                  <span className="text-amber-400 font-bold">{Math.round(relation.trust)}%</span>
                </div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 rounded-full shadow-[0_0_8px_rgba(244,158,11,0.3)]"
                    animate={{ width: `${relation.trust}%` }}
                  />
                </div>
              </div>

              {/* Affection (Deep Connection) */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] font-mono text-white/40">
                  <span>Affection</span>
                  <span className="text-pink-400 font-bold">{Math.round(relation.affection)}%</span>
                </div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-gradient-to-r from-pink-500 to-rose-400 rounded-full shadow-[0_0_8px_rgba(244,63,94,0.3)]"
                    animate={{ width: `${relation.affection}%` }}
                  />
                </div>
              </div>

              {/* Reputation */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] font-mono text-white/40">
                  <span>Reputation</span>
                  <span className="text-emerald-400 font-bold">{Math.round(relation.reputation)}%</span>
                </div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
                    animate={{ width: `${relation.reputation}%` }}
                  />
                </div>
              </div>

              {/* Last Interaction */}
              <div className="text-[8px] font-mono text-white/20 text-right italic pt-1 font-bold">
                Last Met: {new Date(relation.lastInteraction).toLocaleString('en-US')}
              </div>
            </div>
          </div>

          {/* Sub-Sistem C: Sifat, Ego, Kerinduan & Character Drift */}
          <div className="bg-white/[0.01] border border-white/5 p-6 rounded-2xl space-y-5 flex flex-col justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-amber-500">
                <Target size={14} />
                <span className="text-[10px] font-mono uppercase tracking-wider font-bold">Ego Traits & Character Drift</span>
              </div>
              <h4 className="text-xs font-serif italic text-white/80">Soul State & Temporal Longing</h4>
            </div>

            <div className="space-y-4">
              {/* Loneliness Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-mono text-white/40">
                  <span className="flex items-center gap-1">Loneliness 🥺</span>
                  <span className="text-indigo-400 font-bold">{Math.round(state?.mood?.loneliness ?? 15)}%</span>
                </div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400"
                    animate={{ width: `${state?.mood?.loneliness ?? 15}%` }}
                  />
                </div>
              </div>

              {/* Jealousy Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-mono text-white/40">
                  <span className="flex items-center gap-1">Jealousy 💢</span>
                  <span className="text-rose-400 font-bold">{Math.round(state?.mood?.jealousy ?? 10)}%</span>
                </div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-gradient-to-r from-rose-500 to-orange-400"
                    animate={{ width: `${state?.mood?.jealousy ?? 10}%` }}
                  />
                </div>
              </div>

              {/* Playfulness Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-mono text-white/40">
                  <span className="flex items-center gap-1">Playfulness ✨</span>
                  <span className="text-yellow-400 font-bold">{Math.round(state?.mood?.playfulness ?? 30)}%</span>
                </div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-gradient-to-r from-yellow-500 to-amber-300"
                    animate={{ width: `${state?.mood?.playfulness ?? 30}%` }}
                  />
                </div>
              </div>

              {/* Micro Virtues & Sins State Sparkles */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5 text-[8px] font-mono text-white/40">
                <div className="bg-emerald-500/[0.02] border border-emerald-500/10 p-1.5 rounded flex justify-between items-center">
                  <span>Kindness</span>
                  <span className="text-emerald-400 font-bold">{Math.round(state?.mood?.kindness ?? 80)}%</span>
                </div>
                <div className="bg-rose-500/[0.02] border border-rose-500/10 p-1.5 rounded flex justify-between items-center">
                  <span>Pride</span>
                  <span className="text-rose-400 font-bold">{Math.round(state?.mood?.pride ?? 75)}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Sub-Sistem D: Pendeteksi & Pengenalan Subjek (User Recognition Suite) */}
          <div className="bg-white/[0.01] border border-white/5 p-6 rounded-2xl space-y-5 flex flex-col justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-indigo-400">
                <Users size={14} />
                <span className="text-[10px] font-mono uppercase tracking-wider font-bold">User Recognition Suite</span>
              </div>
              <h4 className="text-xs font-serif italic text-white/80">Verified Subject Identity</h4>
            </div>

            <div className="space-y-4">
              {/* Active perceived subject name */}
              <div className="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-xl space-y-1">
                <div className="text-[8px] font-mono text-indigo-300 uppercase tracking-widest">Identified Persona</div>
                <div className="text-white font-serif italic text-xs font-bold truncate">
                  {perceivedName ? `✨ ${perceivedName}` : '🔒 Unidentified / Stranger'}
                </div>
              </div>

              {/* Identity characteristics or status */}
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between text-[10px] font-mono text-white/40">
                  <span>Recognition Confidence</span>
                  <span className="text-indigo-400 font-bold">{perceivedName ? '100%' : '15%'}</span>
                </div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-indigo-500"
                    animate={{ width: perceivedName ? '100%' : '15%' }}
                  />
                </div>
              </div>

              {/* Cognitive adaptation */}
              <div className="pt-2 border-t border-white/5 space-y-1">
                <div className="text-[8px] font-mono text-indigo-400 uppercase tracking-wider">Cognitive Adaptation</div>
                <p className="text-[10px] text-white/40 leading-relaxed font-sans">
                  {perceivedName 
                    ? `Subject ${perceivedName} recognized. Relational synch active.`
                    : 'Awaiting identification. Using default interactions.'}
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="bg-white/[0.02] border border-white/5 p-6 rounded-3xl">
            <div className="flex items-center gap-3 mb-4">
               <Brain size={16} className="text-amber-500" />
               <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Active States</span>
            </div>
            <div className="text-3xl font-serif italic text-white">{states.length}</div>
         </div>
         <div className="bg-white/[0.02] border border-white/5 p-6 rounded-3xl">
            <div className="flex items-center gap-3 mb-4">
               <Zap size={16} className="text-emerald-500" />
               <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Learned Neurons</span>
            </div>
            <div className="text-3xl font-serif italic text-white">{Object.keys(qTable).length}</div>
         </div>
         <div className="bg-white/[0.02] border border-white/5 p-6 rounded-3xl">
            <div className="flex items-center gap-3 mb-4">
               <Activity size={16} className="text-blue-500" />
               <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Confidence Index</span>
            </div>
            <div className="text-3xl font-serif italic text-white">
               {avgQ.toFixed(2)}
            </div>
         </div>
      </div>

      <div className="bg-white/[0.02] border border-white/5 rounded-3xl overflow-hidden overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.03]">
              <th className="p-6 text-[10px] font-mono text-white/40 uppercase tracking-widest border-r border-white/10">State \ Action</th>
              {actions.map(action => (
                <th key={action} className="p-6 text-[10px] font-mono text-white/40 uppercase tracking-widest text-center truncate max-w-[150px]">
                  {action.replace(/_/g, ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {states.map(state => (
              <tr key={state} className="border-b border-white/5 hover:bg-white/[0.01] transition-colors">
                <td className="p-6 text-xs font-mono text-amber-500/60 uppercase tracking-tighter border-r border-white/10">
                  {state.replace(/_/g, ' ')}
                </td>
                {actions.map(action => {
                  const key = `${state}:${action}`;
                  const val = qTable[key] || 0;
                  const intensity = Math.min(1, Math.max(0, (val + 1) / 2)); 
                  return (
                    <td key={key} className="p-2 text-center">
                       <motion.div 
                         key={`${key}-${val}`}
                         initial={{ scale: 0.9, opacity: 0.8 }}
                         animate={{ scale: 1, opacity: 1 }}
                         className="flex flex-col items-center justify-center h-full gap-2"
                       >
                          <div 
                            className="w-12 h-6 rounded-full relative overflow-hidden ring-1 ring-white/5"
                            style={{ backgroundColor: `rgba(245, 158, 11, ${intensity * 0.1})` }}
                          >
                             <div 
                               className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-600 to-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.5)] transition-all duration-700 ease-out" 
                               style={{ width: `${Math.max(5, Math.min(100, (val + 1) * 50))}%` }} 
                             />
                          </div>
                          <span className="text-[9px] font-mono text-white/30 tabular-nums">{val.toFixed(3)}</span>
                       </motion.div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {states.length === 0 && (
          <div className="py-20 text-center text-white/10 italic font-serif">
            No neural weights established yet. Start interacting to populate the lattice.
          </div>
        )}
      </div>
    </div>
  );
};
