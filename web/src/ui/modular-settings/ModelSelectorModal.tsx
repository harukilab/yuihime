import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Check } from 'lucide-react';

interface ModelItem {
  id: string;
  name: string;
  type: string;
  url: string;
  imageUrl: string;
  desc: string;
}

interface ModelSelectorModalProps {
  isModelSelectorOpen: boolean;
  setIsModelSelectorOpen: (open: boolean) => void;
  showImportForm: boolean;
  setShowImportForm: (show: boolean) => void;
  customModelUrlInput: string;
  setCustomModelUrlInput: (val: string) => void;
  customModelNameInput: string;
  setCustomModelNameInput: (val: string) => void;
  customModelTypeInput: 'Live2D' | 'VRM';
  setCustomModelTypeInput: (val: 'Live2D' | 'VRM') => void;
  allModelsList: ModelItem[];
  setAllModelsList: (list: ModelItem[]) => void;
  selectedModelInSelector: ModelItem | null;
  setSelectedModelInSelector: (model: ModelItem | null) => void;
  updateAvatar: (key: string, val: any) => void;
}

export const ModelSelectorModal: React.FC<ModelSelectorModalProps> = ({
  isModelSelectorOpen,
  setIsModelSelectorOpen,
  showImportForm,
  setShowImportForm,
  customModelUrlInput,
  setCustomModelUrlInput,
  customModelNameInput,
  setCustomModelNameInput,
  customModelTypeInput,
  setCustomModelTypeInput,
  allModelsList,
  setAllModelsList,
  selectedModelInSelector,
  setSelectedModelInSelector,
  updateAvatar,
}) => {
  if (!isModelSelectorOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-[#0b0b10] border border-white/10 rounded-[32px] p-6 sm:p-8 max-w-4xl w-full text-white shadow-[0_20px_50px_rgba(0,0,0,0.8)] relative overflow-hidden flex flex-col font-sans"
      >
        {/* Glowing background circles for modern tech-anime vibes */}
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-cyan-400/10 blur-[80px] rounded-full pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-teal-400/10 blur-[80px] rounded-full pointer-events-none" />

        {/* Header/Breadcrumbs */}
        <div className="flex items-center justify-between mb-4 relative z-10">
          <div className="space-y-0.5">
            <span 
              onClick={() => setIsModelSelectorOpen(false)}
              className="text-[10px] text-zinc-500 hover:text-zinc-400 cursor-pointer flex items-center gap-1 uppercase tracking-wider font-mono"
            >
              ‹ Settings / Models
            </span>
            <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight font-sans">Model Selector</h3>
          </div>
          
          <button
            type="button"
            onClick={() => setShowImportForm(!showImportForm)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/15 border border-white/5 hover:border-white/10 text-xs text-white rounded-xl transition-all cursor-pointer font-bold font-sans"
          >
            <Plus size={14} className="text-cyan-400" />
            Import
          </button>
        </div>

        {/* Optional Import Form Drawer */}
        <AnimatePresence>
          {showImportForm && (
            <motion.form 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              onSubmit={(e) => {
                e.preventDefault();
                if (!customModelUrlInput) {
                  alert("Please provide the model configuration URL (.json / .vrm)");
                  return;
                }
                const cleanUrl = customModelUrlInput.trim();
                const cleanName = customModelNameInput.trim() || `Imp: ${cleanUrl.split('/').pop()?.split('?')[0] || 'Custom Model'}`;
                const cleanType = customModelTypeInput;

                const newModel = {
                  id: `imported_${Date.now()}`,
                  name: cleanName,
                  type: cleanType,
                  url: cleanUrl,
                  imageUrl: cleanType === 'VRM' 
                    ? 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=300&auto=format&fit=crop'
                    : 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?q=80&w=300&auto=format&fit=crop',
                  desc: `User imported ${cleanType} model located at ${cleanUrl}.`
                };

                const updated = [...allModelsList, newModel];
                setAllModelsList(updated);

                // Save only imported ones
                const onlyImported = updated.filter(m => m.id.startsWith('imported_'));
                localStorage.setItem('yuihime_cached_models_v2', JSON.stringify(onlyImported));

                setSelectedModelInSelector(newModel);
                setCustomModelUrlInput('');
                setCustomModelNameInput('');
                setShowImportForm(false);
                alert(`Successfully imported model ${cleanName}!`);
              }}
              className="bg-black/40 border border-white/5 rounded-2xl p-4 mb-6 space-y-4 overflow-hidden relative z-10 animate-fade-in"
            >
              <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 font-mono">Import Custom Model Specification</h4>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-zinc-400 font-mono">Model Name</label>
                  <input 
                    type="text"
                    value={customModelNameInput}
                    onChange={(e) => setCustomModelNameInput(e.target.value)}
                    placeholder="e.g. Hiyori Alternate"
                    className="w-full text-xs bg-black/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-cyan-400 transition-colors font-sans"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-zinc-400 font-mono">Model Type</label>
                  <select
                    value={customModelTypeInput}
                    onChange={(e) => setCustomModelTypeInput(e.target.value as any)}
                    className="w-full text-xs bg-black/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-cyan-400 transition-colors font-sans cursor-pointer"
                  >
                    <option value="Live2D">Live2D Cubism (.model3.json)</option>
                    <option value="VRM">3D Avatar (.vrm file)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-zinc-400 font-mono">Model Config Manifest or File URL</label>
                <input 
                  type="text"
                  required
                  value={customModelUrlInput}
                  onChange={(e) => setCustomModelUrlInput(e.target.value)}
                  placeholder="https://cdn.example.com/assets/my-model.model3.json"
                  className="w-full text-xs bg-black/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-cyan-400 transition-colors font-mono"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-1">
                <button 
                  type="button"
                  onClick={() => setShowImportForm(false)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 text-xs text-zinc-300 rounded-lg cursor-pointer font-sans"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-cyan-400 text-black font-bold text-xs rounded-lg cursor-pointer hover:bg-cyan-300 transition-colors font-sans"
                >
                  Add to Library
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Model List Cards Carousel Slider */}
        <div className="relative z-10 flex items-center gap-5 overflow-x-auto py-6 px-1 scrollbar-thin snap-x justify-start select-none">
          {allModelsList.map((model) => {
            const isSelected = selectedModelInSelector?.id === model.id || selectedModelInSelector?.url === model.url;
            return (
              <div
                key={model.id}
                onClick={() => setSelectedModelInSelector(model)}
                className={`w-[200px] sm:w-[220px] shrink-0 h-[280px] rounded-3xl cursor-pointer relative overflow-hidden transition-all duration-300 group snap-start border ${
                  isSelected 
                    ? 'border-cyan-400 shadow-[0_0_30px_rgba(34,211,238,0.25)] scale-[1.02]' 
                    : 'border-white/5 hover:border-white/20 bg-white/[0.02]'
                }`}
              >
                {/* Background Image Banner */}
                <div 
                  className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110 opacity-70 group-hover:opacity-100"
                  style={{ backgroundImage: `url(${model.imageUrl})` }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0e0e14] via-[#0e0e14]/40 to-transparent" />

                {/* Selected Check Badge */}
                {isSelected && (
                  <div className="absolute top-4 right-4 bg-cyan-400 text-black p-1.5 rounded-full shadow-lg">
                    <Check size={14} className="stroke-[3]" />
                  </div>
                )}

                {/* Outer label card elements */}
                <div className="absolute bottom-4 left-4 right-4 text-left pointer-events-none">
                  <h4 className="text-sm font-bold text-white truncate font-sans">{model.name}</h4>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="px-1.5 py-0.5 bg-cyan-400/20 border border-cyan-400/30 text-[8.5px] uppercase font-mono font-black tracking-wider text-cyan-300 rounded">
                      {model.type}
                    </span>
                    <span className="text-[9px] text-zinc-400 truncate max-w-[110px] font-mono">
                      {model.url.split('/').pop()?.split('?')[0]}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Model Description Details */}
        {selectedModelInSelector && (
          <div className="mt-4 p-4.5 bg-white/[0.02] border border-white/5 rounded-2xl relative z-10 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#0ea5e9] font-mono">Selected Model Profile</span>
              <span className="text-[9px] font-mono text-zinc-500 bg-white/5 px-2 py-0.5 rounded border border-white/[0.02] uppercase font-bold">
                {selectedModelInSelector.type} Framework
              </span>
            </div>
            <h4 className="text-white font-bold text-sm font-sans">{selectedModelInSelector.name}</h4>
            <p className="text-zinc-400 text-xs font-sans leading-relaxed">{selectedModelInSelector.desc}</p>
            <div className="pt-2 text-[10px] font-mono text-zinc-500 truncate flex items-center gap-1.5">
              <span className="text-zinc-600 font-bold">MANIFEST_PATH:</span>
              <span className="text-cyan-400/80 bg-black/40 px-2 py-1 rounded border border-white/5">{selectedModelInSelector.url}</span>
            </div>
          </div>
        )}

        {/* Action Confirm Button */}
        <div className="grid grid-cols-2 gap-3.5 mt-6 relative z-10 pt-4 border-t border-white/5 font-sans">
          <button
            type="button"
            onClick={() => setIsModelSelectorOpen(false)}
            className="py-3.5 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 text-white font-bold text-xs uppercase tracking-wider rounded-2xl transition-all cursor-pointer font-sans text-center select-none"
          >
            Close Back
          </button>
          <button
            type="button"
            onClick={() => {
              if (selectedModelInSelector) {
                updateAvatar('modelUrl', selectedModelInSelector.url);
                setIsModelSelectorOpen(false);
                alert(`Character active model successfully set to: ${selectedModelInSelector.name}.`);
              }
            }}
            className="py-3.5 bg-cyan-400 hover:bg-cyan-300 text-black font-black text-xs uppercase tracking-wider rounded-2xl transition-all duration-300 cursor-pointer text-center select-none shadow-[0_0_15px_rgba(34,211,238,0.3)] active:scale-[0.98]"
          >
            Confirm Active Model
          </button>
        </div>

      </motion.div>
    </div>
  );
};
