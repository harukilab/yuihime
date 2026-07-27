import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Save, RefreshCw, Smile, Sparkles, Database, Cpu, Heart, Brain, ChevronLeft, Layers, Palette, Settings, MessageSquare } from 'lucide-react';
import { LockedSlider } from '../../components/LockedSlider';

interface CharacterTabProps {
  activeCardId: string;
  setActiveCardId: (id: string) => void;
  activePersonaId?: string;
  setActivePersonaId?: (id: string) => void;
  characterCards: any[];
  setCharacterCards: React.Dispatch<React.SetStateAction<any[]>>;
  characterName?: string;
}

export const CharacterTab: React.FC<CharacterTabProps> = ({
  activeCardId,
  setActiveCardId,
  activePersonaId = '',
  setActivePersonaId,
  characterCards,
  setCharacterCards,
  characterName = 'Yui Airi',
}) => {
  // MD file editor states
  const [selectedMdFile, setSelectedMdFile] = useState<string | null>(null);
  const [selectedMdName, setSelectedMdName] = useState<string>('');
  const [selectedMdPath, setSelectedMdPath] = useState<string>('');
  const [loadingMd, setLoadingMd] = useState<boolean>(false);
  const [savingMd, setSavingMd] = useState<boolean>(false);
  const [mdFileContent, setMdFileContent] = useState<string>('');
  const [originalMdFileContent, setOriginalMdFileContent] = useState<string>('');
  const [mdStatusMessage, setMdStatusMessage] = useState<{ type: 'success' | 'error' | null; text: string }>({ type: null, text: '' });
  const [editorModeTab, setEditorModeTab] = useState<'edit' | 'preview'>('edit');

  // Editing Card modal states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<any | null>(null);
  const [editModalTab, setEditModalTab] = useState<'identity' | 'behavior' | 'settings'>('identity');
  const [cardForm, setCardForm] = useState<any>({
    name: '',
    nickname: '',
    description: '',
    creatorNotes: '',
    version: '1.0.0',
    behavior: { firstMessage: '', scenario: '', examples: '' },
    settings: { temperature: 0.7, systemPrompt: '' }
  });

  useEffect(() => {
    if (activeCardId && activePersonaId !== activeCardId) {
      setActivePersonaId?.(activeCardId);
    }
  }, [activeCardId, activePersonaId, setActivePersonaId]);

  const handleEditCard = (card: any) => {
    setEditingCard(card);
    setCardForm({
      id: card.id,
      name: card.name || '',
      nickname: card.nickname || '',
      description: card.description || '',
      creatorNotes: card.creatorNotes || '',
      version: card.version || '1.0.0',
      behavior: card.behavior || { firstMessage: '', scenario: '', examples: '' },
      settings: card.settings || { temperature: 0.7, systemPrompt: '' }
    });
    setEditModalTab('identity');
    setIsEditModalOpen(true);
  };

  const handleSaveCard = async () => {
    if (!cardForm.name.trim() || !cardForm.description.trim()) {
      alert("Name and Description are required fields.");
      return;
    }
    try {
      const res = await fetch('/api/system/personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cardForm)
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save persona');
      }
      let updatedCards;
      if (editingCard && editingCard.id) {
        updatedCards = characterCards.map(c => c.id === editingCard.id ? { ...cardForm } : c);
      } else {
        const newId = cardForm.id || 'card_' + Date.now();
        updatedCards = [...characterCards, { ...cardForm, id: newId }];
      }
      setCharacterCards(updatedCards);
      setIsEditModalOpen(false);
      setEditingCard(null);
    } catch (e: any) {
      alert(e.message || 'Failed to save persona');
    }
  };

  const handleLoadMdFile = async (fileName: string, humanName: string) => {
    setLoadingMd(true);
    setSelectedMdFile(fileName);
    setSelectedMdName(humanName);
    setSelectedMdPath('');
    setMdStatusMessage({ type: null, text: '' });
    try {
      const response = await fetch(`/api/system/markdown/${fileName}`);
      if (!response.ok) {
        throw new Error(`Failed to load ${fileName}. File may not exist in workspace.`);
      }
      const data = await response.json();
      setMdFileContent(data.content || '');
      setOriginalMdFileContent(data.content || '');
      if (data.sourcePath) {
        setSelectedMdPath(data.sourcePath);
      }
    } catch (e: any) {
      console.error(e);
      setMdStatusMessage({ type: 'error', text: e.message || 'Failed to read cognitive file.' });
    } finally {
      setLoadingMd(false);
    }
  };

  const handleSaveMdFile = async () => {
    if (!selectedMdFile) return;
    setSavingMd(true);
    setMdStatusMessage({ type: null, text: '' });
    try {
      const res = await fetch(`/api/system/markdown/${selectedMdFile}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: mdFileContent })
      });
      if (!res.ok) throw new Error(`Failed to save ${selectedMdFile}`);
      setOriginalMdFileContent(mdFileContent);
      setMdStatusMessage({ type: 'success', text: `Successfully saved cognitive file: ${selectedMdFile}!` });

      setTimeout(() => {
        setMdStatusMessage(prev => prev.text.includes(selectedMdFile || '') ? { type: null, text: '' } : prev);
      }, 5000);
    } catch (e: any) {
      console.error(e);
      setMdStatusMessage({ type: 'error', text: e.message || `Failed to save ${selectedMdFile}.` });
    } finally {
      setSavingMd(false);
    }
  };

  return (
    <div className="space-y-6">
      {selectedMdFile ? (
        /* MD FILE EDITOR MODE */
        <motion.div
          key="md-file-editor"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="space-y-4"
        >
          {/* Header bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
            <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMdFile(null);
                    setSelectedMdPath('');
                    setMdStatusMessage({ type: null, text: '' });
                  }}
                className="p-2 sm:p-2.5 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white rounded-xl transition-all cursor-pointer"
                title="Return to List"
              >
                <ChevronLeft size={16} />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  <h4 className="text-sm font-bold text-white tracking-wide">{selectedMdName}</h4>
                </div>
                <span className="text-[9px] font-mono text-[#00bcd4] uppercase tracking-wider">
                  {selectedMdPath ? `File: ${selectedMdPath}` : `File Workspace: ${selectedMdFile}`}
                </span>
              </div>
            </div>

            {/* Mode tab (Edit vs Preview) */}
            <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-white/5 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setEditorModeTab('edit')}
                className={`px-3 py-1 text-[10px] font-mono uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                  editorModeTab === 'edit'
                    ? 'bg-[#00bcd4]/15 border border-[#00bcd4]/30 text-[#1de4fc]'
                    : 'text-white/40 hover:text-white/70 border border-transparent'
                }`}
              >
                Code Editor
              </button>
              <button
                type="button"
                onClick={() => setEditorModeTab('preview')}
                className={`px-3 py-1 text-[10px] font-mono uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                  editorModeTab === 'preview'
                    ? 'bg-[#10b981]/15 border border-[#10b981]/30 text-[#10b981]'
                    : 'text-white/40 hover:text-white/70 border border-transparent'
                }`}
              >
                Visual Preview
              </button>
            </div>
          </div>

          {/* Status message */}
          {mdStatusMessage.text && (
            <div className={`p-4 rounded-2xl text-[11px] font-sans border flex items-center gap-3 animate-fade-in ${
              mdStatusMessage.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-450'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                mdStatusMessage.type === 'success' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
              }`} />
              <span className="leading-normal">{mdStatusMessage.text}</span>
            </div>
          )}

          {/* Content panels */}
          {loadingMd ? (
            <div className="py-24 text-center border border-white/5 bg-[#0e0e14]/40 rounded-3xl flex flex-col items-center justify-center gap-3">
              <RefreshCw size={24} className="text-[#00bcd4] animate-spin" />
              <span className="text-[10px] uppercase font-mono tracking-widest text-white/30">Loading cognitive files...</span>
            </div>
          ) : (
            <>
              {editorModeTab === 'edit' ? (
                <div className="space-y-2">
                  <p className="text-[10px] text-white/30 font-mono mb-1">
                    Edit below using Markdown syntax.
                  </p>
                  <div className="relative">
                    <textarea
                      value={mdFileContent}
                      onChange={(e) => setMdFileContent(e.target.value)}
                      rows={18}
                      className="w-full text-zinc-100 bg-[#07070a]/90 border border-white/10 focus:border-[#00bcd4]/50 rounded-2xl p-5 text-xs sm:text-[13px] font-mono leading-relaxed outline-none focus:ring-1 focus:ring-[#00bcd4]/20 transition-all resize-y shadow-[inset_0_2px_8px_rgba(0,0,0,0.8)]"
                      placeholder={`Markdown content for ${selectedMdFile}...`}
                    />
                    <div className="absolute bottom-4 right-4 text-[9px] font-mono text-white/20 select-none bg-black/60 px-2 py-1 rounded-md">
                      {mdFileContent.length} chars
                    </div>
                  </div>
                </div>
              ) : (
                /* Visual Preview Panel */
                <div className="bg-[#07070a]/60 border border-white/5 rounded-2xl p-6 md:p-8 min-h-[400px] max-h-[600px] overflow-y-auto scrollbar-hide">
                  <div className="prose prose-invert prose-xs max-w-none text-zinc-300 space-y-4">
                    {mdFileContent.trim() ? (
                      mdFileContent.split('\n').map((line, idx) => {
                        if (line.startsWith('# ')) {
                          return <h1 key={idx} className="text-xl md:text-2xl font-serif text-white hover:text-cyan-300 transition-colors border-b border-white/10 pb-2 mt-6 uppercase tracking-wider">{line.replace('# ', '')}</h1>;
                        } else if (line.startsWith('## ')) {
                          return <h2 key={idx} className="text-lg font-serif text-amber-200 mt-5 border-b border-white/5 pb-1">{line.replace('## ', '')}</h2>;
                        } else if (line.startsWith('### ')) {
                          return <h3 key={idx} className="text-sm font-semibold text-cyan-400 mt-4 tracking-wide uppercase">{line.replace('### ', '')}</h3>;
                        } else if (line.startsWith('- ') || line.startsWith('* ')) {
                          return <div key={idx} className="flex items-start gap-2 text-zinc-300 text-xs pl-2 leading-relaxed"><span className="text-cyan-400 mt-1 shrink-0">•</span><span>{line.substring(2)}</span></div>;
                        } else if (line.startsWith('> ')) {
                          return <blockquote key={idx} className="border-l-2 border-amber-500/50 bg-white/[0.02] px-4 py-2 italic text-zinc-400 text-xs my-3 rounded-r-lg">{line.replace('> ', '')}</blockquote>;
                        } else if (line.trim() === '') {
                          return <div key={idx} className="h-2" />;
                        } else {
                          return <p key={idx} className="text-xs sm:text-sm leading-relaxed text-zinc-400 font-sans">{line}</p>;
                        }
                      })
                    ) : (
                      <div className="text-center text-white/25 py-20 font-mono text-xs">Document empty.</div>
                    )}
                  </div>
                </div>
              )}

              {/* Action controllers */}
              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Reset all draft changes?")) {
                      setMdFileContent(originalMdFileContent);
                    }
                  }}
                  disabled={savingMd || mdFileContent === originalMdFileContent}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 active:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-mono uppercase tracking-wider rounded-xl text-white/70 hover:text-white transition-all cursor-pointer"
                >
                  Reset Draft
                </button>
                <button
                  type="button"
                  onClick={handleSaveMdFile}
                  disabled={savingMd || mdFileContent === originalMdFileContent}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 disabled:opacity-40 disabled:from-cyan-800 disabled:to-cyan-900 text-black text-xs font-mono uppercase font-bold tracking-widest rounded-xl transition-all cursor-pointer shadow-[0_0_15px_rgba(6,182,212,0.15)] hover:shadow-[0_0_25px_rgba(6,182,212,0.3)] disabled:shadow-none"
                >
                  {savingMd ? (
                    <>
                      <RefreshCw size={12} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={12} />
                      Save
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </motion.div>
      ) : (
        /* LIST OF CORE MARKDOWN FILES TO EDIT */
        <div className="space-y-6">
          {/* Intro Banner */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-cyan-500/[0.03] to-indigo-500/[0.03] border border-white/5 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-cyan-500/10 rounded-xl text-cyan-400 border border-cyan-500/20 shrink-0">
                <Sparkles size={20} className="animate-pulse" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white tracking-wide uppercase">{characterName} Card: Core Documents</h4>
                <p className="text-[11px] leading-relaxed text-zinc-400 mt-1 font-sans">
                  Configure personality, behavior and recall rules through local Markdown files.
                </p>
              </div>
            </div>
          </div>

          {/* Files Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { id: 'character.md', name: 'Personality & Persona Profile', desc: 'Personality traits and tone guidelines.', docName: 'character.md', icon: Sparkles, color: 'text-pink-400', border: 'border-pink-500/10 hover:border-pink-500/50' },
              { id: 'lore.md', name: 'Knowledge & Background Lore', desc: 'Backstory, old memories and world lore.', docName: 'lore.md', icon: Database, color: 'text-indigo-400', border: 'border-indigo-500/10 hover:border-indigo-500/50' },
              { id: 'system_prompt.md', name: 'Core Directives / System Prompt', desc: 'Core instructions and reasoning format.', docName: 'system_prompt.md', icon: Cpu, color: 'text-cyan-400', border: 'border-cyan-500/10 hover:border-cyan-500/50' },
              { id: 'SOUL.md', name: 'Core Soul Blueprint', desc: 'Core consciousness and self-awareness rules.', docName: 'SOUL.md', icon: Heart, color: 'text-rose-500', border: 'border-rose-500/10 hover:border-rose-500/50' },
              { id: 'MEMORY.md', name: 'Memory & Recall Rules', desc: 'Memory and sleep consolidation rules.', docName: 'MEMORY.md', icon: Brain, color: 'text-emerald-400', border: 'border-emerald-500/10 hover:border-emerald-500/50' },
              { id: 'IDENTITY.md', name: 'Identity & Perceptions Manifest', desc: 'Self-perception and digital identity.', docName: 'IDENTITY.md', icon: Smile, color: 'text-amber-400', border: 'border-amber-500/10 hover:border-amber-500/50' }
            ].map((fileItem) => {
              const Icon = fileItem.icon;
              return (
                <div
                  key={fileItem.id}
                  onClick={() => handleLoadMdFile(fileItem.id, fileItem.name)}
                  className={`p-5 rounded-3xl bg-[#09090e]/60 border ${fileItem.border} hover:bg-white/[0.01] hover:-translate-y-1 transition-all group cursor-pointer flex flex-col justify-between min-h-[160px] shadow-[0_4px_20px_rgba(0,0,0,0.2)]`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className={`p-2.5 bg-white/5 rounded-xl border border-white/5 group-hover:bg-white/10 transition-all ${fileItem.color}`}>
                        <Icon size={16} />
                      </div>
                      <span className="text-[8px] font-mono text-white/30 uppercase tracking-widest">{fileItem.docName}</span>
                    </div>
                    <h5 className="font-bold text-white text-xs tracking-wide group-hover:text-amber-400 transition-all">{fileItem.name}</h5>
                    <p className="text-[10.5px] text-zinc-400 leading-relaxed font-sans">{fileItem.desc}</p>
                  </div>
                  <div className="pt-3 border-t border-white/[0.03] flex items-center justify-between text-[8px] font-mono uppercase tracking-widest text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span>Tune Document</span>
                    <span>➔</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ACTIVE PROFILE PRESETS SELECTOR */}
          <div className="pt-4 border-t border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-[10px] uppercase font-mono tracking-widest text-white/30">Active Profiles Presets</h4>
                <p className="text-[9px] text-zinc-500">Local persona backup presets.</p>
              </div>
              <div className="relative overflow-hidden cursor-pointer">
                <button type="button" className="px-3 py-1 bg-white/[0.04] hover:bg-white/[0.08] text-white/70 hover:text-white border border-white/10 rounded-lg text-[9px] font-mono uppercase tracking-wider transition-all cursor-pointer">
                  Upload Card
                </button>
                <input 
                  type="file" 
                  accept=".png,.json"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const text = await file.text();
                      const card = JSON.parse(text);
                      if (!card.id || !card.name) {
                        alert('Invalid card JSON: id and name are required.');
                        return;
                      }
                      const res = await fetch('/api/system/personas', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(card)
                      });
                      if (!res.ok) {
                        const data = await res.json().catch(() => ({}));
                        throw new Error(data.error || 'Failed to upload persona');
                      }
                      setCharacterCards(prev => {
                        const idx = prev.findIndex((c: any) => c.id === card.id);
                        if (idx >= 0) {
                          const updated = [...prev];
                          updated[idx] = { ...updated[idx], ...card };
                          return updated;
                        }
                        return [...prev, card];
                      });
                      alert(`Successfully uploaded persona: ${card.name}`);
                    } catch (err: any) {
                      alert(err.message || 'Failed to upload persona');
                    }
                    e.target.value = '';
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer" 
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {characterCards && characterCards.length > 0 ? (
                characterCards.map((item: any) => {
                  const isSelected = activeCardId === item.id;
                  return (
                    <div 
                      key={item.id}
                      className={`p-4 rounded-2xl border transition-all relative ${
                        isSelected 
                          ? 'bg-amber-500/[0.02] border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.03)]' 
                          : 'bg-[#06060c]/40 border-white/5 hover:border-white/10'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div onClick={() => setActiveCardId(item.id)} className="cursor-pointer flex-1 pr-2">
                          <h5 className="font-bold text-white text-xs tracking-wide hover:text-[#00bcd4] transition-colors">{item.name}</h5>
                          <span className="text-[8px] font-mono text-white/30 uppercase tracking-tighter">v{item.version || '1.0.0'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleEditCard(item)}
                            className="px-2 py-0.5 bg-white/5 hover:bg-white/10 text-[8px] font-bold font-mono rounded text-white/50 hover:text-white transition-all cursor-pointer"
                          >
                            Edit
                          </button>
                          <div 
                            onClick={() => setActiveCardId(item.id)}
                            className={`w-3 h-3 rounded-full cursor-pointer flex items-center justify-center border transition-all ${
                              isSelected 
                                ? 'bg-amber-500 border-amber-500/50 text-black shadow-[0_0_8px_rgba(245,158,11,0.4)]' 
                                : 'bg-transparent border-white/20'
                            }`}
                          >
                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
                          </div>
                        </div>
                      </div>
                      <p className="text-[10px] leading-relaxed text-white/40 line-clamp-2 cursor-pointer" onClick={() => setActiveCardId(item.id)}>
                        {item.description || 'No additional personality descriptions registered.'}
                      </p>
                      {item.id === 'auto' && isSelected && (
                        <div className="mt-2.5 p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-mono text-emerald-400">
                          <span className="font-bold uppercase tracking-wider block mb-0.5">⚡ Auto-Adaptive Router Active</span>
                          Yuihime memilih frekuensi batin secara otomatis sesuai topik obrolan (Koding/Logika → Analytical | Curhat/Emosi → Relational | Cerita/Humor → Entropy | Cinta/Romantis → Sensual Ero).
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="col-span-3 text-center py-6 bg-black/40 border border-[#ffffff05] rounded-xl font-mono text-[9px] text-white/20">
                  No auxiliary presets registered.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* RENDER EDIT DIALOG MODAL IF OPEN */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-3xl p-8 max-w-4xl w-full text-zinc-800 shadow-2xl relative overflow-hidden flex flex-col font-sans border border-gray-100 animate-fade-in"
          >
            <div className="absolute top-0 right-0 w-48 h-48 bg-cyan-200/20 blur-3xl rounded-full pointer-events-none" />

             <h3 className="text-[#0ea5e9] font-sans font-medium text-2xl tracking-wide mb-6">Edit {"${characterName}"} Card</h3>

            {/* Tab list */}
            <div className="flex flex-wrap items-center gap-6 border-b border-gray-200/80 pb-3 mb-6">
              {[
                { id: 'identity', label: 'Identity', icon: Smile },
                { id: 'behavior', label: 'Behavior', icon: MessageSquare },
                { id: 'settings', label: 'Settings', icon: Settings },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = editModalTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setEditModalTab(tab.id as any)}
                    className={`flex items-center gap-2 pb-2.5 px-1 text-xs sm:text-sm font-medium transition-all relative border-b-2 cursor-pointer ${
                      isActive 
                        ? 'border-[#0ea5e9] text-[#0ea5e9] font-semibold' 
                        : 'border-transparent text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    <Icon size={16} className={isActive ? 'text-[#0ea5e9]' : 'text-gray-400'} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Tab Contents */}
            <div className="flex-1 max-h-[60vh] overflow-y-auto pr-2 scrollbar-thin">
              {editModalTab === 'identity' && (
                <div className="space-y-6">
                   <p className="text-xs md:text-sm text-gray-500 leading-relaxed">
                     You can put here some details about the character you are creating, explain his history and context, and how your interactions should be answered. Use {"${characterName}"} as a template variable for the character name.
                   </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    <div className="space-y-5">
                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Name <span className="text-red-500">*</span>
                        </label>
                        <span className="text-[10px] text-gray-400 font-sans block">
                          Is the formal name of this character.
                        </span>
                         <input
                           type="text"
                           value={cardForm.name}
                           onChange={(e) => setCardForm({ ...cardForm, name: e.target.value })}
                           className="w-full text-gray-800 bg-gray-50 border border-gray-200/80 focus:bg-white focus:border-[#0ea5e9] rounded-xl px-4 py-3 text-sm font-sans transition-all outline-none shadow-[inset_0_1px_3px_rgba(0,0,0,0.02)]"
                           placeholder="${characterName}"
                         />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Description <span className="text-red-500">*</span>
                        </label>
                        <span className="text-[10px] text-gray-400 font-sans block">
                          Description of this character.
                        </span>
                         <textarea
                           value={cardForm.description}
                           onChange={(e) => setCardForm({ ...cardForm, description: e.target.value })}
                           rows={4}
                           className="w-full text-gray-800 bg-gray-50 border border-gray-200/80 focus:bg-white focus:border-[#0ea5e9] rounded-xl px-4 py-3 text-sm font-sans transition-all outline-none min-h-[100px] resize-y shadow-[inset_0_1px_3px_rgba(0,0,0,0.02)]"
                           placeholder="Description for ${characterName}"
                         />
                      </div>
                    </div>

                    <div className="space-y-5">
                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Nickname
                        </label>
                        <span className="text-[10px] text-gray-400 font-sans block">
                          You can also give a nickname that will be used in priority.
                        </span>
                        <input
                          type="text"
                          value={cardForm.nickname}
                          onChange={(e) => setCardForm({ ...cardForm, nickname: e.target.value })}
                          className="w-full text-gray-800 bg-gray-50 border border-gray-200/80 focus:bg-white focus:border-[#0ea5e9] rounded-xl px-4 py-3 text-sm font-sans transition-all outline-none shadow-[inset_0_1px_3px_rgba(0,0,0,0.02)]"
                          placeholder="Nickname"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Creator Notes
                        </label>
                        <span className="text-[10px] text-gray-400 font-sans block">
                          If you want to add some personal notes.
                        </span>
                        <textarea
                          value={cardForm.creatorNotes}
                          onChange={(e) => setCardForm({ ...cardForm, creatorNotes: e.target.value })}
                          rows={4}
                          className="w-full text-gray-800 bg-gray-50 border border-gray-200/80 focus:bg-white focus:border-[#0ea5e9] rounded-xl px-4 py-3 text-sm font-sans transition-all outline-none min-h-[100px] resize-y shadow-[inset_0_1px_3px_rgba(0,0,0,0.02)]"
                          placeholder="..."
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {editModalTab === 'behavior' && (
                <div className="space-y-5">
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">First Message</label>
                    <span className="text-[10px] text-gray-400 font-sans block">The greeting dialogue sent when starting a session.</span>
                    <textarea
                      value={cardForm.behavior?.firstMessage || ''}
                      onChange={(e) => setCardForm({
                        ...cardForm,
                        behavior: { ...(cardForm.behavior || {}), firstMessage: e.target.value }
                      })}
                      rows={3}
                      className="w-full text-gray-800 bg-gray-50 border border-gray-200/80 focus:bg-white focus:border-[#0ea5e9] rounded-xl px-4 py-3 text-sm transition-all outline-none shadow-[inset_0_1px_3px_rgba(0,0,0,0.02)]"
                      placeholder="Halo..."
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">Roleplay Scenario</label>
                      <span className="text-[10px] text-gray-400 font-sans block">Context or room rules (e.g. streaming, chatting).</span>
                      <textarea
                        value={cardForm.behavior?.scenario || ''}
                        onChange={(e) => setCardForm({
                          ...cardForm,
                          behavior: { ...(cardForm.behavior || {}), scenario: e.target.value }
                        })}
                        rows={4}
                        className="w-full text-gray-800 bg-gray-50 border border-gray-200/80 focus:bg-white focus:border-[#0ea5e9] rounded-xl px-4 py-3 text-sm transition-all outline-none min-h-[100px] resize-y shadow-[inset_0_1px_3px_rgba(0,0,0,0.02)]"
                        placeholder="Context..."
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">Dialogue Examples</label>
                      <span className="text-[10px] text-gray-400 font-sans block">One or more example responses representing tone and dialogue pacing.</span>
                      <textarea
                        value={cardForm.behavior?.examples || ''}
                        onChange={(e) => setCardForm({
                          ...cardForm,
                          behavior: { ...(cardForm.behavior || {}), examples: e.target.value }
                        })}
                        rows={4}
                        className="w-full text-gray-800 bg-gray-50 border border-gray-200/80 focus:bg-white focus:border-[#0ea5e9] rounded-xl px-4 py-3 text-sm transition-all outline-none min-h-[100px] resize-y shadow-[inset_0_1px_3px_rgba(0,0,0,0.02)]"
                        placeholder="Examples..."
                      />
                    </div>
                  </div>
                </div>
              )}

              {editModalTab === 'settings' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <LockedSlider
                      value={cardForm.settings?.temperature || 0.7}
                      onChange={(val) => setCardForm({
                        ...cardForm,
                        settings: { ...(cardForm.settings || {}), temperature: val }
                      })}
                      min={0.1}
                      max={1.5}
                      step={0.05}
                      label="Dynamic Temperature (α)"
                      description="Controls output randomness (Default: 0.7)"
                      themeColor="amber"
                    />

                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">Explicit Prompt Modifier</label>
                      <span className="text-[10px] text-gray-400 font-sans block">Appended override rules for context response gating</span>
                      <textarea
                        value={cardForm.settings?.systemPrompt || ''}
                        onChange={(e) => setCardForm({
                          ...cardForm,
                          settings: { ...(cardForm.settings || {}), systemPrompt: e.target.value }
                        })}
                        rows={3}
                        className="w-full text-gray-800 bg-gray-50 border border-gray-200/80 focus:bg-white focus:border-[#0ea5e9] rounded-xl px-4 py-3 text-sm transition-all outline-none"
                        placeholder="e.g. Always respond in English unless requested..."
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer containing Save/Close */}
            <div className="flex items-center justify-end gap-3 mt-8 pt-4 border-t border-gray-105">
              <button
                type="button"
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingCard(null);
                }}
                className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200/80 text-gray-700 text-xs font-semibold tracking-wide rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCard}
                className="px-6 py-2.5 bg-[#0ea5e9] hover:bg-[#0284c7] text-white text-xs font-bold tracking-wide rounded-xl cursor-pointer shadow-[0_2px_10px_rgba(14,165,233,0.3)] hover:shadow-[0_4px_15px_rgba(14,165,233,0.4)]"
              >
                Save Persona Preset
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
