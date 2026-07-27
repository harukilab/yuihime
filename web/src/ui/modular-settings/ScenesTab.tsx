import React from 'react';
import { Image as ImageIcon, ChevronRight, Upload, Check } from 'lucide-react';

interface ScenesTabProps {
  selectedBackdrop: string;
  customBdropUrl: string;
  galleryScenes: Array<{ id: string; title: string; url: string }>;
  handleUploadToGallery: (e: React.ChangeEvent<HTMLInputElement>) => void;
  syncBackdropLocal: (mode: string) => void;
  syncBdropUrlLocal: (url: string) => void;
}

export const ScenesTab: React.FC<ScenesTabProps> = ({
  selectedBackdrop,
  customBdropUrl,
  galleryScenes,
  handleUploadToGallery,
  syncBackdropLocal,
  syncBdropUrlLocal,
}) => {
  return (
    <div className="space-y-6 animate-fade-in font-sans">
      {/* Warning Banner */}
      <div className="bg-[#5c2514]/40 border border-[#8f3e24]/30 rounded-2xl p-4 text-[12px] text-[#f7d6cc] font-medium leading-relaxed font-sans">
        Setting it here will set it as the default for the currently active character.
      </div>

      {/* Primary Card: Active Character Background */}
      <div className="bg-[#0e0e14]/55 border border-white/5 rounded-3xl p-5 space-y-5">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center gap-2.5">
            <ImageIcon className="text-[#0ea5e9]" size={16} />
            <span className="text-sm font-bold text-white tracking-wide">Active Character Background</span>
          </div>
          {/* Chevron-down indicates expanded panel */}
          <ChevronRight className="text-zinc-500 rotate-90" size={16} />
        </div>

        <div className="space-y-4">
          {/* Upload to Gallery Button */}
          <div>
            <button
              type="button"
              onClick={() => document.getElementById('scenes-file-uploader')?.click()}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#0f1f2e]/70 hover:bg-[#162f46]/95 text-[#3ea6ff] border border-[#1e3f5f]/60 hover:border-[#2e5f8f] text-[11px] font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-lg font-sans"
            >
              <Upload size={14} className="stroke-[2.5]" /> Upload to Gallery
            </button>
            <input
              id="scenes-file-uploader"
              type="file"
              accept="image/*"
              onChange={handleUploadToGallery}
              className="hidden"
            />
          </div>

          {/* Scenes Gallery Grid */}
          <div className="grid grid-cols-2 gap-4">
            {galleryScenes.map((scene) => {
              const isActive = selectedBackdrop === 'custom' && customBdropUrl === scene.url;
              return (
                <div
                  key={scene.id}
                  onClick={() => {
                    syncBackdropLocal('custom');
                    syncBdropUrlLocal(scene.url);
                  }}
                  className={`group relative aspect-square rounded-2xl overflow-hidden cursor-pointer border transition-all duration-300 ${
                    isActive 
                      ? 'border-[#0ea5e9]/80 shadow-[0_0_15px_rgba(14,165,233,0.25)] ring-2 ring-[#0ea5e9]/30' 
                      : 'border-white/5 hover:border-white/10'
                  }`}
                >
                  {/* Scene Image */}
                  <img
                    src={scene.url}
                    alt={scene.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  
                  {/* Active Indicator Checkmark */}
                  {isActive && (
                    <div className="absolute top-2.5 right-2.5 p-1 bg-[#0ea5e9] text-black rounded-full shadow-lg z-10">
                      <Check size={11} className="stroke-[3]" />
                    </div>
                  )}
                  
                  {/* Label Overlay */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent p-3 pt-6 flex items-end">
                    <p className="text-[10px] text-zinc-100 font-semibold leading-tight line-clamp-1 truncate w-full">
                      {scene.title}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Info Tip Block */}
      <div className="bg-[#142318]/40 border border-[#1e3b24]/35 rounded-2xl p-4">
        <h5 className="text-[10px] uppercase font-mono tracking-widest text-[#62c575] font-bold mb-1">
          Tip!
        </h5>
        <p className="text-[11px] text-[#afd6b7] leading-relaxed">
          Using a square image will leverage <strong className="font-bold text-white">cover cropping</strong> in portrait mode, focusing on the center of the scene.
        </p>
      </div>

      {/* Collapsible Section for Solid / Advanced Backdrops */}
      <div className="bg-[#0e0e14]/40 border border-white/5 rounded-2xl p-5 space-y-4">
        <div>
          <h5 className="text-xs font-bold text-white tracking-wide">Advanced Backdrop Calibration</h5>
          <p className="text-[10px] text-zinc-500 mt-0.5">Configure chromakey screens or custom feed inputs</p>
        </div>

        <div className="grid grid-cols-2 shadow gap-2.5">
          {['matrix', 'neon', 'chroma-green', 'chroma-blue', 'black', 'custom'].map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => syncBackdropLocal(mode)}
              className={`py-3 text-[10px] font-mono border rounded-xl transition-all cursor-pointer uppercase ${
                selectedBackdrop === mode 
                  ? 'bg-[#0ea5e9]/10 border-[#0ea5e9]/40 text-[#0ea5e9] font-bold shadow' 
                  : 'bg-black/35 border-white/5 text-white/45 hover:border-white/10'
              }`}
            >
              {mode === 'chroma-green' ? 'Green Screen' : mode === 'chroma-blue' ? 'Blue Screen' : mode}
            </button>
          ))}
        </div>

        {selectedBackdrop === 'custom' && (
          <div className="pt-3 border-t border-white/5 space-y-2">
            <label className="text-[9px] uppercase font-mono tracking-widest text-white/40 block">Custom Wallpaper Image URL</label>
            <input 
              type="text" 
              value={customBdropUrl}
              onChange={(e) => syncBdropUrlLocal(e.target.value)}
              placeholder="https://images.unsplash.com/photo-example.jpg"
              className="w-full text-xs font-mono bg-black/75 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>
        )}
      </div>
    </div>
  );
};
