import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, Upload, Link, FileArchive, Loader2 } from 'lucide-react';
import { LockedSlider } from '../../components/LockedSlider';

interface ModelItem {
  id: string;
  name: string;
  type: string;
  url: string;
  imageUrl: string;
  desc: string;
}

interface ModelsTabProps {
  settings: any;
  allModelsList: ModelItem[];
  setAllModelsList: React.Dispatch<React.SetStateAction<ModelItem[]>>;
  updateAvatar: (field: string, val: any) => void;
}

export const ModelsTab: React.FC<ModelsTabProps> = ({
  settings,
  allModelsList,
  setAllModelsList,
  updateAvatar,
}) => {
  const [isModelSelectorOpen, setIsModelSelectorOpen] = React.useState(false);
  const [selectedModelInSelector, setSelectedModelInSelector] = React.useState<ModelItem | null>(null);
  const [showImportForm, setShowImportForm] = React.useState(false);

  // Import form inputs
  const [customModelUrlInput, setCustomModelUrlInput] = React.useState('');
  const [customModelNameInput, setCustomModelNameInput] = React.useState('');
  const [customModelTypeInput, setCustomModelTypeInput] = React.useState<'Live2D' | 'VRM'>('Live2D');

  // ZIP Import State variables
  const [importMethod, setImportMethod] = React.useState<'zip' | 'url'>('zip');
  const [isDragging, setIsDragging] = React.useState(false);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.zip')) {
        setSelectedFile(file);
        setUploadError(null);
      } else {
        setUploadError("Invalid file format. Please upload a .zip file.");
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.zip')) {
        setSelectedFile(file);
        setUploadError(null);
      } else {
        setUploadError("Invalid file format. Please upload a .zip file.");
      }
    }
  };

  const handleZipUpload = async () => {
    if (!selectedFile) {
      setUploadError("Please select a model ZIP file first.");
      return;
    }
    
    setIsUploading(true);
    setUploadError(null);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const result = event.target?.result;
          if (typeof result !== 'string') {
            throw new Error("Failed to read file.");
          }
          const base64 = result.split(',')[1];
          
          const response = await fetch('/api/models/import-zip', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              base64,
              fileName: selectedFile.name,
              modelName: customModelNameInput.trim() || undefined
            }),
          });

          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || "Failed to upload model.");
          }

          const newModel: ModelItem = data.model;
          const updated = [...allModelsList, newModel];
          setAllModelsList(updated);

          const onlyImported = updated.filter(m => m.id.startsWith('imported_'));
          localStorage.setItem('yuihime_cached_models_v2', JSON.stringify(onlyImported));

          setSelectedModelInSelector(newModel);
          setCustomModelNameInput('');
          setSelectedFile(null);
          setShowImportForm(false);
        } catch (err: any) {
          setUploadError(err.message || "Failed to import ZIP file.");
        } finally {
          setIsUploading(false);
        }
      };

      reader.onerror = () => {
        setUploadError("Failed to read file.");
        setIsUploading(false);
      };

      reader.readAsDataURL(selectedFile);
    } catch (err: any) {
      setUploadError(err.message || "Failed to import ZIP file.");
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6 bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl">
      {/* Top Info Box */}
      <div className="p-4 bg-teal-500/10 border border-teal-500/20 text-teal-400 rounded-2xl text-[11px] leading-relaxed font-sans">
        <p className="font-bold uppercase tracking-wider mb-1 font-mono text-[9px]">Platform Support Manifest</p>
        We support multi-axial 2D Live2D models (.zip packs) and 3D VRM models (.vrm files) synchronously inside the web engine runtime.
      </div>

      {/* Model Selector Trigger Button */}
      <div className="space-y-2 font-sans">
        <span className="text-[10px] uppercase font-mono tracking-widest text-white/40">Active Character Avatar</span>
        <button 
          type="button"
          onClick={() => {
            const curUrl = settings.avatar?.modelUrl || 'hiyori';
            const matchedModel = allModelsList.find(m => m.id === curUrl || m.url === curUrl);
            setSelectedModelInSelector(matchedModel || allModelsList[0] || null);
            setIsModelSelectorOpen(true);
          }}
          className="w-full py-4 bg-gradient-to-r from-teal-500/15 to-cyan-500/15 hover:from-teal-500/25 hover:to-cyan-500/25 border border-teal-500/35 text-teal-300 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-between px-4 shadow-[0_0_15px_rgba(20,184,166,0.1)] hover:shadow-[0_0_18px_rgba(20,184,166,0.15)] font-sans"
        >
          <span>Select Active Model...</span>
          <span className="px-3 py-1 bg-cyan-400 text-black text-[9.5px] font-black rounded-lg tracking-normal uppercase font-sans">
            {(allModelsList.find(m => m.id === (settings.avatar?.modelUrl || 'hiyori') || m.url === (settings.avatar?.modelUrl || 'hiyori'))?.name) || 'Hiyori (Pro)'}
          </span>
        </button>
      </div>

      {/* Linear camera offset sliders */}
      <div className="space-y-4 pt-4 border-t border-white/5 font-sans">
        <h4 className="text-[10px] uppercase font-mono tracking-widest text-white/40 font-bold">Camera Calibration Offset</h4>
        
        <LockedSlider
          value={settings.avatar?.scale || 1.2}
          onChange={(val) => updateAvatar('scale', val)}
          min={0.5}
          max={2.5}
          step={0.05}
          label="Scale Factor"
          description="Adjust physical presentation size scale of target Live2D / 3D model."
          themeColor="amber"
        />

        <LockedSlider
          value={settings.avatar?.xOffset || 0}
          onChange={(val) => updateAvatar('xOffset', val)}
          min={-300}
          max={300}
          step={1}
          label="Horizontal axis (X)"
          description="Move camera viewport left or right."
          themeColor="cyan"
        />

        <LockedSlider
          value={settings.avatar?.yOffset || 0}
          onChange={(val) => updateAvatar('yOffset', val)}
          min={-300}
          max={300}
          step={1}
          label="Vertical axis (Y)"
          description="Move camera viewport up or down."
          themeColor="emerald"
        />

        <div className="flex items-center justify-between p-4 bg-[#07070a]/45 border border-white/5 rounded-xl pt-4 mt-4">
          <div className="space-y-0.5">
            <span className="text-xs font-bold text-white tracking-wide">Disable Gaze Mouse Tracking</span>
            <p className="text-[10px] text-zinc-400 font-sans leading-relaxed">
              Disable the movement of character eyes and head tracking your mouse cursor.
            </p>
          </div>
          <button
            type="button"
            onClick={() => updateAvatar('disableMouseTracking', !settings.avatar?.disableMouseTracking)}
            className={`w-12 h-6 rounded-full p-1 transition-all duration-300 relative ${
              settings.avatar?.disableMouseTracking ? 'bg-teal-500' : 'bg-zinc-800'
            }`}
          >
            <div
              className={`w-4 h-4 bg-white rounded-full shadow-md transition-all duration-300 ${
                settings.avatar?.disableMouseTracking ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Modal Backdrop / Overlay Portal directly inside the component for perfect encapsulation */}
      <AnimatePresence>
        {isModelSelectorOpen && (
          <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-[#0b0b10] border border-white/10 rounded-[32px] p-6 sm:p-8 max-w-4xl w-full text-white shadow-[0_20px_50px_rgba(0,0,0,0.8)] relative overflow-hidden flex flex-col font-sans"
            >
              <div className="absolute -top-12 -right-12 w-48 h-48 bg-cyan-400/10 blur-[80px] rounded-full pointer-events-none" />
              <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-teal-400/10 blur-[80px] rounded-full pointer-events-none" />

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
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="bg-[#0f0f16]/90 border border-white/10 rounded-2xl p-5 mb-6 space-y-4 overflow-hidden relative z-10 animate-fade-in font-sans"
                  >
                    <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 font-mono">Import Custom Model</h4>
                      {/* Tab Selectors */}
                      <div className="flex gap-1.5 p-1 bg-black/60 rounded-xl border border-white/5">
                        <button
                          type="button"
                          onClick={() => { setImportMethod('zip'); setUploadError(null); }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase font-mono cursor-pointer transition-all ${
                            importMethod === 'zip' 
                              ? 'bg-cyan-400 text-black shadow-md' 
                              : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          <FileArchive size={12} />
                          ZIP File
                        </button>
                        <button
                          type="button"
                          onClick={() => { setImportMethod('url'); setUploadError(null); }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase font-mono cursor-pointer transition-all ${
                            importMethod === 'url' 
                              ? 'bg-cyan-400 text-black shadow-md' 
                              : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          <Link size={12} />
                          Remote URL
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3.5">
                      {/* Common Input: Model Name */}
                      <div className="space-y-1">
                        <label className="text-[9px] uppercase tracking-wider text-zinc-400 font-mono">Model Alias Name (Optional)</label>
                        <input 
                          type="text"
                          value={customModelNameInput}
                          onChange={(e) => setCustomModelNameInput(e.target.value)}
                          placeholder="e.g. My Custom Avatar"
                          className="w-full text-xs bg-black/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-cyan-400 transition-colors font-sans"
                          disabled={isUploading}
                        />
                      </div>

                      {importMethod === 'zip' ? (
                        /* ZIP Drag and Drop File Input Area */
                        <div className="space-y-3">
                          <label className="text-[9px] uppercase tracking-wider text-zinc-400 font-mono">Upload ZIP Archive</label>
                          <div
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => !isUploading && fileInputRef.current?.click()}
                            className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                              isDragging 
                                ? 'border-cyan-400 bg-cyan-400/10' 
                                : selectedFile 
                                ? 'border-emerald-500/40 bg-emerald-500/5' 
                                : 'border-white/10 hover:border-white/20 bg-black/40 hover:bg-black/60'
                            }`}
                          >
                            <input 
                              type="file"
                              ref={fileInputRef}
                              onChange={handleFileChange}
                              accept=".zip"
                              className="hidden"
                              disabled={isUploading}
                            />
                            
                            {selectedFile ? (
                              <div className="space-y-2">
                                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto text-emerald-400">
                                  <FileArchive size={20} />
                                </div>
                                <div className="space-y-0.5">
                                  <p className="text-xs font-bold text-white truncate max-w-[280px]">{selectedFile.name}</p>
                                  <p className="text-[10px] font-mono text-zinc-400">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedFile(null);
                                  }}
                                  className="text-[10px] text-zinc-400 hover:text-rose-400 font-mono uppercase font-bold tracking-wider underline cursor-pointer select-none"
                                  disabled={isUploading}
                                >
                                  Clear File
                                </button>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <div className="w-10 h-10 rounded-full bg-cyan-400/10 flex items-center justify-center mx-auto text-cyan-400">
                                  <Upload size={18} />
                                </div>
                                <div className="space-y-1">
                                  <p className="text-xs font-bold text-zinc-300">Drag & drop your model ZIP pack here</p>
                                  <p className="text-[10px] text-zinc-500">or click to browse local computer</p>
                                </div>
                                <p className="text-[9px] text-zinc-600 font-mono uppercase tracking-wide">Supports Live2D (Cubism 2/3/4) & 3D VRM bundles</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        /* Remote URL Input Form Fields */
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                        </div>
                      )}

                      {/* Display validation/upload error messages */}
                      {uploadError && (
                        <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-[10px] leading-relaxed font-mono">
                          {uploadError}
                        </div>
                      )}

                      {/* Import action buttons */}
                      <div className="flex justify-end gap-2.5 pt-2 border-t border-white/5">
                        <button 
                          type="button"
                          onClick={() => {
                            setShowImportForm(false);
                            setSelectedFile(null);
                            setUploadError(null);
                          }}
                          className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 text-xs text-zinc-300 rounded-lg cursor-pointer font-sans"
                          disabled={isUploading}
                        >
                          Cancel
                        </button>
                        <button 
                          type="button"
                          onClick={() => {
                            if (importMethod === 'zip') {
                              handleZipUpload();
                            } else {
                              if (!customModelUrlInput) {
                                setUploadError("Please provide the model configuration URL (.json / .vrm)");
                                return;
                              }
                              const cleanUrl = customModelUrlInput.trim();
                              const cleanName = customModelNameInput.trim() || `Imp: ${cleanUrl.split('/').pop()?.split('?')[0] || 'Custom Model'}`;
                              const cleanType = customModelTypeInput;

                              const newModel: ModelItem = {
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

                              const onlyImported = updated.filter(m => m.id.startsWith('imported_'));
                              localStorage.setItem('yuihime_cached_models_v2', JSON.stringify(onlyImported));

                              setSelectedModelInSelector(newModel);
                              setCustomModelUrlInput('');
                              setCustomModelNameInput('');
                              setShowImportForm(false);
                            }
                          }}
                          className="px-4 py-2 bg-cyan-400 text-black font-bold text-xs rounded-lg cursor-pointer hover:bg-cyan-300 transition-colors font-sans flex items-center gap-1.5"
                          disabled={isUploading}
                        >
                          {isUploading ? (
                            <>
                              <Loader2 size={13} className="animate-spin" />
                              Extracting ZIP...
                            </>
                          ) : (
                            'Add to Library'
                          )}
                        </button>
                      </div>
                    </div>
                  </motion.div>
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
                      className={`min-w-[210px] max-w-[230px] aspect-[3/4.2] rounded-[24px] overflow-hidden relative cursor-pointer group transition-all duration-300 transform snap-center ${
                        isSelected 
                          ? 'ring-4 ring-cyan-400 scale-[1.03] shadow-[0_0_30px_rgba(34,211,238,0.45)] -translate-y-1' 
                          : 'ring-1 ring-white/10 opacity-70 hover:opacity-95 text-zinc-400'
                      }`}
                    >
                      <img 
                        src={model.imageUrl} 
                        alt={model.name}
                        className="w-full h-full object-cover select-none pointer-events-none group-hover:scale-105 transition-transform duration-500"
                        referrerPolicy="no-referrer"
                      />
                      
                      <div className="absolute inset-0 bg-gradient-to-t from-[#09090d]/90 via-black/30 to-transparent pointer-events-none" />

                      <div className="absolute top-4 left-4 pointer-events-auto">
                        {model.id.startsWith('imported_') ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Are you sure you want to permanently delete custom model "${model.name}"?`)) {
                                const updated = allModelsList.filter(m => m.id !== model.id);
                                setAllModelsList(updated);
                                const onlyImported = updated.filter(m => m.id.startsWith('imported_'));
                                localStorage.setItem('yuihime_cached_models_v2', JSON.stringify(onlyImported));
                                if (selectedModelInSelector?.id === model.id) {
                                  setSelectedModelInSelector(updated[0] || null);
                                }
                              }
                            }}
                            className="p-1.5 bg-black/60 hover:bg-rose-500 hover:text-white rounded-full text-zinc-400 transition-colors cursor-pointer flex items-center justify-center animate-fade-in"
                            title="Remove item"
                          >
                            <Trash2 size={13} />
                          </button>
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-[#0a0a0f]/85 border border-white/5 flex items-center justify-center text-zinc-400 hover:text-white transition-colors">
                            <span className="text-[14px] leading-none mb-1">• • •</span>
                          </div>
                        )}
                      </div>

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

              {selectedModelInSelector && (
                <div className="mt-4 p-4.5 bg-white/[0.02] border border-white/5 rounded-2xl relative z-10 space-y-1.5 max-h-[160px] overflow-y-auto">
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
                    }
                  }}
                  className="py-3.5 bg-cyan-400 hover:bg-cyan-300 text-black font-black text-xs uppercase tracking-wider rounded-2xl transition-all duration-300 cursor-pointer text-center select-none shadow-[0_0_15px_rgba(34,211,238,0.3)] active:scale-[0.98]"
                >
                  Confirm Active Model
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
