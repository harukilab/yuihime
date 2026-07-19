import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus } from 'lucide-react';

interface Scene {
  id: string;
  title: string;
  url: string;
}

interface BackgroundSelectorDrawerProps {
  isBgDrawerOpen: boolean;
  setIsBgDrawerOpen: (val: boolean) => void;
  drawerBackdrop: string;
  setDrawerBackdrop: (val: string) => void;
  drawerCustomImgUrl: string;
  setDrawerCustomImgUrl: (val: string) => void;
  uploadedScenes: Scene[];
  setUploadedScenes: (scenes: Scene[]) => void;
  handleSelectBackdrop: (mode: string) => void;
  handleCustomUrlChange: (url: string) => void;
  addLog: (role: 'user' | 'agent', text: string) => void;
}

export const BackgroundSelectorDrawer: React.FC<BackgroundSelectorDrawerProps> = ({
  isBgDrawerOpen,
  setIsBgDrawerOpen,
  drawerBackdrop,
  setDrawerBackdrop,
  drawerCustomImgUrl,
  setDrawerCustomImgUrl,
  uploadedScenes = [],
  setUploadedScenes,
  handleSelectBackdrop,
  handleCustomUrlChange,
  addLog
}) => {
  return (
    <AnimatePresence>
      {isBgDrawerOpen && (
        <>
          {/* Backdrop click cover */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsBgDrawerOpen(false)}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 cursor-pointer"
          />

          {/* Bottom sheet drawer */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            className="fixed inset-x-0 bottom-0 max-h-[92vh] rounded-t-[32px] bg-[#0d0d14]/98 border-t border-white/10 p-6 pb-8 flex flex-col space-y-5 shadow-[0_-20px_50px_rgba(0,0,0,0.8)] z-50 overflow-hidden font-sans text-white focus:outline-none"
          >
            {/* Grab handle bar */}
            <div className="w-12 h-1 bg-zinc-700/60 rounded-full mx-auto cursor-pointer" onClick={() => setIsBgDrawerOpen(false)} />

            {/* Bottom Sheet Header */}
            <div className="flex items-center justify-between text-left">
              <div className="flex flex-col">
                <span className="text-xs uppercase tracking-[0.2em] font-mono text-amber-500 font-extrabold">OBS BACKDROP SCENE REGISTRY</span>
                <span className="text-sm font-black text-white mt-0.5 tracking-wide">Yuihime Stage Background</span>
              </div>
              <button
                onClick={() => setIsBgDrawerOpen(false)}
                className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Scrollable Gallery */}
            <div className="flex-1 overflow-y-auto space-y-5 pr-1.5 custom-scrollbar text-left">
              {/* Visual Options Grid */}
              <div className="grid grid-cols-2 gap-4">
                {/* Wave Backdrop */}
                <div
                  onClick={() => {
                    setDrawerBackdrop('matrix');
                  }}
                  className={`group relative rounded-2xl overflow-hidden cursor-pointer border p-3.5 space-y-3 transition-all duration-300 bg-black/40 ${
                    drawerBackdrop === 'matrix'
                      ? 'border-[#0ea5e9] shadow-[0_0_15px_rgba(14,165,233,0.2)] ring-1 ring-[#0ea5e9]/50'
                      : 'border-white/5 hover:border-white/10 hover:bg-black/60'
                  }`}
                >
                  <div className="aspect-[16/10] w-full rounded-xl bg-[#080812] relative overflow-hidden border border-white/5 flex items-center justify-center">
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(14,165,233,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(14,165,233,0.06)_1px,transparent_1px)] bg-[size:10px_10px] opacity-40" />
                    <div className="w-16 h-8 bg-gradient-to-t from-cyan-500/10 to-transparent blur-md rounded-full absolute bottom-[-4px]" />
                    <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest font-bold">Wave</span>
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-[12px] font-black text-white tracking-wide">Colorful Wave</h4>
                    <p className="text-[9.5px] text-zinc-400 font-medium leading-normal">Animated wave on cross grid</p>
                  </div>
                </div>

                {/* Transparent Backdrop */}
                <div
                  onClick={() => {
                    setDrawerBackdrop('transparent');
                  }}
                  className={`group relative rounded-2xl overflow-hidden cursor-pointer border p-3.5 space-y-3 transition-all duration-300 bg-black/40 ${
                    drawerBackdrop === 'transparent'
                      ? 'border-[#0ea5e9] shadow-[0_0_15px_rgba(14,165,233,0.2)] ring-1 ring-[#0ea5e9]/50'
                      : 'border-white/5 hover:border-white/10 hover:bg-black/60'
                  }`}
                >
                  <div className="aspect-[16/10] w-full rounded-xl relative overflow-hidden border border-white/5 flex items-center justify-center"
                       style={{
                         backgroundImage: 'linear-gradient(45deg, #16161c 25%, transparent 25%), linear-gradient(-45deg, #16161c 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #16161c 75%), linear-gradient(-45deg, transparent 75%, #16161c 75%)',
                         backgroundSize: '8px 8px',
                         backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
                         backgroundColor: '#0a0a0f'
                       }}
                  >
                    <span className="text-[10px] font-mono text-[#0ea5e9] uppercase tracking-widest font-bold bg-black/40 px-2 py-0.5 rounded-lg border border-white/5">Alpha</span>
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-[12px] font-black text-white tracking-wide">Transparent</h4>
                    <p className="text-[9.5px] text-zinc-400 font-medium leading-normal">Reveal native background layers behind</p>
                  </div>
                </div>

                {/* Neon Backdrop */}
                <div
                  onClick={() => {
                    setDrawerBackdrop('neon');
                  }}
                  className={`group relative rounded-2xl overflow-hidden cursor-pointer border p-3.5 space-y-3 transition-all duration-300 bg-black/40 ${
                    drawerBackdrop === 'neon'
                      ? 'border-[#0ea5e9] shadow-[0_0_15px_rgba(14,165,233,0.2)] ring-1 ring-[#0ea5e9]/50'
                      : 'border-white/5 hover:border-white/10 hover:bg-black/60'
                  }`}
                >
                  <div className="aspect-[16/10] w-full rounded-xl bg-gradient-to-br from-[#1b092e] to-[#050209] relative overflow-hidden border border-white/5 flex items-center justify-center">
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(236,72,153,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(236,72,153,0.05)_1px,transparent_1px)] bg-[size:12px_12px] opacity-40" />
                    <span className="text-[10px] font-mono text-pink-400 uppercase tracking-widest font-bold">Neon</span>
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-[12px] font-black text-white tracking-wide">Neon Glow</h4>
                    <p className="text-[9.5px] text-zinc-400 font-medium leading-normal">Cybernetic pink grid array</p>
                  </div>
                </div>

                {/* Green Screen Backdrop */}
                <div
                  onClick={() => {
                    setDrawerBackdrop('chroma-green');
                  }}
                  className={`group relative rounded-2xl overflow-hidden cursor-pointer border p-3.5 space-y-3 transition-all duration-300 bg-black/40 ${
                    drawerBackdrop === 'chroma-green'
                      ? 'border-[#0ea5e9] shadow-[0_0_15px_rgba(14,165,233,0.2)] ring-1 ring-[#0ea5e9]/50'
                      : 'border-white/5 hover:border-white/10 hover:bg-black/60'
                  }`}
                >
                  <div className="aspect-[16/10] w-full rounded-xl bg-[#00ff00] relative overflow-hidden border border-white/5 flex items-center justify-center">
                    <span className="text-[10px] font-mono text-black uppercase tracking-widest font-bold bg-white/70 px-1.5 py-0.5 rounded">Chroma</span>
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-[12px] font-black text-white tracking-wide">Green Screen</h4>
                    <p className="text-[9.5px] text-zinc-400 font-medium leading-normal">Chroma key green for streaming</p>
                  </div>
                </div>

                {/* Blue Screen Backdrop */}
                <div
                  onClick={() => {
                    setDrawerBackdrop('chroma-blue');
                  }}
                  className={`group relative rounded-2xl overflow-hidden cursor-pointer border p-3.5 space-y-3 transition-all duration-300 bg-black/40 ${
                    drawerBackdrop === 'chroma-blue'
                      ? 'border-[#0ea5e9] shadow-[0_0_15px_rgba(14,165,233,0.2)] ring-1 ring-[#0ea5e9]/50'
                      : 'border-white/5 hover:border-white/10 hover:bg-black/60'
                  }`}
                >
                  <div className="aspect-[16/10] w-full rounded-xl bg-[#0000ff] relative overflow-hidden border border-white/5 flex items-center justify-center">
                    <span className="text-[10px] font-mono text-white uppercase tracking-widest font-bold bg-black/40 px-1.5 py-0.5 rounded">Chroma</span>
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-[12px] font-black text-white tracking-wide">Blue Screen</h4>
                    <p className="text-[9.5px] text-zinc-400 font-medium leading-normal">Chroma key blue for streaming</p>
                  </div>
                </div>

                {/* Pure Black Backdrop */}
                <div
                  onClick={() => {
                    setDrawerBackdrop('black');
                  }}
                  className={`group relative rounded-2xl overflow-hidden cursor-pointer border p-3.5 space-y-3 transition-all duration-300 bg-black/40 ${
                    drawerBackdrop === 'black'
                      ? 'border-[#0ea5e9] shadow-[0_0_15px_rgba(14,165,233,0.2)] ring-1 ring-[#0ea5e9]/50'
                      : 'border-white/5 hover:border-white/10 hover:bg-black/60'
                  }`}
                >
                  <div className="aspect-[16/10] w-full rounded-xl bg-[#000000] relative overflow-hidden border border-white/5 flex items-center justify-center">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest font-bold">Slate</span>
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-[12px] font-black text-white tracking-wide">Pure Black</h4>
                    <p className="text-[9.5px] text-zinc-400 font-medium leading-normal">Deep slate black backdrop</p>
                  </div>
                </div>

                {/* Standard and uploaded scenes */}
                {[
                  {
                    id: "japanese-gothic-castle",
                    title: "Istana Mawar Pastel",
                    url: "https://images.unsplash.com/photo-1578301978693-85fa9c0320b9?auto=format&fit=crop&w=600&q=80"
                  },
                  {
                    id: "aesthetic_bedroom",
                    title: "Aesthetic bedroom loft",
                    url: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=600&q=80"
                  },
                  {
                    id: "cute_streaming_room",
                    title: "Cute streaming room",
                    url: "https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?auto=format&fit=crop&w=600&q=80"
                  },
                  {
                    id: "cozy_tea_corner",
                    title: "Cozy tea corner in garden",
                    url: "https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=600&q=80"
                  },
                  {
                    id: "cyberpunk_neon_deck",
                    title: "Cyberpunk neon deck",
                    url: "https://images.unsplash.com/photo-1507608869274-d3177c8bb4c7?auto=format&fit=crop&w=600&q=80"
                  },
                  {
                    id: "zen_tatami_layout",
                    title: "Zen tatami layout",
                    url: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=600&q=80"
                  },
                  {
                    id: "lofi_cozy_cafe",
                    title: "Lo-fi cozy cafe",
                    url: "https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=600&q=80"
                  },
                  ...uploadedScenes
                ].map((scene) => {
                  const isSelected = drawerBackdrop === 'custom' && drawerCustomImgUrl === scene.url;
                  return (
                    <div
                      key={scene.id}
                      onClick={() => {
                        setDrawerBackdrop('custom');
                        setDrawerCustomImgUrl(scene.url);
                      }}
                      className={`group relative rounded-2xl overflow-hidden cursor-pointer border p-3.5 space-y-3 transition-all duration-300 bg-black/40 ${
                        isSelected
                          ? 'border-[#0ea5e9] shadow-[0_0_15px_rgba(14,165,233,0.2)] ring-1 ring-[#0ea5e9]/50'
                          : 'border-white/5 hover:border-white/10 hover:bg-black/60'
                      }`}
                    >
                      <div className="aspect-[16/10] w-full rounded-xl relative overflow-hidden border border-white/5">
                        <img
                          src={scene.url}
                          alt={scene.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      </div>
                      <div className="space-y-0.5">
                        <h4 className="text-[12px] font-black text-white tracking-wide line-clamp-1 truncate">{scene.title}</h4>
                        <p className="text-[9.5px] text-zinc-400 font-medium leading-normal">Cozy scenic background</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Upload controls */}
              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => document.getElementById('drawer-file-uploader-modular')?.click()}
                  className="flex-1 py-3.5 max-h-[46px] bg-[#0f1f2e]/75 hover:bg-[#162f46]/95 text-[#3ea6ff] border border-[#1e3f5f]/50 hover:border-[#2e5f8f] text-[11px] font-extrabold uppercase tracking-widest rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 font-sans"
                >
                  <Plus size={14} className="stroke-[2.5]" /> Upload Image
                </button>
                <input
                  id="drawer-file-uploader-modular"
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      const b64 = reader.result as string;
                      const newScene = {
                        id: `uploaded_${Date.now()}`,
                        title: file.name.split('.')[0] || "Custom Backdrop",
                        url: b64
                      };
                      const updated = [newScene, ...uploadedScenes];
                      setUploadedScenes(updated);
                      localStorage.setItem("yuihime_uploaded_scenes_v1", JSON.stringify(updated));
                      setDrawerBackdrop('custom');
                      setDrawerCustomImgUrl(b64);
                    };
                    reader.readAsDataURL(file);
                  }}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => {
                    const url = prompt("Masukkan URL gambar background kustom:");
                    if (url) {
                      const newScene = {
                        id: `uploaded_${Date.now()}`,
                        title: "Kustom URL Backdrop",
                        url: url
                      };
                      const updated = [newScene, ...uploadedScenes];
                      setUploadedScenes(updated);
                      localStorage.setItem("yuihime_uploaded_scenes_v1", JSON.stringify(updated));
                      setDrawerBackdrop('custom');
                      setDrawerCustomImgUrl(url);
                    }
                  }}
                  className="py-3.5 px-4 max-h-[46px] bg-black/40 hover:bg-black/60 text-zinc-300 border border-white/5 hover:border-white/10 text-[11px] font-extrabold uppercase tracking-widest rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 font-sans"
                >
                  <Plus size={14} /> Add Custom URL
                </button>
              </div>

              {/* Live Preview Container */}
              <div className="space-y-2 bg-[#121218]/40 border border-white/5 p-4 rounded-2xl">
                <span className="text-[10px] uppercase font-mono tracking-widest text-zinc-400 font-semibold block">Live Preview Window</span>
                <div className="aspect-[16/9] w-full rounded-xl relative overflow-hidden border border-white/10 flex items-center justify-center"
                     style={{
                       backgroundColor: drawerBackdrop === 'transparent' ? 'transparent' :
                                        drawerBackdrop === 'chroma-green' ? '#00ff00' :
                                        drawerBackdrop === 'chroma-blue' ? '#0000ff' :
                                        drawerBackdrop === 'chroma-cyan' ? '#00ffff' :
                                        drawerBackdrop === 'black' ? '#000000' : '#080808',
                       backgroundImage: drawerBackdrop === 'custom' && drawerCustomImgUrl ? `url(${drawerCustomImgUrl})` :
                                        drawerBackdrop === 'neon' ? 'radial-gradient(circle at center, #1b092e 0%, #050209 100%)' : undefined,
                       backgroundSize: 'cover',
                       backgroundPosition: 'center',
                       backgroundRepeat: 'no-repeat'
                     }}
                >
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    {drawerBackdrop === 'neon' && (
                      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(236,72,153,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(236,72,153,0.05)_1px,transparent_1px)] bg-[size:10px_10px]" />
                    )}
                    {drawerBackdrop === 'matrix' && (
                      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(14,165,233,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(14,165,233,0.04)_1px,transparent_1px)] bg-[size:15px_15px] opacity-40" />
                    )}
                    <span className="text-[11px] uppercase tracking-widest text-white/50 bg-black/70 py-1 px-3 rounded-xl border border-white/5 font-mono">
                      {drawerBackdrop.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Use this background button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  handleSelectBackdrop(drawerBackdrop);
                  if (drawerBackdrop === 'custom') {
                    handleCustomUrlChange(drawerCustomImgUrl);
                  }
                  setIsBgDrawerOpen(false);
                  addLog('agent', `[SYSTEM] Mengganti background lingkungan batin Yuihime menjadi [${drawerBackdrop.toUpperCase()}].`);
                }}
                className="w-full py-4 bg-[#0ea5e9] hover:bg-[#0284c7] text-[#000] font-black text-xs uppercase tracking-widest rounded-2xl transition-all cursor-pointer shadow-lg hover:shadow-cyan-500/10"
              >
                Use this background
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
