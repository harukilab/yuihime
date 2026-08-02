import React, { useState, useEffect } from 'react';
import { 
  Database, Download, Upload, RefreshCw, AlertTriangle, 
  Check, Archive, ShieldAlert, Settings, Info, ClipboardList, X
} from 'lucide-react';

interface BackupTabProps {
  settings: any;
  setSettings: React.Dispatch<React.SetStateAction<any>>;
}

const stripUtf8Bom = (text: string): string => text.replace(/^\uFEFF/, '');

const parseConfigText = (text: string): any => {
  const clean = stripUtf8Bom(text);
  const trimmed = clean.trim();
  if (!trimmed) {
    throw new Error('Berkas kosong. Tidak ada data konfigurasi untuk dipulihkan.');
  }

  // Handle markdown code fences gracefully (```json ... ```) for .txt exports.
  const fenceMatch = trimmed.match(/\{[\s\S]*\}/);
  const jsonCandidate = fenceMatch ? fenceMatch[0] : trimmed;

  let parsed: any;
  try {
    parsed = JSON.parse(jsonCandidate);
  } catch (err: any) {
    throw new Error(`JSON tidak valid: ${err.message || 'kesalahan parsing.'}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Format JSON tidak valid. Data harus berupa objek konfigurasi.');
  }
  return parsed;
};

export const BackupTab: React.FC<BackupTabProps> = ({ settings, setSettings }) => {
  // Full System states
  const [fullBackupLoading, setFullBackupLoading] = useState<boolean>(false);
  const [fullRestoreStatus, setFullRestoreStatus] = useState<'idle' | 'reading' | 'restoring' | 'success' | 'error'>('idle');
  const [fullRestoreMessage, setFullRestoreMessage] = useState<string>('');

  // Config-Only states
  const [configBackupLoading, setConfigBackupLoading] = useState<boolean>(false);
  const [configRestoreStatus, setConfigRestoreStatus] = useState<'idle' | 'reading' | 'restoring' | 'success' | 'error'>('idle');
  const [configRestoreMessage, setConfigRestoreMessage] = useState<string>('');

  // Paste / Input JSON Config modal states
  const [showPasteModal, setShowPasteModal] = useState<boolean>(false);
  const [pasteConfigText, setPasteConfigText] = useState<string>('');
  const [pasteConfigError, setPasteConfigError] = useState<string | null>(null);
  const [pasteConfigSubmitting, setPasteConfigSubmitting] = useState<boolean>(false);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // --- Full System Backup / Restore Handlers ---
  const handleDownloadFullBackup = () => {
    setFullBackupLoading(true);
    window.location.href = '/api/backup';
    setTimeout(() => {
      setFullBackupLoading(false);
      setToast({ message: "Unduhan cadangan sistem penuh dimulai! 📥", type: 'success' });
    }, 2000);
  };

  const handleFullFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    try {
      if (!file) return;

      if (!file.name.toLowerCase().endsWith('.zip')) {
        setFullRestoreStatus('error');
        setFullRestoreMessage('Format tidak valid. Harap unggah arsip snapshot .zip Yuihime yang sah.');
        return;
      }

      setFullRestoreStatus('reading');
      setFullRestoreMessage('Membaca arsip cadangan terkompresi...');

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const result = event.target?.result as string;
          if (!result) {
            throw new Error('Gagal membaca aliran biner berkas.');
          }
          const base64Data = result.split(',')[1] || result;

          setFullRestoreStatus('restoring');
          setFullRestoreMessage('Memulihkan basis data kognitif dan aset statis...');

          const res = await fetch('/api/backup/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ backupData: base64Data })
          });

          const data = await res.json();
          if (res.ok && data.success) {
            setFullRestoreStatus('success');
            setFullRestoreMessage(data.message || 'Keadaan penuh sistem berhasil dipulihkan!');
            setTimeout(() => {
              window.location.reload();
            }, 2500);
          } else {
            throw new Error(data.error || 'Server menolak snapshot cadangan.');
          }
        } catch (err: any) {
          setFullRestoreStatus('error');
          setFullRestoreMessage(err.message || 'Kesalahan fatal selama pemulihan.');
        }
      };
      reader.onerror = () => {
        setFullRestoreStatus('error');
        setFullRestoreMessage('Gagal membaca cadangan dari media lokal.');
      };
      reader.readAsDataURL(file);
    } finally {
      e.target.value = '';
    }
  };

  // --- Config-Only Backup / Restore Handlers ---
  const handleDownloadConfigBackup = () => {
    try {
      setConfigBackupLoading(true);
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(settings, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `yuihime_config_only_${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      setTimeout(() => {
        setConfigBackupLoading(false);
        setToast({ message: "Konfigurasi parameter (.json) berhasil diekspor!", type: 'success' });
      }, 1000);
    } catch (err: any) {
      setToast({ message: `Ekspor gagal: ${err.message}`, type: 'error' });
      setConfigBackupLoading(false);
    }
  };

  const restoreConfigObject = async (parsed: any) => {
    setConfigRestoreStatus('restoring');
    setConfigRestoreMessage('Memperbarui pengaturan di server Yuihime...');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSettings(parsed);
        setConfigRestoreStatus('success');
        setConfigRestoreMessage('Konfigurasi berhasil dipulihkan! Memuat ulang...');
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        throw new Error(data.error || 'Server gagal menyimpan pengaturan.');
      }
    } catch (err: any) {
      setConfigRestoreStatus('error');
      setConfigRestoreMessage(err.message || 'Terjadi kesalahan saat impor konfigurasi.');
    }
  };

  const handleConfigFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    try {
      if (!file) return;

      const lowerName = file.name.toLowerCase();
      if (!lowerName.endsWith('.json') && !lowerName.endsWith('.txt')) {
        setConfigRestoreStatus('error');
        setConfigRestoreMessage('Format tidak valid. Pilih berkas konfigurasi .json atau .txt.');
        return;
      }

      setConfigRestoreStatus('reading');
      setConfigRestoreMessage('Membaca berkas konfigurasi lokal...');

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const result = event.target?.result as string;
          if (!result) {
            throw new Error('Gagal membaca data konfigurasi.');
          }
          const parsed = parseConfigText(result);
          await restoreConfigObject(parsed);
        } catch (err: any) {
          setConfigRestoreStatus('error');
          setConfigRestoreMessage(err.message || 'Terjadi kesalahan saat membaca berkas konfigurasi.');
        }
      };
      reader.onerror = () => {
        setConfigRestoreStatus('error');
        setConfigRestoreMessage('Gagal membaca berkas lokal.');
      };
      reader.readAsText(file);
    } finally {
      e.target.value = '';
    }
  };

  const handleOpenPasteModal = () => {
    setPasteConfigText('');
    setPasteConfigError(null);
    setShowPasteModal(true);
  };

  const handleApplyPastedConfig = async () => {
    setPasteConfigError(null);
    setPasteConfigSubmitting(true);
    try {
      const parsed = parseConfigText(pasteConfigText);
      setShowPasteModal(false);
      setPasteConfigText('');
      await restoreConfigObject(parsed);
    } catch (err: any) {
      setPasteConfigError(err.message || 'Teks konfigurasi tidak valid.');
    } finally {
      setPasteConfigSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in font-sans">
      {/* Toast Notification */}
      {toast && (
        <div 
          onClick={() => setToast(null)}
          className={`fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-md transition-all duration-300 transform scale-100 hover:scale-102 active:scale-98 cursor-pointer max-w-md w-[90%] sm:w-auto animate-in fade-in slide-in-from-top-5 ${
            toast.type === 'success' 
              ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-300 shadow-emerald-500/10' 
              : 'bg-rose-950/90 border-rose-500/30 text-rose-300 shadow-rose-500/10'
          }`}
        >
          <span className={`w-2 h-2 rounded-full shrink-0 animate-pulse ${toast.type === 'success' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
          <span className="text-xs font-semibold font-mono tracking-wide flex-1">{toast.message}</span>
        </div>
      )}
      
      {/* Paste / Input JSON Config Modal */}
      {showPasteModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowPasteModal(false)} />
          <div className="relative w-full max-w-lg bg-[#101017] border border-white/10 rounded-2xl shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <ClipboardList size={15} className="text-amber-500" /> Paste / Input JSON Config
              </h4>
              <button
                type="button"
                onClick={() => setShowPasteModal(false)}
                className="p-1.5 text-zinc-500 hover:text-white hover:bg-white/10 rounded-lg transition-all cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Tempel teks konfigurasi JSON (dari backup <code className="text-amber-400 font-mono">.json</code> atau <code className="text-amber-400 font-mono">.txt</code>) di bawah ini untuk memulihkannya tanpa mengunggah berkas.
            </p>
            <textarea
              value={pasteConfigText}
              onChange={(e) => {
                setPasteConfigText(e.target.value);
                setPasteConfigError(null);
              }}
              placeholder={'{\n  "gemini": { ... },\n  "telegram_bridge": { ... }\n}'}
              rows={12}
              className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500/50 resize-y scrollbar-thin placeholder:text-zinc-600"
            />
            {pasteConfigError && (
              <div className="flex items-start gap-2 bg-rose-950/60 border border-rose-500/30 p-2.5 rounded-lg">
                <AlertTriangle size={13} className="text-rose-400 shrink-0 mt-0.5" />
                <p className="text-[10px] text-rose-300 font-mono select-text break-all">{pasteConfigError}</p>
              </div>
            )}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowPasteModal(false)}
                className="px-3.5 py-2 bg-white/5 hover:bg-white/10 text-zinc-300 text-[10px] font-bold rounded-lg border border-white/5 transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleApplyPastedConfig}
                disabled={pasteConfigSubmitting}
                className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 text-[10px] font-bold rounded-lg border border-amber-500/25 transition-all cursor-pointer disabled:opacity-50"
              >
                {pasteConfigSubmitting && <RefreshCw size={12} className="animate-spin" />}
                Validasi & Pulihkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXPLANATORY HEADER */}
      <div className="bg-[#0e0e14]/40 border border-white/5 p-5 rounded-2xl flex items-start gap-4">
        <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-500 shrink-0">
          <Info size={18} />
        </div>
        <div className="space-y-1">
          <h4 className="text-xs font-bold text-white uppercase font-mono tracking-wider">Backup & Restore</h4>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Kelola keamanan sirkuit kognitif Yuihime. Anda dapat mencadangkan semua status database/memori atau sekadar mengekspor konfigurasi parameter.
          </p>
        </div>
      </div>

      {/* SECTION 1: CONFIG-ONLY BACKUP & RESTORE */}
      <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl space-y-5">
        <div className="flex items-start justify-between border-b border-white/5 pb-3">
          <div className="flex items-center gap-2 text-amber-500">
            <Settings size={18} className="text-amber-500" />
            <h4 className="text-sm font-bold text-white tracking-wide">Config Backup</h4>
          </div>
          <span className="text-[9px] uppercase font-mono bg-amber-500/10 border border-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">Fast & Safe</span>
        </div>

        <p className="text-[11px] text-zinc-400 leading-relaxed">
          Ekspor atau impor parameter konfigurasi (<code className="text-amber-400 font-mono">config.toml</code>) dalam format JSON. Berisi API keys, prompt, model, dan preferensi UI.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* Export config block */}
          <div className="bg-[#07070a]/45 border border-white/5 p-4 rounded-xl flex flex-col justify-between space-y-3">
            <div>
              <h5 className="text-xs font-bold text-white">Export config</h5>
              <p className="text-[10px] text-zinc-500 mt-1">Unduh representasi JSON dari parameter pengaturan yang aktif.</p>
            </div>
            <button
              type="button"
              onClick={handleDownloadConfigBackup}
              disabled={configBackupLoading}
              className="inline-flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 disabled:bg-white/2 hover:text-white text-white/80 font-bold text-xs px-4 py-2.5 rounded-xl border border-white/5 cursor-pointer transition-all active:scale-95 shrink-0"
            >
              {configBackupLoading ? (
                <RefreshCw size={13} className="animate-spin" />
              ) : (
                <Download size={13} />
              )}
              <span>Download (.json)</span>
            </button>
          </div>

          {/* Import config block */}
          <div className="bg-[#07070a]/45 border border-white/5 p-4 rounded-xl flex flex-col justify-between space-y-3">
            <div>
              <h5 className="text-xs font-bold text-white">Restore config</h5>
              <p className="text-[10px] text-zinc-500 mt-1">Unggah berkas cadangan JSON (.json / .txt) atau tempel langsung untuk menimpa parameter sistem yang aktif.</p>
            </div>
            
            {configRestoreStatus === 'idle' && (
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex items-center justify-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-bold text-xs px-4 py-2.5 rounded-xl border border-amber-500/20 cursor-pointer transition-all text-center active:scale-95">
                  <Upload size={13} />
                  <span>Upload & Apply</span>
                  <input 
                    type="file" 
                    accept=".json,.txt,application/json,text/plain"
                    onChange={handleConfigFileChange}
                    className="hidden" 
                  />
                </label>
                <button
                  type="button"
                  onClick={handleOpenPasteModal}
                  className="inline-flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white/80 font-bold text-xs px-4 py-2.5 rounded-xl border border-white/5 cursor-pointer transition-all active:scale-95"
                >
                  <ClipboardList size={13} />
                  <span>Paste JSON</span>
                </button>
              </div>
            )}

            {configRestoreStatus !== 'idle' && (
              <div className="flex items-center gap-3 bg-[#0c0c12] border border-white/5 p-2 rounded-lg text-left">
                {configRestoreStatus === 'reading' || configRestoreStatus === 'restoring' ? (
                  <>
                    <RefreshCw size={14} className="animate-spin text-amber-500 shrink-0" />
                    <p className="text-[10px] text-zinc-400 font-mono truncate">{configRestoreMessage}</p>
                  </>
                ) : configRestoreStatus === 'success' ? (
                  <>
                    <Check size={14} className="text-emerald-400 shrink-0" />
                    <p className="text-[10px] text-emerald-400 font-sans truncate">Dipulihkan! Memuat ulang...</p>
                  </>
                ) : (
                  <div className="flex flex-col gap-1.5 w-full">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={14} className="text-rose-400 shrink-0" />
                      <p className="text-[10px] text-rose-400 font-sans truncate">Kesalahan Impor</p>
                    </div>
                    <p className="text-[9px] text-zinc-500 line-clamp-1">{configRestoreMessage}</p>
                    <button 
                      type="button"
                      onClick={() => setConfigRestoreStatus('idle')}
                      className="text-[9px] text-amber-500 hover:underline text-left font-mono font-bold mt-0.5"
                    >
                      Coba Lagi
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 2: FULL SYSTEM ZIP BACKUP & RESTORE */}
      <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl space-y-5">
        <div className="flex items-start justify-between border-b border-white/5 pb-3">
          <div className="flex items-center gap-2 text-emerald-400">
            <Archive size={18} />
            <h4 className="text-sm font-bold text-white tracking-wide">System Snapshot</h4>
          </div>
          <span className="text-[9px] uppercase font-mono bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">Complete Backup</span>
        </div>

        <p className="text-[11px] text-zinc-400 leading-relaxed">
          Cadangkan seluruh keadaan kognitif Yuihime. Ini mengemas database SQLite (<code className="text-zinc-300 font-mono">yuihime.db</code>), parameter, plugin, berkas agen, dan data pengguna workspace.
        </p>

        {/* Action: Download backup */}
        <div className="p-4 bg-[#07070a]/45 border border-[#10b981]/15 rounded-xl space-y-3.5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20 text-emerald-400 shrink-0">
              <Database size={15} />
            </div>
            <div>
              <h5 className="text-xs font-bold text-white">Full Snapshot</h5>
              <p className="text-[10px] text-zinc-500">Arsipkan semua berkas internal dan database dengan aman di latar belakang.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDownloadFullBackup}
            disabled={fullBackupLoading}
            className="w-full inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white font-bold text-xs px-5 py-3 rounded-xl transition-all cursor-pointer border border-emerald-500/30 active:scale-[0.98] shadow-[0_0_15px_rgba(16,185,129,0.1)]"
          >
            {fullBackupLoading ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <Download size={13} />
            )}
            <span>Ekspor sistem penuh (.zip)</span>
          </button>
        </div>

        {/* Action: Restore backup */}
        <div className="pt-4 border-t border-white/5 space-y-4">
          <div className="flex items-center gap-2 text-rose-450">
            <ShieldAlert size={16} className="text-rose-400 shrink-0" />
            <h5 className="text-xs font-bold text-white">Restore snapshot</h5>
            <span className="text-[9px] uppercase font-mono bg-rose-500/10 border border-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded-md scale-90 origin-left">Destructive</span>
          </div>

          <div className="bg-rose-500/[0.02] border border-rose-500/10 p-3.5 rounded-xl flex items-start gap-3 select-none">
            <AlertTriangle size={15} className="text-rose-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-zinc-500 leading-normal">
              <strong className="text-rose-400 font-bold">Peringatan:</strong> Ini sepenuhnya menggantikan database, memori, konfigurasi, dan plugin saat ini. Unduh cadangan terlebih dahulu untuk menghindari kehilangan data permanen.
            </p>
          </div>

          {fullRestoreStatus === 'idle' && (
            <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-white/10 hover:border-amber-500/35 bg-[#07070a]/35 hover:bg-[#0c0c12]/55 rounded-xl transition-all cursor-pointer text-center group">
              <Upload size={20} className="text-zinc-500 group-hover:text-amber-500 transition-all mb-2" />
              <span className="text-xs font-bold text-zinc-300">Pilih berkas zip cadangan</span>
              <span className="text-[10px] text-zinc-500 mt-1 font-mono">Ukuran maks: 50MB</span>
              <input 
                type="file" 
                accept=".zip,application/zip,application/x-zip-compressed,application/x-zip"
                onChange={handleFullFileChange}
                className="hidden" 
              />
            </label>
          )}

          {fullRestoreStatus !== 'idle' && (
            <div className="p-5 bg-black/45 border border-white/5 rounded-xl flex flex-col items-center justify-center text-center space-y-3.5 animate-fade-in">
              {fullRestoreStatus === 'reading' || fullRestoreStatus === 'restoring' ? (
                <>
                  <RefreshCw size={20} className="animate-spin text-amber-500" />
                  <div className="space-y-1">
                    <h5 className="text-xs font-bold text-white">{fullRestoreStatus === 'reading' ? 'Membaca Arsip Zip...' : 'Memulihkan Database & Konfigurasi...'}</h5>
                    <p className="text-[10px] text-zinc-400 font-mono">{fullRestoreMessage}</p>
                  </div>
                </>
              ) : fullRestoreStatus === 'success' ? (
                <>
                  <div className="w-8 h-8 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center animate-bounce">
                    <Check size={16} />
                  </div>
                  <div className="space-y-1">
                    <h5 className="text-xs font-bold text-emerald-400">Sistem Berhasil Dipulihkan!</h5>
                    <p className="text-[10px] text-zinc-400 mt-1 leading-relaxed">{fullRestoreMessage}</p>
                    <p className="text-[9px] text-amber-500 font-mono mt-2 animate-pulse font-bold">Memulai ulang loop kognitif Yuihime dalam 2 detik...</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-8 h-8 bg-rose-500/10 border border-rose-500/20 text-rose-450 rounded-full flex items-center justify-center">
                    <AlertTriangle size={16} />
                  </div>
                  <div className="space-y-1.5 w-full text-center">
                    <h5 className="text-xs font-bold text-rose-400">Pemulihan Gagal</h5>
                    <p className="text-[10px] text-zinc-400 font-mono select-text bg-[#07070a] border border-white/5 p-2 rounded-lg max-h-24 overflow-y-auto leading-relaxed text-left inline-block max-w-full">{fullRestoreMessage}</p>
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setFullRestoreStatus('idle');
                          setFullRestoreMessage('');
                        }}
                        className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 text-white/70 text-[10px] font-bold rounded-lg border border-white/5 cursor-pointer"
                      >
                        Coba Lagi
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
