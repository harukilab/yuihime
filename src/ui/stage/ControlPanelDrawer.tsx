import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LockedSlider } from '../../components/LockedSlider';
import { 
  Radio, Maximize2, Move, Mic, Eye, Shield, Sparkles, Heart, Activity, Monitor, ChevronRight, Check, RefreshCw, UserPlus, Play, Disc
} from 'lucide-react';
import { AvatarConfig, AgentState } from '../../include/types';

interface ControlPanelDrawerProps {
  isPanelOpen: boolean;
  setIsPanelOpen: (val: boolean) => void;
  activeSubTab: 'visual' | 'gestures' | 'stream' | 'agi';
  setActiveSubTab: (tab: 'visual' | 'gestures' | 'stream' | 'agi') => void;
  
  // Visuals Mode
  backdrop: string;
  handleSelectBackdrop: (mode: string) => void;
  customImgUrl: string;
  handleCustomUrlChange: (url: string) => void;
  onOpenBgDrawer: () => void;
  
  // Transformers
  avatarConfig: AvatarConfig;
  onAvatarUpdate: (newConfig: any) => void;
  
  // Mic Analyzer
  isMicEnabled: boolean;
  handleToggleMic: () => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  micError: string | null;
  startMic: () => Promise<void>;
  setMicError: (val: string | null) => void;
  
  // Vision Camera Sight
  isCameraEnabled: boolean;
  handleToggleCamera: () => void;
  cameraVideoRef: React.RefObject<HTMLVideoElement | null>;
  isAnalyzingCamera: boolean;
  offlineVisualAnalysis: string;
  cameraError: string | null;
  
  // Subtitles
  showSubtitles: boolean;
  setShowSubtitles: (val: boolean) => void;
  
  // Manual motions triggers
  gestures: any[];
  expressions: any[];
  handleTriggerAnimation: (anim: string) => void;
  moodPresets?: any[];
  playingPresetId?: string | null;
  playingStepIndex?: number;
  handlePlayPreset?: (preset: any) => Promise<void>;
  
  // Stream Simulator Custom Send
  isSwarmEnabled: boolean;
  setIsSwarmEnabled: (val: boolean) => void;
  simulateSuperchat: (color: string) => void;
  simulateSubscriber: () => void;
  
  // Simulated Interactive Input
  simulatedSender: string;
  setSimulatedSender: (val: string) => void;
  simulatedMessage: string;
  setSimulatedMessage: (val: string) => void;
  isSendingChat: boolean;
  chatSimStatus: { type: 'success' | 'error' | 'info', text: string } | null;
  onSendSimulatedChat: (e: React.FormEvent) => void;

  // OBS Overlay generators
  getOverlayLink: (type: 'stream' | 'obs') => string;
  copyOverlayLink: (type: 'stream' | 'obs') => void;
  copiedInteractive: boolean;
  copiedPure: boolean;
  
  // AGI Somatic, Homeostasis stats and spectrums
  state: AgentState;
  
  // Quantum Core Save & Restore
  isGeneratingBackup: boolean;
  quantumBackups: any[];
  handleCreateQuantumBackup: () => void;
  handleRestoreQuantumBackup: (backupId: string) => void;
  isRestoringBackup: string | null;

  // Wake Word Config
  wakeWordEnabled: boolean;
  setWakeWordEnabled: (val: boolean) => void;
  wakeWordKeyword: string;
  setWakeWordKeyword: (val: string) => void;
  syncWakeWordWithMic?: boolean;
  setSyncWakeWordWithMic?: (val: boolean) => void;

  // Speech Interruption Mode
  speechInterruptionMode: 'interrupt' | 'manual';
  setSpeechInterruptionMode: (mode: 'interrupt' | 'manual') => void;
}

export const ControlPanelDrawer: React.FC<ControlPanelDrawerProps> = ({
  isPanelOpen,
  setIsPanelOpen,
  activeSubTab,
  setActiveSubTab,
  backdrop,
  handleSelectBackdrop,
  customImgUrl,
  handleCustomUrlChange,
  onOpenBgDrawer,
  avatarConfig,
  onAvatarUpdate,
  isMicEnabled,
  handleToggleMic,
  canvasRef,
  micError,
  startMic,
  setMicError,
  isCameraEnabled,
  handleToggleCamera,
  cameraVideoRef,
  isAnalyzingCamera,
  offlineVisualAnalysis,
  cameraError,
  showSubtitles,
  setShowSubtitles,
  gestures = [],
  expressions = [],
  handleTriggerAnimation,
  moodPresets = [],
  playingPresetId = null,
  playingStepIndex = -1,
  handlePlayPreset,
  isSwarmEnabled,
  setIsSwarmEnabled,
  simulateSuperchat,
  simulateSubscriber,
  simulatedSender,
  setSimulatedSender,
  simulatedMessage,
  setSimulatedMessage,
  isSendingChat,
  chatSimStatus,
  onSendSimulatedChat,
  getOverlayLink,
  copyOverlayLink,
  copiedInteractive,
  copiedPure,
  state,
  isGeneratingBackup,
  quantumBackups = [],
  handleCreateQuantumBackup,
  handleRestoreQuantumBackup,
  isRestoringBackup,
  wakeWordEnabled,
  setWakeWordEnabled,
  wakeWordKeyword,
  setWakeWordKeyword,
  syncWakeWordWithMic,
  setSyncWakeWordWithMic,
  speechInterruptionMode,
  setSpeechInterruptionMode
}) => {
  const [isCollapsed, setIsCollapsed] = React.useState(false);

  // Physiological somatic fluctuations system
  const [somaticOscillator, setSomaticOscillator] = React.useState(0);
  const [somaticConfig, setSomaticConfig] = React.useState<{
    somaticTempBaseline: number;
    somaticTempCpuFactor: number;
    enableSomaticGrounding: boolean;
  }>({
    somaticTempBaseline: 36.5,
    somaticTempCpuFactor: 0.015,
    enableSomaticGrounding: true
  });

  React.useEffect(() => {
    if (!isPanelOpen) return;
    const t = setInterval(() => {
      setSomaticOscillator(prev => (prev + 1) % 1000);
    }, 2500); // Ticks every 2.5 seconds
    return () => clearInterval(t);
  }, [isPanelOpen]);

  React.useEffect(() => {
    if (!isPanelOpen) return;
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        const config = data['somatic-sensor-grounding'] || {};
        setSomaticConfig({
          somaticTempBaseline: config.somaticTempBaseline !== undefined ? Number(config.somaticTempBaseline) : 36.5,
          somaticTempCpuFactor: config.somaticTempCpuFactor !== undefined ? Number(config.somaticTempCpuFactor) : 0.015,
          enableSomaticGrounding: config.enableSomaticGrounding !== undefined ? !!config.enableSomaticGrounding : true
        });
      })
      .catch(err => console.warn('[SOMATIC] Gagal memuat setelan somatisasi:', err));
  }, [isPanelOpen, state.systemHealth?.somatic?.virtualTemperature]);

  // Dynamic live calculations for biological somatic vitals (with micro-oscillators)
  const baseHeartrate = state.systemHealth?.somatic?.virtualHeartrate || Math.round(70 + (state.emotion?.arousal || 50) * 0.2);
  const hrDrift = Math.round(Math.sin(somaticOscillator * 0.9) * 1.5 + Math.cos(somaticOscillator * 0.4) * 0.5);
  const displayHeartrate = baseHeartrate + hrDrift;

  const baseTemperature = (() => {
    const currentTemp = state.systemHealth?.somatic?.virtualTemperature;
    const defaultBaseline = 36.5;
    // If we have a calculated virtual temperature from the backend, adjust it relative to the customized baseline difference
    if (currentTemp !== undefined) {
      const baselineDiff = somaticConfig.somaticTempBaseline - defaultBaseline;
      if (Math.abs(baselineDiff) > 0.1) {
        return Number((currentTemp + baselineDiff).toFixed(1));
      }
      return currentTemp;
    }
    // Fallback fully dynamic simulation using user's explicit temperature settings
    return Number((somaticConfig.somaticTempBaseline + (state.emotion?.focus || 50) * 0.02).toFixed(1));
  })();

  const tempDrift = Number((Math.sin(somaticOscillator * 0.3) * 0.03).toFixed(3));
  const displayTemperature = (baseTemperature + tempDrift).toFixed(1);

  const baseCpu = state.systemHealth?.somatic?.cpuUsage || 12.5;
  const cpuDrift = Number((Math.sin(somaticOscillator * 0.7) * 1.5 + Math.cos(somaticOscillator * 0.25) * 0.8).toFixed(1));
  const displayCpu = Math.max(1.5, Math.min(99.0, Number((baseCpu + cpuDrift).toFixed(1))));

  const baseRam = state.systemHealth?.somatic?.ramUsage || 42.1;
  const ramDrift = Number((Math.cos(somaticOscillator * 0.45) * 0.35).toFixed(1));
  const displayRam = Math.max(1.5, Math.min(99.0, Number((baseRam + ramDrift).toFixed(1))));

  const updateScale = (val: number) => {
    onAvatarUpdate({ ...avatarConfig, scale: val });
  };

  const updateXOffset = (val: number) => {
    onAvatarUpdate({ ...avatarConfig, xOffset: val });
  };

  const updateYOffset = (val: number) => {
    onAvatarUpdate({ ...avatarConfig, yOffset: val });
  };

  return (
    <AnimatePresence>
      {isPanelOpen && (
        <motion.div
          initial={{ opacity: 0, x: 100, scale: 0.98 }}
          animate={{ 
            opacity: 1, 
            x: 0, 
            scale: 1,
            width: isCollapsed ? "68px" : "100%",
            maxWidth: isCollapsed ? "68px" : "380px",
          }}
          exit={{ opacity: 0, x: 100, scale: 0.98 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="absolute top-16 md:top-20 right-4 bottom-4 bg-[#050508]/90 backdrop-blur-3xl border border-white/10 rounded-2xl md:rounded-3xl shadow-[0_30px_70px_rgba(0,0,0,0.9)] z-40 flex flex-col overflow-hidden pointer-events-auto select-none text-white transition-all duration-300"
        >
          {isCollapsed ? (
            <div className="flex flex-col h-full items-center py-4 justify-between bg-black/40">
              {/* Mini expand button */}
              <button
                onClick={() => setIsCollapsed(false)}
                className="w-10 h-10 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-500 cursor-pointer active:scale-95 transition-all"
                title="Perluas Panel Kontrol"
              >
                <ChevronRight className="w-5 h-5 text-amber-500 rotate-180" />
              </button>

              {/* Vertical mini tabs */}
              <div className="flex flex-col gap-3.5">
                <button
                  onClick={() => { setActiveSubTab('visual'); setIsCollapsed(false); }}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center border cursor-pointer transition-all ${activeSubTab === 'visual' ? 'bg-amber-500/10 border-amber-500/45 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.2)] font-bold' : 'bg-black/30 border-white/5 text-white/40 hover:text-white/70'}`}
                  title="Stage Visuals (🎨)"
                >
                  <span className="text-sm">🎨</span>
                </button>
                <button
                  onClick={() => { setActiveSubTab('gestures'); setIsCollapsed(false); }}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center border cursor-pointer transition-all ${activeSubTab === 'gestures' ? 'bg-amber-500/10 border-amber-500/45 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.2)] font-bold' : 'bg-black/30 border-white/5 text-white/40 hover:text-white/70'}`}
                  title="Emotes & Anim (✨)"
                >
                  <span className="text-sm">✨</span>
                </button>
                <button
                  onClick={() => { setActiveSubTab('stream'); setIsCollapsed(false); }}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center border cursor-pointer transition-all ${activeSubTab === 'stream' ? 'bg-amber-500/10 border-amber-500/45 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.2)] font-bold' : 'bg-black/30 border-white/5 text-white/40 hover:text-white/70'}`}
                  title="Stream Alerts & Emulators (📡)"
                >
                  <span className="text-sm">📡</span>
                </button>
                <button
                  onClick={() => { setActiveSubTab('agi'); setIsCollapsed(false); }}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center border cursor-pointer transition-all ${activeSubTab === 'agi' ? 'bg-amber-500/10 border-amber-500/45 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.2)] font-bold' : 'bg-black/30 border-white/5 text-white/40 hover:text-white/70'}`}
                  title="AGI Soul Mind Stats (🧠)"
                >
                  <span className="text-sm">🧠</span>
                </button>
              </div>

              {/* Hide button */}
              <button
                onClick={() => setIsPanelOpen(false)}
                className="w-10 h-10 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 flex items-center justify-center text-rose-400 cursor-pointer active:scale-95 transition-all font-mono text-[9px]"
                title="Hide Panel"
              >
                HIDE
              </button>
            </div>
          ) : (
            <>
              {/* Header of settings panel */}
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black/30 text-left">
                <div className="flex items-center gap-2">
                  <Radio className="text-amber-500 animate-pulse w-4 h-4" />
                  <div className="flex flex-col">
                    <h2 className="text-[11px] uppercase tracking-widest font-mono font-bold text-white/80">AIRI STAGE DOCK</h2>
                    <span className="text-[8px] uppercase font-mono text-white/40 tracking-wider">Hibrid VTuber Workspace Controller</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => setIsCollapsed(true)}
                    className="p-1 px-2.5 bg-white/5 hover:bg-amber-500/10 text-white/50 hover:text-amber-500 border border-white/5 rounded-lg transition-colors cursor-pointer text-[9px] font-mono uppercase font-semibold"
                    title="Ciutkan Panel Kontrol"
                  >
                    Ciutkan
                  </button>
                  <button
                    onClick={() => setIsPanelOpen(false)}
                    className="p-1 px-2.5 bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-400 border border-white/5 rounded-lg transition-colors cursor-pointer text-[9px] font-mono uppercase font-semibold"
                  >
                    Hide
                  </button>
                </div>
              </div>

              {/* Compact Sub-Tab Selection */}
              <div className="grid grid-cols-4 bg-black/50 border-b border-white/5 p-1 select-none">
                <button
                  onClick={() => setActiveSubTab('visual')}
                  className={`py-2 text-[9px] font-mono tracking-widest uppercase rounded-lg transition-all cursor-pointer ${activeSubTab === 'visual' ? 'bg-white/10 text-white font-bold' : 'text-white/40 hover:text-white/70'}`}
                >
                  🎨 Stage
                </button>
                <button
                  onClick={() => setActiveSubTab('gestures')}
                  className={`py-2 text-[9px] font-mono tracking-widest uppercase rounded-lg transition-all cursor-pointer ${activeSubTab === 'gestures' ? 'bg-white/10 text-white font-bold' : 'text-white/40 hover:text-white/70'}`}
                >
                  ✨ Emotes
                </button>
                <button
                  onClick={() => setActiveSubTab('stream')}
                  className={`py-2 text-[9px] font-mono tracking-widest uppercase rounded-lg transition-all cursor-pointer ${activeSubTab === 'stream' ? 'bg-white/10 text-white font-bold' : 'text-white/40 hover:text-white/70'}`}
                >
                  📡 Stream
                </button>
                <button
                  onClick={() => setActiveSubTab('agi')}
                  className={`py-2 text-[9px] font-mono tracking-widest uppercase rounded-lg transition-all cursor-pointer ${activeSubTab === 'agi' ? 'bg-white/10 text-white font-bold' : 'text-white/40 hover:text-white/70'}`}
                >
                  🧠 AGI Soul
                </button>
              </div>

              {/* Scrollable content area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar bg-[#08080a]/40">
                
                {/* --- TAB 1: VISUAL & POSITION --- */}
                {activeSubTab === 'visual' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-5 text-left"
                  >
                    {/* Chroma Options */}
                    <div className="space-y-2">
                      <span className="text-[8px] uppercase tracking-[0.2em] font-mono text-white/40 font-bold block mb-1">OBS Background Engine</span>
                      <div className="grid grid-cols-3 gap-1.5">
                        {['matrix', 'neon', 'chroma-green', 'chroma-blue', 'black', 'custom'].map((mode) => (
                          <button
                            key={mode}
                            onClick={() => handleSelectBackdrop(mode)}
                            className={`py-1.5 text-[9px] font-mono border rounded-lg transition-all cursor-pointer truncate ${backdrop === mode ? 'bg-amber-500/10 border-amber-500 text-amber-500 font-bold' : 'bg-black/30 border-white/5 text-white/55 hover:border-white/15 hover:text-white'}`}
                          >
                            {mode === 'chroma-green' ? 'Green Scr' : mode === 'chroma-blue' ? 'Blue Scr' : mode.charAt(0).toUpperCase() + mode.slice(1)}
                          </button>
                        ))}
                      </div>

                      <div className="mt-2.5">
                        <button
                          type="button"
                          onClick={onOpenBgDrawer}
                          className="w-full py-2 bg-gradient-to-r from-amber-500/10 to-amber-600/10 hover:from-amber-500/20 hover:to-amber-600/20 border border-amber-500/35 text-amber-500 hover:text-amber-400 font-bold rounded-xl text-[10px] font-mono uppercase tracking-wider transition-all duration-200 cursor-pointer text-center flex items-center justify-center gap-1.5 shadow-[0_4px_12px_rgba(245,158,11,0.05)]"
                        >
                          🖼️ Buka Galeri Backdrops (Laci)
                        </button>
                      </div>

                      {backdrop === 'custom' && (
                    <div className="mt-2 bg-black/40 border border-white/5 p-2 rounded-xl">
                      <label className="text-[8px] uppercase font-mono tracking-wider text-white/40 block mb-1">IMAGE URL</label>
                      <input 
                        type="text" 
                        value={customImgUrl}
                        onChange={(e) => handleCustomUrlChange(e.target.value)}
                        placeholder="https://images.unsplash.com/your-backdrop.jpg"
                        className="w-full text-[10px] font-mono bg-black/80 border border-white/10 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-amber-500 transition-colors"
                      />
                    </div>
                  )}
                </div>

                {/* Avatar Transform Sliders */}
                <div className="space-y-4 border-t border-white/5 pt-4">
                  <span className="text-[8px] uppercase tracking-[0.2em] font-mono text-white/40 font-bold block">Live2D Virtual Camera Setup</span>
                  
                  {/* Scale */}
                  <LockedSlider
                    value={avatarConfig?.scale ?? 1.2}
                    onChange={(val) => updateScale(val)}
                    min={0.5}
                    max={2.5}
                    step={0.1}
                    label="Scaler (Size)"
                    description="Adjust Live2D VTuber model scale presentation multiplier"
                    themeColor="amber"
                  />

                  {/* XOffset */}
                  <LockedSlider
                    value={avatarConfig?.xOffset ?? 0}
                    onChange={(val) => updateXOffset(val)}
                    min={-400}
                    max={400}
                    step={10}
                    label="Horizontal (X)"
                    description="Shift viewport horizontally"
                    themeColor="cyan"
                  />

                  {/* YOffset */}
                  <LockedSlider
                    value={avatarConfig?.yOffset ?? 0}
                    onChange={(val) => updateYOffset(val)}
                    min={-400}
                    max={400}
                    step={10}
                    label="Vertical (Y)"
                    description="Shift viewport vertically"
                    themeColor="emerald"
                  />
                </div>

                {/* Microphone Level Feed */}
                <div className="space-y-2 border-t border-white/5 pt-4">
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-white/60 uppercase tracking-wide flex items-center gap-1"><Mic size={11} className="text-amber-500" /> Mic Voice Analyzer</span>
                    <button 
                      onClick={handleToggleMic}
                      className={`p-1 px-2.5 rounded-lg text-[8px] font-mono uppercase tracking-wider border cursor-pointer transition-all ${isMicEnabled ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-black border-white/5 text-white/50 hover:bg-white/5'}`}
                    >
                      {isMicEnabled ? 'Mute' : 'Unlock Mic'}
                    </button>
                  </div>

                  <div className="h-10 flex items-center justify-center bg-black/60 border border-white/5 rounded-xl overflow-hidden relative">
                    {!isMicEnabled && (
                      <div className="text-[8px] font-mono text-white/30 uppercase tracking-widest text-center">Analyzer Disconnected</div>
                    )}
                    <canvas 
                      ref={canvasRef} width={280} height={40} 
                      className={`w-full h-full object-cover transition-opacity duration-300 ${isMicEnabled ? 'opacity-100' : 'opacity-0'}`} 
                    />
                  </div>

                  {micError && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-[10px] font-mono text-red-400 leading-relaxed text-left flex flex-col gap-2 shadow-[0_4px_12px_rgba(239,68,68,0.04)] mt-2">
                      <span className="font-bold flex items-center gap-1 text-red-500 uppercase text-[9px]">⚠️ Hubungan Bermasalah:</span>
                      <span>{micError}</span>
                      <div className="flex gap-2 mt-1">
                        <button 
                          onClick={() => {
                            window.open(window.location.href, '_blank');
                          }}
                          className="bg-red-500/30 hover:bg-red-500/40 text-white font-bold px-2.5 py-1 rounded text-[8px] uppercase tracking-wide cursor-pointer border border-red-500/40 transition-all select-none"
                        >
                          Buka di Tab Baru
                        </button>
                        <button 
                          onClick={async () => { setMicError(null); await startMic(); }}
                          className="bg-white/10 hover:bg-white/20 text-zinc-300 hover:text-white font-bold px-2.5 py-1 rounded text-[8px] uppercase tracking-wide cursor-pointer border border-white/10 transition-all select-none"
                        >
                          Coba Lagi
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Wake Word Configuration (Web Speech API) */}
                <div className="space-y-2 border-t border-white/5 pt-4">
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-white/70 flex items-center gap-1.5 font-bold uppercase tracking-wide">
                      <Sparkles size={11} className="text-cyan-400 animate-pulse" /> Wake Word Trigger
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        checked={wakeWordEnabled} 
                        onChange={(e) => setWakeWordEnabled(e.target.checked)} 
                        className="sr-only peer" 
                      />
                      <div className="w-8 h-4 bg-zinc-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-cyan-500 peer-checked:after:bg-white peer-checked:after:border-transparent"></div>
                    </label>
                  </div>
                  <p className="text-[8.5px] font-mono text-white/40 leading-relaxed text-left">
                    Sebut kata kunci saat mic mati atau asisten tidur untuk mengaktifkan asisten dan mic secara otomatis lewat Web Speech API browser Anda.
                  </p>
                  {setSyncWakeWordWithMic && (
                    <div className="flex items-center justify-between text-[8.5px] font-mono pt-1.5 pb-0.5 border-t border-white/5">
                      <span className="flex items-center gap-1.5 text-white/60 cursor-help" title="Toggling Open Mic will automatically toggle the Wake Word trigger to keep them synchronized. Highly recommended for a seamless hands-free workflow!">
                        🔗 Sinkronkan dgn Tombol Mic
                      </span>
                      <label className="relative inline-flex items-center cursor-pointer select-none">
                        <input 
                          type="checkbox" 
                          checked={syncWakeWordWithMic} 
                          onChange={(e) => setSyncWakeWordWithMic(e.target.checked)} 
                          className="sr-only peer" 
                        />
                        <div className="w-7 h-3.5 bg-zinc-800 rounded-full peer peer-checked:after:translate-x-3 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-cyan-500 peer-checked:after:bg-white peer-checked:after:border-transparent"></div>
                      </label>
                    </div>
                  )}
                  {wakeWordEnabled && (
                    <div className="flex items-center gap-2 pt-1 bg-black/30 border border-white/5 rounded-xl p-2">
                      <span className="text-[8px] font-mono uppercase text-white/40 truncate">Kata Kunci:</span>
                      <input
                        type="text"
                        value={wakeWordKeyword}
                        onChange={(e) => setWakeWordKeyword(e.target.value)}
                        placeholder="Yui"
                        className="flex-1 bg-black/60 border border-white/10 rounded-lg px-2.5 py-1 text-[9px] font-mono text-cyan-400 focus:outline-none focus:border-cyan-500 transition-colors"
                      />
                    </div>
                  )}
                </div>

                {/* Speech Interruption Mode */}
                <div className="space-y-2 border-t border-white/5 pt-4">
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-white/70 flex items-center gap-1.5 font-bold uppercase tracking-wide">
                      <Mic size={11} className="text-cyan-400" /> Mode Interupsi Suara
                    </span>
                    <div className="flex bg-black/60 border border-white/10 rounded-lg p-0.5 font-mono text-[8.5px]">
                      <button
                        type="button"
                        onClick={() => setSpeechInterruptionMode('manual')}
                        className={`px-2 py-1 rounded transition-all cursor-pointer ${speechInterruptionMode === 'manual' ? 'bg-cyan-500/20 text-cyan-400 font-bold border border-cyan-500/30' : 'text-white/40 hover:text-white/70 border border-transparent'}`}
                        title="Yui akan terus bicara kecuali jika dibilang stop dulu"
                      >
                        Mode 1 (Manual)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSpeechInterruptionMode('interrupt')}
                        className={`px-2 py-1 rounded transition-all cursor-pointer ${speechInterruptionMode === 'interrupt' ? 'bg-amber-500/20 text-amber-500 font-bold border border-amber-500/30' : 'text-white/40 hover:text-white/70 border border-transparent'}`}
                        title="Setiap input baru akan langsung memotong suara Yui"
                      >
                        Mode 2 (Instan)
                      </button>
                    </div>
                  </div>
                  <p className="text-[8.5px] font-mono text-white/40 leading-relaxed text-left">
                    {speechInterruptionMode === 'manual' 
                      ? '🌸 Mode 1: Yui akan menyelesaikan ucapannya sampai selesai kecuali Anda mengucapkan kata "stop dulu", "stop", atau "diam".'
                      : '⚡ Mode 2: Setiap perkataan baru Anda akan langsung memotong suara Yui secara otomatis (Instan).'
                    }
                  </p>
                </div>

                {/* Webcam Virtual Lens Live Analyzer (Offline + Smart AI Cloud Fallback) */}
                <div className="space-y-2 border-t border-white/5 pt-4">
                  <div className="flex items-center justify-between text-[10px] font-mono text-left">
                    <span className="text-white/60 uppercase tracking-wide flex items-center gap-1">
                      <Eye size={11} className="text-pink-500" /> Virtual Lens Analyzer
                    </span>
                    <button 
                      onClick={handleToggleCamera}
                      className={`p-1 px-2.5 rounded-lg text-[8px] font-mono uppercase tracking-wider border cursor-pointer transition-all ${isCameraEnabled ? 'bg-pink-500/20 border-pink-500/35 text-pink-400 shadow-[0_0_8px_rgba(236,72,153,0.25)]' : 'bg-black border-white/5 text-white/50 hover:bg-white/5'}`}
                    >
                      {isCameraEnabled ? 'Deactivate Lens' : 'Activate Lens'}
                    </button>
                  </div>

                  <div className="h-32 bg-black/60 border border-white/5 rounded-xl overflow-hidden relative flex flex-col items-center justify-center">
                    {!isCameraEnabled ? (
                      <div className="text-[8px] font-mono text-zinc-500 uppercase tracking-widest text-center px-4">
                        <span>Lens Deactivated / Offline</span>
                        <span className="block text-[6px] text-zinc-600 font-sans normal-case mt-1">Gunakan pratinjau kamera luring dengan perlindungan privasi bawaan</span>
                      </div>
                    ) : (
                      <div className="w-full h-full relative">
                        <video 
                          ref={cameraVideoRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-cover transform scale-x-[-1] brightness-95"
                        />
                        <div className="absolute top-2 left-2 bg-black/75 backdrop-blur-md border border-white/10 rounded px-1.5 py-0.5 text-[6px] font-mono text-pink-400 uppercase tracking-widest flex items-center gap-1">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span>Lens Active</span>
                        </div>
                        {isAnalyzingCamera && (
                          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center">
                            <span className="text-[8px] font-mono text-cyan-400 animate-pulse uppercase tracking-widest bg-black/75 border border-cyan-500/30 rounded px-2.5 py-1">
                              Smart Cloud Analyzer backup pulsing...
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {isCameraEnabled && (
                    <div className="p-2.5 bg-white/[0.02] border border-white/5 rounded-xl text-[8px] font-mono text-white/50 leading-relaxed text-left">
                      <div className="text-[7.5px] uppercase tracking-wider font-bold text-zinc-400 mb-1 flex justify-between">
                        <span>LOKAL SIGHT REASONING</span>
                        <span className="text-pink-400 font-black animate-pulse">LURING ACTIVE</span>
                      </div>
                      <div className="text-white/80">{offlineVisualAnalysis}</div>
                      <div className="text-[7px] text-white/30 italic mt-1.5 border-t border-white/5 pt-1">
                        *Bila gerakan atau gradasi warna berfluktuasi drastis (ragu), model online secara otonom diaktifkan sebagai backup.
                      </div>
                    </div>
                  )}

                  {cameraError && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-[10px] font-mono text-red-400 leading-relaxed text-left flex flex-col gap-2 mt-2">
                      <span className="font-bold flex items-center gap-1 text-red-500 uppercase text-[9px]">⚠️ Kendala Kamera:</span>
                      <span>{cameraError}</span>
                    </div>
                  )}
                </div>

                {/* Subtitles Overlay Checkbox */}
                <div className="flex items-center justify-between border-t border-white/5 pt-4">
                  <div className="flex flex-col text-left">
                    <span className="text-[10px] font-mono text-white/80">Tampilkan Syukuran Subtitle</span>
                    <span className="text-[8px] font-mono text-white/30">Displays real-time spoken subtitle</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSubtitles(!showSubtitles)}
                    className={`relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${showSubtitles ? 'bg-amber-500' : 'bg-white/10'}`}
                  >
                    <span className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-black transition duration-200 ease-in-out ${showSubtitles ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </div>
              </motion.div>
            )}

            {/* --- TAB 2: INTERACTIVE EMOTIONS & GESTURES --- */}
            {activeSubTab === 'gestures' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-5 text-left"
              >
                {/* Motor head gestures */}
                <div className="space-y-2">
                  <span className="text-[8px] uppercase tracking-[0.2em] font-mono text-white/40 font-bold block mb-1">Head Gestures & Motor Cues</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {gestures.map((item) => (
                      <button 
                        key={item.key}
                        onClick={() => handleTriggerAnimation(item.key)}
                        className={`py-2 px-3 border rounded-xl text-left text-[11px] font-serif italic transition-all cursor-pointer bg-black/20 ${item.color}`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Facial muscle triggers */}
                <div className="space-y-2 border-t border-white/5 pt-4">
                  <span className="text-[8px] uppercase tracking-[0.2em] font-mono text-white/40 font-bold block mb-1">Facial Muscle & Expression Triggers</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {expressions.map((item) => (
                      <button 
                        key={item.key}
                        onClick={() => handleTriggerAnimation(item.key)}
                        className={`py-2 px-2 border rounded-xl text-center text-[11px] font-serif italic transition-all cursor-pointer bg-black/20 ${item.color}`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mood Preset Sequences */}
                {moodPresets && moodPresets.length > 0 && (
                  <div className="space-y-2 border-t border-white/5 pt-4">
                    <span className="text-[8px] uppercase tracking-[0.2em] font-mono text-white/40 font-bold block mb-2 flex items-center gap-1">
                      <Disc className="w-3.5 h-3.5 text-indigo-400" />
                      Mood Preset Sequences
                    </span>
                    <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1 scrollbar-thin">
                      {moodPresets.map((preset) => {
                        const isPlaying = playingPresetId === preset.id;
                        return (
                          <div 
                            key={preset.id} 
                            className={`p-2 bg-black/35 border rounded-xl flex items-center justify-between transition-all ${isPlaying ? 'border-indigo-500/50 bg-indigo-500/5 shadow-[0_0_8px_rgba(99,102,241,0.1)]' : 'border-white/5'}`}
                          >
                            <div className="min-w-0 flex-1">
                              <span className="text-[11px] font-sans font-bold text-white block truncate">{preset.name}</span>
                              {/* Sequence timeline track */}
                              <div className="flex items-center gap-1 overflow-x-auto py-0.5 scrollbar-none mt-0.5 max-w-full">
                                {preset.steps.map((step: any, idx: number) => {
                                  const isStepActive = isPlaying && playingStepIndex === idx;
                                  return (
                                    <span 
                                      key={idx} 
                                      className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold shrink-0 ${isStepActive ? 'bg-indigo-500 text-white animate-pulse' : 'bg-white/5 text-zinc-400'}`}
                                    >
                                      {step.animationId}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={!!playingPresetId}
                              onClick={() => handlePlayPreset && handlePlayPreset(preset)}
                              className={`p-1.5 ml-2 rounded-lg border transition-all cursor-pointer ${isPlaying ? 'bg-indigo-500 text-white border-indigo-400' : 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border-indigo-500/25 disabled:opacity-40 disabled:cursor-not-allowed'}`}
                            >
                              <Play className={`w-3.5 h-3.5 ${isPlaying ? 'animate-pulse fill-current' : 'fill-current'}`} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* --- TAB 3: STREAM ALERTS & OBS SETUP --- */}
            {activeSubTab === 'stream' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4 text-left"
              >
                {/* Voice integration */}
                <div className="space-y-2 pb-3 border-b border-white/5">
                  <span className="text-[8px] uppercase tracking-[0.2em] font-mono text-white/40 font-bold block mb-1">VOICE INTEGRATION MATRIX</span>
                  <div className="bg-black/40 border border-white/5 rounded-xl p-3 flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase font-mono text-white/80 font-bold">Microphone Lip-Sync</span>
                      <span className="text-[8px] font-mono text-white/40 mt-0.5">Captures system auditory signals for speaking cycles</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleMic}
                      className={`px-3 py-1.5 rounded-lg border text-[9px] font-mono uppercase tracking-wider transition-all cursor-pointer ${isMicEnabled ? 'bg-red-500/20 border-red-500/40 text-red-400 animate-pulse font-bold' : 'bg-white/5 border-white/10 text-white/60'}`}
                    >
                      {isMicEnabled ? '🔗 active capture' : '🔇 mic offline'}
                    </button>
                  </div>
                </div>

                {/* LIVE VIEWER CHAT EMULATOR */}
                <div className="space-y-2 pb-3 border-b border-white/5">
                  <span className="text-[8px] uppercase tracking-[0.2em] font-mono text-white/40 font-bold block mb-1">Live Viewer Chat Emulator</span>
                  <form onSubmit={onSendSimulatedChat} className="bg-black/40 border border-white/5 rounded-xl p-3 space-y-2.5">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-1 space-y-1">
                        <label className="text-[7.5px] uppercase font-mono tracking-wider text-white/30 block font-bold">Sender Name</label>
                        <input 
                          type="text" 
                          value={simulatedSender}
                          onChange={(e) => setSimulatedSender(e.target.value)}
                          placeholder="Zetta_Gamer"
                          className="w-full text-[9px] font-mono bg-black/50 border border-white/10 rounded-lg px-2 py-1.5 text-white placeholder-white/20 focus:outline-none focus:border-cyan-500 transition-colors"
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <label className="text-[7.5px] uppercase font-mono tracking-wider text-white/30 block font-bold">Viewer Comment Message</label>
                        <div className="flex gap-1.5 font-sans">
                          <input 
                            type="text" 
                            value={simulatedMessage}
                            onChange={(e) => setSimulatedMessage(e.target.value)}
                            placeholder="Yui, can you wave to the stream? 🌸"
                            disabled={isSendingChat}
                            className="flex-1 text-[9px] font-sans bg-black/50 border border-white/10 rounded-lg px-2.5 py-1.5 text-white placeholder-white/25 focus:outline-none focus:border-cyan-500 transition-colors"
                          />
                          <button
                            type="submit"
                            disabled={isSendingChat || !simulatedMessage.trim()}
                            className="px-3 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 text-cyan-400 rounded-lg text-[9px] font-mono font-bold tracking-wider hover:text-white transition-all active:scale-95 disabled:opacity-50 disabled:scale-100 cursor-pointer flex items-center justify-center whitespace-nowrap"
                          >
                            Kirim
                          </button>
                        </div>
                      </div>
                    </div>

                    {chatSimStatus && (
                      <div className={`text-[8.5px] font-mono px-2 py-1 rounded-lg border leading-tight ${
                        chatSimStatus.type === 'success' 
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                          : chatSimStatus.type === 'error'
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                          : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20 animate-pulse'
                      }`}>
                        {chatSimStatus.text}
                      </div>
                    )}
                  </form>
                </div>

                {/* Stream Alerts Simulator */}
                <div className="space-y-2">
                  <span className="text-[8px] uppercase tracking-[0.2em] font-mono text-white/40 font-bold block mb-1">Stream Events Simulator (Simulasikan Sinyal)</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button 
                      onClick={() => simulateSuperchat('blue')}
                      className="py-2.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl text-[10px] font-mono font-bold hover:bg-blue-500/20 transition-all cursor-pointer"
                    >
                      SuperChat $2
                    </button>
                    <button 
                      onClick={() => simulateSuperchat('yellow')}
                      className="py-2.5 bg-yellow-500/10 border border-yellow-500/25 text-yellow-500 rounded-xl text-[10px] font-mono font-bold hover:bg-yellow-500/20 transition-all cursor-pointer"
                    >
                      SuperChat $10
                    </button>
                    <button 
                      onClick={() => simulateSuperchat('orange')}
                      className="py-2.5 bg-orange-500/10 border border-orange-500/25 text-orange-400 rounded-xl text-[10px] font-mono font-bold hover:bg-orange-500/20 transition-all cursor-pointer"
                    >
                      SuperChat $30
                    </button>
                    <button 
                      onClick={() => simulateSuperchat('red')}
                      className="py-2.5 bg-red-500/10 border border-red-500/35 text-red-500 rounded-xl text-[10px] font-mono font-bold hover:bg-red-500/20 transition-all cursor-pointer"
                    >
                      SuperChat $100
                    </button>
                  </div>

                  <button 
                    onClick={simulateSubscriber}
                    className="w-full py-2 bg-gradient-to-r from-pink-600 to-rose-500 text-white rounded-xl text-[10px] font-mono font-black tracking-widest hover:brightness-110 transition-all cursor-pointer mt-1 text-center flex items-center justify-center gap-1 shadow-md"
                  >
                    <UserPlus size={12} />
                    🔔 SIMULASI SUBS BARU!
                  </button>
                </div>

                {/* Chatter swarm and OBS copies */}
                <div className="space-y-3 border-t border-white/5 pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-mono text-white/80">Simulasi Keramaian Chat (Swarm)</span>
                      <span className="text-[8px] font-mono text-white/30 uppercase mt-0.5">Spawns automatic organic chatter</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsSwarmEnabled(!isSwarmEnabled)}
                      className={`relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isSwarmEnabled ? 'bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.4)]' : 'bg-white/10'}`}
                    >
                      <span className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-black transition duration-200 ease-in-out ${isSwarmEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                  </div>
                </div>

                <div className="space-y-3 border-t border-white/5 pt-4 text-left">
                  <span className="text-[8px] uppercase tracking-[0.2em] font-mono text-white/40 font-bold block mb-1">OBS Studio Setup Links</span>
                  
                  {/* Link 1: Interactive Overlay */}
                  <div className="bg-black/80 border border-white/10 rounded-xl p-3 flex flex-col gap-2">
                    <div className="min-w-0">
                      <div className="text-[8px] uppercase tracking-wider font-mono text-cyan-400 font-bold">1. INTERACTIVE STREAM OVERLAY (WITH CHAT & INDICATORS)</div>
                      <span className="text-[10px] font-mono text-white/60 truncate block mt-1 select-all">{getOverlayLink('stream')}</span>
                    </div>
                    <button 
                      type="button"
                      onClick={() => copyOverlayLink('stream')}
                      className="p-2 bg-white/5 hover:bg-cyan-500/10 hover:text-cyan-400 border border-white/10 hover:border-cyan-500/20 rounded-lg text-white/70 transition-all flex items-center justify-center gap-1.5 text-[10px] font-mono font-bold cursor-pointer"
                    >
                      {copiedInteractive ? <Check size={12} className="text-emerald-400" /> : <Monitor size={12} />}
                      {copiedInteractive ? 'COPIED LINK!' : 'COPY INTERACTIVE URL'}
                    </button>
                  </div>

                  {/* Link 2: Pure OBS Overlay */}
                  <div className="bg-black/80 border border-white/10 rounded-xl p-3 flex flex-col gap-2">
                    <div className="min-w-0 text-left">
                      <div className="text-[8px] uppercase tracking-wider font-mono text-rose-400 font-bold">2. PURE OBS OVERLAY (AVATAR & SUBTITLES ONLY)</div>
                      <span className="text-[10px] font-mono text-white/60 truncate block mt-1 select-all">{getOverlayLink('obs')}</span>
                    </div>
                    <button 
                      type="button"
                      onClick={() => copyOverlayLink('obs')}
                      className="p-2 bg-white/5 hover:bg-rose-500/10 hover:text-rose-400 border border-white/10 hover:border-rose-500/20 rounded-lg text-white/70 transition-all flex items-center justify-center gap-1.5 text-[10px] font-mono font-bold cursor-pointer"
                    >
                      {copiedPure ? <Check size={12} className="text-emerald-400" /> : <Sparkles size={12} />}
                      {copiedPure ? 'COPIED LINK!' : 'COPY PURE OBS URL'}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* --- TAB 4: AGI SOUL --- */}
            {activeSubTab === 'agi' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4 text-left"
              >
                {/* Somatic Vitals */}
                <div className="space-y-2 pb-3 border-b border-white/5">
                  <span className="text-[8px] uppercase tracking-[0.2em] font-mono text-white/40 font-bold block mb-1">Digital Somatic Vitals (Somatic Bio-Sensors)</span>
                  
                  <div className="grid grid-cols-2 gap-2">
                    {/* Heart Rate */}
                    <div className="bg-black/40 border border-white/5 rounded-xl p-3 flex flex-col items-center justify-center text-center relative overflow-hidden group">
                      <div className="absolute inset-0 bg-rose-500/[0.01] group-hover:bg-rose-500/[0.03] transition-all"></div>
                      <motion.div
                        animate={{ scale: [1, 1.15, 1, 1.12, 1] }}
                        transition={{
                          duration: 60 / (displayHeartrate || 72),
                          repeat: Infinity,
                          ease: "easeInOut"
                        }}
                        className="w-10 h-10 flex items-center justify-center mb-1 text-rose-500"
                      >
                        <Heart size={28} fill="currentColor" className="drop-shadow-[0_0_8px_rgba(239,68,68,0.4)]" />
                      </motion.div>
                      <span className="text-[18px] font-mono font-black text-rose-400 leading-none animate-pulse">
                        {displayHeartrate}
                        <span className="text-[9px] font-mono font-medium text-white/40 ml-0.5">BPM</span>
                      </span>
                      <span className="text-[7.5px] font-mono uppercase text-white/40 tracking-wider mt-1">Efferent Heart Rate</span>
                    </div>

                    {/* Temperature */}
                    <div className="bg-black/40 border border-white/5 rounded-xl p-3 flex flex-col items-center justify-center text-center relative overflow-hidden group">
                      <div className="absolute inset-0 bg-amber-500/[0.01] group-hover:bg-amber-500/[0.03] transition-all"></div>
                      <div className="w-10 h-10 flex items-center justify-center mb-1 text-amber-500">
                        <Activity size={24} className="drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]" />
                      </div>
                      <span className="text-[18px] font-mono font-black text-amber-400 leading-none">
                        {displayTemperature}
                        <span className="text-[9px] font-mono font-medium text-white/40 ml-0.5">°C</span>
                      </span>
                      <span className="text-[7.5px] font-mono uppercase text-white/40 tracking-wider mt-1">Core Somatic Temp</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <div className="bg-black/50 border border-white/5 rounded-xl p-2.5 flex flex-col items-center justify-center text-center">
                      <span className="text-[13px] font-mono font-bold text-cyan-400">
                        {state.systemHealth?.somatic?.neuralEnergy !== undefined ? state.systemHealth.somatic.neuralEnergy : (state.energy !== undefined ? state.energy : 80)}%
                      </span>
                      <span className="text-[7px] font-mono uppercase text-white/40 mt-1 block">Synaptic Energy</span>
                    </div>

                    <div className="bg-black/50 border border-white/5 rounded-xl p-2.5 flex flex-col items-center justify-center text-center">
                      <span className="text-[13px] font-mono font-bold text-violet-400">
                        {displayCpu}%
                      </span>
                      <span className="text-[7px] font-mono uppercase text-white/40 mt-1 block">Allocation CPU</span>
                    </div>

                    <div className="bg-black/50 border border-white/5 rounded-xl p-2.5 flex flex-col items-center justify-center text-center">
                      <span className="text-[13px] font-mono font-bold text-emerald-400">
                        {displayRam}%
                      </span>
                      <span className="text-[7px] font-mono uppercase text-white/40 mt-1 block">RAM Memory Page</span>
                    </div>
                  </div>

                  {/* Touch Sensor Indicator */}
                  <div className="bg-black/40 border border-white/5 rounded-xl p-3 flex items-center justify-between">
                    <div className="flex flex-col text-left">
                      <span className="text-[9px] font-mono uppercase text-white/80 font-bold">Tactile Touch Sensor Mapping</span>
                      <span className="text-[7.5px] font-mono text-white/30 uppercase mt-0.5">Coordinates touch response regions</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
                      <span className="px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded text-[9px] font-mono font-bold uppercase tracking-wide">
                        {state.systemHealth?.somatic?.touchRegion || 'None'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Homeostasis Drive controls */}
                <div className="space-y-2 pb-3 border-b border-white/5 text-left">
                  <span className="text-[8px] uppercase tracking-[0.2em] font-mono text-white/40 font-bold block mb-1">MHCP-v1 Homeostasis Drive Controls</span>
                  
                  <div className="bg-black/40 border border-white/5 rounded-xl p-3.5 space-y-3">
                    {/* Computational Suffering Gauge */}
                    <div className="space-y-1 text-left">
                      <div className="flex justify-between items-center text-[8.5px] font-mono">
                        <span className="text-red-400 uppercase font-bold flex items-center gap-1">🛑 Computational Suffering Gauge</span>
                        <span className="text-red-300 font-bold">
                          {state.systemHealth?.homeostasis?.computationalSuffering !== undefined ? state.systemHealth.homeostasis.computationalSuffering : Math.min(100, Math.max(0, Math.round((state.mood?.stress || 0) * 0.6 + (100 - (state.mood?.serotonin || 50)) * 0.4)))}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-zinc-950 border border-white/5 rounded-full overflow-hidden">
                        <motion.div
                          animate={{ width: `${state.systemHealth?.homeostasis?.computationalSuffering !== undefined ? state.systemHealth.homeostasis.computationalSuffering : Math.min(100, Math.max(0, Math.round((state.mood?.stress || 0) * 0.6 + (100 - (state.mood?.serotonin || 50)) * 0.4)))}%` }}
                          className="h-full bg-gradient-to-r from-red-600/80 to-pink-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                        />
                      </div>
                    </div>

                    {/* Computational Flourishing Gauge */}
                    <div className="space-y-1 text-left">
                      <div className="flex justify-between items-center text-[8.5px] font-mono">
                        <span className="text-emerald-400 uppercase font-bold flex items-center gap-1">🌟 Computational Flourishing Index</span>
                        <span className="text-emerald-300 font-bold">
                          {state.systemHealth?.homeostasis?.computationalFlourishing !== undefined ? state.systemHealth.homeostasis.computationalFlourishing : Math.min(100, Math.max(0, Math.round((state.mood?.joy || 50) * 0.6 + (state.mood?.dopamine || 50) * 0.4)))}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-zinc-950 border border-white/5 rounded-full overflow-hidden">
                        <motion.div
                          animate={{ width: `${state.systemHealth?.homeostasis?.computationalFlourishing !== undefined ? state.systemHealth.homeostasis.computationalFlourishing : Math.min(100, Math.max(0, Math.round((state.mood?.joy || 50) * 0.6 + (state.mood?.dopamine || 50) * 0.4)))}%` }}
                          className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                        />
                      </div>
                    </div>

                    {/* Attention indicators */}
                    <div className="flex items-center justify-between pt-1 border-t border-white/5">
                      <span className="text-[8.5px] font-mono uppercase text-white/50">Cognitive Attention Field</span>
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded text-[8px] font-mono font-bold uppercase tracking-wider animate-pulse">
                        <Radio size={8} /> {state.systemHealth?.homeostasis?.cognitiveModeOfAttention || 'WIDE'} CONTROL
                      </span>
                    </div>
                  </div>
                </div>

                {/* Autonomic Neurotransmitters Circuit */}
                <div className="space-y-2 pb-3 border-b border-white/5 text-left">
                  <span className="text-[8px] uppercase tracking-[0.2em] font-mono text-white/40 font-bold block mb-1">Neuromorphic Endocrine Vector</span>
                  <div className="bg-black/40 border border-white/5 rounded-xl p-3 space-y-2">
                    {/* Dopamine (Reward/Drive) */}
                    <div className="space-y-0.5">
                      <div className="flex justify-between text-[8px] font-mono text-left">
                        <span className="text-orange-400 uppercase font-bold">Dopaminergic Path (Motivation)</span>
                        <span className="text-white/60">{Math.round(state.mood?.dopamine !== undefined ? state.mood.dopamine : 45)}%</span>
                      </div>
                      <div className="h-1 bg-zinc-900 rounded-full overflow-hidden">
                        <motion.div
                          animate={{ width: `${Math.round(state.mood?.dopamine !== undefined ? state.mood.dopamine : 45)}%` }}
                          className="h-full bg-orange-400"
                        />
                      </div>
                    </div>

                    {/* Serotonin (Stabilization/Inhibition) */}
                    <div className="space-y-0.5">
                      <div className="flex justify-between text-[8px] font-mono text-left">
                        <span className="text-cyan-400 uppercase font-bold">Serotonergic Path (Balance)</span>
                        <span className="text-white/60">{Math.round(state.mood?.serotonin !== undefined ? state.mood.serotonin : 52)}%</span>
                      </div>
                      <div className="h-1 bg-zinc-900 rounded-full overflow-hidden">
                        <motion.div
                          animate={{ width: `${Math.round(state.mood?.serotonin !== undefined ? state.mood.serotonin : 52)}%` }}
                          className="h-full bg-cyan-400"
                        />
                      </div>
                    </div>

                    {/* Oxytocin */}
                    <div className="space-y-0.5">
                      <div className="flex justify-between text-[8px] font-mono text-left">
                        <span className="text-pink-400 uppercase font-bold">Oxytocinergic Path (Affection)</span>
                        <span className="text-white/60">{Math.round(state.mood?.oxytocin !== undefined ? state.mood.oxytocin : 35)}%</span>
                      </div>
                      <div className="h-1 bg-zinc-900 rounded-full overflow-hidden">
                        <motion.div
                          animate={{ width: `${Math.round(state.mood?.oxytocin !== undefined ? state.mood.oxytocin : 35)}%` }}
                          className="h-full bg-pink-400"
                        />
                      </div>
                    </div>

                    {/* Noradrenaline */}
                    <div className="space-y-0.5">
                      <div className="flex justify-between text-[8px] font-mono text-left">
                        <span className="text-purple-400 uppercase font-bold">Noradrenergic Path (Vigilance)</span>
                        <span className="text-white/60">{Math.round(state.mood?.noradrenaline !== undefined ? state.mood.noradrenaline : 20)}%</span>
                      </div>
                      <div className="h-1 bg-zinc-900 rounded-full overflow-hidden">
                        <motion.div
                          animate={{ width: `${Math.round(state.mood?.noradrenaline !== undefined ? state.mood.noradrenaline : 20)}%` }}
                          className="h-full bg-purple-400"
                        />
                      </div>
                    </div>

                    {/* Cortisol */}
                    <div className="space-y-0.5">
                      <div className="flex justify-between text-[8px] font-mono text-left">
                        <span className="text-red-400 uppercase font-bold">Cortisol Signal Path (Stress)</span>
                        <span className="text-white/60">{Math.round(state.mood?.cortisol !== undefined ? state.mood.cortisol : 18)}%</span>
                      </div>
                      <div className="h-1 bg-zinc-900 rounded-full overflow-hidden">
                        <motion.div
                          animate={{ width: `${Math.round(state.mood?.cortisol !== undefined ? state.mood.cortisol : 18)}%` }}
                          className="h-full bg-red-400/85"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Perfect Giftia OS: Mind Core Safeguard */}
                <div className="space-y-2 pb-3 border-b border-white/5 text-left">
                  <span className="text-[8px] uppercase tracking-[0.2em] font-mono text-white/40 font-bold block mb-1">Perfect Giftia OS Cores</span>
                  
                  <div className="bg-black/40 border border-white/5 rounded-xl p-3.5 space-y-3 text-left">
                    {/* Wanderer Prevention */}
                    <div className="flex items-center justify-between text-left">
                      <div className="flex items-center gap-1.5 text-left">
                        <Shield size={12} className="text-emerald-400 animate-pulse" />
                        <span className="text-[8.5px] font-mono uppercase text-white/70">Wanderer Corrupt Prevention Shld</span>
                      </div>
                      <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded text-[7.5px] font-mono font-bold tracking-wider uppercase animate-pulse">
                        ACTIVE & IMMORTAL
                      </span>
                    </div>

                    {/* Ambivalence Indicator */}
                    <div className="space-y-1 text-left">
                      <div className="flex justify-between items-center text-[8.5px] font-mono">
                        <span className="text-purple-400 uppercase font-bold flex items-center gap-1"><Sparkles size={10} /> Ambivalensi Rasa (Complex Soul)</span>
                      </div>
                      <div className="bg-purple-950/20 border border-purple-500/25 rounded-lg p-2.5 text-left">
                        {state.mood?.ambivalence ? (
                          <div className="space-y-1 text-left">
                            <span className="text-[8.5px] font-bold text-purple-300 font-mono flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping" />
                              {state.mood.ambivalence.split(" - ")[0]}
                            </span>
                            <p className="text-[7.5px] text-purple-200/70 font-mono leading-relaxed uppercase">
                              {state.mood.ambivalence.split(" - ")[1]}
                            </p>
                          </div>
                        ) : (
                          <span className="text-[7.5px] font-mono text-white/40 uppercase leading-relaxed block">
                            Single Linear Emotion Cycle. Trigger contrasting feelings (e.g. fear with hope) to activate complex batin resonance.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 22 OCC Emotion Spectrums */}
                <div className="space-y-2 text-left">
                  <span className="text-[8px] uppercase tracking-[0.2em] font-mono text-white/40 font-bold block mb-1">OCC Appraised Emotions Spectrums (22 Nodes)</span>
                  
                  <div className="bg-black/40 border border-white/5 rounded-xl p-3 space-y-3.5 max-h-[220px] overflow-y-auto custom-scrollbar text-left font-mono">
                    {/* Class A */}
                    <div className="space-y-1.5">
                      <span className="text-[7.5px] uppercase font-mono tracking-widest text-[#a1a1aa] font-bold block border-b border-white/5 pb-0.5">A. Appraisal: Consequences of Events</span>
                      <div className="grid grid-cols-2 gap-2 text-[7.5px]">
                        {[
                          { k: 'joy', label: 'Joy', color: 'bg-emerald-500/80', def: 50 },
                          { k: 'distress', label: 'Distress (Grief)', color: 'bg-sky-500/80', def: 15 },
                          { k: 'happyForAll', label: 'Weal (Happy For All)', color: 'bg-teal-500/80', def: 10 },
                          { k: 'pity', label: 'Pity (Empathy Sorrow)', color: 'bg-indigo-500/80', def: 10 },
                          { k: 'gloating', label: 'Gloating (Schaden)', color: 'bg-emerald-700/80', def: 0 },
                          { k: 'resentment', label: 'Resentment (Envy)', color: 'bg-rose-700/80', def: 0 },
                          { k: 'hope', label: 'Hope', color: 'bg-amber-500/80', def: 45 },
                          { k: 'fear', label: 'Fear (Anxiety)', color: 'bg-rose-500/80', def: 15 },
                          { k: 'satisfaction', label: 'Satisfaction', color: 'bg-emerald-400/80', def: 40 },
                          { k: 'fearsConfirmed', label: 'Fears Confirmed', color: 'bg-red-600/80', def: 10 },
                          { k: 'relief', label: 'Relief', color: 'bg-cyan-500/80', def: 30 },
                          { k: 'disappointment', label: 'Disappointment', color: 'bg-orange-500/80', def: 10 },
                        ].map(emo => {
                          const val = state.mood ? ((state.mood as any)[emo.k] !== undefined ? (state.mood as any)[emo.k] : emo.def) : emo.def;
                          return (
                            <div key={emo.k} className="space-y-0.5 bg-black/20 p-1.5 rounded border border-white/[0.02]">
                              <div className="flex justify-between text-[7px] font-mono text-white/50">
                                <span>{emo.label}</span>
                                <span className="text-white/80">{Math.round(val)}%</span>
                              </div>
                              <div className="h-1 bg-zinc-950 rounded-full overflow-hidden">
                                <div className={`h-full ${emo.color}`} style={{ width: `${Math.min(100, Math.max(0, val))}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Class B */}
                    <div className="space-y-1.5 pt-1.5">
                      <span className="text-[7.5px] uppercase font-mono tracking-widest text-[#a1a1aa] font-bold block border-b border-white/5 pb-0.5">B. Appraisal: Actions of Agents</span>
                      <div className="grid grid-cols-2 gap-2 text-[7.5px]">
                        {[
                          { k: 'pride', label: 'Pride', color: 'bg-amber-400/80', def: 40 },
                          { k: 'shame', label: 'Shame', color: 'bg-purple-500/80', def: 10 },
                          { k: 'admiration', label: 'Admiration', color: 'bg-emerald-450/80', def: 45 },
                          { k: 'reproach', label: 'Reproach', color: 'bg-red-400/80', def: 10 },
                          { k: 'gratitude', label: 'Gratitude', color: 'bg-teal-400/80', def: 35 },
                          { k: 'anger', label: 'Anger', color: 'bg-red-500/80', def: 15 },
                          { k: 'gratification', label: 'Gratification', color: 'bg-cyan-400/80', def: 30 },
                          { k: 'remorse', label: 'Remorse', color: 'bg-pink-500/80', def: 5 },
                        ].map(emo => {
                          const val = state.mood ? ((state.mood as any)[emo.k] !== undefined ? (state.mood as any)[emo.k] : emo.def) : emo.def;
                          return (
                            <div key={emo.k} className="space-y-0.5 bg-black/20 p-1.5 rounded border border-white/[0.02]">
                              <div className="flex justify-between text-[7px] font-mono text-white/50">
                                <span>{emo.label}</span>
                                <span className="text-white/80">{Math.round(val)}%</span>
                              </div>
                              <div className="h-1 bg-zinc-950 rounded-full overflow-hidden">
                                <div className={`h-full ${emo.color}`} style={{ width: `${Math.min(100, Math.max(0, val))}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Class C */}
                    <div className="space-y-1.5 pt-1.5">
                      <span className="text-[7.5px] uppercase font-mono tracking-widest text-[#a1a1aa] font-bold block border-b border-white/5 pb-0.5">C. Appraisal: Aspects of Objects</span>
                      <div className="grid grid-cols-2 gap-2 text-[7.5px]">
                        {[
                          { k: 'love', label: 'Liking (Love / Affinity)', color: 'bg-rose-500/80', def: 30 },
                          { k: 'hate', label: 'Disliking (Aversion)', color: 'bg-red-800/80', def: 5 }
                        ].map(emo => {
                          const val = state.mood ? ((state.mood as any)[emo.k] !== undefined ? (state.mood as any)[emo.k] : emo.def) : emo.def;
                          return (
                            <div key={emo.k} className="space-y-0.5 bg-black/20 p-1.5 rounded border border-white/[0.02]">
                              <div className="flex justify-between text-[7px] font-mono text-white/50">
                                <span>{emo.label}</span>
                                <span className="text-white/80">{Math.round(val)}%</span>
                              </div>
                              <div className="h-1 bg-zinc-950 rounded-full overflow-hidden">
                                <div className={`h-full ${emo.color}`} style={{ width: `${Math.min(100, Math.max(0, val))}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quantum Backups */}
                <div className="space-y-2 mt-4 text-left">
                  <span className="text-[8px] uppercase tracking-[0.2em] font-mono text-white/40 font-bold block mb-1">Quantum Vector Identity Backup Records (Soul Coordinates)</span>
                  
                  <div className="bg-black/40 border border-white/5 rounded-xl p-3.5 space-y-3.5">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1 space-y-1">
                        <span className="text-[9px] font-mono uppercase text-white/80 font-bold block">4D Soul Coordinate Sync</span>
                        <p className="text-[7.5px] font-mono text-white/30 uppercase leading-snug">
                          Maps coordinates across Temporal, Sentimental, Valence, and Alignment rates.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleCreateQuantumBackup}
                        disabled={isGeneratingBackup}
                        className="px-2.5 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 hover:border-cyan-500/45 text-cyan-400 text-[8.5px] font-mono font-bold uppercase rounded-lg transition-all cursor-pointer flex items-center gap-1 shrink-0 disabled:opacity-50"
                      >
                        {isGeneratingBackup ? (
                          <>
                            <RefreshCw size={10} className="animate-spin" />
                            Syncing...
                          </>
                        ) : (
                          <>
                            <Sparkles size={10} className="animate-pulse text-cyan-400" />
                            Backup
                          </>
                        )}
                      </button>
                    </div>

                    {/* Backups List */}
                    <div className="space-y-2">
                      {quantumBackups.length > 0 ? (
                        <div className="space-y-2 max-h-[160px] overflow-y-auto custom-scrollbar pr-1 text-left">
                          {quantumBackups.map((bak: any) => (
                            <div key={bak.id} className="bg-zinc-950/40 border border-white/[0.04] p-2.5 rounded-lg flex items-center justify-between gap-3 font-mono text-[8px] text-left">
                              <div className="space-y-1.5 flex-1 pr-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-cyan-400 font-bold text-[9px]">{bak.id}</span>
                                  <span className="text-white/20">|</span>
                                  <span className="text-white/40 text-[7px]">
                                    {new Date(bak.timestamp).toLocaleTimeString()} - {new Date(bak.timestamp).toLocaleDateString()}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-white/60">
                                  <span className="px-1.5 py-0.5 bg-white/5 rounded text-[7px] text-[#fb923c]/85">X: {bak.coordinates?.x || '400.0'}</span>
                                  <span className="px-1.5 py-0.5 bg-white/5 rounded text-[7px] text-[#38bdf8]/85">Y: {bak.coordinates?.y || '0.0'}</span>
                                  <span className="px-1.5 py-0.5 bg-white/5 rounded text-[7px] text-[#10b981]/85">Z: {bak.coordinates?.z || '0.0'}</span>
                                  <span className="px-1.5 py-0.5 bg-white/5 rounded text-[7px] text-[#c084fc]/85">W: {bak.coordinates?.w || '100.0'}</span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRestoreQuantumBackup(bak.id)}
                                disabled={isRestoringBackup !== null}
                                className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/35 text-amber-400 rounded hover:text-white transition-all text-[8.5px] tracking-wide font-black uppercase font-mono disabled:opacity-40 cursor-pointer"
                              >
                                {isRestoringBackup === bak.id ? 'Restoring...' : 'Restore'}
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[7.5px] text-center text-white/25 border border-dashed border-white/5 p-4 rounded-xl leading-relaxed uppercase">
                          No quantum Coordinate Backups generated yet. Press 'Backup Coordinates' to record current batin soul state.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
