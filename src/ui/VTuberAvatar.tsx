import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, CameraOff, RefreshCw } from 'lucide-react';
import { MoodState, EmotionState, UserRelation } from '../include/types';
import { SpeechService } from '../core/speech';
import { Live2DAvatar } from './avatar/Live2DAvatar';
import { VrmAvatar } from './avatar/VrmAvatar';
import { eventBus } from '../core/kernel/event-bus';

interface VTuberAvatarProps {
  mood: MoodState;
  emotion?: EmotionState;
  relation?: UserRelation;
  status: string;
  modelUrl: string;
  isTyping?: boolean;
  isSpeaking?: boolean;
  animations?: string[];
  scale?: number;
  xOffset?: number;
  yOffset?: number;
  volume?: number;
  isActive?: boolean;
  typedSubtitle?: string;
  activeSubtitle?: string;
  disableMouseTracking?: boolean;
}

export const VTuberAvatar: React.FC<VTuberAvatarProps> = ({ 
  mood, 
  emotion,
  relation,
  status, 
  modelUrl, 
  isTyping, 
  isSpeaking: externalIsSpeaking,
  animations = [],
  scale = 1,
  xOffset = 0,
  yOffset = 0,
  isActive = true,
  typedSubtitle = '',
  activeSubtitle = '',
  disableMouseTracking = false
}) => {
  const [internalIsSpeaking, setInternalIsSpeaking] = useState(false);
  const isSpeaking = externalIsSpeaking ?? internalIsSpeaking;
  const [volume, setVolume] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const [activeAnimations, setActiveAnimations] = useState<string[]>([]);
  const lastTriggerTimesRef = useRef<Record<string, number>>({});

  const isVrm = modelUrl.toLowerCase().includes('.vrm') || modelUrl.toLowerCase().includes('vrm');

  // Synchronize animations prop
  useEffect(() => {
    setActiveAnimations(animations);
  }, [animations]);

  // Real-time autonomous emotional reaction trigger
  useEffect(() => {
    const now = Date.now();
    const cooldownTime = 12000; // 12-second throttle cooldown

    const canTrigger = (type: string) => {
      const lastTime = lastTriggerTimesRef.current[type] || 0;
      return now - lastTime > cooldownTime;
    };

    const recordTrigger = (type: string) => {
      lastTriggerTimesRef.current[type] = now;
    };

    const triggerAuto = (animName: string) => {
      setActiveAnimations((prev) => {
        // Prevent duplicate appending within same active anim set
        if (prev.includes(animName)) return prev;
        return [...prev, animName];
      });
    };

    // 1. Shiver trigger (Stress > 70 or Cortisol high)
    if (mood.stress > 70) {
      if (canTrigger('shiver')) {
        recordTrigger('shiver');
        console.log(`[AUTONOMOUS-CORTEX] Stress is high (${mood.stress}). Auto-triggering 'shiver' animation.`);
        triggerAuto('shiver');
      }
    }

    // 2. Blush trigger (Rapport > 75, Affection > 75, or Embarrassment > 70)
    const highRapport = (emotion?.rapport ?? 0) > 75;
    const highAffection = (relation?.affection ?? 0) > 75;
    const highEmbarrassment = mood.embarrassment > 70;

    if (highRapport || highAffection || highEmbarrassment) {
      if (canTrigger('blush')) {
        recordTrigger('blush');
        console.log(`[AUTONOMOUS-CORTEX] High rapport/affection/embarrassment detected. Auto-triggering 'blush' animation.`);
        triggerAuto('blush');
      }
    }

    // 3. Joy/Excitement -> Laugh or Smile trigger
    if (mood.joy > 85 || mood.excitement > 85) {
      if (canTrigger('laugh')) {
        recordTrigger('laugh');
        console.log(`[AUTONOMOUS-CORTEX] High joy/excitement detected. Auto-triggering 'laugh' animation.`);
        triggerAuto('laugh');
      }
    } else if (mood.joy > 70 || mood.excitement > 70) {
      if (canTrigger('smile')) {
        recordTrigger('smile');
        console.log(`[AUTONOMOUS-CORTEX] Warm emotion detected. Auto-triggering 'smile' animation.`);
        triggerAuto('smile');
      }
    }

    // 4. Sadness -> Sad trigger
    if (mood.sadness > 70) {
      if (canTrigger('sad')) {
        recordTrigger('sad');
        console.log(`[AUTONOMOUS-CORTEX] Melancholy mood detected. Auto-triggering 'sad' animation.`);
        triggerAuto('sad');
      }
    }

    // 5. Anger/Irritation -> Angry trigger
    if (mood.anger > 70 || mood.irritation > 75) {
      if (canTrigger('angry')) {
        recordTrigger('angry');
        console.log(`[AUTONOMOUS-CORTEX] Irritation/wrath detected. Auto-triggering 'angry' animation.`);
        triggerAuto('angry');
      }
    }
  }, [mood, emotion, relation]);

  // Webcam Tracking States
  const [webcamTrackingActive, setWebcamTrackingActive] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('yuihime_vrm_webcam_tracking') === 'true';
    }
    return false;
  });
  const [isWebcamLoading, setIsWebcamLoading] = useState(false);
  const [hasFaceDetected, setHasFaceDetected] = useState(false);
  const [webcamVideoElement, setWebcamVideoElement] = useState<HTMLVideoElement | null>(null);

  const lastFaceDetected = useRef(false);
  const handleFaceDetected = (detected: boolean) => {
    if (lastFaceDetected.current !== detected) {
      lastFaceDetected.current = detected;
      setHasFaceDetected(detected);
    }
  };

  const lastTrackerLoading = useRef(false);
  const handleTrackerLoading = (loading: boolean) => {
    if (lastTrackerLoading.current !== loading) {
      lastTrackerLoading.current = loading;
      setIsWebcamLoading(loading);
    }
  };

  // Unified Speech volume listeners and eventBus sync channel
  useEffect(() => {
    const unsubSpeak = SpeechService.subscribe((speaking) => setInternalIsSpeaking(speaking));
    const unsubVolume = SpeechService.subscribeVolume((vol) => setVolume(vol));
    
    // Subscribe to AUDIO_SYNC_EVENT for precise multi-source audio coordination
    const unsubAudioSync = eventBus.on('AUDIO_SYNC_EVENT', (data: any) => {
      if (!data) return;
      console.log("[VTuberAvatar] [AUDIO_SYNC_EVENT]:", data);
      if (data.event === 'play') {
        setInternalIsSpeaking(true);
      } else if (data.event === 'pause' || data.event === 'ended' || data.event === 'stop') {
        setInternalIsSpeaking(false);
        setVolume(0);
      }
    });

    return () => {
      unsubSpeak();
      unsubVolume();
      unsubAudioSync();
    };
  }, []);

  const handleLoadingStateChange = (loading: boolean) => {
    setIsLoading(loading);
  };

  const handleLoadError = () => {
    setLoadError(true);
    setIsLoading(false);
  };

  // Reset error when model changes
  useEffect(() => {
    setLoadError(false);
    setIsLoading(true);
  }, [modelUrl]);

  return (
    <div 
      ref={containerRef} 
      id="avatar-frame"
      className="relative w-full h-full flex items-center justify-center overflow-hidden rounded-2xl select-none"
    >
      {/* Immersive Holographic Background Glow */}
      <div className="absolute inset-0 bg-radial-glow opacity-30 pointer-events-none" />

      {/* Primary Renderee Layer */}
      {!loadError && (
        <AnimatePresence mode="popLayout">
          {isVrm ? (
            <motion.div
              key="vrm-layer"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.1, ease: 'easeOut' }}
              className="absolute inset-0 w-full h-full"
            >
              <VrmAvatar
                mood={mood}
                status={status}
                modelUrl={modelUrl}
                isTyping={isTyping}
                isSpeaking={isSpeaking}
                volume={volume}
                typedSubtitle={typedSubtitle}
                activeSubtitle={activeSubtitle}
                animations={activeAnimations}
                disableMouseTracking={disableMouseTracking}
                onLoadingStateChange={handleLoadingStateChange}
                onLoadError={handleLoadError}
                webcamTrackingActive={webcamTrackingActive}
                webcamVideoElement={webcamVideoElement}
                onFaceDetected={handleFaceDetected}
                onTrackerLoading={handleTrackerLoading}
              />
            </motion.div>
          ) : (
            <motion.div
              key="l2d-layer"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.85, ease: 'easeOut' }}
              className="absolute inset-0 w-full h-full bg-transparent"
            >
              <Live2DAvatar
                mood={mood}
                status={status}
                modelUrl={modelUrl}
                scale={scale}
                xOffset={xOffset}
                yOffset={yOffset}
                isTyping={isTyping}
                isSpeaking={isSpeaking}
                volume={volume}
                typedSubtitle={typedSubtitle}
                activeSubtitle={activeSubtitle}
                animations={activeAnimations}
                isActive={isActive}
                disableMouseTracking={disableMouseTracking}
                onLoadingStateChange={handleLoadingStateChange}
                onLoadError={handleLoadError}
              />
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Dynamic Cinematic Loading State Overlay */}
      <AnimatePresence>
        {isLoading && (
          <motion.div 
            id="avatar-loader"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-gray-950/75 backdrop-blur-md"
          >
            {/* Spinning Hologram Ring */}
            <div className="relative w-16 h-16 mb-4">
              <div className="absolute inset-0 rounded-full border-4 border-amber-500/10" />
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                className="absolute inset-0 rounded-full border-4 border-t-amber-500 border-r-amber-500/30 border-b-transparent border-l-transparent"
              />
            </div>
            
            <p className="text-amber-500 font-mono text-sm tracking-wider animate-pulse font-medium">
              SYNCRONIZING PHYSICAL SHELL...
            </p>
            <p className="text-gray-400 font-mono text-xs mt-1%">
              {isVrm ? 'Compiling skeletal morph indexes (VRM)' : 'Registering texture blocks (Live2D)'}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Smart Fallback & Physical Error Card */}
      <AnimatePresence>
        {loadError && (
          <motion.div 
            id="avatar-error"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-gray-950/85 p-6 text-center"
          >
            <div className="max-w-xs p-5 bg-gray-900 border border-red-500/30 rounded-xl shadow-2xl">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              
              <h4 className="text-white font-mono text-sm font-semibold tracking-wide mb-1 uppercase">
                COGNITION SHELL BREAK
              </h4>
              <p className="text-gray-400 text-xs leading-relaxed mb-4">
                The target body shell could not be compiled or found locally.
              </p>
              
              <button 
                onClick={() => {
                  setLoadError(false);
                  setIsLoading(true);
                }}
                className="w-full py-2 px-4 rounded-lg bg-red-500/20 hover:bg-red-500/30 active:scale-95 border border-red-500/30 text-red-300 font-mono text-xs transition duration-150"
              >
                RE-SYNCRONIZE CORE
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Webcam Tracking Controller */}
      {isVrm && !loadError && (
        <div className="absolute top-4 right-4 z-40 flex flex-col gap-2 items-end">
          <button
            onClick={() => {
              const nextVal = !webcamTrackingActive;
              setWebcamTrackingActive(nextVal);
              localStorage.setItem('yuihime_vrm_webcam_tracking', String(nextVal));
              if (!nextVal) {
                handleFaceDetected(false);
                handleTrackerLoading(false);
              }
            }}
            title={webcamTrackingActive ? "Deactivate webcam facial tracking" : "Activate webcam facial tracking"}
            className={`p-2 rounded-xl border flex items-center gap-1.5 transition-all outline-none duration-150 cursor-pointer shadow-lg hover:scale-105 active:scale-95 ${
              webcamTrackingActive 
                ? 'bg-rose-500/20 border-rose-500/45 text-rose-300 shadow-[0_0_12px_rgba(239,68,68,0.3)] font-black' 
                : 'bg-zinc-950/85 border-white/10 text-white/70 hover:bg-zinc-900/90'
            }`}
          >
            {webcamTrackingActive ? <CameraOff size={14} /> : <Camera size={14} />}
            <span className="text-[9px] font-mono font-bold tracking-widest uppercase px-0.5">
              {webcamTrackingActive ? "Stop Lens" : "Track Face"}
            </span>
          </button>
        </div>
      )}

      {/* Dynamic Webcam Picture-in-Picture Preview Panel */}
      {isVrm && webcamTrackingActive && !loadError && (
        <div className="absolute top-4 left-4 z-40 bg-slate-950/85 backdrop-blur-md border border-white/10 p-2 rounded-xl shadow-2xl flex flex-col gap-1 w-28 md:w-36 overflow-hidden">
          <div className="flex items-center justify-between text-[7px] font-mono px-0.5 select-none no-select">
            <span className="text-white/40 tracking-wider">CORTEX LENS</span>
            <span className={`w-1.5 h-1.5 rounded-full ${hasFaceDetected ? 'bg-emerald-500 animate-pulse shadow-[0_0_6px_#10b981]' : 'bg-rose-500 animate-pulse'}`} />
          </div>
          <div className="relative aspect-video w-full rounded-lg overflow-hidden border border-white/5 bg-black">
            <video
              ref={(el) => {
                if (el && webcamVideoElement !== el) {
                  setWebcamVideoElement(el);
                }
              }}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />
            {isWebcamLoading && (
              <div className="absolute inset-0 bg-black/70 backdrop-blur-xs flex flex-col items-center justify-center gap-1">
                <RefreshCw size={10} className="animate-spin text-amber-500" />
                <span className="text-[5.5px] font-mono text-amber-500 animate-pulse uppercase tracking-wider">INIT LENS...</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
