import React, { useState, useEffect } from 'react';
import { 
  Database, Download, Upload, RefreshCw, AlertTriangle, 
  Check, Archive, ShieldAlert, Settings, Info
} from 'lucide-react';

interface BackupTabProps {
  settings: any;
  setSettings: React.Dispatch<React.SetStateAction<any>>;
}

export const BackupTab: React.FC<BackupTabProps> = ({ settings, setSettings }) => {
  // Full System states
  const [fullBackupLoading, setFullBackupLoading] = useState<boolean>(false);
  const [fullRestoreStatus, setFullRestoreStatus] = useState<'idle' | 'reading' | 'restoring' | 'success' | 'error'>('idle');
  const [fullRestoreMessage, setFullRestoreMessage] = useState<string>('');

  // Config-Only states
  const [configBackupLoading, setConfigBackupLoading] = useState<boolean>(false);
  const [configRestoreStatus, setConfigRestoreStatus] = useState<'idle' | 'reading' | 'restoring' | 'success' | 'error'>('idle');
  const [configRestoreMessage, setConfigRestoreMessage] = useState<string>('');

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
      setToast({ message: "Full system backup download initiated! 📥", type: 'success' });
    }, 2000);
  };

  const handleFullFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.zip')) {
      setFullRestoreStatus('error');
      setFullRestoreMessage('Invalid format. Please upload a valid Yuihime .zip archive.');
      return;
    }

    setFullRestoreStatus('reading');
    setFullRestoreMessage('Reading compressed backup archive...');

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const result = event.target?.result as string;
        if (!result) {
          throw new Error('Failed to read file binary stream.');
        }
        const base64Data = result.split(',')[1] || result;

        setFullRestoreStatus('restoring');
        setFullRestoreMessage('Restoring cognitive database and static assets...');

        const res = await fetch('/api/backup/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ backupData: base64Data })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          setFullRestoreStatus('success');
          setFullRestoreMessage(data.message || 'Full system state successfully restored!');
          setTimeout(() => {
            window.location.reload();
          }, 2500);
        } else {
          throw new Error(data.error || 'Server rejected the backup snapshot.');
        }
      } catch (err: any) {
        setFullRestoreStatus('error');
        setFullRestoreMessage(err.message || 'Fatal error during restoration.');
      }
    };
    reader.onerror = () => {
      setFullRestoreStatus('error');
      setFullRestoreMessage('Failed to read backup from local media.');
    };
    reader.readAsDataURL(file);
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
        setToast({ message: "Parameters config (.json) exported successfully!", type: 'success' });
      }, 1000);
    } catch (err: any) {
      setToast({ message: `Export failed: ${err.message}`, type: 'error' });
      setConfigBackupLoading(false);
    }
  };

  const handleConfigFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      setConfigRestoreStatus('error');
      setConfigRestoreMessage('Invalid format. Please select a valid .json config file.');
      return;
    }

    setConfigRestoreStatus('reading');
    setConfigRestoreMessage('Reading local JSON file...');

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const result = event.target?.result as string;
        if (!result) {
          throw new Error('Failed to read config data.');
        }
        const parsed = JSON.parse(result);
        
        if (typeof parsed !== 'object' || parsed === null) {
          throw new Error('Invalid JSON format.');
        }

        setConfigRestoreStatus('restoring');
        setConfigRestoreMessage('Updating settings on Yuihime server...');

        const res = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed)
        });

        const data = await res.json();
        if (res.ok && data.success) {
          setSettings(parsed);
          setConfigRestoreStatus('success');
          setConfigRestoreMessage('Settings successfully restored! Reloading...');
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        } else {
          throw new Error(data.error || 'Failed to persist settings on server.');
        }
      } catch (err: any) {
        setConfigRestoreStatus('error');
        setConfigRestoreMessage(err.message || 'Error occurred during configuration import.');
      }
    };
    reader.onerror = () => {
      setConfigRestoreStatus('error');
      setConfigRestoreMessage('Failed to read local file.');
    };
    reader.readAsText(file);
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
      
      {/* EXPLANATORY HEADER */}
      <div className="bg-[#0e0e14]/40 border border-white/5 p-5 rounded-2xl flex items-start gap-4">
        <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-500 shrink-0">
          <Info size={18} />
        </div>
        <div className="space-y-1">
          <h4 className="text-xs font-bold text-white uppercase font-mono tracking-wider">Backup & Restore</h4>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Manage the safety of Yuihime cognitive circuits. You can backing up all database/memory states or simply export parameters configurations.
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
          Export or import configuration parameters (<code className="text-amber-400 font-mono">config.toml</code>) in JSON format. This contains API keys, prompts, models, and UI preferences.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* Export config block */}
          <div className="bg-[#07070a]/45 border border-white/5 p-4 rounded-xl flex flex-col justify-between space-y-3">
            <div>
              <h5 className="text-xs font-bold text-white">Export config</h5>
              <p className="text-[10px] text-zinc-500 mt-1">Download a JSON representation of active parameter settings.</p>
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
              <p className="text-[10px] text-zinc-500 mt-1">Upload a JSON backup file to overwrite active system parameters.</p>
            </div>
            
            {configRestoreStatus === 'idle' && (
              <label className="inline-flex items-center justify-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-bold text-xs px-4 py-2.5 rounded-xl border border-amber-500/20 cursor-pointer transition-all text-center active:scale-95">
                <Upload size={13} />
                <span>Upload & Apply</span>
                <input 
                  type="file" 
                  accept=".json"
                  onChange={handleConfigFileChange}
                  className="hidden" 
                />
              </label>
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
                    <p className="text-[10px] text-emerald-400 font-sans truncate">Restored! Reloading...</p>
                  </>
                ) : (
                  <div className="flex flex-col gap-1.5 w-full">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={14} className="text-rose-400 shrink-0" />
                      <p className="text-[10px] text-rose-400 font-sans truncate">Import Error</p>
                    </div>
                    <p className="text-[9px] text-zinc-500 line-clamp-1">{configRestoreMessage}</p>
                    <button 
                      type="button"
                      onClick={() => setConfigRestoreStatus('idle')}
                      className="text-[9px] text-amber-500 hover:underline text-left font-mono font-bold mt-0.5"
                    >
                      Retry
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
          Back up the entire Yuihime cognitive state. This packages the SQLite database (<code className="text-zinc-300 font-mono">yuihime.db</code>), parameter parameters, plugins, agent files, and workspace user data.
        </p>

        {/* Action: Download backup */}
        <div className="p-4 bg-[#07070a]/45 border border-[#10b981]/15 rounded-xl space-y-3.5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20 text-emerald-400 shrink-0">
              <Database size={15} />
            </div>
            <div>
              <h5 className="text-xs font-bold text-white">Full Snapshot</h5>
              <p className="text-[10px] text-zinc-500">Safely archive all internal files and databases in the background.</p>
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
            <span>Export full system (.zip)</span>
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
              <strong className="text-rose-400 font-bold">Warning:</strong> This completely replaces current databases, memories, configurations, and plugins. Download a backup first to avoid permanent data loss.
            </p>
          </div>

          {fullRestoreStatus === 'idle' && (
            <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-white/10 hover:border-amber-500/35 bg-[#07070a]/35 hover:bg-[#0c0c12]/55 rounded-xl transition-all cursor-pointer text-center group">
              <Upload size={20} className="text-zinc-500 group-hover:text-amber-500 transition-all mb-2" />
              <span className="text-xs font-bold text-zinc-300">Select backup zip file</span>
              <span className="text-[10px] text-zinc-500 mt-1 font-mono">Max size: 50MB</span>
              <input 
                type="file" 
                accept=".zip"
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
                    <h5 className="text-xs font-bold text-white">{fullRestoreStatus === 'reading' ? 'Reading Zip Archive...' : 'Restoring Database & Config...'}</h5>
                    <p className="text-[10px] text-zinc-400 font-mono">{fullRestoreMessage}</p>
                  </div>
                </>
              ) : fullRestoreStatus === 'success' ? (
                <>
                  <div className="w-8 h-8 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center animate-bounce">
                    <Check size={16} />
                  </div>
                  <div className="space-y-1">
                    <h5 className="text-xs font-bold text-emerald-400">System Restored successfully!</h5>
                    <p className="text-[10px] text-zinc-400 mt-1 leading-relaxed">{fullRestoreMessage}</p>
                    <p className="text-[9px] text-amber-500 font-mono mt-2 animate-pulse font-bold">Restarting Yuihime cognitive loop in 2 seconds...</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-8 h-8 bg-rose-500/10 border border-rose-500/20 text-rose-450 rounded-full flex items-center justify-center">
                    <AlertTriangle size={16} />
                  </div>
                  <div className="space-y-1.5 w-full text-center">
                    <h5 className="text-xs font-bold text-rose-400">Restoration Failed</h5>
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
    </div>
  );
};
