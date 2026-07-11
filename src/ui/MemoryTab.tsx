import React from 'react';
import { motion } from 'motion/react';
import { Search, X, Tag, Check, Edit2 } from 'lucide-react';
import { Memory } from '../include/types';

interface MemoryTabProps {
  memories: Memory[];
  memorySearchQuery: string;
  setMemorySearchQuery: (val: string) => void;
  editingTagsMemoryId: string | null;
  setEditingTagsMemoryId: (val: string | null) => void;
  tagInput: string;
  setTagInput: (val: string) => void;
  handleSaveTags: (id: string) => void;
}

export const MemoryTab: React.FC<MemoryTabProps> = ({
  memories,
  memorySearchQuery,
  setMemorySearchQuery,
  editingTagsMemoryId,
  setEditingTagsMemoryId,
  tagInput,
  setTagInput,
  handleSaveTags
}) => {
  return (
    <motion.div 
      key="memory"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 p-4 md:p-12 overflow-y-auto z-10 scrollbar-hide"
    >
      <div className="max-w-5xl mx-auto">
        <header className="mb-12">
          <h2 className="text-xs uppercase tracking-[0.3em] text-amber-500/60 mb-2 font-mono">Buffer 0x01 // Persistence</h2>
          <h1 className="text-3xl font-serif text-white italic tracking-wide">Kernel Memories</h1>
        
        <div className="mt-8 max-w-xl relative group">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            <Search size={14} className="text-white/20 group-focus-within:text-amber-500 transition-colors" />
          </div>
          <input 
            type="text"
            value={memorySearchQuery}
            onChange={(e) => setMemorySearchQuery(e.target.value)}
            placeholder="Search content or #tags..."
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-12 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all font-sans"
          />
          {memorySearchQuery && (
            <button 
              onClick={() => setMemorySearchQuery('')}
              className="absolute inset-y-0 right-4 flex items-center text-white/20 hover:text-white/60 transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </header>

      <div className="grid gap-4 max-w-4xl">
        {(memories || [])
          .filter(m => {
            if (!memorySearchQuery) return true;
            const query = memorySearchQuery.toLowerCase();
            const contentMatch = m.content.toLowerCase().includes(query);
            const tagMatch = (m.tags || []).some(t => t.toLowerCase().includes(query.replace('#', '')));
            return contentMatch || tagMatch;
          })
          .slice(-150)
          .map((m, i) => (
          <div key={m.id || `mem-${i}`} className="p-4 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-all group flex gap-6">
            <div className="flex flex-col items-center gap-2 pt-1 uppercase">
              <div className={`w-1.5 h-1.5 rounded-full ${m.type === 'fact' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              <div className="[writing-mode:vertical-lr] text-[8px] text-white/30 tracking-widest">{m.type}</div>
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-mono text-amber-200/40">ID:{(m.id || '').substring(0, 8)} // &lt;{m.speaker || 'Operator'}&gt;</span>
                <span className="text-[10px] text-white/20 uppercase tracking-tighter">{new Date(m.timestamp).toLocaleDateString()}</span>
              </div>
              <p className="text-sm text-white/80 leading-relaxed font-sans">{m.content}</p>
              
              {editingTagsMemoryId === m.id ? (
                <div className="mt-4 flex items-center gap-3">
                  <Tag size={12} className="text-amber-500" />
                  <input 
                    autoFocus={localStorage.getItem('yuihime_disable_autofocus') !== 'true'}
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveTags(m.id)}
                    placeholder="scientific, neural, data..."
                    className="bg-transparent border-b border-amber-500/50 text-[10px] text-white/80 focus:outline-none py-1 flex-1 font-mono"
                  />
                  <button onClick={() => handleSaveTags(m.id)} className="p-1 hover:bg-emerald-500/20 text-emerald-500 rounded transition-colors">
                    <Check size={14} />
                  </button>
                  <button onClick={() => setEditingTagsMemoryId(null)} className="p-1 hover:bg-white/10 text-white/40 rounded transition-colors">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 relative group-item">
                  {(m.tags || []).map((t, ti) => (
                    <span key={`${t}-${ti}`} className="text-[9px] font-mono text-white/30 uppercase tracking-widest break-all">#{t}</span>
                  ))}
                  <button 
                    onClick={() => {
                      setEditingTagsMemoryId(m.id);
                      setTagInput(m.tags.join(', '));
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 text-white/30 hover:text-white rounded transition-all"
                    title="Edit Tags"
                  >
                    <Edit2 size={10} />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {memories.length === 0 && (
          <div className="py-24 text-center border-2 border-dashed border-white/5 rounded-3xl">
            <p className="opacity-20 font-serif italic text-xl">Buffer is currently clear.</p>
          </div>
        )}
      </div>
    </div>
    </motion.div>
  );
};
