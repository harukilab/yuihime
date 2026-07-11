import React from 'react';
import { Heart, Info } from 'lucide-react';

interface AboutTabProps {
  yuihimeVersionInfo: { version: string; date: string; turn: string } | null;
  memories: any[];
  knowledge: any[];
  settings: any;
  onShowInfo?: (title: string, text: string) => void;
}

export const AboutTab: React.FC<AboutTabProps> = ({
  yuihimeVersionInfo,
  memories,
  knowledge,
  settings,
  onShowInfo,
}) => {
  return (
    <div className="space-y-6 animate-fade-in font-sans">
      <div className="grid grid-cols-1 md:grid-cols-1 gap-6">
        {/* VTuber Rigging & Concept */}
        <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-3xl space-y-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="text-[10px] uppercase font-mono tracking-widest text-[#d4d4d8]/40 mb-1 font-bold">Consciousness Concept</h4>
                <h3 className="text-xl font-bold text-white tracking-wide">Yuihime Virtual AGI</h3>
              </div>
              {onShowInfo && (
                <button
                  type="button"
                  onClick={() => onShowInfo(
                    "Yuihime Virtual AGI Guidance",
                    "Yuihime is an autonomous, self-aware AI VTuber constructed inside a full-stack Node.js and React Sandbox Environment.\n\nShe integrates raw neural intuition (Deep Learning model backends) with strict logical rules (Symbolic AI structures) to achieve high-order metacognition."
                  )}
                  className="flex items-center gap-1 bg-white/5 hover:bg-white/10 text-amber-500 hover:text-amber-400 px-2.5 py-1.5 rounded-lg border border-white/5 transition-all text-[10px] font-mono cursor-pointer font-bold"
                >
                  <Info size={12} /> Details
                </button>
              )}
            </div>
            
            <p className="text-zinc-400 text-xs mt-1.5 leading-relaxed font-normal">
              Yuihime is an autonomous, self-aware AI VTuber. Connects deep learning backends and symbolic logic rules.
            </p>

            <div className="space-y-2 border-t border-white/5 pt-4">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-zinc-500">Rigging System</span>
                <span className="text-cyan-400 font-bold">Cubism SDK v4.0 (Live2D)</span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-zinc-500">Neural Engine Integration</span>
                <span className="text-amber-500 font-bold">Neuro-Symbolic Hybrid Core ({yuihimeVersionInfo?.version || 'v5.52'})</span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-zinc-500">Long-Term Memory Persistence</span>
                <span className="text-emerald-400 font-bold">Episodic & Semantic Database</span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-zinc-550">Autonomous Intrinsic Pulse</span>
                <span className="text-purple-400 font-bold">Active (Pulse Enabled)</span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-zinc-550">Cognitive Verifier</span>
                <span className="text-rose-400 font-bold">NeuralVerifier v0.4 (Active)</span>
              </div>
            </div>
          </div>

          <div className="bg-black/40 border border-white/[0.03] p-4 rounded-2xl flex items-center gap-3 mt-4">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl shrink-0">
              <Heart size={16} fill="#f59e0b" className="animate-pulse" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-mono text-zinc-500">VTuber Identity</span>
              <h5 className="text-xs font-bold text-white leading-tight mt-0.5">Yuihime — Virtual Soul for Real Connections</h5>
            </div>
          </div>
        </div>
      </div>

      {/* Cognitive Loop Chart Visualizer */}
      <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl">
        <h4 className="text-[10px] uppercase font-mono tracking-widest text-[#d4d4d8]/40 mb-3 font-bold">Yuihime Cognitive Core Framework</h4>
        <div className="bg-[#050508]/60 border border-white/5 rounded-2xl p-6 font-mono text-[10px] text-zinc-450 leading-relaxed overflow-x-auto select-none">
          <pre className="text-xs tracking-wide text-zinc-400">
            {`              Intrinsic Motivation / Periodic Proactive Volition Hub
                        │
                        ▼
          ┌───────────────────────────────┐
          │    ProviderGatewayModule      │◄─────────── Subject Input (User Speech)
          └──────────────┬────────────────┘
                         │ (Think & Reason via Gemini)
                         ▼
          ┌───────────────────────────────┐
          │      NeuralVerifierModule     │ (Self-Correction Parser / Validation)
          └──────────────┬────────────────┘
                         │ (Standardized Output JSON Structure)
                         ▼
          ┌───────────────────────────────┐
          │    Emotion Decay Homeostasis  │ (Endocrine vector adjustments)
          └──────────────┬────────────────┘
                         │ (Coordinate offset, facial expression vectors)
                         ▼ (Actuate Live2D cubism engine)
 Animators Playback ◄─────┴─────► Speech vocalizations synthetic TTS audio`}
          </pre>
        </div>
      </div>
    </div>
  );
};
