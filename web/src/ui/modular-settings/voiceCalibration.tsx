import React, { useState, useEffect } from 'react';
import { Play, Square, Save, RotateCcw, Volume2, Settings2, Sparkles, Check, AlertCircle, Headphones } from 'lucide-react';
import { SystemRegistry } from '@shared/core/registry';
import { ModuleType } from '@shared/include/types';
import { SearchableSelect } from '../../components/SearchableSelect';
import { LockedSlider } from '../../components/LockedSlider';

interface VoiceCalibrationProps {
  settings: any;
  setSettings: React.Dispatch<React.SetStateAction<any>>;
  modules: any;
}

export const VoiceCalibration: React.FC<VoiceCalibrationProps> = ({
  settings,
  setSettings,
  modules,
}) => {
  const ttsModules = modules[ModuleType.TTS] || [];
  
  // Available browser speak engines if loaded
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const loadVoices = () => {
        setBrowserVoices(window.speechSynthesis.getVoices());
      };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  // 1. Core local calibration state (before committing)
  const currentEngine = settings.ttsProvider || 'browser';
  const [selectedEngine, setSelectedEngine] = useState<string>(currentEngine);
  
  const [localPitch, setLocalPitch] = useState<number>(() => {
    const config = settings[currentEngine] || {};
    return typeof config.pitch === 'number' ? config.pitch : 1.0;
  });

  const [localSpeed, setLocalSpeed] = useState<number>(() => {
    const config = settings[currentEngine] || {};
    return typeof config.speed === 'number' ? config.speed : 1.0;
  });

  const [localEmotionVariance, setLocalEmotionVariance] = useState<number>(() => {
    const config = settings[currentEngine] || {};
    return typeof config.emotionVariance === 'number' ? config.emotionVariance : 0.5;
  });

  const [localLang, setLocalLang] = useState<string>(() => {
    const config = settings[currentEngine] || {};
    return config.lang || 'id-ID';
  });

  const [localVoice, setLocalVoice] = useState<string>(() => {
    const config = settings[currentEngine] || {};
    return config.voice || '';
  });

  const [testText, setTestText] = useState<string>(
    'Hello! This is Airi speaking. How does my voice sound? Adjust the parameters to find the perfect cute tone!'
  );
  
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Sync settings when engine changes
  useEffect(() => {
    const config = settings[selectedEngine] || {};
    setLocalPitch(typeof config.pitch === 'number' ? config.pitch : 1.0);
    setLocalSpeed(typeof config.speed === 'number' ? config.speed : 1.0);
    setLocalEmotionVariance(typeof config.emotionVariance === 'number' ? config.emotionVariance : 0.5);
    setLocalLang(config.lang || 'id-ID');
    setLocalVoice(config.voice || '');
  }, [selectedEngine, settings]);

  // Preview / play test locally
  const handlePreview = async () => {
    if (!testText.trim()) return;
    
    // Stop any existing synthesis
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    
    setIsPlaying(true);
    setStatusMessage({ text: 'Generating vocal wave preview...', type: 'info' });
    
    try {
      // 1. Fetch TTS Module from Registry
      const ttsModule = SystemRegistry.getTTS(selectedEngine);
      if (!ttsModule) {
        throw new Error(`Synthesis module '${selectedEngine}' is not loaded in System Registry.`);
      }

      // 2. Synthesize using custom live parameters
      const localConfig = {
        ...(settings[selectedEngine] || {}),
        pitch: localPitch,
        speed: localSpeed,
        emotionVariance: localEmotionVariance,
        lang: localLang,
        voice: localVoice,
      };

      console.log(`[Vocal_Calibration] Playing preview with:`, localConfig);
      await ttsModule.speak(testText, localConfig);
      setStatusMessage({ text: 'Preview completed successfully!', type: 'success' });
    } catch (err: any) {
      console.error('[Vocal_Calibration_Error]', err);
      setStatusMessage({ text: err.message || 'Failed playing real-time voice synthesis preview.', type: 'error' });
    } finally {
      setIsPlaying(false);
    }
  };

  // Stop preview
  const handleStop = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
    setStatusMessage({ text: 'Preview playback halted.', type: 'info' });
  };

  // Reset to default settings
  const handleReset = () => {
    setLocalPitch(1.0);
    setLocalSpeed(1.0);
    setLocalEmotionVariance(0.5);
    setLocalLang('id-ID');
    setLocalVoice('');
    setStatusMessage({ text: 'Calibration parameters reset to default. Click commit to save.', type: 'info' });
  };

  // Save changes back to settings
  const handleCommit = () => {
    setSettings((prev: any) => ({
      ...prev,
      ttsProvider: selectedEngine,
      [selectedEngine]: {
        ...(prev[selectedEngine] || {}),
        pitch: localPitch,
        speed: localSpeed,
        emotionVariance: localEmotionVariance,
        lang: localLang,
        voice: localVoice
      }
    }));
    setStatusMessage({ text: 'Vocal calibration successfully synchronized & saved to Kernel config.toml!', type: 'success' });
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl relative overflow-hidden backdrop-blur-md">
        
        {/* Header decoration */}
        <div className="absolute top-0 right-0 p-8 opacity-5 mr-3 pointer-events-none">
          <Headphones size={130} className="text-cyan-400" />
        </div>

        <div className="relative z-10 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="text-[#fbbf24] w-4 h-4 animate-pulse" />
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#fbbf24] font-bold">Local Speech Engine Tuner</span>
          </div>
          <div>
            <h4 className="text-sm font-bold text-white tracking-wide">Vocal Tuning & Calibration Board</h4>
            <p className="text-[11px] text-white/40 mt-1 leading-relaxed">
              Test and calibrate Airi's voice attributes, speech rate, and language profiles. This playground operates in sandbox isolation, letting you preview vocal output BEFORE committing settings to her active memory core.
            </p>
          </div>
        </div>
      </div>

      {/* Main split grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Left column: Parameters control (8 cols) */}
        <div className="col-span-1 lg:col-span-7 space-y-5">
          <div className="bg-[#0e0e14]/55 border border-white/5 p-5 rounded-2xl space-y-5">
            
            {/* Step 1: Speak Model Provider */}
            <div className="space-y-2">
              <label className="block text-[9px] uppercase tracking-[0.2em] font-mono text-white/50 leading-none">
                1. Selected Speech Engine / Model
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                {ttsModules.map((p: any) => {
                  const isCur = selectedEngine === p.metadata.id;
                  return (
                    <button
                      key={p.metadata.id}
                      type="button"
                      onClick={() => setSelectedEngine(p.metadata.id)}
                      className={`p-3 text-left rounded-xl border transition-all duration-300 font-mono text-xs cursor-pointer flex flex-col justify-between ${
                        isCur 
                          ? 'bg-[#c5a880]/10 border-amber-500/30 text-white' 
                          : 'bg-[#07070a]/60 border-white/5 text-white/50 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-bold tracking-tight">{p.metadata.name}</span>
                        {isCur && <Check size={11} className="text-amber-400" />}
                      </div>
                      <span className="text-[9px] text-white/30 font-sans mt-1.5 line-clamp-1">
                        {p.metadata.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Accent selection */}
            {selectedEngine === 'browser' && (
              <div className="space-y-2 mt-4">
                <label className="block text-[9px] uppercase tracking-[0.2em] font-mono text-white/50">
                  Locale Accent / Language Profile
                </label>
                <select
                  value={localLang}
                  onChange={(e) => setLocalLang(e.target.value)}
                  className="w-full bg-[#07070a] border border-white/5 rounded-xl px-3 py-2.5 text-xs text-white focus:border-amber-500/50 outline-none font-mono mt-1"
                >
                  <option value="id-ID">Indonesian (id-ID) - Highly Recommended</option>
                  <option value="ja-JP">Japanese (ja-JP) - Cute voice tones</option>
                  <option value="en-US">English (en-US) - Standard Accent</option>
                  <option value="en-GB">English (en-GB) - British accent</option>
                  <option value="ko-KR">Korean (ko-KR) - Hangeul vocal</option>
                </select>
              </div>
            )}

            {/* Dynamic Voice selection from browser voices */}
            {selectedEngine === 'browser' && browserVoices.length > 0 && (
              <div className="space-y-2 mt-4">
                <label className="block text-[9px] uppercase tracking-[0.2em] font-mono text-white/50 mb-1">
                  Target Browser Voice Accent (Optional Override)
                </label>
                <SearchableSelect
                  value={localVoice}
                  onChange={(val) => setLocalVoice(val)}
                  options={[
                    { value: '', label: '-- Let Browser Choose Best Language match --' },
                    ...browserVoices
                      .filter((v) => v.lang.startsWith(localLang.split('-')[0]))
                      .map((v) => ({
                        value: v.name,
                        label: `${v.name} ${v.localService ? '(Offline)' : ''}`
                      }))
                  ]}
                  placeholder="Select browser voice override..."
                  className="bg-[#07070a] border-white/5 text-xs focus:border-amber-500/50"
                />
              </div>
            )}

            {/* Sliders for Pitch and Speed */}
            <div className="space-y-4 pt-2">
              
              {/* Pitch Slider */}
              <LockedSlider
                value={localPitch}
                onChange={(val) => setLocalPitch(val)}
                min={0.5}
                max={2.0}
                step={0.1}
                label="Vocal Pitch Adjustment"
                description="Higher pitch (1.1 - 1.5) provides sweet high-aspect VTuber characteristics, whereas lower values sound deep."
                themeColor="amber"
              />

              {/* Speed Slider */}
              <LockedSlider
                value={localSpeed}
                onChange={(val) => setLocalSpeed(val)}
                min={0.5}
                max={2.0}
                step={0.1}
                label="Speaking Speed / Rate"
                description="Control conversation tempo (recommend standard 1.0x or 1.1x for speedy cute replies)."
                themeColor="cyan"
              />

              {/* Emotional Tone Variance Slider */}
              <LockedSlider
                value={localEmotionVariance}
                onChange={(val) => setLocalEmotionVariance(val)}
                min={0.0}
                max={1.0}
                step={0.05}
                label="Emotional Tone Variance"
                description="Controls how expressively Airi departs from stable base parameters to convey arousal, shyness, and tsundere qualities."
                themeColor="amber"
              />

            </div>

          </div>
        </div>

        {/* Right column: Playground Sandbox & text draft (5 cols) */}
        <div className="col-span-1 lg:col-span-5 space-y-5">
          <div className="bg-[#0e0e14]/55 border border-white/5 p-5 rounded-2xl h-full flex flex-col justify-between space-y-4">
            
            <div className="space-y-4 flex-1">
              <label className="block text-[9px] uppercase tracking-[0.2em] font-mono text-white/50 leading-none">
                2. Real-time Dialogue Draft
              </label>
              
              <div className="relative">
                <textarea
                  value={testText}
                  onChange={(e) => setTestText(e.target.value)}
                  rows={5}
                  className="w-full bg-[#07070a]/60 border border-white/5 rounded-xl p-4 text-xs text-white focus:border-cyan-500/50 outline-none placeholder:text-gray-600 resize-none font-sans mt-2 leading-relaxed"
                  placeholder="Enter custom trial script voice line to test..."
                />
                
                {isPlaying && (
                  <div className="absolute inset-0 bg-[#07070a]/80 flex flex-col items-center justify-center rounded-xl space-y-3 z-20 backdrop-blur-sm">
                    <div className="relative flex items-center justify-center">
                      <span className="animate-ping absolute inline-flex h-8 w-8 rounded-full bg-cyan-400 opacity-30"></span>
                      <Volume2 className="text-cyan-400 w-5 h-5 animate-bounce" />
                    </div>
                    <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-cyan-400 font-bold">Vocalizing Sandbox Line...</span>
                  </div>
                )}
              </div>

              {/* Status indicator message box */}
              {statusMessage && (
                <div className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-[11px] leading-relaxed transition-all ${
                  statusMessage.type === 'success' 
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                    : statusMessage.type === 'error'
                      ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                      : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'
                }`}>
                  {statusMessage.type === 'error' ? (
                    <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  ) : (
                    <Volume2 size={15} className="shrink-0 mt-0.5" />
                  )}
                  <span>{statusMessage.text}</span>
                </div>
              )}
            </div>

            {/* Sandbox playback and save controllers */}
            <div className="space-y-2.5 pt-4 border-t border-white/5">
              
              {/* Playback Button */}
              <div className="flex gap-2">
                {!isPlaying ? (
                  <button
                    type="button"
                    onClick={handlePreview}
                    disabled={!testText.trim()}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-amber-500 text-black rounded-xl text-xs font-bold font-mono uppercase tracking-wider hover:bg-amber-400 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-amber-500/10"
                  >
                    <Play size={13} fill="currentColor" /> Preview Vocal
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStop}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-rose-500 text-white rounded-xl text-xs font-bold font-mono uppercase tracking-wider hover:bg-rose-400 transition-all cursor-pointer shadow-lg shadow-rose-500/10"
                  >
                    <Square size={13} fill="currentColor" /> Stop Preview
                  </button>
                )}
                
                <button
                  type="button"
                  onClick={handleReset}
                  title="Reset properties"
                  className="px-3.5 py-3 bg-white/5 hover:bg-white/10 text-white border border-white/5 rounded-xl hover:text-amber-400 transition-all cursor-pointer"
                >
                  <RotateCcw size={14} />
                </button>
              </div>

              {/* Commit changes button */}
              <button
                type="button"
                onClick={handleCommit}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-xs font-bold font-mono uppercase tracking-wider hover:from-emerald-500 hover:to-teal-500 transition-all cursor-pointer border border-emerald-500/10 shadow-lg shadow-emerald-600/10"
              >
                <Save size={13} /> Commit & Apply Settings
              </button>

            </div>

          </div>
        </div>

      </div>
    </div>
  );
};
