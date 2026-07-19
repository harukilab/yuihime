import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { VTuberAvatar } from './VTuberAvatar';
import { AgentState, Memory, AvatarConfig } from '@shared/include/types';
import { RefreshCw } from 'lucide-react';
import { SpeechService } from '@/core/speech';

interface StreamOverlayProps {
  state: AgentState;
  memories: Memory[];
  activeSubtitle: string | null;
  typedSubtitle: string;
  isSubtitleTyping: boolean;
  animations: string[];
  avatarConfig: AvatarConfig;
  showSubtitles?: boolean;
  pure?: boolean;
}

export const StreamOverlay: React.FC<StreamOverlayProps> = ({
  state: initialState,
  memories: initialMemories,
  activeSubtitle: initialActiveSubtitle,
  typedSubtitle: initialTypedSubtitle,
  isSubtitleTyping: initialIsSubtitleTyping,
  animations: initialAnimations,
  avatarConfig,
  showSubtitles = true,
  pure = false
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Synced states that can be populated either via Direct properties OR from the SSE events channel (OBS Standalone)
  const [state, setState] = useState(initialState);
  const [memories, setMemories] = useState(initialMemories || []);
  const [activeSubtitle, setActiveSubtitle] = useState(initialActiveSubtitle);
  const [typedSubtitle, setTypedSubtitle] = useState(initialTypedSubtitle || "");
  const [isSubtitleTyping, setIsSubtitleTyping] = useState(initialIsSubtitleTyping || false);
  const [animations, setAnimations] = useState(initialAnimations || []);

  // Backdrop states for custom stream backgrounds
  const [backdropType, setBackdropType] = useState<string>(() => {
    return localStorage.getItem('yuihime_stage_backdrop') || 'transparent';
  });
  const [customBdropUrl, setCustomBdropUrl] = useState<string>(() => {
    return localStorage.getItem('yuihime_stage_backdrop_custom') || '';
  });

  // Re-sync backdrop changes in real-time or when storage is altered
  useEffect(() => {
    const handleBackdropChanged = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setBackdropType(customEvent.detail.type || 'transparent');
        setCustomBdropUrl(customEvent.detail.customImgUrl || '');
      }
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'yuihime_stage_backdrop') {
        setBackdropType(e.newValue || 'transparent');
      } else if (e.key === 'yuihime_stage_backdrop_custom') {
        setCustomBdropUrl(e.newValue || '');
      }
    };

    window.addEventListener('yuihime_backdrop_changed', handleBackdropChanged);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('yuihime_backdrop_changed', handleBackdropChanged);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const getBackdropStyle = (): React.CSSProperties => {
    switch (backdropType) {
      case 'transparent':
        return { backgroundColor: 'transparent' };
      case 'chroma-green':
        return { backgroundColor: '#00ff00' };
      case 'chroma-blue':
        return { backgroundColor: '#0000ff' };
      case 'chroma-cyan':
        return { backgroundColor: '#00ffff' };
      case 'black':
        return { backgroundColor: '#08080c' };
      case 'custom':
        if (customBdropUrl) {
          return {
            backgroundImage: `url(${customBdropUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat'
          };
        }
        return { backgroundColor: 'transparent' };
      case 'neon':
        return {
          background: 'radial-gradient(circle at center, #1b092e 0%, #050209 100%)'
        };
      case 'matrix':
        return {
          background: 'radial-gradient(circle at center, #0c1020 0%, #05050a 100%)'
        };
      default:
        return { backgroundColor: 'transparent' };
    }
  };

  // 1. Property Synchronization (for embedded overlay preview inside main app)
  useEffect(() => {
    if (initialState) setState(initialState);
  }, [initialState]);

  useEffect(() => {
    if (initialMemories) setMemories(initialMemories);
  }, [initialMemories]);

  useEffect(() => {
    if (initialActiveSubtitle !== undefined) setActiveSubtitle(initialActiveSubtitle);
  }, [initialActiveSubtitle]);

  useEffect(() => {
    if (initialTypedSubtitle !== undefined) setTypedSubtitle(initialTypedSubtitle || "");
  }, [initialTypedSubtitle]);

  useEffect(() => {
    if (initialIsSubtitleTyping !== undefined) setIsSubtitleTyping(initialIsSubtitleTyping);
  }, [initialIsSubtitleTyping]);

  useEffect(() => {
    if (initialAnimations) setAnimations(initialAnimations);
  }, [initialAnimations]);

  // 2. Standalone Real-Time Synchronization (WebSocket with SSE fallback)
  useEffect(() => {
    console.log("[STREAM_OVERLAY] Initializing real-time synchronization link to Airi Daemon...");
    
    let isCleanup = false;
    let ws: WebSocket | null = null;
    let sse: EventSource | null = null;
    let reconnectTimeout: any = null;

    const handlePayload = (payload: any) => {
      if (payload.type === 'state_update') {
        const { state: s, activeSubtitle: as, typedSubtitle: ts, isSubtitleTyping: ist, animations: an } = payload.data;
        if (s) setState(s);
        if (as !== undefined) {
          setActiveSubtitle(as);
          const currentMode = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('mode');
          const isStreamActive = currentMode === 'stream' || currentMode === 'obs';
          if (isStreamActive && as) {
            try {
              SpeechService.speak(as);
            } catch (e) {}
          }
        }
        if (ts !== undefined) setTypedSubtitle(ts || "");
        if (ist !== undefined) setIsSubtitleTyping(ist);
        if (an) setAnimations(an);
      } else if (payload.type === 'memory_update') {
        const isSocialMedia = payload.data.context && (payload.data.context.startsWith('tg_') || payload.data.context.startsWith('dc_'));
        if (!isSocialMedia) {
          setMemories(prev => {
            const exists = prev.some(m => m.id === payload.data.id);
            if (exists) return prev;
            return [...prev, payload.data];
          });
        }
      }
    };

    const connectSSE = () => {
      if (isCleanup) return;
      console.log("[STREAM_OVERLAY] Establishing Server-Sent Events (SSE) fallback stream...");
      sse = new EventSource('/api/stream/events');

      sse.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          handlePayload(payload);
        } catch (e) {
          console.error("[STREAM_OVERLAY] Fail parsing SSE packet:", e);
        }
      };

      sse.onerror = (err) => {
        console.warn("[STREAM_OVERLAY] SSE connection error. Reconnecting in 5s...", err);
        sse?.close();
        if (!isCleanup) {
          reconnectTimeout = setTimeout(connectSSE, 5000);
        }
      };
    };

    const connectWebSocket = () => {
      if (isCleanup) return;
      
      let wsUrl = "";
      try {
        const storedSettings = localStorage.getItem('yuihime_modular_settings');
        if (storedSettings) {
          const parsed = JSON.parse(storedSettings);
          if (parsed.connectionWebsocketUrl) {
            wsUrl = parsed.connectionWebsocketUrl;
          }
        }
      } catch (err) {}

      if (!wsUrl) {
        const loc = window.location;
        const proto = loc.protocol === "https:" ? "wss:" : "ws:";
        wsUrl = `${proto}//${loc.host}/ws`;
      }

      console.log(`[STREAM_OVERLAY] Connecting to WebSocket gateway at: ${wsUrl}`);
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.info("[STREAM_OVERLAY] WebSocket connection established successfully.");
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
          reconnectTimeout = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "sync_ok" || payload.type === "pong") return;
          handlePayload(payload);
        } catch (e) {
          console.error("[STREAM_OVERLAY] Error parsing WebSocket message:", e);
        }
      };

      ws.onerror = (err) => {
        console.warn("[STREAM_OVERLAY] WebSocket encountered an error.", err);
      };

      ws.onclose = () => {
        if (isCleanup) return;
        console.warn("[STREAM_OVERLAY] WebSocket closed. Dropping to SSE fallback...");
        if (ws) {
          ws = null;
        }
        connectSSE();
      };
    };

    connectWebSocket();

    return () => {
      isCleanup = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) {
        console.log("[STREAM_OVERLAY] Closing active WebSocket connection.");
        ws.close();
      }
      if (sse) {
        console.log("[STREAM_OVERLAY] Closing active SSE EventSource.");
        sse.close();
      }
    };
  }, []);

  // Standalone TTS Engine Initializer for OBS Browser Sources
  useEffect(() => {
    const currentMode = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('mode');
    const isStreamActive = currentMode === 'stream' || currentMode === 'obs';
    if (isStreamActive) {
      try {
        SpeechService.init();
        SpeechService.setEnabled(true);
        console.log("[STREAM_OVERLAY] Standalone Speech Service initialized for OBS/Browser Live Feed.");
      } catch (e) {
        console.warn("[STREAM_OVERLAY] Standalone Speech initialization bypassed:", e);
      }
    }
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [memories]);

  return (
    <div 
      className="fixed inset-0 overflow-hidden font-sans select-none transition-all duration-700"
      style={getBackdropStyle()}
    >
      {/* Neon grid lines layer if active */}
      {backdropType === 'neon' && (
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(236,72,153,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(236,72,153,0.05)_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-35 z-0" />
      )}
      
      {/* Glow highlight balls to emulate background depth */}
      {['matrix', 'neon'].includes(backdropType) && (
        <div className="absolute inset-0 opacity-10 pointer-events-none z-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full border border-amber-500/10 blur-3xl"></div>
        </div>
      )}

      {/* 1. Live2D/VRM Character */}
      {pure ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center overflow-hidden pointer-events-none pb-12">
          <div className="w-full h-full max-w-[900px] max-h-[1050px] relative transition-transform duration-700 pointer-events-auto">
            <VTuberAvatar 
              mood={state.mood} 
              status={state.status} 
              modelUrl={avatarConfig?.modelUrl} 
              isTyping={isSubtitleTyping}
              animations={animations}
              scale={avatarConfig?.scale ?? 1.1}
              xOffset={avatarConfig?.xOffset}
              yOffset={avatarConfig?.yOffset}
            />
          </div>
        </div>
      ) : (
        <div className="absolute inset-y-0 right-0 z-10 flex items-end justify-center md:justify-end pb-24 pr-0 md:pr-10 w-full md:w-[60%] overflow-hidden pointer-events-none">
          <div className="w-full h-full max-w-[800px] max-h-[1000px] relative translate-x-[10%] md:translate-x-[5%] transition-transform duration-700 pointer-events-auto">
            <VTuberAvatar 
              mood={state.mood} 
              status={state.status} 
              modelUrl={avatarConfig?.modelUrl} 
              isTyping={isSubtitleTyping}
              animations={animations}
              scale={avatarConfig?.scale ?? 1.1}
              xOffset={avatarConfig?.xOffset}
              yOffset={avatarConfig?.yOffset}
            />
          </div>
        </div>
      )}

      {/* 2. Subtitles Overlay */}
      <div className={
        pure 
          ? "absolute left-1/2 -translate-x-1/2 bottom-8 z-30 pointer-events-none flex flex-col items-center px-4 w-full max-w-3xl"
          : "absolute left-10 md:left-20 bottom-12 md:bottom-24 z-30 pointer-events-none flex flex-col items-center md:items-start px-8 md:px-0"
      }>
        <AnimatePresence mode="wait">
          {showSubtitles && activeSubtitle && (
            <motion.div
              key={activeSubtitle}
              initial={pure ? { opacity: 0, y: 15, scale: 0.95 } : { opacity: 0, x: -30, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
              exit={pure ? { opacity: 0, y: -10, scale: 0.95 } : { opacity: 0, x: 20, scale: 0.95 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }} 
              className={`bg-black/75 backdrop-blur-xl border border-white/10 px-8 py-5 rounded-3xl w-full max-w-3xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] flex flex-col relative group overflow-hidden ${
                pure ? "items-center text-center" : "items-start text-left"
              }`}
            >
              {/* Decorative accent */}
              <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-cyan-500 via-blue-500 to-fuchsia-500" />
              
              <div className="flex items-center gap-3 mb-1">
                <div className="text-[10px] uppercase tracking-[0.4em] text-cyan-400 font-bold font-mono">Neural_Feed</div>
                <div className="w-12 h-px bg-white/20" />
                {isSubtitleTyping && (
                  <div className="flex gap-0.5">
                    <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" />
                  </div>
                )}
              </div>
              
              <div className={`font-sans font-medium text-white leading-normal drop-shadow-lg overflow-hidden select-text pointer-events-auto line-clamp-2 text-xl md:text-2xl min-h-[2.4em] flex items-center ${
                pure ? "text-center justify-center w-full" : "text-left"
              }`}>
                {typedSubtitle}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 3. Live Chat Display - Hidden in Pure OBS Overlay */}
      {!pure && (
        <div className="absolute top-10 left-10 w-80 h-[50vh] z-20 pointer-events-none">
          <div className="h-full flex flex-col gap-3 overflow-hidden">
            <div className="text-[10px] uppercase tracking-[0.4em] text-white/40 mb-2 font-mono drop-shadow-md">
              Neural_Feed // Live
            </div>
            <div 
               ref={scrollRef}
               className="flex-1 overflow-y-auto space-y-3 pr-4 scrollbar-hide flex flex-col justify-end"
            >
              <AnimatePresence initial={false}>
                {memories.filter(m => {
                  const isSocialMedia = m.context && (m.context.startsWith('tg_') || m.context.startsWith('dc_'));
                  return !isSocialMedia;
                }).slice(-10).map((m, idx) => (
                  <motion.div
                    key={m.id || idx}
                    initial={{ opacity: 0, x: -20, scale: 0.9 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    className={`p-3 rounded-xl border backdrop-blur-sm max-w-[90%] ${
                      m.type === 'interaction' 
                        ? 'bg-white/10 border-white/10' 
                        : 'bg-amber-500/10 border-amber-500/20'
                    }`}
                  >
                    <div className="text-[8px] uppercase font-mono text-white/30 mb-1">
                      {m.type === 'interaction' ? 'H_SUBJECT' : 'A_CORE'}
                    </div>
                    <div className="text-xs text-white/90 leading-relaxed">
                      {m.content}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}

      {/* 4. Small Status Indicator - Hidden in Pure OBS Overlay */}
      {!pure && (
        <div className="absolute top-10 right-10 z-20 flex items-center gap-3">
          <div className="flex flex-col items-end">
            <div className="text-[10px] uppercase tracking-widest text-white/40 font-mono">Stream Overlay Mode</div>
            <div className="flex items-center gap-2">
              <AnimatePresence>
                {state.status === 'learning' && (
                  <motion.div 
                     initial={{ opacity: 0, scale: 0 }}
                     animate={{ opacity: 1, scale: 1 }}
                     exit={{ opacity: 0, scale: 0 }}
                     className="flex items-center gap-1.5 px-2 py-0.5 bg-fuchsia-500/20 border border-fuchsia-500/50 rounded-full"
                  >
                    <RefreshCw size={8} className="text-fuchsia-400 animate-spin" />
                    <span className="text-[8px] font-black font-mono text-fuchsia-400 uppercase tracking-tighter">Neural Loop</span>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className={`w-2 h-2 rounded-full animate-pulse shadow-[0_0_8px] ${
                state.status === 'awake' ? 'bg-emerald-500 shadow-emerald-500' : 'bg-amber-500 shadow-amber-500'
              }`} />
              <span className="text-xs font-mono text-white/60 uppercase">{state.status}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
