import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Edit2, Copy, Download, Upload } from 'lucide-react';
import { encryptProfile, decryptProfile } from '../../services/profileCrypto';

interface TopWaveBannerProps {
  perceivedName: string;
  setIdentity?: (name: string) => void;
  activeSessionId: string;
  onRestoreProfile: (name: string, sessionId: string) => void;
  NEURAL_CORES: any[];
  activePersonaId: string;
  setActivePersonaId: (id: string) => void;
  onSpeakAndEmote: (text: string, emote: string) => void;
  prepareForTraining?: boolean;
  onTogglePrepareForTraining?: () => void;
}

export const TopWaveBanner: React.FC<TopWaveBannerProps> = ({
  perceivedName,
  setIdentity,
  activeSessionId,
  onRestoreProfile,
  NEURAL_CORES = [],
  activePersonaId = 'hiyori',
  setActivePersonaId,
  onSpeakAndEmote,
  prepareForTraining = false,
  onTogglePrepareForTraining
}) => {
  const [showPersonaDropdown, setShowPersonaDropdown] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState('');
  const [copiedSessionId, setCopiedSessionId] = useState(false);
  const [profileStatus, setProfileStatus] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const handleSaveName = () => {
    const trimmed = tempName.trim();
    if (trimmed && setIdentity) {
      setIdentity(trimmed);
    }
    setIsEditingName(false);
  };

  const handleSaveAndDownloadProfile = () => {
    try {
      const dataToEncrypt = {
        session_id: activeSessionId,
        perceivedName: perceivedName || 'user',
        timestamp: Date.now()
      };
      
      const encryptedPem = encryptProfile(dataToEncrypt);
      
      const blob = new Blob([encryptedPem], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const formattedName = (perceivedName || 'user').toLowerCase().replace(/\s+/g, '_');
      link.download = `yuihime_profile_${formattedName}.yui`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setProfileStatus({ type: 'success', text: 'Profil berhasil diekspor!' });
      setTimeout(() => setProfileStatus(null), 3500);
      
      onSpeakAndEmote(`Kunci enkripsi identitas batin kakak berhasil diunduh. Simpan dengan baik ya!`, 'wink');
    } catch (err: any) {
      setProfileStatus({ type: 'error', text: 'Gagal ekspor: ' + err.message });
      setTimeout(() => setProfileStatus(null), 4000);
    }
  };

  const handleLoadProfileFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) throw new Error("Gagal membaca isi berkas.");
        
        const decrypted = decryptProfile(text);
        if (!decrypted.session_id || !decrypted.perceivedName) {
          throw new Error("Format data di dalam berkas enkripsi tidak lengkap.");
        }
        
        onRestoreProfile(decrypted.perceivedName, decrypted.session_id);
        
        setProfileStatus({ type: 'success', text: `Profil ${decrypted.perceivedName} berhasil dimuat!` });
        setTimeout(() => setProfileStatus(null), 4000);
        
        onSpeakAndEmote(`Halo kak ${decrypted.perceivedName}! Transponder batin diselaraskan kembali ke frekuensi sesi lama.`, 'wink');
      } catch (err: any) {
        setProfileStatus({ type: 'error', text: 'Gagal memuat: ' + err.message });
        setTimeout(() => setProfileStatus(null), 4000);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="absolute top-0 inset-x-0 h-28 pointer-events-none z-[43] select-none">
      {/* Curved gradient dual-wave graphics wrapped to prevent clipping interactive dropdowns */}
      <div className="absolute inset-x-0 top-0 h-28 overflow-hidden pointer-events-none">
        <svg viewBox="0 0 1440 120" preserveAspectRatio="none" className="absolute top-0 left-0 w-full h-[85px] pointer-events-none opacity-95">
          {/* Wave layer 1 (Ambient darker teal accent) */}
          <path d="M0,0 L1440,0 L1440,65 Q1080,120 720,60 T0,75 Z" fill="#023b49" opacity="0.65" />
          {/* Wave layer 2 (Main deep rich teal) */}
          <path d="M0,0 L1440,0 L1440,50 Q1080,95 720,55 T0,68 Z" fill="#0a4c58" />
        </svg>
      </div>

      {/* Content container inside the wave */}
      <div className="relative z-[44] flex items-center justify-between w-full h-[60px] max-w-7xl mx-auto px-4 md:px-6 pointer-events-auto">
        {/* Left spacer to keep right element on the right side */}
        <div />

        {/* Right: Active core dropdown selector menu */}
        <div className="relative">
          <button
            onClick={() => setShowPersonaDropdown(!showPersonaDropdown)}
            className="flex items-center gap-1.5 p-1 px-1.5 rounded-full bg-black/25 hover:bg-black/45 active:scale-95 border border-white/10 text-white/90 font-mono text-[10.5px] font-bold tracking-wide transition-all shadow-[0_4px_12px_rgba(0,0,0,0.3)] cursor-pointer"
          >
            {/* Profile Image (circle.png) or fallback SVG */}
            <div className="w-8 h-8 rounded-full overflow-hidden border border-white/20 shadow-md flex items-center justify-center bg-black/30">
              {!imgFailed ? (
                <img 
                  src="/models/circle.png" 
                  alt="Yuihime Core" 
                  className="w-full h-full object-cover scale-110 translate-y-0.5"
                  referrerPolicy="no-referrer"
                  onError={() => setImgFailed(true)}
                />
              ) : (
                <svg viewBox="0 0 64 64" className="w-5 h-5 text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M32 8 C20 8 10 16 10 26 C10 32 12 36 16 40 C17 42 16 46 14 50 C19 50 23 48 25 46 C27 47 30 48 32 48 C44 48 54 40 54 26 C54 13 44 8 32 8 Z" opacity="0.4" fill="currentColor" />
                  <path d="M31 22 C26 21 21 24 20 28 C19 32 21 36 26 37 C29 37 32 35 33 33 C34 35 37 37 40 37 C45 36 47 32 46 28 C45 24 40 21 35 22 C34 23 33 24 33 25 C33 24 32 23 31 22 Z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  <circle cx="23" cy="31" r="2" fill="currentColor" />
                  <circle cx="43" cy="31" r="2" fill="currentColor" />
                  <path d="M26 41 Q32 45 38 41" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              )}
            </div>
            <ChevronDown size={14} className={`text-white/60 transition-transform duration-200 mr-1 ${showPersonaDropdown ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown popup */}
          <AnimatePresence>
            {showPersonaDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 mt-2.5 w-60 bg-[#0c0c12]/95 border border-white/10 rounded-2xl p-2.5 shadow-[0_15px_40px_rgba(0,0,0,0.6)] z-50 backdrop-blur-2xl text-left"
              >
                {/* User Profile Settings Section */}
                <div className="px-2.5 pb-2.5 mb-2.5 border-b border-white/10">
                  <div className="text-[7.5px] font-mono uppercase tracking-widest text-zinc-500 font-bold mb-2">
                    User Profile Settings
                  </div>
                  {isEditingName ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={tempName}
                        onChange={(e) => setTempName(e.target.value)}
                        className="w-full px-2 py-1 bg-black/55 border border-white/10 rounded-xl text-xs text-white placeholder-white/20 focus:outline-none focus:border-amber-500/50"
                        placeholder="Ketik nama baru..."
                        autoFocus={localStorage.getItem('yuihime_disable_autofocus') !== 'true'}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSaveName();
                          } else if (e.key === 'Escape') {
                            setIsEditingName(false);
                          }
                        }}
                      />
                      <div className="flex gap-1.5 justify-end">
                        <button
                          type="button"
                          onClick={() => setIsEditingName(false)}
                          className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[9px] font-mono text-white/60 transition-colors"
                        >
                          Batal
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveName}
                          className="px-2.5 py-0.5 rounded bg-amber-500 hover:bg-amber-600 text-[9px] font-mono text-black font-bold transition-colors"
                        >
                          Simpan
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-[10px] font-mono text-amber-400 font-bold">
                          {(perceivedName || 'user')[0]?.toUpperCase() || 'U'}
                        </div>
                        <div className="flex flex-col truncate max-w-[100px]">
                          <span className="text-xs font-bold text-white truncate">
                            {perceivedName || 'user'}
                          </span>
                          <span className="text-[7.5px] font-mono text-zinc-500">
                            Subject Name
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setTempName(perceivedName || 'user');
                          setIsEditingName(true);
                        }}
                        className="p-1 px-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-[9px] font-mono text-zinc-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <Edit2 size={10} />
                        Ubah
                      </button>
                    </div>
                  )}

                  {/* Active Session ID & Encrypted Backup/Restore */}
                  <div className="mt-3 pt-2.5 border-t border-white/10 space-y-2">
                    <div className="flex items-center justify-between text-[7px] font-mono text-zinc-500 uppercase tracking-widest font-bold">
                      <span>Active Session ID</span>
                      {copiedSessionId ? (
                        <span className="text-emerald-400 font-bold">Copied!</span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(activeSessionId);
                            setCopiedSessionId(true);
                            setTimeout(() => setCopiedSessionId(false), 2000);
                          }}
                          className="hover:text-amber-400 text-zinc-500 transition-colors cursor-pointer"
                          title="Salin ID Sesi"
                        >
                          <Copy size={9} />
                        </button>
                      )}
                    </div>
                    <div className="text-[8.5px] font-mono text-zinc-400 bg-black/40 px-2 py-1 rounded-xl border border-white/5 truncate select-all">
                      {activeSessionId}
                    </div>

                    <div className="text-[7px] font-mono uppercase tracking-widest text-zinc-500 font-bold pt-1">
                      Secure Profile File
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSaveAndDownloadProfile();
                        }}
                        className="flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 text-[9px] font-mono text-zinc-300 hover:text-white transition-all cursor-pointer"
                      >
                        <Download size={9} />
                        <span>Save</span>
                      </button>
                      
                      <label className="flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-[9px] font-mono text-amber-400 font-bold hover:text-amber-300 transition-all cursor-pointer">
                        <Upload size={9} />
                        <span>Load</span>
                        <input
                          type="file"
                          accept=".yui,.yuihime,.txt"
                          onChange={handleLoadProfileFile}
                          onClick={(e) => e.stopPropagation()}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {profileStatus && (
                      <div className={`text-[8px] font-mono px-2 py-1 rounded-lg border leading-tight ${
                        profileStatus.type === 'success' 
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      }`}>
                        {profileStatus.text}
                      </div>
                    )}

                    {/* Prepare for Training Toggle */}
                    <div className="flex items-center justify-between border-t border-white/5 pt-2.5 mt-2.5">
                      <div className="flex flex-col text-left">
                        <span className="text-[10px] font-mono text-white/80 font-bold">Prepare for Training</span>
                        <span className="text-[7.5px] font-mono text-zinc-500">Auto-formats chat flow to JSONL fine-tuning data</span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onTogglePrepareForTraining) {
                            onTogglePrepareForTraining();
                          }
                        }}
                        className={`relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${prepareForTraining ? 'bg-amber-500' : 'bg-white/10'}`}
                      >
                        <span className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-black transition duration-200 ease-in-out ${prepareForTraining ? 'translate-x-4' : 'translate-x-0'}`} />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
