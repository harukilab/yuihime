import React, { useRef } from 'react';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import { Terminal, Activity, Zap, Cpu, X, Play, Info, GripHorizontal } from 'lucide-react';
import { MoodState, EmotionState } from '../include/types';

interface VTuberDebugPanelProps {
  animations: string[];
  mood: MoodState;
  emotion: EmotionState;
  status: string;
  activePersona: string;
  isThinking: boolean;
  onClose?: () => void;
  onTriggerAnimation?: (anim: string) => void;
}

export const VTuberDebugPanel: React.FC<VTuberDebugPanelProps> = ({
  animations,
  mood,
  emotion,
  status,
  activePersona,
  isThinking,
  onClose,
  onTriggerAnimation
}) => {
  const dragControls = useDragControls();
  const constraintsRef = useRef(null);
  const [size, setSize] = React.useState({ width: 288, height: 450 });

  const commonAnimations = [
    'NOD', 'SHAKE', 'WAVE', 'SMILE', 'LAUGH', 'SURPRISE', 'BLUSH', 'SAD', 'ANGRY', 'THINK',
    'LOOK_LEFT', 'LOOK_RIGHT', 'LOOK_UP', 'LOOK_DOWN', 'BLINK', 'WINK'
  ];

  return (
    <>
      {/* Constraints for dragging */}
      <div ref={constraintsRef} className="fixed inset-0 pointer-events-none z-[99]" />
      
      <motion.div
        initial={{ opacity: 0, x: 100, y: 0 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 100 }}
        drag
        dragConstraints={constraintsRef}
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={false}
        dragElastic={0}
        className="fixed z-[100] bg-slate-950/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl flex flex-col font-mono text-[10px] overflow-hidden"
        style={{ 
          width: size.width, 
          height: size.height,
          right: '1rem',
          top: '6rem'
        }}
      >
        {/* Header - Drag Handle */}
        <div 
          onPointerDown={(e) => dragControls.start(e)}
          className="bg-white/5 p-3 flex items-center justify-between border-b border-white/10 cursor-grab active:cursor-grabbing shrink-0 touch-none"
        >
          <div className="flex items-center gap-2 text-cyan-400">
            <GripHorizontal size={14} className="text-white/20" />
            <Terminal size={14} />
            <span className="uppercase tracking-widest font-bold">Neural Console</span>
          </div>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 p-4 space-y-4 overflow-y-auto hide-scrollbar">
          {/* Status Section */}
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-white/40 uppercase tracking-tighter">
              <Activity size={12} /> Live Telemetry
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white/5 p-2 rounded-lg border border-white/5">
                <div className="text-white/30 mb-1">STATUS</div>
                <div className={`font-bold ${(status || 'idle').toUpperCase() === 'IDLE' ? 'text-green-400' : 'text-amber-400 animate-pulse'}`}>
                  {(status || 'idle').toUpperCase()}
                </div>
              </div>
              <div className="bg-white/5 p-2 rounded-lg border border-white/5">
                <div className="text-white/30 mb-1">PERSONA</div>
                <div className="text-cyan-400 font-bold truncate">{(activePersona || 'unknown').toUpperCase()}</div>
              </div>
            </div>
          </section>

          {/* Animations Section */}
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-white/40 uppercase tracking-tighter">
              <Zap size={12} /> LLM Motion Buffer
            </div>
            <div className="bg-black/40 rounded-xl p-3 border border-white/5 min-h-[60px]">
              <AnimatePresence mode="popLayout">
                {animations.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {animations.map((anim, i) => (
                      <motion.span
                        key={`${anim}-${i}`}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        className="px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded text-[9px] font-bold"
                      >
                        {anim}
                      </motion.span>
                    ))}
                  </div>
                ) : (
                  <div className="text-white/20 italic">No signals detected...</div>
                )}
              </AnimatePresence>
            </div>
          </section>

          {/* Emotion Section */}
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-white/40 uppercase tracking-tighter">
              <Cpu size={12} /> Endocrine Vector
            </div>
            <div className="space-y-1.5 bg-white/5 p-3 rounded-xl border border-white/5">
              {[
                 { label: 'JOY', val: mood?.joy || 0, color: 'bg-amber-400' },
                 { label: 'STRESS', val: mood?.stress || 0, color: 'bg-indigo-400' },
                 { label: 'SAD', val: mood?.sadness || 0, color: 'bg-blue-400' },
                 { label: 'ANGER', val: mood?.anger || 0, color: 'bg-red-400' },
                 { label: 'FOCUS', val: emotion?.focus || 0, color: 'bg-cyan-400' },
                 { label: 'DOPAMINE (DOP)', val: (mood as any)?.dopamine !== undefined ? (mood as any).dopamine : 15, color: 'bg-pink-400' },
                 { label: 'SEROTONIN (SER)', val: (mood as any)?.serotonin !== undefined ? (mood as any).serotonin : 50, color: 'bg-emerald-400' },
                 { label: 'OXYTOCIN (OXT)', val: (mood as any)?.oxytocin !== undefined ? (mood as any).oxytocin : 30, color: 'bg-fuchsia-400' },
                 { label: 'NORADRENALINE (NOR)', val: (mood as any)?.noradrenaline !== undefined ? (mood as any).noradrenaline : 10, color: 'bg-rose-500' },
              ].map(m => (
                <div key={m.label} className="space-y-1">
                  <div className="flex justify-between text-[8px] text-white/60">
                     <span>{m.label}</span>
                     <span>{Math.round(m.val)}%</span>
                  </div>
                  <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                     <motion.div 
                       animate={{ width: `${m.val}%` }}
                       className={`h-full ${m.color} shadow-[0_0_8px_rgba(255,255,255,0.2)]`} 
                     />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Manual Controls */}
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-white/40 uppercase tracking-tighter">
              <Play size={12} /> Manual Pulse Override
            </div>
            <div className="grid grid-cols-3 gap-1">
              {commonAnimations.map(anim => (
                <button
                  key={anim}
                  onClick={() => onTriggerAnimation?.(anim)}
                  className="px-1 py-1.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded text-[8px] text-white/60 hover:text-white transition-all uppercase truncate"
                >
                  {anim}
                </button>
              ))}
            </div>
          </section>

          <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[8px] text-white/20 italic">
            <div className="flex items-center gap-2">
              <Info size={10} /> Latency: Synchronized
            </div>
            {/* Visual Resize Indicator & Interaction Handle */}
            <motion.div 
              drag
              dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
              dragElastic={0}
              onDrag={(e, info) => {
                setSize(prev => ({
                  width: Math.max(240, prev.width + info.delta.x),
                  height: Math.max(300, prev.height + info.delta.y)
                }));
              }}
              className="w-4 h-4 cursor-nwse-resize flex items-end justify-end p-0.5 group touch-none"
            >
              <div className="w-2 h-2 border-r border-b border-white/20 group-hover:border-cyan-400 transition-colors" />
            </motion.div>
          </div>
        </div>
      </motion.div>
    </>
  );
};
