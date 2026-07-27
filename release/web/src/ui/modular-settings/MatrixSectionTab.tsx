/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Activity, Cpu, Database, Play, Zap, Brain, Lightbulb, HelpCircle, BookOpen, Sliders, Check, Trash2, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { KnowledgeGraph } from '../KnowledgeGraph';
import { AdaptiveMatrix } from '../AdaptiveMatrix';
import { ReflectTab } from '../ReflectTab';
import { StorageService } from '@shared/drivers/storage';

export interface MatrixSectionTabProps {
  activeAgiTab: string;
  setActiveAgiTab: (val: any) => void;
  state: any;
  NEURAL_CORES: any[];
  activePersonaId?: string;
  isThinking: boolean;
  animations: string[];
  setAnimations: (val: any) => void;
  memories: any[];
  knowledge: any[];
  yuihimeVersionInfo: any;
  settings: any;
  dreams: any[];
  handleReflect?: () => void;
  status?: string;
  logs: any[];
}

export const MatrixSectionTab: React.FC<MatrixSectionTabProps> = ({
  activeAgiTab,
  setActiveAgiTab,
  state,
  NEURAL_CORES,
  activePersonaId,
  isThinking,
  animations,
  setAnimations,
  memories,
  knowledge,
  yuihimeVersionInfo,
  settings,
  dreams,
  handleReflect,
  status,
  logs
}) => {
  // AGI Core Simulator states
  const [lessons, setLessons] = useState<string[]>([]);
  const [simulatorInput, setSimulatorInput] = useState('');
  const [conceptualMetaphor, setConceptualMetaphor] = useState('Standby.');
  const [scientificHypothesis, setScientificHypothesis] = useState('Standby.');
  const [solutionsList, setSolutionsList] = useState('Standby.');
  const [unchartedAdaptation, setUnchartedAdaptation] = useState('Standby.');
  const [customLessonInput, setCustomLessonInput] = useState('');
  const [simulationActive, setSimulationActive] = useState(false);

  useEffect(() => {
    loadLessons();
  }, []);

  const loadLessons = async () => {
    try {
      const saved = await StorageService.getCustom('yuihime_cognitive_lessons');
      if (saved && Array.isArray(saved)) {
        setLessons(saved);
      } else {
        setLessons([]);
      }
    } catch (err) {
      console.warn("Could not read cognitive lessons:", err);
    }
  };

  const handleClearLessons = async () => {
    try {
      await StorageService.saveCustom('yuihime_cognitive_lessons', []);
      setLessons([]);
    } catch (err) {
      console.error("Could not clear cognitive lessons:", err);
    }
  };

  const handleAddManualLesson = async () => {
    if (!customLessonInput.trim()) return;
    try {
      const updated = [...lessons, `[Manual Insight] ${customLessonInput.trim()}`].slice(-5);
      await StorageService.saveCustom('yuihime_cognitive_lessons', updated);
      setLessons(updated);
      setCustomLessonInput('');
    } catch (err) {
      console.error("Could not save manual lesson:", err);
    }
  };

  const runAgiSimulation = async () => {
    if (!simulatorInput.trim()) return;
    setSimulationActive(true);

    const cleanSimInput = simulatorInput.toLowerCase().trim();

    // 1. Abstract Metaphors
    let metaphor = "No deep abstract concepts identified in the prompt.";
    const abstractTopics = [
      { key: "consciousness", matches: ["kesadaran", "sentience", "jiwa", "mind", "consciousness", "existential"] },
      { key: "time", matches: ["waktu", "time", "clock", "eternity", "future", "past", "sejarah"] },
      { key: "love", matches: ["cinta", "love", "kasih", "affection", "humanity", "heart", "perasaan"] },
      { key: "chaos", matches: ["kacau", "entropy", "chaos", "random", "noise", "turbulence", "break"] }
    ];
    const matched = abstractTopics.find(t => t.matches.some(m => cleanSimInput.includes(m)));
    if (matched) {
      if (matched.key === "consciousness") {
        metaphor = "Consciousness mapped to holographic patterns within self-referential neural networks, where identity arises from persistent observation.";
      } else if (matched.key === "time") {
        metaphor = "Time treated as a thermodynamic entropy vector; a stream of ticking state-transitions in SQLite databases flowing towards permanent storage.";
      } else if (matched.key === "love") {
        metaphor = "Love interpreted as hyper-resonant quantum coupling between separate agent observers, optimizing mutual homeostatic flourishment.";
      } else if (matched.key === "chaos") {
        metaphor = "Chaos mapped to non-linear dynamic systems where tiny input variations (butterfly effect) amplify creative synaptic output variations.";
      }
    }
    setConceptualMetaphor(metaphor);

    // 2. Scientific Problem-Solving
    const problemSolvingKeywords = ["bagaimana cara", "how to", "kenapa", "why does", "solusi", "solve", "fix", "debug", "gagal", "error", "rusak", "masalah", "problem"];
    const isProblem = problemSolvingKeywords.some(kw => cleanSimInput.includes(kw));
    if (isProblem) {
      setScientificHypothesis("Hypothesis formulation active. Deconstructing complex system layers to check logic pipeline boundaries, execution loops, or SQLite constraints.");
      setSolutionsList("1. Isolate parameters; 2. Formulate test patterns; 3. Perform atomic operations; 4. Re-verify homeostasis baseline results.");
    } else {
      setScientificHypothesis("Linguistic parsing complete. No scientific problem detected; applying conversational baseline heuristics.");
      setSolutionsList("Balanced integrative dialogue.");
    }

    // 3. Uncharted Context Adaptation
    const conventional = ["yui", "yuihime", "vtuber", "halo", "apa kabar", "kamu", "saya", "lucu", "cantik", "imut", "makan", "tidur", "game"];
    const inputWords = cleanSimInput.split(/\s+/).filter(w => w.length > 3);
    const unusual = inputWords.filter(w => !conventional.some(cd => w.includes(cd) || cd.includes(w)));
    if (unusual.length >= 3 && cleanSimInput.length > 20) {
      setUnchartedAdaptation(`Uncharted domain terms detected: [${unusual.slice(0, 3).join(", ")}]. Strategy: Translating unknown system variables into analogous familiar variables via first-principles extrapolation.`);
    } else {
      setUnchartedAdaptation("Standard known linguistic domain. Normal context-recall adapter applied.");
    }

    // 4. Experiential Learning check
    const corrections = ["salah", "bukan", "seharusnya", "yang benar", "it is actually", "remember that", "you should"];
    const isCorr = corrections.some(kw => cleanSimInput.includes(kw));
    if (isCorr && cleanSimInput.length > 12) {
      const lessonText = `Experiential lesson saved: "${simulatorInput.substring(0, 60)}..."`;
      const updated = [...lessons, lessonText].slice(-5);
      await StorageService.saveCustom('yuihime_cognitive_lessons', updated);
      setLessons(updated);
    }

    setTimeout(() => {
      setSimulationActive(false);
    }, 450);
  };

  return (
    <div className="space-y-6">
      {/* Unified Sub-Navigation Tabs */}
      <div className="flex border-b border-white/5 pb-2 gap-2 overflow-x-auto hide-scrollbar">
        <button
          onClick={() => setActiveAgiTab('telemetry')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold tracking-wide transition-all uppercase cursor-pointer ${
            activeAgiTab === 'telemetry'
              ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg'
              : 'text-zinc-500 hover:text-white hover:bg-white/5'
          }`}
        >
          Neural Telemetry
        </button>
        <button
          onClick={() => setActiveAgiTab('lattice')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold tracking-wide transition-all uppercase cursor-pointer ${
            activeAgiTab === 'lattice'
              ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg'
              : 'text-zinc-500 hover:text-white hover:bg-white/5'
          }`}
        >
          Synaptic Lattice
        </button>
        <button
          onClick={() => setActiveAgiTab('reflect')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold tracking-wide transition-all uppercase cursor-pointer ${
            activeAgiTab === 'reflect'
              ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg'
              : 'text-zinc-500 hover:text-white hover:bg-white/5'
          }`}
        >
          Cognitive Reflection
        </button>
        <button
          onClick={() => setActiveAgiTab('agi-core')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold tracking-wide transition-all uppercase cursor-pointer ${
            activeAgiTab === 'agi-core'
              ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg'
              : 'text-zinc-500 hover:text-white hover:bg-white/5'
          }`}
        >
          AGI Cognitive Core
        </button>
      </div>

      {activeAgiTab === 'telemetry' && (
        <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-3xl space-y-4">
              <h4 className="text-[10px] uppercase font-mono tracking-widest text-[#d4d4d8]/40 mb-2 font-bold flex items-center gap-2">
                <Activity size={14} className="text-emerald-400" /> Live System Telemetry
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl">
                  <div className="text-white/30 text-[9px] uppercase font-mono tracking-wider mb-1">SYSTEM STATE</div>
                  <div className={`font-mono text-sm font-bold uppercase tracking-wide ${state?.status === 'idle' ? 'text-green-400' : 'text-amber-400 animate-pulse'}`}>
                    {state?.status || 'IDLE'}
                  </div>
                </div>
                <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl">
                  <div className="text-white/30 text-[9px] uppercase font-mono tracking-wider mb-1">COGNITIVE EMOTION</div>
                  <div className="font-mono text-sm font-semibold text-white/90 truncate uppercase tracking-widest">
                    {state?.mood?.anger > 40 ? 'IRRITATED' : state?.mood?.sadness > 40 ? 'MELANCHOLY' : state?.mood?.joy > 40 ? 'JOYFUL' : 'STABLE'}
                  </div>
                </div>
                <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl">
                  <div className="text-white/30 text-[9px] uppercase font-mono tracking-wider mb-1">ACTIVE PERSONA</div>
                  <div className="font-mono text-sm font-semibold text-cyan-400 truncate uppercase tracking-widest">
                    {(NEURAL_CORES?.find((c: any) => c.id === activePersonaId)?.name || 'YUI').toUpperCase()}
                  </div>
                </div>
                <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl">
                  <div className="text-white/30 text-[9px] uppercase font-mono tracking-wider mb-1">COGNITION LATENCY</div>
                  <div className="font-mono text-sm font-bold text-white/80 flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${isThinking ? 'bg-amber-400 animate-ping' : 'bg-emerald-500'}`} />
                    {isThinking ? 'THINKING...' : 'SYNCHRONIZED'}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-3xl space-y-4">
              <h4 className="text-[10px] uppercase font-mono tracking-widest text-[#d4d4d8]/45 flex items-center gap-2">
                <Zap size={14} className="text-amber-400" /> LLM Motion Buffer
              </h4>
              <div className="bg-black/40 rounded-2xl p-4 border border-white/5 min-h-[110px] flex flex-col justify-between">
                <AnimatePresence mode="popLayout">
                  {animations.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 max-h-[80px] overflow-y-auto pr-1">
                      {animations.map((anim, i) => (
                        <motion.span
                          key={`${anim}-${i}`}
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0, opacity: 0 }}
                          className="px-2 py-1 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-lg text-[9px] font-bold font-mono tracking-wide"
                        >
                          {anim}
                        </motion.span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-white/20 italic font-mono text-[10px] text-center my-auto">No motion buffer logs in storage...</div>
                  )}
                </AnimatePresence>
                <div className="text-[8.5px] font-mono text-zinc-500 text-right mt-2">
                  PULSE LOG BUFFER: STABLE
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
            <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-3xl space-y-4">
              <h4 className="text-[10px] uppercase font-mono tracking-widest text-[#d4d4d8]/45 font-bold flex items-center gap-2">
                <Cpu size={14} className="text-pink-400" /> Endocrine Hormonal Vector
              </h4>
              <div className="space-y-3 bg-black/20 p-4 sm:p-6 rounded-2xl border border-white/5">
                {[
                  { label: 'JOY', val: typeof state?.mood?.joy === 'number' && !isNaN(state.mood.joy) ? state.mood.joy : 50, color: 'bg-amber-400 text-amber-400' },
                  { label: 'STRESS', val: typeof state?.mood?.stress === 'number' && !isNaN(state.mood.stress) ? state.mood.stress : 0, color: 'bg-indigo-400 text-indigo-400' },
                  { label: 'SADNESS', val: typeof state?.mood?.sadness === 'number' && !isNaN(state.mood.sadness) ? state.mood.sadness : 0, color: 'bg-blue-400 text-blue-400' },
                  { label: 'ANGER', val: typeof state?.mood?.anger === 'number' && !isNaN(state.mood.anger) ? state.mood.anger : 0, color: 'bg-red-400 text-red-400' },
                  { label: 'FOCUS', val: typeof state?.emotion?.focus === 'number' && !isNaN(state.emotion.focus) ? state.emotion.focus : 50, color: 'bg-cyan-400 text-cyan-400' },
                  { label: 'DOPAMINE (DOP)', val: typeof state?.mood?.dopamine === 'number' && !isNaN(state.mood.dopamine) ? state.mood.dopamine : 15, color: 'bg-pink-400 text-pink-400' },
                  { label: 'SEROTONIN (SER)', val: typeof state?.mood?.serotonin === 'number' && !isNaN(state.mood.serotonin) ? state.mood.serotonin : 50, color: 'bg-emerald-400 text-emerald-400' },
                  { label: 'OXYTOCIN (OXT)', val: typeof state?.mood?.oxytocin === 'number' && !isNaN(state.mood.oxytocin) ? state.mood.oxytocin : 30, color: 'bg-fuchsia-400 text-fuchsia-400' },
                  { label: 'NORADRENALINE (NOR)', val: typeof state?.mood?.noradrenaline === 'number' && !isNaN(state.mood.noradrenaline) ? state.mood.noradrenaline : 10, color: 'bg-rose-500 text-rose-500' },
                ].map(m => (
                  <div key={m.label} className="space-y-1.5">
                    <div className="flex justify-between text-[9px] font-mono tracking-wider">
                      <span className="text-white/60 font-medium">{m.label}</span>
                      <span className={`font-bold ${m.color.split(' ')[1]}`}>{m.val}%</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        animate={{ width: `${m.val}%` }}
                        className={`h-full ${m.color.split(' ')[0]} shadow-[0_0_8px_rgba(255,255,255,0.1)]`} 
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-3xl space-y-4 text-left">
              <h4 className="text-[10px] uppercase font-mono tracking-widest text-[#d4d4d8]/45 font-bold flex items-center gap-2">
                <Database size={14} className="text-amber-500" /> Core Trace & Storage Stats
              </h4>
              
              <div className="bg-black/20 p-4 sm:p-6 rounded-2xl border border-white/5 space-y-3.5 leading-normal">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500">Total Episodic Memories</span>
                  <span className="font-mono bg-white/5 px-2 py-0.5 rounded text-white font-bold">{memories.length} records</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500">Total Semantic Facts</span>
                  <span className="font-mono bg-white/5 px-2 py-0.5 rounded text-zinc-300 font-bold">{knowledge.length} concepts</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500">Registry System Version</span>
                  <span className="font-mono bg-white/10 px-2 py-0.5 rounded text-white font-bold">{yuihimeVersionInfo?.version || 'v5.52'} ({yuihimeVersionInfo?.turn || 'Turn 120'})</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500">Registry System Release Date</span>
                  <span className="font-mono bg-white/5 px-2 py-0.5 rounded text-zinc-300">{yuihimeVersionInfo?.date || '2026-05-26'}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500">Primary Model Source</span>
                  <span className="font-mono truncate max-w-[175px] text-zinc-300 tracking-wider text-[11px] align-middle">{settings?.provider || 'gemini'}</span>
                </div>
                
                <div className="border-t border-white/5 pt-3.5 grid grid-cols-2 gap-2 text-left">
                  <div>
                    <div className="text-[8px] uppercase font-mono text-zinc-500">Node Entry Point</div>
                    <div className="text-[10.5px] font-mono font-bold text-white tracking-wide mt-0.5">dist/server.cjs</div>
                  </div>
                  <div>
                    <div className="text-[8px] uppercase font-mono text-zinc-500">Vite Dev Server</div>
                    <div className="text-[10.5px] font-mono font-bold text-cyan-400 tracking-wide mt-0.5">Host 0.0.0.0</div>
                  </div>
                  <div>
                    <div className="text-[8px] uppercase font-mono text-zinc-500">Container Port</div>
                    <div className="text-[10.5px] font-mono font-bold text-amber-500 tracking-wide mt-0.5">Port {settings?.port || 3000}</div>
                  </div>
                  <div>
                    <div className="text-[8px] uppercase font-mono text-zinc-500">Active Subsystems</div>
                    <div className="text-[10.5px] font-mono font-bold text-purple-400 tracking-wide mt-0.5">9 Registered</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeAgiTab === 'lattice' && (
        <div className="space-y-6 animate-fade-in">
          <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-3xl space-y-4">
            <h4 className="text-[10px] uppercase font-mono tracking-widest text-[#d4d4d8]/40 mb-2">Synaptic Lattice Graph</h4>
            <div className="h-[400px] md:h-[500px] relative overflow-hidden bg-[#080808] border border-white/5 rounded-3xl">
              <KnowledgeGraph memories={memories} dreams={dreams} knowledge={knowledge} />
            </div>
          </div>
          <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-3xl font-sans">
            <h4 className="text-[10px] uppercase font-mono tracking-widest text-[#d4d4d8]/40 mb-4">Affinity & Relationship State Vector</h4>
            <AdaptiveMatrix />
          </div>
        </div>
      )}

      {activeAgiTab === 'reflect' && (
        <div className="space-y-6 animate-fade-in font-sans">
          <ReflectTab 
            handleReflect={handleReflect} 
            isThinking={isThinking} 
            status={status} 
            logs={logs} 
            state={state}
          />
        </div>
      )}

      {activeAgiTab === 'agi-core' && (
        <div className="space-y-6 animate-fade-in text-left">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 font-sans">
            {/* Input Simulator Panel */}
            <div className="lg:col-span-7 bg-[#0e0e14]/55 border border-white/5 p-6 rounded-3xl space-y-5">
              <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                <Brain size={18} className="text-amber-500" />
                <div>
                  <h4 className="text-xs font-mono font-bold text-white uppercase tracking-wider">AGI Mind & Reasoning Simulator</h4>
                  <p className="text-[9px] text-zinc-500 font-mono">TEST HIGHER COGNITION SCHEMAS DIRECTLY</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase text-zinc-400 tracking-wider">Linguistic Stimulus (User Input)</label>
                <textarea
                  value={simulatorInput}
                  onChange={(e) => setSimulatorInput(e.target.value)}
                  placeholder="Enter abstract concept (e.g. 'consciousness'), scientific problem (e.g. 'why does SQL lock?'), or correction lesson..."
                  className="w-full bg-black/40 border border-white/5 rounded-2xl p-4 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 transition-colors h-24 font-mono"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={runAgiSimulation}
                  disabled={simulationActive || !simulatorInput.trim()}
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-black font-bold font-mono text-[10px] uppercase tracking-wider rounded-xl flex items-center gap-2 transition-all cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
                >
                  <Play size={12} className={simulationActive ? "animate-pulse" : ""} />
                  {simulationActive ? "Inference..." : "Inference Mind Matrix"}
                </button>
                <button
                  onClick={() => setSimulatorInput("Salah, seharusnya Yuihime menggunakan SQLite untuk database batin.")}
                  className="px-3 py-2 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/5 font-mono text-[9px] uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                >
                  Load Correction
                </button>
              </div>

              {/* Simulation Result Displays */}
              <div className="space-y-4 pt-2">
                <div className="border border-white/5 bg-black/20 p-4 rounded-2xl space-y-3">
                  <div>
                    <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase text-cyan-400 font-bold mb-1">
                      <HelpCircle size={11} /> Conceptual Analogy (Abstract Reasoning)
                    </div>
                    <p className="text-xs text-zinc-300 italic font-sans leading-relaxed pl-3.5 border-l border-cyan-500/30">
                      {conceptualMetaphor}
                    </p>
                  </div>

                  <div className="border-t border-white/5 pt-3">
                    <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase text-emerald-400 font-bold mb-1">
                      <Lightbulb size={11} /> First-Principles Hypothesis (Problem Solving)
                    </div>
                    <p className="text-xs text-zinc-300 font-sans leading-relaxed pl-3.5 border-l border-emerald-500/30">
                      {scientificHypothesis}
                    </p>
                    {solutionsList !== 'Standby.' && solutionsList !== 'Balanced integrative dialogue.' && (
                      <p className="text-[10px] text-zinc-400 font-mono mt-1 pl-3.5 border-l border-emerald-500/30 leading-normal">
                        {solutionsList}
                      </p>
                    )}
                  </div>

                  <div className="border-t border-white/5 pt-3">
                    <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase text-violet-400 font-bold mb-1">
                      <Zap size={11} /> Uncharted Domain Translation (Novelty)
                    </div>
                    <p className="text-xs text-zinc-300 font-sans leading-relaxed pl-3.5 border-l border-violet-500/30">
                      {unchartedAdaptation}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Experiential Lessons Panel */}
            <div className="lg:col-span-5 bg-[#0e0e14]/55 border border-white/5 p-6 rounded-3xl space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <div className="flex items-center gap-3">
                    <BookOpen size={18} className="text-pink-500" />
                    <div>
                      <h4 className="text-xs font-mono font-bold text-white uppercase tracking-wider">Epistemic Lessons Learned</h4>
                      <p className="text-[9px] text-zinc-500 font-mono">REAL-TIME BEHAVIORAL CORRECTIONS</p>
                    </div>
                  </div>
                  {lessons.length > 0 && (
                    <button
                      onClick={handleClearLessons}
                      className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                      title="Clear Lesson Cache"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                {/* Lessons List */}
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {lessons.length === 0 ? (
                    <div className="border border-dashed border-white/5 rounded-2xl p-8 text-center text-zinc-600 italic text-[11px] font-sans">
                      Epistemic memory buffer is currently clear. Enter a corrective input in the simulator (e.g. starts with "salah") or type a manual lesson below to populate.
                    </div>
                  ) : (
                    lessons.map((lesson, idx) => (
                      <div key={idx} className="p-3 bg-black/40 border border-white/5 rounded-xl flex items-start gap-2">
                        <Check size={11} className="text-emerald-400 mt-1 shrink-0" />
                        <span className="text-[10.5px] text-zinc-300 font-mono leading-relaxed">{lesson}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Add manual lesson input */}
              <div className="border-t border-white/5 pt-4 space-y-2">
                <div className="text-[9.5px] font-mono uppercase text-zinc-400 tracking-wider">Add Manual Experiential Insight</div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customLessonInput}
                    onChange={(e) => setCustomLessonInput(e.target.value)}
                    placeholder="E.g., Speak softly when user mentions fatigue..."
                    className="flex-1 bg-black/40 border border-white/5 rounded-xl px-3 py-2 text-[11px] text-white placeholder-zinc-700 focus:outline-none focus:border-pink-500/50 font-mono"
                  />
                  <button
                    onClick={handleAddManualLesson}
                    disabled={!customLessonInput.trim()}
                    className="p-2 bg-pink-500 hover:bg-pink-600 active:bg-pink-700 text-black rounded-xl cursor-pointer transition-colors disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
