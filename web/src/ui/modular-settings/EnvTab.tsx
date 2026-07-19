import React, { useState, useEffect } from 'react';
import { 
  Plus, Trash2, Edit2, Save, Search, Eye, EyeOff, 
  AlertTriangle, Check, RefreshCw, X, Key, Info, Ban
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface EnvTabProps {
  onShowInfo?: (title: string, text: string) => void;
}

export const EnvTab: React.FC<EnvTabProps> = ({ onShowInfo }) => {
  const [envs, setEnvs] = useState<Record<string, string>>({});
  const [recommendedKeys, setRecommendedKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // Status notification
  const [status, setStatus] = useState<{ text: string; type: 'success' | 'err' | 'info' } | null>(null);

  // Masking states for hidden keys
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});

  // CRUD state managers
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [newKey, setNewKey] = useState<string>('');
  const [newValue, setNewValue] = useState<string>('');

  // Delete modal state
  const [keyToDelete, setKeyToDelete] = useState<string | null>(null);

  // Fetch env keys on mount
  useEffect(() => {
    fetchEnvConfig();
  }, []);

  const fetchEnvConfig = async () => {
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch('/api/env');
      if (res.ok) {
        const data = await res.json();
        setEnvs(data.envs || {});
        setRecommendedKeys(data.recommendedKeys || []);
      } else {
        throw new Error('Failed to load environment variables from backend.');
      }
    } catch (err: any) {
      showStatus(err.message || 'Error loading environment variables.', 'err');
    } finally {
      setLoading(false);
    }
  };

  const showStatus = (text: string, type: 'success' | 'err' | 'info') => {
    setStatus({ text, type });
    if (type !== 'err') {
      setTimeout(() => setStatus(null), 5000);
    }
  };

  const handleSaveAll = async (updatedEnvs: Record<string, string>) => {
    setSaving(true);
    try {
      const res = await fetch('/api/env', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envs: updatedEnvs })
      });

      if (res.ok) {
        setEnvs(updatedEnvs);
        showStatus('Saved .env file successfully!', 'success');
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Server rejected .env update.');
      }
    } catch (err: any) {
      showStatus(err.message || 'Failed to save .env file.', 'err');
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = newKey.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
    if (!cleanKey) {
      showStatus('Variable key must be a valid alphanumeric identifier.', 'err');
      return;
    }

    if (envs[cleanKey] !== undefined) {
      showStatus(`Key "${cleanKey}" is already configured. Please edit or use another name.`, 'err');
      return;
    }

    const updated = { ...envs, [cleanKey]: newValue };
    handleSaveAll(updated);
    
    // Reset Form
    setNewKey('');
    setNewValue('');
    setShowAddForm(false);
  };

  const handleStartEditing = (key: string) => {
    setEditingKey(key);
    setEditingValue(envs[key] || '');
  };

  const handleCancelEditing = () => {
    setEditingKey(null);
    setEditingValue('');
  };

  const handleSaveEdit = (key: string) => {
    const updated = { ...envs, [key]: editingValue };
    handleSaveAll(updated);
    setEditingKey(null);
    setEditingValue('');
  };

  const handleDeleteConfirm = () => {
    if (!keyToDelete) return;
    const updated = { ...envs };
    delete updated[keyToDelete];
    handleSaveAll(updated);
    setKeyToDelete(null);
  };

  const toggleReveal = (key: string) => {
    setRevealedKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleQuickAdd = (key: string) => {
    setNewKey(key);
    setNewValue('');
    setShowAddForm(true);
    // Smooth scroll to form
    const container = document.getElementById('env-add-form-anchor');
    if (container) {
      container.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Safe masking utility
  const isSensitiveKey = (key: string) => {
    const sensitiveTerms = ['key', 'secret', 'token', 'password', 'auth', 'private', 'bearer'];
    return sensitiveTerms.some(term => key.toLowerCase().includes(term));
  };

  // Filter current variables based on Search Term
  const filteredKeys = Object.keys(envs).filter(key => 
    key.toLowerCase().includes(searchTerm.toLowerCase()) ||
    envs[key].toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in font-sans pb-12">
      
      {/* HEADER CARD */}
      <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-3xl relative overflow-hidden backdrop-blur-md">
        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 blur-2xl rounded-full pointer-events-none" />
        <div className="flex items-start gap-3 border-b border-white/5 pb-4">
          <div className="p-3 bg-cyan-700/10 border border-cyan-500/20 text-cyan-400 rounded-2xl shrink-0">
            <Key size={18} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white tracking-wide">Environment Variables (.env) CRUD</h4>
            <p className="text-zinc-500 text-xs mt-0.5">
              Configure environment variables at your project root `./.env`. Saved keys will be bound to `process.env` immediately.
            </p>
          </div>
        </div>

        {/* Global Alert / Info status */}
        {status && (
          <div className={`mt-4 p-4 rounded-2xl flex items-start gap-2 text-xs border ${
            status.type === 'success' 
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
              : status.type === 'err' 
              ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' 
              : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'
          }`}>
            {status.type === 'success' && <Check size={14} className="mt-0.5" />}
            {status.type === 'err' && <AlertTriangle size={14} className="mt-0.5" />}
            {status.type === 'info' && <Info size={14} className="mt-0.5" />}
            <p className="flex-1 leading-relaxed">{status.text}</p>
          </div>
        )}
      </div>

      {/* QUICK ADD / EMPTY RECOMMENDATION SLOTS */}
      {recommendedKeys.some(rk => envs[rk] === undefined) && (
        <div className="bg-[#0e0e14]/30 border border-white/5 p-6 rounded-3xl">
          <h5 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Info size={12} /> Recommended Configurations Pending Set ({recommendedKeys.filter(rk => envs[rk] === undefined).length})
          </h5>
          <p className="text-zinc-500 text-xs mb-4">
            The following essential variables are recommended but not yet defined in your `.env` file:
          </p>
          <div className="flex flex-wrap gap-2">
            {recommendedKeys.map(rk => {
              if (envs[rk] !== undefined) return null;
              return (
                <button
                  key={rk}
                  onClick={() => handleQuickAdd(rk)}
                  className="flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 hover:border-amber-500/30 text-amber-300 font-mono text-[11px] px-3 py-1.5 rounded-xl transition-all cursor-pointer"
                >
                  <Plus size={11} /> {rk}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* MAIN CRUD MANAGER BODY */}
      <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-3xl backdrop-blur-md">
        
        {/* Actions head bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6">
          {/* Search bar */}
          <div className="relative flex-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500">
              <Search size={14} />
            </span>
            <input
              type="text"
              placeholder="Search variables..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-[#07070a]/80 border border-white/5 rounded-2xl py-2 px-10 text-xs text-white placeholder-zinc-650 focus:border-cyan-500/30 outline-none transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={fetchEnvConfig}
              className="p-2.5 bg-white/5 hover:bg-white/10 active:scale-95 border border-white/5 text-zinc-450 hover:text-white rounded-xl transition-all cursor-pointer"
              title="Refresh from disk"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>

            <button
              onClick={() => {
                setShowAddForm(!showAddForm);
                if (!showAddForm) {
                  setNewKey('');
                  setNewValue('');
                }
              }}
              className="flex items-center gap-1.5 bg-cyan-700/25 hover:bg-cyan-700/40 border border-cyan-500/20 text-cyan-300 text-xs px-4 py-2.5 rounded-xl transition-all cursor-pointer font-medium font-sans"
            >
              {showAddForm ? <Ban size={13} /> : <Plus size={13} />}
              {showAddForm ? 'Cancel' : 'Add Variable'}
            </button>
          </div>
        </div>

        {/* INLINE NEW VARIABLE SCHEMATIC FORM */}
        <div id="env-add-form-anchor">
          <AnimatePresence>
            {showAddForm && (
              <motion.form
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                onSubmit={handleCreate}
                className="overflow-hidden mb-6 bg-cyan-505/5 border border-cyan-500/10 p-5 rounded-2xl flex flex-col gap-4"
              >
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-400">
                    <Plus size={13} /> Add New Environment Variable
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setShowAddForm(false)}
                    className="text-zinc-500 hover:text-white"
                  >
                    <X size={12} />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-zinc-500 font-mono uppercase">Variable Key *</label>
                    <input
                      type="text"
                      placeholder="e.g. EXTRA_SERVICE_URL"
                      value={newKey}
                      onChange={e => setNewKey(e.target.value.toUpperCase())}
                      className="w-full bg-[#050508]/90 border border-white/10 rounded-xl py-2 px-3 text-xs font-mono text-white placeholder-zinc-700 outline-none focus:border-cyan-500/40"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-zinc-500 font-mono uppercase">Value / Secret Credentials</label>
                    <input
                      type="text"
                      placeholder="e.g. my-secure-auth-value"
                      value={newValue}
                      onChange={e => setNewValue(e.target.value)}
                      className="w-full bg-[#050508]/90 border border-white/10 rounded-xl py-2 px-3 text-xs font-mono text-white placeholder-zinc-700 outline-none focus:border-cyan-500/40"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="bg-transparent hover:bg-white/5 text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <Save size={12} />
                    {saving ? 'Creating...' : 'Create Variable'}
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        {/* LOADING INDICATOR */}
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2">
            <RefreshCw size={24} className="text-cyan-500 animate-spin" />
            <span className="text-xs text-zinc-500 font-mono">Loading `.env` variables from server...</span>
          </div>
        ) : filteredKeys.length === 0 ? (
          <div className="py-12 border border-dashed border-white/5 rounded-2xl flex flex-col items-center justify-center text-center p-6">
            <Ban size={20} className="text-zinc-650 mb-2" />
            <p className="text-zinc-400 text-xs font-medium">No environment variables found.</p>
            <p className="text-zinc-600 text-[11px] mt-0.5">
              {searchTerm ? 'Try adjusting your search filter.' : 'Click "Add Variable" to create your first credential.'}
            </p>
          </div>
        ) : (
          /* ENVIRONMENT EDITING DATAGRID TABLE */
          <div className="overflow-x-auto border border-white/5 rounded-2xl bg-[#050508]/40">
            <table className="w-full border-collapse text-left text-xs text-zinc-300">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02]">
                  <th className="p-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500 w-[40%]">Variable Key</th>
                  <th className="p-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Value (Secret)</th>
                  <th className="p-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500 text-right w-[120px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {filteredKeys.map((key) => {
                  const isEditing = editingKey === key;
                  const value = envs[key];
                  const isSensitive = isSensitiveKey(key);
                  const isRevealed = revealedKeys[key] || false;

                  return (
                    <tr key={key} className="hover:bg-white/[0.01] transition-colors">
                      {/* Name of Key */}
                      <td className="p-3 font-mono font-medium text-white break-all self-center select-all">
                        {key}
                      </td>

                      {/* Value display */}
                      <td className="p-3 break-all font-mono">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editingValue}
                            onChange={e => setEditingValue(e.target.value)}
                            className="w-full bg-zinc-900 border border-cyan-500/40 rounded-lg p-1.5 text-xs text-white outline-none font-mono focus:bg-black"
                            autoFocus={localStorage.getItem('yuihime_disable_autofocus') !== 'true'}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSaveEdit(key);
                              if (e.key === 'Escape') handleCancelEditing();
                            }}
                          />
                        ) : (
                          <div className="flex items-center gap-2 max-w-full">
                            <span className="flex-1 select-all break-all text-zinc-400">
                              {isSensitive && !isRevealed ? '••••••••••••••••' : value || <em className="text-zinc-[650] text-[10px] italic">empty</em>}
                            </span>
                            {isSensitive && (
                              <button
                                onClick={() => toggleReveal(key)}
                                className="p-1 text-zinc-500 hover:text-white transition-colors cursor-pointer"
                                title={isRevealed ? 'Hide' : 'Show'}
                              >
                                {isRevealed ? <EyeOff size={11} /> : <Eye size={11} />}
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => handleSaveEdit(key)}
                                className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 rounded-lg border border-emerald-500/20 transition-all cursor-pointer"
                                title="Commit update"
                              >
                                <Check size={12} />
                              </button>
                              <button
                                onClick={handleCancelEditing}
                                className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg border border-zinc-700 transition-all cursor-pointer"
                                title="Cancel"
                              >
                                <X size={12} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => handleStartEditing(key)}
                                className="p-1.5 bg-white/5 hover:bg-white/10 text-zinc-450 hover:text-white rounded-lg border border-white/5 transition-all cursor-pointer"
                                title="Edit Variable"
                              >
                                <Edit2 size={12} />
                              </button>
                              <button
                                onClick={() => setKeyToDelete(key)}
                                className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 rounded-lg border border-rose-500/15 transition-all cursor-pointer"
                                title="Delete Variable"
                              >
                                <Trash2 size={12} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>

      {/* CONFIRMATION DELETE COMPACT DIALOG MODAL */}
      <AnimatePresence>
        {keyToDelete && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0c0c12] border border-white/10 rounded-2xl p-6 max-w-sm w-full text-left shadow-2xl relative"
            >
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl shrink-0">
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Delete Variable "{keyToDelete}"?</h4>
                  <p className="text-zinc-500 text-xs mt-1.5 leading-relaxed">
                    Deleting this environment variable will remove it permanently from the `.env` file. This action cannot be undone.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 mt-5">
                <button
                  onClick={() => setKeyToDelete(null)}
                  className="bg-transparent hover:bg-white/5 text-zinc-400 hover:text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  className="bg-rose-600 hover:bg-rose-500 active:scale-95 text-white px-4 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
