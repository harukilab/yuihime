import React, { useState, useEffect } from 'react';
import { Edit3, Plus, Search, Trash2, Eye, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface DatasetEditorProps {
  onRefreshMemories?: () => void;
}

export const DatasetEditor: React.FC<DatasetEditorProps> = ({
  onRefreshMemories
}) => {
  const [crudRecords, setCrudRecords] = useState<any[]>([]);
  const [isCrudLoading, setIsCrudLoading] = useState<boolean>(false);
  const [crudError, setCrudError] = useState<string | null>(null);
  const [crudSearch, setCrudSearch] = useState<string>('');
  const [crudCurrentPage, setCrudCurrentPage] = useState<number>(1);
  
  // Form modal overlays
  const [editingRecord, setEditingRecord] = useState<any | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);
  const [formUserQuery, setFormUserQuery] = useState<string>('');
  const [formTargetSpeech, setFormTargetSpeech] = useState<string>('');
  const [formThought, setFormThought] = useState<string>('');
  const [formAnimations, setFormAnimations] = useState<string[]>(['SMILE']);
  const [formJoy, setFormJoy] = useState<number>(1);
  const [formAffection, setFormAffection] = useState<number>(0);
  const [formSadness, setFormSadness] = useState<number>(0);
  const [formAnger, setFormAnger] = useState<number>(0);
  const [formShyness, setFormShyness] = useState<number>(0);
  const [formIsSaving, setFormIsSaving] = useState<boolean>(false);

  const entriesPerPage = 10;

  const fetchCrudRecords = async () => {
    setIsCrudLoading(true);
    setCrudError(null);
    try {
      const res = await fetch("/api/cortex/synthesizer/records");
      if (res.ok) {
        const data = await res.json();
        setCrudRecords(data.records || []);
      } else {
        const err = await res.json();
        setCrudError(err.error || "Failed to load SFT records.");
      }
    } catch (err: any) {
      setCrudError(err.message || String(err));
    } finally {
      setIsCrudLoading(false);
    }
  };

  const handleSaveRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formUserQuery.trim() || !formTargetSpeech.trim()) {
      alert("User Query and Target Speech are required fields.");
      return;
    }

    setFormIsSaving(true);
    try {
      const payload = {
        userQuery: formUserQuery,
        targetSpeech: formTargetSpeech,
        thought: formThought,
        animations: formAnimations,
        mood_impact: {
          joy: formJoy,
          affection: formAffection,
          sadness: formSadness,
          anger: formAnger,
          shyness: formShyness
        }
      };

      const url = editingRecord 
        ? `/api/cortex/synthesizer/records/${editingRecord.id}`
        : `/api/cortex/synthesizer/records`;
      
      const method = editingRecord ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        await fetchCrudRecords();
        setEditingRecord(null);
        setIsCreatingNew(false);
        resetForm();
        onRefreshMemories?.();
      } else {
        const err = await res.json();
        alert(`Error: ${err.error || "Failed to save record."}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message || String(err)}`);
    } finally {
      setFormIsSaving(false);
    }
  };

  const handleDeleteRecord = async (id: string) => {
    if (!confirm("Are you sure you want to permanently delete this SFT record from the database?")) {
      return;
    }

    try {
      const res = await fetch(`/api/cortex/synthesizer/records/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchCrudRecords();
        onRefreshMemories?.();
      } else {
        const err = await res.json();
        alert(`Error: ${err.error || "Failed to delete record."}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message || String(err)}`);
    }
  };

  const resetForm = () => {
    setFormUserQuery('');
    setFormTargetSpeech('');
    setFormThought('');
    setFormAnimations(['SMILE']);
    setFormJoy(1);
    setFormAffection(0);
    setFormSadness(0);
    setFormAnger(0);
    setFormShyness(0);
  };

  const startEditRecord = (rec: any) => {
    setEditingRecord(rec);
    setIsCreatingNew(false);
    setFormUserQuery(rec.userQuery || '');
    setFormTargetSpeech(rec.targetSpeech || '');
    setFormThought(rec.synthesized?.thought || '');
    setFormAnimations(rec.synthesized?.animations || ['SMILE']);
    
    const moodObj = rec.synthesized?.mood_impact || {};
    setFormJoy(moodObj.joy !== undefined ? moodObj.joy : 1);
    setFormAffection(moodObj.affection !== undefined ? moodObj.affection : 0);
    setFormSadness(moodObj.sadness !== undefined ? moodObj.sadness : 0);
    setFormAnger(moodObj.anger !== undefined ? moodObj.anger : 0);
    setFormShyness(moodObj.shyness !== undefined ? moodObj.shyness : 0);
  };

  const startCreateRecord = () => {
    setEditingRecord(null);
    setIsCreatingNew(true);
    resetForm();
  };

  useEffect(() => {
    fetchCrudRecords();
  }, []);

  const filtered = crudRecords.filter(rec => {
    const q = crudSearch.toLowerCase();
    const uq = (rec.userQuery || '').toLowerCase();
    const ts = (rec.targetSpeech || '').toLowerCase();
    const th = (rec.synthesized?.thought || '').toLowerCase();
    return uq.includes(q) || ts.includes(q) || th.includes(q);
  });

  const totalCrudPages = Math.ceil(filtered.length / entriesPerPage);
  const activeCrudPage = Math.min(crudCurrentPage, Math.max(1, totalCrudPages));
  const displayed = filtered.slice((activeCrudPage - 1) * entriesPerPage, activeCrudPage * entriesPerPage);

  return (
    <div className="space-y-6 text-left animate-fade-in font-sans">
      
      {/* Search Header toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-[#0e0e14]/55 border border-white/5 p-4 rounded-3xl">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 text-zinc-550" size={13} />
          <input
            type="text"
            value={crudSearch}
            onChange={(e) => {
              setCrudSearch(e.target.value);
              setCrudCurrentPage(1);
            }}
            placeholder="Search within custom SFT entries..."
            className="w-full bg-[#07070a] border border-white/5 rounded-xl pl-9 pr-4 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50 font-mono transition-colors"
          />
        </div>
        <button
          onClick={startCreateRecord}
          className="w-full md:w-auto px-4 py-2 bg-emerald-500 hover:bg-emerald-450 text-black font-extrabold text-[10.5px] uppercase tracking-wider rounded-xl font-mono flex items-center justify-center gap-1.5 shadow-[0_4px_12px_rgba(16,185,129,0.15)] transition-all cursor-pointer"
        >
          <Plus size={12} /> Add SFT Record
        </button>
      </div>

      {/* Main Grid display SFT cards */}
      {isCrudLoading ? (
        <div className="p-16 text-center text-xs italic text-zinc-550 animate-pulse">
          Loading SFT synthesized database rows...
        </div>
      ) : crudRecords.length === 0 ? (
        <div className="p-16 text-center bg-black/20 border border-white/5 rounded-3xl text-zinc-550 italic text-xs">
          No custom synthesized SFT records found. Create one manually or run the Creator Daemon!
        </div>
      ) : displayed.length === 0 ? (
        <div className="p-12 text-center text-zinc-555 text-xs italic">
          No records match your search filter criteria.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-hidden border border-white/5 rounded-2xl divide-y divide-white/5">
            {displayed.map((rec, index) => (
              <div key={rec.id || index} className="p-4 bg-black/30 hover:bg-[#0c0c12]/30 transition-all font-mono text-[10.5px] grid grid-cols-1 lg:grid-cols-12 gap-4">
                
                {/* ID & actions */}
                <div className="lg:col-span-2 flex lg:flex-col justify-between items-start border-r border-white/[0.02] pr-2 gap-2">
                  <div>
                    <span className="text-[8px] uppercase bg-emerald-500/10 text-emerald-400 font-extrabold px-1.5 py-0.5 rounded block">
                      #{rec.id} SFT Record
                    </span>
                    <span className="text-[7.5px] text-zinc-650 block mt-1">
                      {new Date(rec.createdAt || Date.now()).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => startEditRecord(rec)}
                      className="p-1.5 bg-white/5 hover:bg-white/10 rounded border border-white/5 text-zinc-300 hover:text-white cursor-pointer transition-all"
                      title="Edit SFT"
                    >
                      <Edit3 size={11} />
                    </button>
                    <button
                      onClick={() => handleDeleteRecord(rec.id)}
                      className="p-1.5 bg-rose-500/5 hover:bg-rose-500/20 rounded border border-rose-500/5 text-rose-400 cursor-pointer transition-all"
                      title="Delete"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>

                {/* Content columns */}
                <div className="lg:col-span-10 space-y-2 text-left">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <span className="text-[8px] uppercase font-bold text-zinc-450 block">💬 User Request:</span>
                      <p className="text-zinc-300 leading-relaxed italic">"{rec.userQuery}"</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[8px] uppercase font-bold text-amber-500 block">🎀 Spoken Speech Reply:</span>
                      <p className="text-amber-300 leading-relaxed font-sans font-bold text-xs">"{rec.targetSpeech}"</p>
                    </div>
                  </div>

                  {rec.synthesized?.thought && (
                    <div className="p-2.5 bg-black/40 border border-white/5 rounded-xl mt-1 space-y-0.5">
                      <span className="text-[8px] uppercase font-bold text-zinc-500 block">🧠 Mind CoT Thought Process:</span>
                      <p className="text-zinc-400 leading-relaxed italic font-mono">"{rec.synthesized.thought}"</p>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-[8.5px] border-t border-white/[0.02]">
                    <div className="flex items-center gap-1.5">
                      <span className="text-zinc-550 uppercase">Animations:</span>
                      <span className="bg-emerald-500/10 text-emerald-400 font-bold px-1 rounded">
                        {rec.synthesized?.animations?.join(', ') || 'SMILE'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-zinc-550 uppercase">Mood Impact weights:</span>
                      <span className="text-zinc-400 font-bold">
                        {JSON.stringify(rec.synthesized?.mood_impact || { joy: 1 })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalCrudPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-[10px] font-mono">
              <span className="text-zinc-500">Page {activeCrudPage} of {totalCrudPages} (Total {filtered.length} rows)</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCrudCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={activeCrudPage === 1}
                  className="p-1 px-2.5 bg-white/5 border border-white/5 hover:bg-white/10 rounded-lg text-white disabled:opacity-30 cursor-pointer active:scale-95 transition-all font-bold"
                >
                  <ChevronLeft size={11} className="inline" /> Back
                </button>
                <button
                  type="button"
                  onClick={() => setCrudCurrentPage(prev => Math.min(prev + 1, totalCrudPages))}
                  disabled={activeCrudPage === totalCrudPages}
                  className="p-1 px-2.5 bg-white/5 border border-white/5 hover:bg-white/10 rounded-lg text-white disabled:opacity-30 cursor-pointer active:scale-95 transition-all font-bold"
                >
                  Next <ChevronRight size={11} className="inline" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Editor dialog overlay modal */}
      <AnimatePresence>
        {(isCreatingNew || !!editingRecord) && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto font-sans">
            <motion.div
              initial={{ opacity: 0, y: 15, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.98 }}
              className="bg-[#09090e] border border-neutral-800 w-full max-w-xl rounded-3xl shadow-[0_0_80px_rgba(16,185,129,0.08)] flex flex-col p-6 max-h-[90vh] overflow-hidden text-left text-zinc-300"
            >
              <div className="flex justify-between items-center border-b border-white/5 pb-3 mb-4 select-none">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/20">
                    <Edit3 size={15} />
                  </div>
                  <div>
                    <h4 className="text-[8px] uppercase font-mono text-zinc-500">SFT Repository Creator</h4>
                    <h3 className="text-sm font-bold text-white">
                      {editingRecord ? `Edit SFT Record #${editingRecord.id}` : "Add Manual SFT Record"}
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingRecord(null);
                    setIsCreatingNew(false);
                  }}
                  className="p-1 rounded-lg hover:bg-white/10 text-zinc-300 hover:text-white transition-all cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>

              <form onSubmit={handleSaveRecord} className="flex-1 overflow-y-auto pr-1 space-y-4 scrollbar-hide select-text text-xs">
                {/* User query inputs */}
                <div className="space-y-1">
                  <label className="text-[9.5px] uppercase font-mono tracking-wider font-bold text-zinc-400 flex items-center gap-1">
                    <span>💬 User Request / Query</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={2}
                    placeholder="Enter user's query here..."
                    value={formUserQuery}
                    onChange={(e) => setFormUserQuery(e.target.value)}
                    className="w-full bg-black/40 border border-white/5 rounded-xl p-2.5 text-[11px] text-zinc-300 font-mono focus:outline-none focus:border-emerald-500/50 resize-none leading-relaxed"
                  />
                </div>

                {/* Speech answers */}
                <div className="space-y-1">
                  <label className="text-[9.5px] uppercase font-mono tracking-wider font-bold text-emerald-400 flex items-center gap-1">
                    <span>🎀 Spoken Speech Reply</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Enter Yui's sweet response reply here..."
                    value={formTargetSpeech}
                    onChange={(e) => setFormTargetSpeech(e.target.value)}
                    className="w-full bg-black/40 border border-emerald-500/5 rounded-xl p-2.5 text-[11px] text-emerald-300 focus:outline-none focus:border-emerald-500/50 resize-none leading-relaxed font-semibold font-sans"
                  />
                </div>

                {/* Thought monolog */}
                <div className="space-y-1">
                  <label className="text-[9.5px] uppercase font-mono tracking-wider font-bold text-amber-500 block">
                    🧠 Thought Process CoT
                  </label>
                  <textarea
                    rows={2.5}
                    placeholder="Enter the inner monologue, visual animations, emotions, or cognitive reasoning here..."
                    value={formThought}
                    onChange={(e) => setFormThought(e.target.value)}
                    className="w-full bg-black/40 border border-white/5 rounded-xl p-2.5 text-[11px] text-[#f59e0b] font-mono focus:outline-none focus:border-emerald-500/50 resize-none leading-relaxed"
                  />
                </div>

                {/* Facial expressions */}
                <div className="space-y-1.5">
                  <span className="text-[9.5px] uppercase font-mono tracking-wider font-bold text-zinc-400 block select-none">
                    🎭 Yui Facial Expression Animations
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {['SMILE', 'BLUSH', 'SAD', 'ANGRY', 'WINK', 'DOUBT', 'SHY', 'NORMAL', 'HAPPY', 'SURPRISED'].map((anim) => {
                      const isSelected = formAnimations.includes(anim);
                      return (
                        <button
                          key={anim}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setFormAnimations(prev => prev.filter(a => a !== anim));
                            } else {
                              setFormAnimations(prev => [...prev, anim]);
                            }
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[8.5px] uppercase font-mono font-bold border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                              : 'bg-black/20 border-white/5 text-zinc-500 hover:text-white hover:border-white/10'
                          }`}
                        >
                          {anim}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Mood impact index weights */}
                <div className="space-y-2 pt-1">
                  <span className="text-[9.5px] uppercase font-mono tracking-wider font-bold text-zinc-400 block">
                    📈 Emotional Mood Impact Weights
                  </span>
                  <div className="grid grid-cols-2 gap-3 bg-black/30 border border-white/5 p-3 rounded-2xl select-none text-[10px]">
                    {/* Joy */}
                    <div className="space-y-0.5">
                      <div className="flex justify-between font-mono">
                        <span className="text-zinc-550">Joy</span>
                        <span className="text-emerald-400 font-bold">{formJoy}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="5"
                        value={formJoy}
                        onChange={(e) => setFormJoy(Number(e.target.value))}
                        className="w-full accent-emerald-500 h-1 bg-white/5 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Affection */}
                    <div className="space-y-0.5">
                      <div className="flex justify-between font-mono">
                        <span className="text-zinc-550">Affection</span>
                        <span className="text-emerald-400 font-bold">{formAffection}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="5"
                        value={formAffection}
                        onChange={(e) => setFormAffection(Number(e.target.value))}
                        className="w-full accent-emerald-500 h-1 bg-white/5 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Sadness */}
                    <div className="space-y-0.5">
                      <div className="flex justify-between font-mono">
                        <span className="text-zinc-555">Sadness</span>
                        <span className="text-rose-400 font-bold">{formSadness}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="5"
                        value={formSadness}
                        onChange={(e) => setFormSadness(Number(e.target.value))}
                        className="w-full accent-rose-500 h-1 bg-white/5 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Anger */}
                    <div className="space-y-0.5">
                      <div className="flex justify-between font-mono">
                        <span className="text-zinc-555">Anger</span>
                        <span className="text-rose-400 font-bold">{formAnger}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="5"
                        value={formAnger}
                        onChange={(e) => setFormAnger(Number(e.target.value))}
                        className="w-full accent-rose-500 h-1 bg-white/5 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Shyness */}
                    <div className="space-y-0.5 col-span-2">
                      <div className="flex justify-between font-mono">
                        <span className="text-zinc-555">Shyness</span>
                        <span className="text-purple-400 font-bold">{formShyness}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="5"
                        value={formShyness}
                        onChange={(e) => setFormShyness(Number(e.target.value))}
                        className="w-full accent-purple-500 h-1 bg-white/5 rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                {/* Footer buttons */}
                <div className="pt-3 border-t border-white/5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRecord(null);
                      setIsCreatingNew(false);
                    }}
                    className="px-3.5 py-1.5 bg-white/5 border border-white/5 text-zinc-400 hover:text-white rounded-xl font-bold cursor-pointer transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={formIsSaving}
                    className="px-4 py-1.5 bg-emerald-500 hover:bg-[#10b981] text-black font-extrabold rounded-xl cursor-pointer transition-all disabled:opacity-50"
                  >
                    {formIsSaving ? "Saving..." : "Save Record"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
