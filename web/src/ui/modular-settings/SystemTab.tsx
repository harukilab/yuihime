import React from 'react';
import { 
  Sliders, Palette, Monitor, Terminal, ChevronRight, 
  Maximize2, Move, Sparkles, Info, Database, Upload,
  Download, RefreshCw, AlertTriangle, Check, Archive, ShieldAlert,
  Trash2, Play, Plus, Smile, Activity, Layers, SlidersHorizontal,
  Disc, Timer, Square
} from 'lucide-react';
import { LockedSlider } from '../../components/LockedSlider';
import { RUNTIME_DEFAULTS } from '@shared/constants';
import { EnvTab } from './EnvTab';

interface SystemTabProps {
  settings: any;
  setSettings: React.Dispatch<React.SetStateAction<any>>;
  updateGeneral: (field: string, val: any) => void;
  systemSubpage: string | null;
  setSystemSubpage: (val: string | null) => void;
  applyThemePalette: (themeId: string, customColor?: string) => void;
  backdrop: string;
  handleSelectBackdrop: (mode: string) => void;
  customImgUrl: string;
  handleCustomUrlChange: (url: string) => void;
  avatarConfig: any;
  onAvatarUpdate: any;
  renderFields: (module: any, configValue: any, onChange: (field: string, val: any) => void) => React.ReactNode;
  onShowInfo?: (title: string, text: string) => void;
}

export const SystemTab: React.FC<SystemTabProps> = ({
  settings,
  setSettings,
  updateGeneral,
  systemSubpage,
  setSystemSubpage,
  applyThemePalette,
  backdrop,
  handleSelectBackdrop,
  customImgUrl,
  handleCustomUrlChange,
  avatarConfig,
  onAvatarUpdate,
  renderFields,
  onShowInfo
}) => {
  const [restoreStatus, setRestoreStatus] = React.useState<'idle' | 'reading' | 'restoring' | 'success' | 'error'>('idle');
  const [restoreMessage, setRestoreMessage] = React.useState<string>('');
  const [backupLoading, setBackupLoading] = React.useState<boolean>(false);

  // Custom Expressions state and form parameters
  const [customExpressions, setCustomExpressions] = React.useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('yuihime_custom_expressions_v1');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [newKey, setNewKey] = React.useState('');
  const [newLabel, setNewLabel] = React.useState('');
  const [newExprFile, setNewExprFile] = React.useState('None');
  const [customExprFile, setCustomExprFile] = React.useState('');
  const [newMotionGroup, setNewMotionGroup] = React.useState('None');
  const [customMotionGroup, setCustomMotionGroup] = React.useState('');
  const [newMotionIndex, setNewMotionIndex] = React.useState(0);

  const [overrideEyeSmile, setOverrideEyeSmile] = React.useState(false);
  const [valEyeSmile, setValEyeSmile] = React.useState(0.5);

  const [overrideMouthForm, setOverrideMouthForm] = React.useState(false);
  const [valMouthForm, setValMouthForm] = React.useState(0.0);

  const [overrideCheek, setOverrideCheek] = React.useState(false);
  const [valCheek, setValCheek] = React.useState(0.5);

  const [overrideBrowY, setOverrideBrowY] = React.useState(false);
  const [valBrowY, setValBrowY] = React.useState(0.0);

  const [formError, setFormError] = React.useState('');

  const handleAddExpression = () => {
    setFormError('');
    const cleanKey = newKey.trim().toLowerCase().replace(/\s+/g, '_');
    if (!cleanKey) {
      setFormError('Expression Key/ID is required.');
      return;
    }
    const label = newLabel.trim();
    if (!label) {
      setFormError('Display Label is required.');
      return;
    }

    if (customExpressions.some(e => e.key === cleanKey)) {
      setFormError(`Expression with Key/ID "${cleanKey}" already exists.`);
      return;
    }

    const finalExprFile = newExprFile === 'custom' ? customExprFile.trim() : (newExprFile === 'None' ? '' : newExprFile);
    const finalMotionGroup = newMotionGroup === 'custom' ? customMotionGroup.trim() : (newMotionGroup === 'None' ? '' : newMotionGroup);

    const newExprObj = {
      key: cleanKey,
      label,
      expressionId: finalExprFile,
      motionGroup: finalMotionGroup,
      motionIndex: newMotionIndex,
      overrides: {
        ParamEyeSmile: { enabled: overrideEyeSmile, value: valEyeSmile },
        ParamMouthForm: { enabled: overrideMouthForm, value: valMouthForm },
        ParamCheek: { enabled: overrideCheek, value: valCheek },
        ParamBrowInnerY: { enabled: overrideBrowY, value: valBrowY }
      }
    };

    const updated = [...customExpressions, newExprObj];
    setCustomExpressions(updated);
    localStorage.setItem('yuihime_custom_expressions_v1', JSON.stringify(updated));

    window.dispatchEvent(new CustomEvent('yuihime_custom_expressions_changed'));
    window.dispatchEvent(new Event('storage'));

    // Reset Form
    setNewKey('');
    setNewLabel('');
    setNewExprFile('None');
    setCustomExprFile('');
    setNewMotionGroup('None');
    setCustomMotionGroup('');
    setNewMotionIndex(0);
    setOverrideEyeSmile(false);
    setOverrideMouthForm(false);
    setOverrideCheek(false);
    setOverrideBrowY(false);
  };

  const handleDeleteExpression = (key: string) => {
    const updated = customExpressions.filter(e => e.key !== key);
    setCustomExpressions(updated);
    localStorage.setItem('yuihime_custom_expressions_v1', JSON.stringify(updated));

    window.dispatchEvent(new CustomEvent('yuihime_custom_expressions_changed'));
    window.dispatchEvent(new Event('storage'));
  };

  const handleTestExpression = (key: string) => {
    window.dispatchEvent(new CustomEvent('yuihime_trigger_animation', { detail: { anim: key } }));
  };

  // --- Mood Presets / Macro Recorder State ---
  const [moodPresets, setMoodPresets] = React.useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('yuihime_mood_presets_v1');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [presetName, setPresetName] = React.useState('');
  const [presetSteps, setPresetSteps] = React.useState<any[]>([]);
  const [isRecordingMacro, setIsRecordingMacro] = React.useState(false);
  const [lastRecordTimestamp, setLastRecordTimestamp] = React.useState<number | null>(null);

  const [selectedStepAnim, setSelectedStepAnim] = React.useState('smile');
  const [selectedStepDelay, setSelectedStepDelay] = React.useState(1000);

  const [playingPresetId, setPlayingPresetId] = React.useState<string | null>(null);
  const [playingStepIndex, setPlayingStepIndex] = React.useState<number>(-1);

  // Sync state changes across windows/tabs
  React.useEffect(() => {
    const handlePresetsUpdate = () => {
      try {
        const saved = localStorage.getItem('yuihime_mood_presets_v1');
        setMoodPresets(saved ? JSON.parse(saved) : []);
      } catch (e) {}
    };
    window.addEventListener('yuihime_mood_presets_changed', handlePresetsUpdate);
    window.addEventListener('storage', handlePresetsUpdate);
    return () => {
      window.removeEventListener('yuihime_mood_presets_changed', handlePresetsUpdate);
      window.removeEventListener('storage', handlePresetsUpdate);
    };
  }, []);

  // Intercept triggered animations to record macro steps in real-time
  React.useEffect(() => {
    if (!isRecordingMacro) return;

    const handleRecordedAnimation = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.anim) {
        const now = Date.now();
        setPresetSteps(prev => {
          const updated = [...prev];
          if (updated.length > 0 && lastRecordTimestamp !== null) {
            const elapsed = now - lastRecordTimestamp;
            updated[updated.length - 1].delay = Math.max(100, elapsed);
          }
          updated.push({ animationId: detail.anim, delay: 1000 });
          return updated;
        });
        setLastRecordTimestamp(now);
      }
    };

    window.addEventListener('yuihime_trigger_animation', handleRecordedAnimation);
    return () => {
      window.removeEventListener('yuihime_trigger_animation', handleRecordedAnimation);
    };
  }, [isRecordingMacro, lastRecordTimestamp]);

  const handleStartLiveRecord = () => {
    setIsRecordingMacro(true);
    setPresetSteps([]);
    setLastRecordTimestamp(Date.now());
  };

  const handleStopLiveRecord = () => {
    setIsRecordingMacro(false);
    setLastRecordTimestamp(null);
  };

  const handleAddManualStep = () => {
    setPresetSteps(prev => [
      ...prev,
      { animationId: selectedStepAnim, delay: selectedStepDelay }
    ]);
  };

  const handleRemoveStep = (index: number) => {
    setPresetSteps(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateStepDelay = (index: number, val: number) => {
    setPresetSteps(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], delay: Math.max(100, val) };
      return updated;
    });
  };

  const handleSavePreset = () => {
    const trimmedName = presetName.trim();
    if (!trimmedName) return;
    if (presetSteps.length === 0) return;

    const presetId = 'preset_' + Date.now();
    const newPreset = {
      id: presetId,
      name: trimmedName,
      steps: presetSteps
    };

    const updated = [...moodPresets, newPreset];
    setMoodPresets(updated);
    localStorage.setItem('yuihime_mood_presets_v1', JSON.stringify(updated));

    window.dispatchEvent(new CustomEvent('yuihime_mood_presets_changed'));
    window.dispatchEvent(new Event('storage'));

    setPresetName('');
    setPresetSteps([]);
  };

  const handleDeletePreset = (id: string) => {
    const updated = moodPresets.filter(p => p.id !== id);
    setMoodPresets(updated);
    localStorage.setItem('yuihime_mood_presets_v1', JSON.stringify(updated));

    window.dispatchEvent(new CustomEvent('yuihime_mood_presets_changed'));
    window.dispatchEvent(new Event('storage'));
  };

  const handlePlayPreset = async (preset: any) => {
    if (playingPresetId) return;
    setPlayingPresetId(preset.id);

    for (let i = 0; i < preset.steps.length; i++) {
      setPlayingStepIndex(i);
      const step = preset.steps[i];
      window.dispatchEvent(new CustomEvent('yuihime_trigger_animation', { detail: { anim: step.animationId } }));
      
      await new Promise(resolve => setTimeout(resolve, step.delay));
    }

    setPlayingPresetId(null);
    setPlayingStepIndex(-1);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    try {
      if (!file) return;

      if (!file.name.toLowerCase().endsWith('.zip')) {
        setRestoreStatus('error');
        setRestoreMessage('Berkas tidak valid. Harap unggah arsip backup .zip resmi Yuihime.');
        return;
      }

      setRestoreStatus('reading');
      setRestoreMessage('Membaca data kompresi arsip lokal...');

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const result = event.target?.result as string;
          if (!result) {
            throw new Error('Gagal membaca data biner berkas.');
          }
          const base64Data = result.split(',')[1] || result;

          setRestoreStatus('restoring');
          setRestoreMessage('Menginstal konfigurasi kognitif dan mereposisi basis data batin...');

          const res = await fetch('/api/backup/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ backupData: base64Data })
          });

          const data = await res.json();
          if (res.ok && data.success) {
            setRestoreStatus('success');
            setRestoreMessage(data.message || 'Sistem batin Yuihime berhasil dipulihkan secara penuh!');
            setTimeout(() => {
              window.location.reload();
            }, 2500);
          } else {
            throw new Error(data.error || 'Server menolak pemuatan cadangan.');
          }
        } catch (err: any) {
          setRestoreStatus('error');
          setRestoreMessage(err.message || 'Kesalahan fatal saat pemulihan sistem.');
        }
      };
      reader.onerror = () => {
        setRestoreStatus('error');
        setRestoreMessage('Gagal membaca data dari medium fisik lokal.');
      };
      reader.readAsDataURL(file);
    } finally {
      e.target.value = '';
    }
  };

  const handleDownloadBackup = () => {
    setBackupLoading(true);
    window.location.href = '/api/backup';
    setTimeout(() => {
      setBackupLoading(false);
    }, 2000);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {systemSubpage === null ? (
        <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl space-y-3">
          <h4 className="text-[10px] uppercase font-mono tracking-widest text-[#d4d4d8]/40 mb-2 font-bold font-sans">Core System Setup</h4>

          {/* GENERAL */}
          <button 
            type="button"
            onClick={() => setSystemSubpage('general')}
            className="w-full flex items-center justify-between p-4 bg-[#07070a]/65 hover:bg-[#111118]/85 border border-white/5 rounded-2xl transition-all cursor-pointer text-left group animate-fade-in"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-500">
                <Sliders size={16} />
              </div>
              <div>
                <h5 className="text-xs font-bold text-white group-hover:text-amber-500 transition-colors font-sans">General</h5>
                <p className="text-[10px] text-zinc-500 mt-0.5 font-sans">Dark theme, languages, etc.</p>
              </div>
            </div>
            <ChevronRight size={14} className="text-zinc-500 group-hover:translate-x-1 transition-transform" />
          </button>

          {/* COLOR SCHEME */}
          <button 
            type="button"
            onClick={() => setSystemSubpage('colors')}
            className="w-full flex items-center justify-between p-4 bg-[#07070a]/65 hover:bg-[#111118]/85 border border-white/5 rounded-2xl transition-all cursor-pointer text-left group animate-fade-in"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-pink-500/10 rounded-xl border border-pink-500/20 text-pink-400">
                <Palette size={16} />
              </div>
              <div>
                <h5 className="text-xs font-bold text-white group-hover:text-pink-400 transition-colors font-sans">Color Scheme</h5>
                <p className="text-[10px] text-zinc-500 mt-0.5 font-sans">Adapt visual focus colors of the virtual stage</p>
              </div>
            </div>
            <ChevronRight size={14} className="text-zinc-500 group-hover:translate-x-1 transition-transform" />
          </button>

          {/* STAGE & VTUBER CAMERA CALIBRATION */}
          <button 
            type="button"
            onClick={() => setSystemSubpage('stage')}
            className="w-full flex items-center justify-between p-4 bg-[#07070a]/65 hover:bg-[#111118]/85 border border-white/5 rounded-2xl transition-all cursor-pointer text-left group animate-fade-in"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-cyan-500/10 rounded-xl border border-cyan-500/20 text-cyan-400">
                <Monitor size={16} />
              </div>
              <div>
                <h5 className="text-xs font-bold text-white group-hover:text-cyan-400 transition-colors font-sans">Stage & VTuber Camera</h5>
                <p className="text-[10px] text-zinc-500 mt-0.5 font-sans">Calibrate avatar scale, offset coordinates, and stream backgrounds</p>
              </div>
            </div>
            <ChevronRight size={14} className="text-zinc-500 group-hover:translate-x-1 transition-transform" />
          </button>

          {/* DEVELOPERS */}
          <button 
            type="button"
            onClick={() => setSystemSubpage('developers')}
            className="w-full flex items-center justify-between p-4 bg-[#07070a]/65 hover:bg-[#111118]/85 border border-white/5 rounded-2xl transition-all cursor-pointer text-left group animate-fade-in"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-purple-500/10 rounded-xl border border-purple-500/20 text-purple-400">
                <Terminal size={16} />
              </div>
              <div>
                <h5 className="text-xs font-bold text-white group-hover:text-purple-400 transition-colors font-sans font-sans">Developers</h5>
                <p className="text-[10px] text-zinc-500 mt-0.5 font-sans text-left">Diagnostics, sandbox and action chains</p>
              </div>
            </div>
            <ChevronRight size={14} className="text-zinc-500 group-hover:translate-x-1 transition-transform" />
          </button>

          {/* BACKUP & RESTORE */}
          <button 
            type="button"
            onClick={() => setSystemSubpage('backup')}
            className="w-full flex items-center justify-between p-4 bg-[#07070a]/65 hover:bg-[#111118]/85 border border-white/5 rounded-2xl transition-all cursor-pointer text-left group animate-fade-in"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-400">
                <Database size={16} />
              </div>
              <div>
                <h5 className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors font-sans font-sans">Backup & Pemulihan Sistem</h5>
                <p className="text-[10px] text-zinc-500 mt-0.5 font-sans text-left">Ekspor cadangan penuh batin atau restorasi data zip lokal</p>
              </div>
            </div>
            <ChevronRight size={14} className="text-zinc-550 group-hover:translate-x-1 transition-transform" />
          </button>

        </div>
      ) : systemSubpage === 'general' ? (
        <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl space-y-6">
          {/* General Theme option matching Image 1 */}
          <div className="flex items-center justify-between py-2 border-b border-white/5 pb-4">
            <div>
              <h5 className="text-xs font-bold text-white tracking-wide font-sans">Theme</h5>
              <p className="text-[10.5px] text-zinc-400 mt-1 font-sans">Switch the base theme of AIRI, Light mode or Dark mode.</p>
            </div>
            <button 
              type="button"
              onClick={() => {
                const isCurrentlyDark = settings.colorScheme?.selected !== 'light';
                const targetTheme = isCurrentlyDark ? 'light' : 'default';
                setSettings((prev: any) => ({
                  ...prev,
                  colorScheme: { ...(prev.colorScheme || {}), selected: targetTheme }
                }));
                applyThemePalette(targetTheme);
              }}
              className={`w-12 h-6 rounded-full transition-all relative cursor-pointer ${settings.colorScheme?.selected !== 'light' ? 'bg-amber-500' : 'bg-white/10'}`}
            >
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-black transition-all ${settings.colorScheme?.selected !== 'light' ? 'left-7' : 'left-1'}`} />
            </button>
          </div>

          {/* Language Dropdown matching Image 1 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-2 border-b border-white/5 pb-4">
            <div>
              <h5 className="text-xs font-bold text-white tracking-wide font-sans">Language</h5>
              <p className="text-[10.5px] text-zinc-400 mt-1 font-sans">UI language. You can set characters' language later.</p>
            </div>
            <select 
              value={settings.language || 'en'} 
              onChange={e => updateGeneral('language', e.target.value)}
              className="bg-[#07070a] border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500/30 font-bold min-w-[140px] font-sans" 
            >
              <option value="en">English (EN)</option>
              <option value="id">Indonesian (ID)</option>
              <option value="jp">Japanese (JP)</option>
            </select>
          </div>

          {/* Bypass Multi-Turn Reasoning Toggle (Mode Berpikir Cepat) */}
          <div className="flex items-start justify-between gap-4 py-2 border-b border-white/5 pb-4">
            <div className="space-y-1 pr-6 text-left">
              <h5 className="text-xs font-bold text-white tracking-wide font-sans">Mode Berpikir Cepat (Bypass Multi-Turn Reasoning)</h5>
              <p className="text-[10.5px] text-zinc-400 font-sans leading-relaxed">
                Lewati analisis kognitif multi-langkah batin untuk langsung menghasilkan respons cepat (Single-Turn). Sangat berguna untuk menghemat kuota token API dan meningkatkan kecepatan respons Yuihime secara maksimal.
              </p>
            </div>
            <button 
              type="button"
              onClick={() => {
                const cur = settings.developer?.enableMultiTurnReasoning !== false;
                setSettings((prev: any) => ({
                  ...prev,
                  developer: { ...(prev.developer || {}), enableMultiTurnReasoning: !cur }
                }));
              }}
              className={`w-12 h-6 rounded-full transition-all relative shrink-0 mt-1 cursor-pointer ${settings.developer?.enableMultiTurnReasoning === false ? 'bg-teal-500' : 'bg-white/10'}`}
            >
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-black transition-all ${settings.developer?.enableMultiTurnReasoning === false ? 'left-7' : 'left-1'}`} />
            </button>
          </div>

          {/* Streaming LLM Response Toggle */}
          <div className="flex items-start justify-between gap-4 py-2 border-b border-white/5 pb-4">
            <div className="space-y-1 pr-6 text-left">
              <h5 className="text-xs font-bold text-white tracking-wide font-sans">Mode Aliran Teks (Streaming LLM Response)</h5>
              <p className="text-[10.5px] text-zinc-400 font-sans leading-relaxed">
                Aktifkan mode aliran teks (streaming) dari LLM untuk memunculkan obrolan secara bertahap (kata per kata) dengan latensi super rendah, sangat cocok untuk interaksi dinamis atau livestreaming. Jika dinonaktifkan, Yuihime akan memproses teks penuh secara instan setelah respons selesai digenerasikan.
              </p>
            </div>
            <button 
              type="button"
              onClick={() => {
                const cur = settings.developer?.enableStreaming !== false;
                setSettings((prev: any) => ({
                  ...prev,
                  developer: { ...(prev.developer || {}), enableStreaming: !cur }
                }));
              }}
              className={`w-12 h-6 rounded-full transition-all relative shrink-0 mt-1 cursor-pointer ${settings.developer?.enableStreaming !== false ? 'bg-amber-500' : 'bg-white/10'}`}
            >
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-black transition-all ${settings.developer?.enableStreaming !== false ? 'left-7' : 'left-1'}`} />
            </button>
          </div>

          {/* Unlimited Loops Configuration */}
          <div className="flex items-start justify-between gap-4 py-2 border-b border-white/5 pb-4">
            <div className="space-y-1 pr-6 text-left">
              <h5 className="text-xs font-bold text-white tracking-wide font-sans">Unlimited Loops (Opsi Tanpa Batas)</h5>
              <p className="text-[10.5px] text-zinc-400 font-sans leading-relaxed">
                Mengaktifkan analisis batin tanpa batas (unlimited loops). Gunakan dengan sangat hati-hati karena dapat menghabiskan kuota token Anda dengan cepat jika terjadi pengulangan alat (looping tools) yang intens.
              </p>
            </div>
            <button 
              type="button"
              onClick={() => {
                const cur = settings.developer?.unlimitedLoops === true;
                setSettings((prev: any) => ({
                  ...prev,
                  developer: { ...(prev.developer || {}), unlimitedLoops: !cur }
                }));
              }}
              className={`w-12 h-6 rounded-full transition-all relative shrink-0 mt-1 cursor-pointer ${settings.developer?.unlimitedLoops === true ? 'bg-amber-500' : 'bg-white/10'}`}
            >
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-black transition-all ${settings.developer?.unlimitedLoops === true ? 'left-7' : 'left-1'}`} />
            </button>
          </div>

          {/* Maximum Loops Configuration */}
          {!settings.developer?.unlimitedLoops && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-2 border-b border-white/5 pb-4">
              <div>
                <h5 className="text-xs font-bold text-white tracking-wide font-sans">Maximum Loops (Batas Putaran Manual)</h5>
                <p className="text-[10.5px] text-zinc-400 mt-1 font-sans">
                  Atur batas putaran pemikiran (loop) maksimal yang diizinkan untuk eksekusi tools dalam satu turn. Bawaan: 3.
                </p>
              </div>
              <input
                type="text"
                placeholder="3"
                value={settings.developer?.maxLoops !== undefined && settings.developer?.maxLoops !== null ? settings.developer.maxLoops : ''}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  setSettings((prev: any) => ({
                    ...prev,
                    developer: { ...(prev.developer || {}), maxLoops: val ? parseInt(val, 10) : '' }
                  }));
                }}
                className="bg-[#07070a] border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500/30 font-mono font-bold w-[140px] text-right"
              />
            </div>
          )}

          {/* Server Port Configuration */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-2 border-b border-white/5 pb-4">
            <div>
              <h5 className="text-xs font-bold text-white tracking-wide font-sans">Server Network Port</h5>
              <p className="text-[10.5px] text-zinc-400 mt-1 font-sans">
                Atur port jaringan alternatif untuk peluncuran server Yuihime. Bawaan: 3000 (Hubungkan ke localhost).
                <span className="block text-amber-500/80 mt-1 font-sans text-[10px] italic">⚠️ Mengubah port memerlukan restart server manual untuk diterapkan secara fisik.</span>
              </p>
            </div>
            <input
              type="text"
              placeholder="3000"
              value={settings.port !== undefined && settings.port !== null ? settings.port : ''}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '');
                updateGeneral('port', val ? parseInt(val, 10) : '');
              }}
              className="bg-[#07070a] border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500/30 font-mono font-bold w-[140px] text-right"
            />
          </div>

          {/* AI Character Name */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-2 border-b border-white/5 pb-4">
            <div>
              <h5 className="text-xs font-bold text-white tracking-wide font-sans">AI Character Name</h5>
              <p className="text-[10.5px] text-zinc-400 mt-1 font-sans">
                Nama karakter AI yang dipakai di prompt, narasi, dan identitas sistem. Default: Yui Airi.
              </p>
            </div>
            <input
              type="text"
              placeholder="Yui Airi"
              value={settings.characterName !== undefined && settings.characterName !== null ? settings.characterName : ''}
              onChange={(e) => {
                const val = e.target.value.trim();
                updateGeneral('characterName', val);
              }}
              className="bg-[#07070a] border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500/30 font-mono font-bold w-[180px] text-right"
            />
          </div>

          {/* Max Tokens Slider Panel */}
          <LockedSlider
            value={settings.maxTokens !== undefined ? settings.maxTokens : 65536}
            onChange={(val) => updateGeneral('maxTokens', val)}
            min={2048}
            max={131072}
            step={2048}
            label="Max Tokens (Global Output Limit)"
            description="Batasi jumlah token maksimum output respons AI secara dinamis. Default: 65536."
            themeColor="amber"
          />

          {/* UI Render Scale Slider Panel */}
          <LockedSlider
            value={settings.uiScale !== undefined ? settings.uiScale : 100}
            onChange={(val) => {
              updateGeneral('uiScale', val);
              if (typeof document !== 'undefined') {
                const scale = val / 100;
                
                // Clean up legacy zoom properties
                document.documentElement.style.zoom = '';
                document.body.style.zoom = '';
                
                document.documentElement.style.setProperty('--ui-scale', `${scale}`);
                document.documentElement.style.backgroundColor = '#050505';
                document.body.style.backgroundColor = '#050505';
                
                window.dispatchEvent(new Event('resize'));
              }
            }}
            min={50}
            max={150}
            step={5}
            label="UI Render Scale"
            description="Atur skala ukuran tampilan antarmuka visual (UI) Yuihime secara penuh. Sangat berguna untuk menyesuaikan kenyamanan tampilan pada perangkat mobile, tablet, atau layar resolusi tinggi (misal: kurangi ke 75% untuk HP)."
            themeColor="cyan"
          />

          {/* Enable Usage Analytics Toggle matching Image 1 */}
          <div className="flex items-start justify-between gap-4 py-2">
            <div className="space-y-1 pr-6 text-left">
              <h5 className="text-xs font-bold text-white tracking-wide font-sans">Enable usage analytics</h5>
              <div className="flex items-center gap-1.5 leading-none">
                <p className="text-[10.5px] text-zinc-400 font-sans leading-relaxed">
                  Anonymous metrics for stability and feature usage.
                </p>
                {onShowInfo && (
                  <button
                    type="button"
                    onClick={() => onShowInfo(
                      "Usage Analytics & Privacy Policy",
                      "AIRI collects anonymous usage analytics to help us understand how the app is used and improve stability. No personal data is collected.\n\nRead the privacy policy for full details. You can turn analytics off at any time using this interface switch."
                    )}
                    className="text-amber-500 hover:text-amber-400 font-mono transition-all text-[11px] cursor-pointer inline-flex items-center justify-center font-bold"
                    title="See details"
                  >
                    [?]
                  </button>
                )}
              </div>
              <div className="pt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono">
                <a href="#privacy" className="text-amber-500/80 hover:underline">Read the privacy policy.</a>
                <span className="text-zinc-500">You can turn analytics off at any time.</span>
              </div>
            </div>
            <button 
              type="button"
              onClick={() => {
                const next = !settings.enableAnalytics;
                setSettings((prev: any) => ({ ...prev, enableAnalytics: next }));
              }}
              className={`w-12 h-6 rounded-full transition-all relative shrink-0 mt-1 cursor-pointer ${settings.enableAnalytics ? 'bg-amber-500' : 'bg-white/10'}`}
            >
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-black transition-all ${settings.enableAnalytics ? 'left-7' : 'left-1'}`} />
            </button>
          </div>

        </div>
      ) : systemSubpage === 'colors' ? (
        <div className="space-y-6 animate-fade-in font-sans">
          {/* Primary Color Calibration Card */}
          <div className="bg-[#0e0e14]/55 border border-white/5 rounded-3xl p-5 space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2.5">
                <Palette className="text-[#0ea5e9]" size={16} />
                <span className="text-sm font-bold text-white tracking-wide">Color Scheme</span>
              </div>
              <ChevronRight className="text-zinc-500 rotate-90" size={16} />
            </div>

            <div className="space-y-5">
              {/* Dynamic Toggle & Primary Color Header */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase font-mono tracking-wider block">Primary Color</span>
                  <span className="text-[15px] font-extrabold text-white font-mono mt-0.5 block">
                    {(() => {
                      const activeThemeId = settings.colorScheme?.selected || 'default';
                      const palettesForShades: Record<string, string> = {
                        default: '#00bcd4',
                        morandi: '#b85b4f',
                        monet: '#7ba2db',
                        japanese: '#df8c8c',
                        nordic: '#568296',
                        theme: '#c23b3b',
                        chinese: '#c23b3b'
                      };
                      return (activeThemeId === 'custom' 
                        ? (localStorage.getItem('yuihime_custom_primary_color') || '#00bcd4')
                        : (palettesForShades[activeThemeId] || '#00bcd4')).toUpperCase();
                    })()}
                  </span>
                </div>

                <div className="flex items-center gap-2 bg-black/45 border border-white/5 px-3 py-1.5 rounded-xl">
                  <span className="text-[10px] font-mono text-zinc-400">I Want It Dynamic!</span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !settings.colorSchemeDynamic;
                      setSettings((prev: any) => ({ ...prev, colorSchemeDynamic: next }));
                    }}
                    className={`w-9 h-5 rounded-full transition-all relative shrink-0 cursor-pointer ${settings.colorSchemeDynamic ? 'bg-[#0ea5e9]' : 'bg-white/10'}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-black transition-all ${settings.colorSchemeDynamic ? 'left-4.5' : 'left-0.5'}`} />
                  </button>
                </div>
              </div>

              {/* Interactive Hue Rainbow Spectrum Slider */}
              <LockedSlider
                value={(() => {
                  const activeHue = localStorage.getItem('yuihime_custom_hue_v1');
                  return activeHue ? parseInt(activeHue) : 195;
                })()}
                onChange={(val) => {
                  const hue = val;
                  localStorage.setItem('yuihime_custom_hue_v1', hue.toString());
                  
                  // Translate hue to Hex
                  const hslToHex = (h: number, s: number, l: number): string => {
                    l /= 100;
                    const a = (s * Math.min(l, 1 - l)) / 100;
                    const f = (n: number) => {
                      const k = (n + h / 30) % 12;
                      const col = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
                      return Math.round(255 * col).toString(16).padStart(2, '0');
                    };
                    return `#${f(0)}${f(8)}${f(4)}`;
                  };
                  const hex = hslToHex(hue, 100, 50);
                  
                  localStorage.setItem('yuihime_custom_primary_color', hex);
                  setSettings((prev: any) => ({
                    ...prev,
                    colorScheme: { ...(prev.colorScheme || {}), selected: 'custom', customColor: hex }
                  }));
                  applyThemePalette('custom', hex);
                }}
                min={0}
                max={360}
                step={1}
                label="Theme Primary Color Spectrum (Hue)"
                description="Slide across the palette or type a hue value dynamically to calibrate theme base accents."
                sliderStyle={{
                  background: 'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)'
                }}
                sliderClassName="h-2.5 rounded-full"
              />

              {/* Dynamic Solid Color Shades List */}
              <div className="space-y-2.5">
                <span className="text-[9px] uppercase font-mono tracking-widest text-[#d4d4d8]/40 block font-bold">Shades</span>
                <div className="grid grid-cols-11 gap-1">
                  {[50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((shade, idx) => {
                    const activeThemeId = settings.colorScheme?.selected || 'default';
                    const palettesForShades: Record<string, string> = {
                      default: '#00bcd4',
                      morandi: '#b85b4f',
                      monet: '#7ba2db',
                      japanese: '#df8c8c',
                      nordic: '#568296',
                      chinese: '#c23b3b'
                    };
                    const baseColor = activeThemeId === 'custom' 
                      ? (localStorage.getItem('yuihime_custom_primary_color') || '#00bcd4')
                      : (palettesForShades[activeThemeId] || '#00bcd4');
                    
                    const opacity = 1 - (idx * 0.08);

                    return (
                      <div key={shade} className="flex flex-col items-center gap-1 min-w-0">
                        <div 
                          className="w-full aspect-square rounded-md border border-white/5 shadow-inner" 
                          style={{ backgroundColor: baseColor, opacity: opacity }}
                        />
                        <span className="text-[7.5px] font-mono text-zinc-650 truncate">{shade}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Transparent/Alpha Shades list */}
              <div className="space-y-2.5">
                <span className="text-[9px] uppercase font-mono tracking-widest text-[#d4d4d8]/40 block font-bold">Transparent Shades</span>
                <div className="grid grid-cols-10 gap-1.5">
                  {[5, 10, 20, 30, 40, 50, 60, 70, 80, 90].map((alpha) => {
                    const activeThemeId = settings.colorScheme?.selected || 'default';
                    const palettesForShades: Record<string, string> = {
                      default: '#00bcd4',
                      morandi: '#b85b4f',
                      monet: '#7ba2db',
                      japanese: '#df8c8c',
                      nordic: '#568296',
                      chinese: '#c23b3b'
                    };
                    const baseColor = activeThemeId === 'custom' 
                      ? (localStorage.getItem('yuihime_custom_primary_color') || '#00bcd4')
                      : (palettesForShades[activeThemeId] || '#00bcd4');

                    return (
                      <div key={alpha} className="flex flex-col items-center gap-1 min-w-0">
                        <div 
                          className="w-full aspect-square rounded-md overflow-hidden border border-white/5 shadow-inner relative"
                          style={{
                            backgroundImage: 'linear-gradient(45deg, #1b1b22 25%, transparent 25%), linear-gradient(-45deg, #1b1b22 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1b1b22 75%), linear-gradient(-45deg, transparent 75%, #1b1b22 75%)',
                            backgroundSize: '6px 6px',
                            backgroundPosition: '0 0, 0 3px, 3px -3px, -3px 0px'
                          }}
                        >
                          <div 
                            className="absolute inset-0"
                            style={{ backgroundColor: baseColor, opacity: alpha / 100 }}
                          />
                        </div>
                        <span className="text-[7.5px] font-mono text-zinc-650 truncate">500/{alpha}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Color Scheme Presets Selection Card */}
          <div className="bg-[#0e0e14]/55 border border-white/5 rounded-3xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2.5">
                <Sparkles className="text-[#0ea5e9]" size={16} />
                <span className="text-sm font-bold text-white tracking-wide">Color Scheme Presets</span>
              </div>
              <ChevronRight className="text-zinc-550 rotate-90" size={16} />
            </div>

            <div className="space-y-3">
              {[
                { 
                  id: 'default', 
                  name: 'Default Color', 
                  desc: 'The default greenish theme color, brought by AIRI to you!', 
                  colors: ['#00bcd4'] 
                },
                { 
                  id: 'morandi', 
                  name: 'Morandi Colors', 
                  desc: "Soft, muted tones inspired by Giorgio Morandi's paintings", 
                  colors: ['#c5b3a3', '#dfd5ca', '#cccdc6', '#dec9c1', '#eae1db', '#aba296', '#d6c6b9', '#dbcbc1'] 
                },
                { 
                  id: 'monet', 
                  name: 'Monet Colors', 
                  desc: "Impressionist palette inspired by Claude Monet's works", 
                  colors: ['#79a1bd', '#b8cdd6', '#eacfaf', '#8b9c6f', '#cfe2db', '#ecceac', '#7d95b5', '#afd2c9'] 
                },
                { 
                  id: 'japanese', 
                  name: 'Japanese Colors', 
                  desc: 'Traditional Japanese color palette', 
                  colors: ['#e2af90', '#c78572', '#a08b7e', '#ba8964', '#dfad31', '#d29e34', '#dfbe1b', '#c18511'] 
                },
                { 
                  id: 'nordic', 
                  name: 'Nordic Colors', 
                  desc: 'Scandinavian minimalist color scheme', 
                  colors: ['#92adb9', '#d1dee4', '#bfcbcc', '#9caebb', '#d8e1e7', '#8192a6', '#98abb8', '#8ba4b4'] 
                },
                { 
                  id: 'chinese', 
                  name: 'Chinese Traditional Colors', 
                  desc: 'Traditional Chinese colors, derived from ancient textiles, porcelain and paintings', 
                  colors: ['#f9cbd7', '#be0027', '#7f6f50', '#6f9e71', '#1a101d', '#febc11', '#4193cc', '#a24b42'] 
                }
              ].map((theme) => {
                const isActive = (settings.colorScheme?.selected || 'default') === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => {
                      setSettings((prev: any) => ({
                        ...prev,
                        colorScheme: { ...(prev.colorScheme || {}), selected: theme.id }
                      }));
                      applyThemePalette(theme.id);
                    }}
                    className={`w-full flex items-start gap-4 p-4 bg-[#07070a]/75 hover:bg-[#111118]/85 border rounded-2xl cursor-pointer text-left transition-all ${
                      isActive 
                        ? 'border-[#0ea5e9]/55 shadow-[0_0_12px_rgba(14,165,233,0.15)] bg-[#111118]/65' 
                        : 'border-white/5'
                    }`}
                  >
                    <div className="flex flex-wrap gap-1 w-11 shrink-0 bg-black/40 p-1.5 rounded-lg border border-white/5">
                      {theme.colors.slice(0, 4).map((c, i) => (
                        <span key={i} className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c, width: '10px', height: '10px' }} />
                      ))}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h5 className="text-[12px] font-bold text-white leading-tight">{theme.name}</h5>
                        {isActive && <span className="text-[8px] uppercase tracking-widest text-[#0ea5e9] bg-[#0ea5e9]/10 border border-[#0ea5e9]/20 px-1.5 py-0.5 rounded-md font-mono">Active</span>}
                      </div>
                      <p className="text-[10px] text-zinc-550 leading-normal mt-0.5 font-sans">
                        {theme.desc}
                      </p>
                      
                      {theme.colors.length > 1 && (
                        <div className="flex items-center gap-1 mt-2">
                          {theme.colors.map((c, i) => (
                            <span key={i} className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c }} />
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : systemSubpage === 'stage' ? (
        <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl space-y-6 animate-fade-in font-sans">
          
          {/* Backdrop Selectors */}
          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-bold text-white tracking-wide font-sans">OBS Backdrop Engine</h4>
              <p className="text-[10.5px] text-zinc-400 mt-1 font-sans">Configure visual background behind Yuihime</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {['matrix', 'neon', 'chroma-green', 'chroma-blue', 'black', 'custom'].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => handleSelectBackdrop(mode)}
                  className={`py-2 text-[10px] font-mono border rounded-xl transition-all cursor-pointer font-bold ${backdrop === mode ? 'bg-amber-500/15 border-amber-500 text-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.15)]' : 'bg-black/30 border-white/5 text-white/50 hover:border-white/10 hover:text-white'}`}
                >
                  {mode === 'chroma-green' ? 'Green Screen' : mode === 'chroma-blue' ? 'Blue Screen' : mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>

            {backdrop === 'custom' && (
              <div className="mt-2 bg-black/40 border border-white/5 p-3 rounded-xl space-y-1.5 font-sans">
                <label className="text-[9px] uppercase font-mono tracking-wider text-zinc-500 block">Custom Backdrop Image URL</label>
                <input 
                  type="text" 
                  value={customImgUrl}
                  onChange={(e) => handleCustomUrlChange(e.target.value)}
                  placeholder="https://images.unsplash.com/your-custom-backdrop.jpg"
                  className="w-full text-xs font-mono bg-black/80 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>
            )}
          </div>

          {/* Camera calibration sliders */}
          {avatarConfig && onAvatarUpdate && (
            <div className="space-y-4 border-t border-white/5 pt-4">
              <div>
                <h4 className="text-sm font-bold text-white tracking-wide font-sans">Live2D Virtual Camera Setup</h4>
                <p className="text-[10.5px] text-zinc-400 mt-1 font-sans">Fine-tune coordinates and scale size of the avatar</p>
              </div>

              {/* Scale */}
              <LockedSlider
                value={avatarConfig?.scale ?? 1.2}
                onChange={(val) => onAvatarUpdate({ ...avatarConfig, scale: val })}
                min={0.5}
                max={2.5}
                step={0.1}
                label="Scaler (Size)"
                description="Adjust physical size presentation multiplier of the live avatar model"
                themeColor="amber"
              />

              {/* X Offset */}
              <LockedSlider
                value={avatarConfig?.xOffset ?? 0}
                onChange={(val) => onAvatarUpdate({ ...avatarConfig, xOffset: val })}
                min={-400}
                max={400}
                step={10}
                label="Horizontal Coordinate (X)"
                description="Move camera horizontal offset viewport bounds"
                themeColor="cyan"
              />

              {/* Y Offset */}
              <LockedSlider
                value={avatarConfig?.yOffset ?? 0}
                onChange={(val) => onAvatarUpdate({ ...avatarConfig, yOffset: val })}
                min={-400}
                max={400}
                step={10}
                label="Vertical Coordinate (Y)"
                description="Move camera vertical offset viewport bounds"
                themeColor="emerald"
              />
            </div>
          )}

          {/* Custom Expressions panel */}
          <div className="space-y-4 border-t border-white/5 pt-5">
            <div>
              <h4 className="text-sm font-bold text-white tracking-wide font-sans flex items-center gap-2">
                <Smile className="w-4 h-4 text-purple-400" />
                Custom Live2D Expressions & Parameter Settings
              </h4>
              <p className="text-[10.5px] text-zinc-450 mt-1 font-sans">
                Create new expressions mapped to Live2D animation keys, trigger custom motions, or set manual Live2D parameter values to achieve fine-tuned posture overrides.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Side: Existing Expressions List (5 cols) */}
              <div className="lg:col-span-5 space-y-3">
                <span className="text-[9px] uppercase font-mono tracking-wider text-zinc-500 block">Existing Custom Expressions</span>
                <div className="bg-black/35 border border-white/5 rounded-xl p-3 max-h-[360px] overflow-y-auto space-y-2">
                  {customExpressions.length === 0 ? (
                    <div className="py-8 text-center text-zinc-500 font-sans text-[11px] italic">
                      No custom expressions created yet. Start customizing one on the right!
                    </div>
                  ) : (
                    customExpressions.map((expr) => (
                      <div 
                        key={expr.key} 
                        className="p-3 bg-white/[0.02] border border-white/5 hover:border-white/10 rounded-xl flex items-center justify-between transition-all"
                      >
                        <div className="space-y-1 text-left min-w-0 pr-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold text-white font-sans truncate">{expr.label}</span>
                            <span className="px-1.5 py-0.5 bg-purple-500/10 border border-purple-500/20 rounded-md text-[9px] font-mono text-purple-400 font-bold">{expr.key}</span>
                          </div>
                          <div className="text-[9px] font-mono text-zinc-500 space-y-0.5">
                            {expr.expressionId && <div>File: <span className="text-zinc-300">{expr.expressionId}</span></div>}
                            {expr.motionGroup && <div>Motion: <span className="text-zinc-300">{expr.motionGroup} [{expr.motionIndex}]</span></div>}
                            {Object.entries(expr.overrides || {}).some(([_, v]: any) => v.enabled) && (
                              <div className="text-[8.5px] text-amber-500/80">
                                Overrides: {Object.entries(expr.overrides || {})
                                  .filter(([_, v]: any) => v.enabled)
                                  .map(([k, v]: any) => `${k.replace('Param', '')}(${v.value})`)
                                  .join(', ')}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleTestExpression(expr.key)}
                            className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 hover:border-emerald-500/40 rounded-lg transition-all cursor-pointer"
                            title="Trigger / Play expression"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteExpression(expr.key)}
                            className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-450 border border-red-500/20 hover:border-red-500/40 rounded-lg transition-all cursor-pointer"
                            title="Delete expression"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Right Side: Expression Creation Form (7 cols) */}
              <div className="lg:col-span-7 bg-black/20 border border-white/5 p-4 rounded-xl space-y-4">
                <span className="text-[9px] uppercase font-mono tracking-wider text-purple-400 font-bold block flex items-center gap-1">
                  <Plus className="w-3 h-3" />
                  Define New Expression ID
                </span>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-mono tracking-wider text-zinc-500 block">Expression Key/ID</label>
                    <input 
                      type="text" 
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value)}
                      placeholder="e.g., shy"
                      className="w-full text-xs font-mono bg-black/60 border border-white/10 rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-purple-500 transition-colors"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-mono tracking-wider text-zinc-500 block">Display Label</label>
                    <input 
                      type="text" 
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      placeholder="e.g., Shy Expression"
                      className="w-full text-xs font-sans bg-black/60 border border-white/10 rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-purple-500 transition-colors"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1 col-span-1">
                    <label className="text-[9px] uppercase font-mono tracking-wider text-zinc-500 block">L2D Expression File</label>
                    <select
                      value={newExprFile}
                      onChange={(e) => setNewExprFile(e.target.value)}
                      className="w-full text-xs font-mono bg-black/60 border border-white/10 rounded-xl px-2 py-1.5 text-white focus:outline-none focus:border-purple-500 transition-colors"
                    >
                      <option value="None">None</option>
                      <option value="f01">f01 (Smile)</option>
                      <option value="f02">f02 (Laugh)</option>
                      <option value="f03">f03 (Sad)</option>
                      <option value="f04">f04 (Think)</option>
                      <option value="f05">f05 (Angry)</option>
                      <option value="f06">f06 (Surprise)</option>
                      <option value="f07">f07 (Blush)</option>
                      <option value="custom">Custom ID...</option>
                    </select>
                  </div>
                  
                  {newExprFile === 'custom' && (
                    <div className="space-y-1 col-span-2">
                      <label className="text-[9px] uppercase font-mono tracking-wider text-zinc-500 block">Custom Expression File ID</label>
                      <input 
                        type="text" 
                        value={customExprFile}
                        onChange={(e) => setCustomExprFile(e.target.value)}
                        placeholder="e.g., f08"
                        className="w-full text-xs font-mono bg-black/60 border border-white/10 rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-purple-500 transition-colors"
                      />
                    </div>
                  )}

                  <div className={`${newExprFile === 'custom' ? 'col-span-3' : 'col-span-2'} grid grid-cols-2 gap-2`}>
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-mono tracking-wider text-zinc-500 block">Motion Group</label>
                      <select
                        value={newMotionGroup}
                        onChange={(e) => setNewMotionGroup(e.target.value)}
                        className="w-full text-xs font-mono bg-black/60 border border-white/10 rounded-xl px-2 py-1.5 text-white focus:outline-none focus:border-purple-500 transition-colors"
                      >
                        <option value="None">None</option>
                        <option value="Idle">Idle</option>
                        <option value="Tap">Tap</option>
                        <option value="custom">Custom...</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-mono tracking-wider text-zinc-500 block">Motion Index</label>
                      <input 
                        type="number" 
                        value={newMotionIndex}
                        onChange={(e) => setNewMotionIndex(Number(e.target.value) || 0)}
                        min={0}
                        max={100}
                        className="w-full text-xs font-mono bg-black/60 border border-white/10 rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-purple-500 transition-colors"
                      />
                    </div>
                  </div>
                </div>

                {newMotionGroup === 'custom' && (
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-mono tracking-wider text-zinc-500 block">Custom Motion Group Name</label>
                    <input 
                      type="text" 
                      value={customMotionGroup}
                      onChange={(e) => setCustomMotionGroup(e.target.value)}
                      placeholder="e.g., Shake"
                      className="w-full text-xs font-mono bg-black/60 border border-white/10 rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-purple-500 transition-colors"
                    />
                  </div>
                )}

                {/* Parameter Overrides Grid */}
                <div className="space-y-3 pt-2 border-t border-white/5 text-left">
                  <span className="text-[9px] uppercase font-mono tracking-wider text-purple-400 font-bold block flex items-center gap-1">
                    <SlidersHorizontal className="w-3 h-3" />
                    Manual Parameter Settings (Overrides)
                  </span>

                  <div className="space-y-3.5">
                    {/* ParamEyeSmile */}
                    <div className="bg-black/30 border border-white/5 rounded-lg p-2.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input 
                            type="checkbox" 
                            checked={overrideEyeSmile}
                            onChange={(e) => setOverrideEyeSmile(e.target.checked)}
                            className="rounded border-white/20 bg-black text-purple-500 focus:ring-0 focus:ring-offset-0"
                          />
                          <span className="text-[10px] font-mono text-zinc-300 font-bold">ParamEyeSmile (Eye Smile)</span>
                        </label>
                        <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">{valEyeSmile.toFixed(2)}</span>
                      </div>
                      {overrideEyeSmile && (
                        <div className="flex items-center gap-3">
                          <span className="text-[9px] font-mono text-zinc-500">0.00</span>
                          <input 
                            type="range" 
                            min="0.00" 
                            max="1.00" 
                            step="0.05"
                            value={valEyeSmile}
                            onChange={(e) => setValEyeSmile(Number(e.target.value))}
                            className="flex-1 accent-purple-500 h-1 bg-zinc-800 rounded-lg cursor-pointer animate-fade-in"
                          />
                          <span className="text-[9px] font-mono text-zinc-500">1.00</span>
                        </div>
                      )}
                    </div>

                    {/* ParamMouthForm */}
                    <div className="bg-black/30 border border-white/5 rounded-lg p-2.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input 
                            type="checkbox" 
                            checked={overrideMouthForm}
                            onChange={(e) => setOverrideMouthForm(e.target.checked)}
                            className="rounded border-white/20 bg-black text-purple-500 focus:ring-0 focus:ring-offset-0"
                          />
                          <span className="text-[10px] font-mono text-zinc-300 font-bold">ParamMouthForm (Mouth Form)</span>
                        </label>
                        <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">{valMouthForm.toFixed(2)}</span>
                      </div>
                      {overrideMouthForm && (
                        <div className="flex items-center gap-3">
                          <span className="text-[9px] font-mono text-zinc-500">-1.00</span>
                          <input 
                            type="range" 
                            min="-1.00" 
                            max="1.00" 
                            step="0.05"
                            value={valMouthForm}
                            onChange={(e) => setValMouthForm(Number(e.target.value))}
                            className="flex-1 accent-purple-500 h-1 bg-zinc-800 rounded-lg cursor-pointer animate-fade-in"
                          />
                          <span className="text-[9px] font-mono text-zinc-500">1.00</span>
                        </div>
                      )}
                    </div>

                    {/* ParamCheek */}
                    <div className="bg-black/30 border border-white/5 rounded-lg p-2.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input 
                            type="checkbox" 
                            checked={overrideCheek}
                            onChange={(e) => setOverrideCheek(e.target.checked)}
                            className="rounded border-white/20 bg-black text-purple-500 focus:ring-0 focus:ring-offset-0"
                          />
                          <span className="text-[10px] font-mono text-zinc-300 font-bold">ParamCheek (Blush / Cheek)</span>
                        </label>
                        <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">{valCheek.toFixed(2)}</span>
                      </div>
                      {overrideCheek && (
                        <div className="flex items-center gap-3">
                          <span className="text-[9px] font-mono text-zinc-500">0.00</span>
                          <input 
                            type="range" 
                            min="0.00" 
                            max="1.00" 
                            step="0.05"
                            value={valCheek}
                            onChange={(e) => setValCheek(Number(e.target.value))}
                            className="flex-1 accent-purple-500 h-1 bg-zinc-800 rounded-lg cursor-pointer animate-fade-in"
                          />
                          <span className="text-[9px] font-mono text-zinc-500">1.00</span>
                        </div>
                      )}
                    </div>

                    {/* ParamBrowInnerY */}
                    <div className="bg-black/30 border border-white/5 rounded-lg p-2.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input 
                            type="checkbox" 
                            checked={overrideBrowY}
                            onChange={(e) => setOverrideBrowY(e.target.checked)}
                            className="rounded border-white/20 bg-black text-purple-500 focus:ring-0 focus:ring-offset-0"
                          />
                          <span className="text-[10px] font-mono text-zinc-300 font-bold">ParamBrowInnerY (Brow Inner Y)</span>
                        </label>
                        <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">{valBrowY.toFixed(2)}</span>
                      </div>
                      {overrideBrowY && (
                        <div className="flex items-center gap-3">
                          <span className="text-[9px] font-mono text-zinc-500">-1.00</span>
                          <input 
                            type="range" 
                            min="-1.00" 
                            max="1.00" 
                            step="0.05"
                            value={valBrowY}
                            onChange={(e) => setValBrowY(Number(e.target.value))}
                            className="flex-1 accent-purple-500 h-1 bg-zinc-800 rounded-lg cursor-pointer animate-fade-in"
                          />
                          <span className="text-[9px] font-mono text-zinc-500">1.00</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {formError && (
                  <div className="text-[10.5px] font-mono text-red-400 flex items-center gap-1.5 bg-red-500/10 border border-red-500/25 p-2 rounded-xl">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleAddExpression}
                  className="w-full py-2.5 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white font-sans font-bold text-xs rounded-xl shadow-lg hover:shadow-purple-500/10 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Save Custom Expression ID
                </button>
              </div>
            </div>
          </div>

          {/* Mood Presets Macro Recorder Panel */}
          <div className="space-y-4 border-t border-white/5 pt-5">
            <div>
              <h4 className="text-sm font-bold text-white tracking-wide font-sans flex items-center gap-2">
                <Disc className={`w-4 h-4 ${isRecordingMacro ? 'text-red-500 animate-pulse' : 'text-indigo-400'}`} />
                Live2D Mood Presets & Macro Recorder
              </h4>
              <p className="text-[10.5px] text-zinc-450 mt-1 font-sans">
                Record a sequence of Live2D expressions/gestures in real-time or script a custom choreography timeline manually. Play them back as a unified "Mood Preset".
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Side: Existing Mood Presets */}
              <div className="lg:col-span-5 space-y-3">
                <span className="text-[9px] uppercase font-mono tracking-wider text-zinc-500 block">Saved Mood Presets</span>
                <div className="bg-black/35 border border-white/5 rounded-xl p-3 max-h-[420px] overflow-y-auto space-y-2">
                  {moodPresets.length === 0 ? (
                    <div className="py-12 text-center text-zinc-500 font-sans text-[11px] italic">
                      No mood presets created yet. Use the recorder or manual builder on the right to sequence your first preset!
                    </div>
                  ) : (
                    moodPresets.map((preset) => {
                      const isPlaying = playingPresetId === preset.id;
                      return (
                        <div 
                          key={preset.id} 
                          className={`p-3 bg-white/[0.02] border rounded-xl flex flex-col gap-2 transition-all ${isPlaying ? 'border-indigo-500 bg-indigo-500/5 shadow-[0_0_12px_rgba(99,102,241,0.1)]' : 'border-white/5 hover:border-white/10'}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="min-w-0">
                              <span className="text-xs font-bold text-white font-sans block truncate">{preset.name}</span>
                              <span className="text-[8.5px] font-mono text-indigo-400 font-bold block">{preset.steps.length} Steps Sequence</span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                disabled={!!playingPresetId}
                                onClick={() => handlePlayPreset(preset)}
                                className={`p-1.5 rounded-lg border transition-all cursor-pointer ${isPlaying ? 'bg-indigo-500 text-white border-indigo-400' : 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border-indigo-500/20 hover:border-indigo-500/40 disabled:opacity-50 disabled:cursor-not-allowed'}`}
                                title="Play preset sequence"
                              >
                                <Play className={`w-3.5 h-3.5 ${isPlaying ? 'animate-pulse fill-current' : 'fill-current'}`} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeletePreset(preset.id)}
                                className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-455 border border-red-500/20 hover:border-red-500/40 rounded-lg transition-all cursor-pointer"
                                title="Delete preset"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Visual Steps Timeline */}
                          <div className="flex items-center gap-1 overflow-x-auto py-1 scrollbar-thin">
                            {preset.steps.map((step: any, idx: number) => {
                              const isStepActive = isPlaying && playingStepIndex === idx;
                              return (
                                <React.Fragment key={idx}>
                                  <div className={`px-2 py-0.5 rounded text-[8.5px] font-mono font-bold shrink-0 transition-all border ${isStepActive ? 'bg-indigo-500 text-white border-indigo-400 scale-105 shadow-[0_0_8px_rgba(99,102,241,0.3)]' : 'bg-black/40 text-zinc-400 border-white/5'}`}>
                                    {step.animationId}
                                  </div>
                                  {idx < preset.steps.length - 1 && (
                                    <span className="text-[8px] font-mono text-zinc-600 shrink-0">➔ {step.delay}ms ➔</span>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Side: Recorder and Manual Builder */}
              <div className="lg:col-span-7 bg-black/20 border border-white/5 p-4 rounded-xl space-y-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <span className="text-[9px] uppercase font-mono tracking-wider text-zinc-400 font-bold block">Preset Sequence Editor</span>
                  
                  {/* Live Recording Button */}
                  {isRecordingMacro ? (
                    <button
                      type="button"
                      onClick={handleStopLiveRecord}
                      className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white font-mono font-bold text-[9px] rounded-lg shadow-lg active:scale-[0.98] transition-all cursor-pointer flex items-center gap-1.5 animate-pulse"
                    >
                      <Square className="w-3 h-3 fill-current" />
                      🔴 Live Capturing... Stop
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStartLiveRecord}
                      className="px-3 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 hover:border-indigo-500/40 font-mono font-bold text-[9px] rounded-lg active:scale-[0.98] transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <Disc className="w-3 h-3 text-indigo-400" />
                      Live Capture Mode
                    </button>
                  )}
                </div>

                {isRecordingMacro ? (
                  <div className="py-6 text-center border-2 border-dashed border-red-500/20 rounded-xl bg-red-500/[0.02] space-y-2">
                    <div className="flex items-center justify-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-red-500 animate-ping" />
                      <span className="text-[11px] font-sans font-bold text-red-400 uppercase tracking-wider">Macro Recorder Is Live</span>
                    </div>
                    <p className="text-[10px] text-zinc-400 max-w-[320px] mx-auto font-sans leading-relaxed">
                      Click the green play button of any <span className="text-purple-400 font-bold">Custom Expression</span> above or trigger standard emotes to capture them as real-time choreographed steps!
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Steps / Timeline Builder */}
                    <div className="space-y-2">
                      <span className="text-[8px] uppercase tracking-[0.1em] font-mono text-zinc-500 font-bold block">Sequence Timeline ({presetSteps.length} Steps)</span>
                      
                      {presetSteps.length === 0 ? (
                        <div className="py-8 text-center bg-black/40 border border-white/5 border-dashed rounded-xl text-zinc-500 text-[10.5px] font-sans italic">
                          Timeline is empty. Record live above or add manual steps below.
                        </div>
                      ) : (
                        <div className="bg-black/35 border border-white/5 rounded-xl p-3 max-h-[180px] overflow-y-auto space-y-2">
                          {presetSteps.map((step, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2 bg-white/[0.01] border border-white/5 rounded-lg">
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] font-mono text-zinc-500">#{idx + 1}</span>
                                <span className="text-[11.5px] font-mono text-white font-bold">{step.animationId}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1.5">
                                  <Timer className="w-3 h-3 text-zinc-500" />
                                  <input 
                                    type="number"
                                    min="100"
                                    max="10000"
                                    step="100"
                                    value={step.delay}
                                    onChange={(e) => handleUpdateStepDelay(idx, Number(e.target.value))}
                                    className="w-16 text-center text-[10px] font-mono bg-black/50 border border-white/10 rounded px-1.5 py-0.5 text-zinc-300 focus:outline-none focus:border-purple-500"
                                  />
                                  <span className="text-[9px] font-mono text-zinc-500">ms</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveStep(idx)}
                                  className="text-red-400/80 hover:text-red-400 p-1 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Manual Step Adder */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2 border-t border-white/5">
                      <div className="md:col-span-6 space-y-1">
                        <label className="text-[9px] font-mono text-zinc-400 block font-bold uppercase tracking-wider">Animation Target</label>
                        <select
                          value={selectedStepAnim}
                          onChange={(e) => setSelectedStepAnim(e.target.value)}
                          className="w-full text-xs font-mono bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-500 transition-colors"
                        >
                          <optgroup label="Standard Expressions" className="bg-[#0f0f15]">
                            <option value="smile">smile</option>
                            <option value="laugh">laugh</option>
                            <option value="surprise">surprise</option>
                            <option value="blush">blush</option>
                            <option value="sad">sad</option>
                            <option value="angry">angry</option>
                            <option value="think">think</option>
                            <option value="wink">wink</option>
                          </optgroup>
                          <optgroup label="Standard Gestures" className="bg-[#0f0f15]">
                            <option value="nod">nod</option>
                            <option value="shake">shake</option>
                            <option value="wave">wave</option>
                            <option value="look_left">look_left</option>
                            <option value="look_right">look_right</option>
                            <option value="look_center">look_center</option>
                          </optgroup>
                          {customExpressions.length > 0 && (
                            <optgroup label="Custom Expressions" className="bg-[#0f0f15]">
                              {customExpressions.map(e => (
                                <option key={e.key} value={e.key}>{e.key}</option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                      </div>

                      <div className="md:col-span-4 space-y-1">
                        <label className="text-[9px] font-mono text-zinc-400 block font-bold uppercase tracking-wider">Step Delay (ms)</label>
                        <input 
                          type="number" 
                          min="100" 
                          max="10000"
                          step="100"
                          value={selectedStepDelay}
                          onChange={(e) => setSelectedStepDelay(Number(e.target.value))}
                          className="w-full text-xs font-mono bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-500 transition-colors"
                        />
                      </div>

                      <div className="md:col-span-2 flex items-end">
                        <button
                          type="button"
                          onClick={handleAddManualStep}
                          className="w-full py-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl text-xs font-sans font-bold active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add Step
                        </button>
                      </div>
                    </div>

                    {/* Preset Saving Section */}
                    {presetSteps.length > 0 && (
                      <div className="flex flex-col md:flex-row gap-3 pt-4 border-t border-white/5">
                        <input 
                          type="text"
                          value={presetName}
                          onChange={(e) => setPresetName(e.target.value)}
                          placeholder="Preset name (e.g., Excited Greetings)"
                          className="flex-1 text-xs font-sans bg-black/60 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setPresetSteps([])}
                            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-sans font-bold text-xs rounded-xl active:scale-[0.98] transition-all cursor-pointer"
                          >
                            Clear
                          </button>
                          <button
                            type="button"
                            disabled={!presetName.trim()}
                            onClick={handleSavePreset}
                            className="px-5 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-sans font-bold text-xs rounded-xl shadow-lg active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Save Preset
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

        </div>
      ) : systemSubpage === 'developers' ? (
        <div className="space-y-6 animate-fade-in font-sans">
          {/* Workspace Paths & Physical Path Jail Config Board */}
          <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div>
                <h4 className="text-[10px] uppercase font-mono tracking-widest text-[#d4d4d8]/40 font-bold">🛡️ Workspace Sandbox Paths & Jail Registry</h4>
                <div className="flex items-center gap-2 mt-0.5 leading-none">
                  <p className="text-[10.5px] text-zinc-450 font-sans">Physical sandbox data isolation directories and Path Jail rules.</p>
                  {onShowInfo && (
                    <button
                      type="button"
                      onClick={() => onShowInfo(
                        "Workspace Sandbox Isolation & Path Jail",
                        "Konfigurasi folder batin fisik dan pembatasan isolasi keamanan Sandbox (Path Jail).\n\nSistem mengarantina dan me-jail seluruh file-operasi kognitif hanya di bawah user_data untuk memproteksi direktori vital root host server dari manipulasi berbahaya."
                      )}
                      className="text-amber-500 hover:text-amber-400 font-mono transition-all text-[11px] cursor-pointer inline-flex items-center justify-center font-bold"
                      title="See details"
                    >
                      [?]
                    </button>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSettings((prev: any) => ({
                    ...prev,
                    sandbox_paths: {
                      ...RUNTIME_DEFAULTS.sandbox_paths,
                    }
                  }));
                }}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-zinc-350 text-[9px] uppercase tracking-wider font-mono border border-white/5 rounded-xl transition-all cursor-pointer hover:border-amber-500/35 font-bold active:scale-95"
              >
                🔄 Reset Default Template
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10.5px] text-zinc-400 mb-1.5 font-sans font-bold">Data Directory (Database, Config, Metrics)</label>
                <input 
                  type="text" 
                  value={settings.sandbox_paths?.data_dir || './data'}
                  onChange={e => setSettings((prev: any) => ({
                    ...prev,
                    sandbox_paths: { ...(prev.sandbox_paths || {}), data_dir: e.target.value }
                  }))}
                  className="w-full bg-[#07070a] border border-white/5 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500/35 font-mono transition-all"
                />
              </div>
              <div>
                <label className="block text-[10.5px] text-zinc-400 mb-1.5 font-sans font-bold">Config File Path (TOML File)</label>
                <input 
                  type="text" 
                  value={settings.sandbox_paths?.config_path || './data/config.toml'}
                  onChange={e => setSettings((prev: any) => ({
                    ...prev,
                    sandbox_paths: { ...(prev.sandbox_paths || {}), config_path: e.target.value }
                  }))}
                  className="w-full bg-[#07070a] border border-white/5 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500/35 font-mono transition-all"
                />
              </div>
              <div>
                <label className="block text-[10.5px] text-zinc-400 mb-1.5 font-sans font-bold">Database SQLite File Path</label>
                <input 
                  type="text" 
                  value={settings.sandbox_paths?.db_path || './data/yuihime.db'}
                  onChange={e => setSettings((prev: any) => ({
                    ...prev,
                    sandbox_paths: { ...(prev.sandbox_paths || {}), db_path: e.target.value }
                  }))}
                  className="w-full bg-[#07070a] border border-white/5 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500/35 font-mono transition-all"
                />
              </div>
              <div>
                <label className="block text-[10.5px] text-zinc-400 mb-1.5 font-sans font-bold">User Workspace Sandbox Path (Path Jail)</label>
                <input 
                  type="text" 
                  value={settings.sandbox_paths?.user_data_path || './user_data'}
                  onChange={e => setSettings((prev: any) => ({
                    ...prev,
                    sandbox_paths: { ...(prev.sandbox_paths || {}), user_data_path: e.target.value }
                  }))}
                  className="w-full bg-[#07070a] border border-white/5 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500/35 font-mono transition-all"
                />
              </div>
              <div>
                <label className="block text-[10.5px] text-zinc-400 mb-1.5 font-sans font-bold">Agent Internal Markdown Assets Path</label>
                <input 
                  type="text" 
                  value={settings.sandbox_paths?.agent_path || './agent'}
                  onChange={e => setSettings((prev: any) => ({
                    ...prev,
                    sandbox_paths: { ...(prev.sandbox_paths || {}), agent_path: e.target.value }
                  }))}
                  className="w-full bg-[#07070a] border border-white/5 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500/35 font-mono transition-all"
                />
              </div>
              <div>
                <label className="block text-[10.5px] text-zinc-400 mb-1.5 font-sans font-bold">Addons Plugin Directory Path</label>
                <input 
                  type="text" 
                  value={settings.sandbox_paths?.addons_path || './addons'}
                  onChange={e => setSettings((prev: any) => ({
                    ...prev,
                    sandbox_paths: { ...(prev.sandbox_paths || {}), addons_path: e.target.value }
                  }))}
                  className="w-full bg-[#07070a] border border-white/5 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500/35 font-mono transition-all"
                />
              </div>
              <div>
                <label className="block text-[10.5px] text-zinc-400 mb-1.5 font-sans font-bold">Waktu Tunggu Konfirmasi (Detik)</label>
                <input 
                  type="number" 
                  min={5}
                  max={600}
                  value={settings.sandbox_paths?.confirmation_timeout ?? 45}
                  onChange={e => {
                    const val = parseInt(e.target.value, 10);
                    setSettings((prev: any) => ({
                      ...prev,
                      sandbox_paths: { ...(prev.sandbox_paths || {}), confirmation_timeout: isNaN(val) ? 45 : val }
                    }));
                  }}
                  className="w-full bg-[#07070a] border border-white/5 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500/35 font-mono transition-all"
                />
              </div>

              <div className="md:col-span-2 bg-[#09090e]/75 border border-white/5 rounded-xl p-4 flex items-center justify-between mt-2 select-none">
                <div className="pr-4">
                  <label className="block text-[11px] text-zinc-300 font-sans font-bold">Auto Acc (Matikan Konfirmasi user_data)</label>
                  <p className="text-[10px] text-zinc-500 font-sans mt-0.5 leading-relaxed">
                    Jika diaktifkan, Yuihime akan langsung mengeksekusi operasi edit/hapus berkas di direktori <code>user_data</code> secara otomatis tanpa memunculkan panel konfirmasi manual.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSettings((prev: any) => ({
                    ...prev,
                    sandbox_paths: {
                      ...(prev.sandbox_paths || {}),
                      auto_acc_user_data: !prev.sandbox_paths?.auto_acc_user_data
                    }
                  }))}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.sandbox_paths?.auto_acc_user_data ? 'bg-amber-500' : 'bg-zinc-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-black shadow ring-0 transition duration-200 ease-in-out ${
                      settings.sandbox_paths?.auto_acc_user_data ? 'translate-x-4 bg-white' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="md:col-span-2 bg-[#09090e]/75 border border-white/5 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between mt-2 select-none gap-4">
                <div className="pr-4 max-w-xl">
                  <label className="block text-[11px] text-amber-500 font-sans font-bold">YOLO Mode (Total Sandbox & Shell Bypass)</label>
                  <p className="text-[10px] text-zinc-500 font-sans mt-0.5 leading-relaxed">
                    Tingkat batasan batin Yuihime terhadap sistem operasi dan file:<br />
                    • <strong className="text-zinc-300">OFF:</strong> Sangat ketat. Hanya membaca/menulis di dalam <code>user_data</code> sandbox saja.<br />
                    • <strong className="text-amber-500">HALF:</strong> Hanya CLI Shell yang dibatasi (blacklist). Bebas membaca/menulis file di manapun di luar sandbox, namun setiap penulisan/modifikasi file di luar folder sistem wajib konfirmasi (ditampilkan target path dan tindakannya) kecuali jika terdaftar di whitelist.<br />
                    • <strong className="text-red-400 font-bold">FULL:</strong> Bebas sepenuhnya tanpa batasan dan tanpa konfirmasi.
                  </p>
                </div>
                <div className="flex bg-[#050508] border border-white/5 rounded-xl p-1 gap-1">
                  {['off', 'half', 'full'].map((mode) => {
                    const currentVal = settings.sandbox_paths?.yolo_mode;
                    const isSelected = 
                      (mode === 'full' && (currentVal === 'full' || currentVal === true)) ||
                      (mode === 'half' && currentVal === 'half') ||
                      (mode === 'off' && (currentVal === 'off' || currentVal === false || currentVal === undefined));

                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setSettings((prev: any) => ({
                          ...prev,
                          sandbox_paths: {
                            ...(prev.sandbox_paths || {}),
                            yolo_mode: mode
                          }
                        }))}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-wider transition-all ${
                          isSelected 
                            ? 'bg-amber-500 text-black font-bold' 
                            : 'text-zinc-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        {mode}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-[10.5px] text-zinc-400 mb-1.5 font-sans font-bold">YOLO Half Mode Whitelist</label>
                <input 
                  type="text" 
                  placeholder="e.g. src/drivers, package.json (comma-separated)"
                  value={settings.sandbox_paths?.whitelist || ''}
                  onChange={e => setSettings((prev: any) => ({
                    ...prev,
                    sandbox_paths: { ...(prev.sandbox_paths || {}), whitelist: e.target.value }
                  }))}
                  className="w-full bg-[#07070a] border border-white/5 rounded-xl px-3 py-2.5 text-xs text-white placeholder-zinc-750 focus:outline-none focus:border-amber-500/35 font-mono transition-all"
                />
                <p className="text-[9px] text-zinc-550 font-sans mt-1 leading-relaxed">
                  Daftar nama file atau direktori relatif (pisahkan dengan koma) yang diizinkan untuk langsung dimodifikasi pada mode YOLO HALF tanpa perlu memicu dialog konfirmasi manual.
                </p>
              </div>

              <div className="md:col-span-2">
                <label className="block text-[10.5px] text-zinc-400 mb-1.5 font-sans font-bold">Shell Command Blacklist</label>
                <input 
                  type="text" 
                  placeholder="e.g. rm -rf /, mkfs, dd, reboot, shutdown (comma-separated)"
                  value={settings.sandbox_paths?.command_blacklist || ''}
                  onChange={e => setSettings((prev: any) => ({
                    ...prev,
                    sandbox_paths: { ...(prev.sandbox_paths || {}), command_blacklist: e.target.value }
                  }))}
                  className="w-full bg-[#07070a] border border-white/5 rounded-xl px-3 py-2.5 text-xs text-white placeholder-zinc-750 focus:outline-none focus:border-amber-500/35 font-mono transition-all"
                />
                <p className="text-[9px] text-zinc-550 font-sans mt-1 leading-relaxed">
                  Daftar pola perintah shell (pisahkan dengan koma) yang dilarang keras untuk dieksekusi demi pengamanan sistem (kecuali pada mode YOLO FULL).
                </p>
              </div>

              <div className="md:col-span-2">
                <label className="block text-[10.5px] text-zinc-400 mb-1.5 font-sans font-bold">Shell Command Whitelist</label>
                <input 
                  type="text" 
                  placeholder="e.g. echo, ls, pwd (comma-separated)"
                  value={settings.sandbox_paths?.command_whitelist || ''}
                  onChange={e => setSettings((prev: any) => ({
                    ...prev,
                    sandbox_paths: { ...(prev.sandbox_paths || {}), command_whitelist: e.target.value }
                  }))}
                  className="w-full bg-[#07070a] border border-white/5 rounded-xl px-3 py-2.5 text-xs text-white placeholder-zinc-750 focus:outline-none focus:border-amber-500/35 font-mono transition-all"
                />
                <p className="text-[9px] text-zinc-550 font-sans mt-1 leading-relaxed">
                  Daftar pola perintah shell (pisahkan dengan koma) yang diizinkan untuk melewati filter blacklist di atas.
                </p>
              </div>
            </div>
            <div className="bg-amber-500/5 rounded-xl border border-amber-500/10 p-4 select-none">
              <p className="text-[10px] text-amber-500/90 leading-relaxed font-sans">
                ⚠️ <strong>Informasi Keamanan Path Jail:</strong> Path Jail fisik Yuihime melindungi sistem kail pembatasan agar agen hanya bisa mendaftar, membaca, dan memodifikasi file di dalam direktori <code>user_data</code> secara aman.
              </p>
            </div>
          </div>

          {/* Memory & Forgetfulness Configurations */}
          <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl">
            <h4 className="text-[10px] uppercase font-mono tracking-widest text-zinc-550 mb-4">🧠 Memory & Forgetfulness</h4>
            {renderFields(
              {
                metadata: { id: 'memory' },
                configSchema: {
                  fields: {
                    forgetfulness_enabled: {
                      label: 'Enable Memory Forgetfulness Protocol (Ebbinghaus Decay)',
                      type: 'boolean',
                      default: true,
                      description: 'Saat aktif, memori lama pelan-pelan dilupakan (decay importance) lalu dihapus jika sangat usang dan tidak pernah diingat ulang. Saat nonaktif, seluruh percakapan (termasuk Telegram) dipertahankan utuh tanpa decay, purge, maupun konsolidasi otomatis.'
                    }
                  }
                }
              } as any,
              settings.memory || { forgetfulness_enabled: true },
              (field: string, val: any) => {
                setSettings((prev: any) => ({
                  ...prev,
                  memory: { ...(prev.memory || {}), [field]: val }
                }));
              }
            )}
          </div>

          {/* Diagnostics and Developer Configurations */}
          <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl">
            <h4 className="text-[10px] uppercase font-mono tracking-widest text-zinc-550 mb-4">Engine Diagnostics & Configurations</h4>
            {renderFields(
              {
                metadata: { id: 'developer' },
                configSchema: {
                  fields: {
                    enableMultiTurnReasoning: { 
                      label: 'Enable Multi-Turn Agent Reasoning (Tool Call Loops)', 
                      type: 'boolean', 
                      default: true,
                      description: 'Mengaktifkan putaran analisis multi-langkah batin untuk alat bantu (tools). Jika dimatikan, respons akan langsung dihasilkan dalam satu langkah cepat untuk performa maksimal.' 
                    },
                    disableStageTransitions: { label: 'Deactivate Animation Transitions', type: 'boolean', default: false },
                    enableKernelFailsafe: { label: 'Enable Kernel Failsafe (LLM Reprocessing Retry)', type: 'boolean', default: false },
                    pageSpecificTransitions: { label: 'Enable View-Specific Framer Motion Effects', type: 'boolean', default: true },
                    performanceVisualizer: { label: 'Enable Real-Time Rendering Diagnostics (FPS Monitor)', type: 'boolean', default: false },
                    bgRemoval: { label: 'Activate Alpha Chroma Matte (Transparent Canvas BG)', type: 'boolean', default: false },
                    bgThemeBlending: { label: 'Matte Transparency Blending Intensity', type: 'slider', min: 0, max: 100, step: 5, default: 50 },
                    disableUiAutoFocus: {
                      label: 'Deactivate Input Cursor Auto Focus',
                      type: 'boolean',
                      default: false,
                      description: 'Menonaktifkan pemfokusan kursor (autoFocus/element.focus) otomatis pada seluruh kolom input/textarea di antarmuka sistem.'
                    },
                    audioRecordMode: {
                      label: 'Acoustic Capturing Protocol',
                      type: 'select',
                      default: 'high',
                      options: [
                        { value: 'high', label: 'Lossless Audio High-Fidelity Capture' },
                        { value: 'balanced', label: 'Balanced Speech Activity Extraction' },
                        { value: 'low', label: 'Fallback Legacy Audio Web Standard' }
                      ]
                    }
                  }
                }
              } as any,
              settings.developer || { ...RUNTIME_DEFAULTS.developer },
              (field: string, val: any) => {
                setSettings((prev: any) => ({
                  ...prev,
                  developer: { ...(prev.developer || {}), [field]: val }
                }));
              }
            )}
          </div>

          {/* Environment Variables Management inside Developer Settings */}
          <div className="pt-2">
            <EnvTab onShowInfo={onShowInfo} />
          </div>
        </div>
      ) : (
        <div className="space-y-6 animate-fade-in font-sans">
          {/* BACKUP & RESTORE VIEW */}
          <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl space-y-4 animate-fade-in">
            <div className="flex items-start justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <Archive size={18} />
                <h4 className="text-sm font-bold text-white tracking-wide font-sans">Export Complete System Backup</h4>
              </div>
              <span className="text-[9px] uppercase font-mono bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">Automated Snapshot</span>
            </div>

            <p className="text-[11px] text-zinc-400 font-sans leading-relaxed">
              Compile the database, global settings, agent history, custom personality prompts, local workspace archives, and addon libraries into a single compact zip.
            </p>

            <div className="bg-[#07070a]/45 border border-[#10b981]/15 p-4 rounded-xl flex items-center gap-3.5 select-none leading-normal">
              <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-400">
                <Database size={16} />
              </div>
              <div>
                <h5 className="text-[11px] font-bold text-white font-sans">System Ready</h5>
                <p className="text-[10px] text-zinc-500 mt-0.5 font-sans">Snapshot process runs safely in the background.</p>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleDownloadBackup}
                disabled={backupLoading}
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white font-sans font-bold text-xs px-5 py-3 rounded-xl transition-all cursor-pointer select-none active:scale-95 shadow-[0_0_15px_rgba(16,185,129,0.15)] hover:shadow-[0_0_20px_rgba(16,185,129,0.25)] border border-emerald-500/30"
              >
                {backupLoading ? (
                  <RefreshCw size={13} className="animate-spin" />
                ) : (
                  <Download size={13} />
                )}
                <span>Create & Download Backup (.zip)</span>
              </button>
            </div>
          </div>

          {/* RESTORE IMPORT SECTION */}
          <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl space-y-4 animate-fade-in">
            <div className="flex items-start justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2 text-amber-500">
                <ShieldAlert size={18} className="text-amber-500" />
                <h4 className="text-sm font-bold text-white tracking-wide font-sans">Restore System</h4>
              </div>
              <span className="text-[9px] uppercase font-mono bg-rose-500/10 border border-rose-500/20 text-rose-450 px-2 py-0.5 rounded-full">Destructive Action</span>
            </div>

            <p className="text-[11px] text-zinc-400 font-sans leading-relaxed">
              Upload a backup zip file to restore system settings, databases, and memory. This is a destructive action that overwrites existing data.
            </p>

            <div className="bg-[#ef4444]/5 border border-[#ef4444]/15 p-4 rounded-xl flex items-start gap-3.5 select-none text-left leading-normal">
              <div className="p-2.5 bg-rose-500/10 rounded-xl border border-rose-500/20 text-rose-450 shrink-0 mt-0.5">
                <AlertTriangle size={16} />
              </div>
              <div>
                <h5 className="text-[11px] font-bold text-rose-400 font-sans">Deconstruction Warning</h5>
                <p className="text-[10px] text-zinc-500 mt-1.5 font-sans leading-relaxed">
                  This action overwrites your running database and configuration. Ensure you have backed up your current data first.
                </p>
              </div>
            </div>

            {restoreStatus === 'idle' && (
              <div className="pt-2 font-sans animate-fade-in">
                <label 
                  className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-white/10 hover:border-amber-500/35 bg-[#07070a]/35 hover:bg-[#0c0c12]/55 rounded-2xl transition-all cursor-pointer text-center group"
                >
                  <Upload size={24} className="text-zinc-500 group-hover:text-amber-500 group-hover:-translate-y-0.5 transition-all mb-2" />
                  <span className="text-xs font-bold text-zinc-300">Select backup zip file (.zip)</span>
                  <span className="text-[10px] text-zinc-500 mt-1 font-mono">Upload size limit: 50MB</span>
                  <input 
                    type="file" 
                    accept=".zip,application/zip,application/x-zip-compressed,application/x-zip"
                    onChange={handleFileChange}
                    className="hidden" 
                  />
                </label>
              </div>
            )}

            {restoreStatus !== 'idle' && (
              <div className="p-5 bg-black/45 border border-white/5 rounded-2xl flex flex-col items-center justify-center text-center space-y-4 animate-fade-in">
                {restoreStatus === 'reading' || restoreStatus === 'restoring' ? (
                  <>
                    <div className="w-8 h-8 border-3 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
                    <div className="space-y-1">
                      <h5 className="text-xs font-bold text-white font-sans">{restoreStatus === 'reading' ? 'Reading Backup Zip...' : 'Restoring Inner Database...'}</h5>
                      <p className="text-[10px] text-zinc-400 font-mono">{restoreMessage}</p>
                    </div>
                  </>
                ) : restoreStatus === 'success' ? (
                  <>
                    <div className="w-9 h-9 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center animate-bounce">
                      <Check size={18} />
                    </div>
                    <div className="space-y-1">
                      <h5 className="text-xs font-bold text-emerald-400 font-sans">System Successfully Restored!</h5>
                      <p className="text-[10px] text-zinc-400 mt-1 font-sans">{restoreMessage}</p>
                      <p className="text-[9px] text-amber-500 font-mono mt-1 animate-pulse">Restarting system in 2 seconds...</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-9 h-9 bg-rose-500/10 border border-rose-500/20 text-rose-450 rounded-full flex items-center justify-center">
                      <AlertTriangle size={18} />
                    </div>
                    <div className="space-y-1.5 flex-1 w-full text-center">
                      <h5 className="text-xs font-bold text-rose-400 font-sans">Restore Failed</h5>
                      <p className="text-[10px] text-zinc-400 font-mono select-text bg-[#07070a] border border-white/5 p-2 rounded-lg max-h-24 overflow-y-auto leading-relaxed text-left inline-block">{restoreMessage}</p>
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setRestoreStatus('idle');
                            setRestoreMessage('');
                          }}
                          className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 text-white/70 text-[10px] font-sans font-bold rounded-lg border border-white/5 cursor-pointer"
                        >
                          Try Again
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
