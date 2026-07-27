import React, { useState } from 'react';
import { 
  Info, Sliders, MessageSquare, Eye, EyeOff, Mic, MicOff, 
  Smile, Moon, Sun, Heart, Image as ImageIcon, Settings,
  ChevronsLeft, ChevronsRight
} from 'lucide-react';
import { AgentState } from '@shared/include/types';
import { motion, AnimatePresence } from 'motion/react';

interface RightDockActionsProps {
  showInfoCard: boolean;
  setShowInfoCard: (val: boolean) => void;
  showConversations: boolean;
  setShowConversations: (val: boolean) => void;
  showSubtitles: boolean;
  setShowSubtitles: (val: boolean) => void;
  isSleeping: boolean;
  setIsSleeping: (val: boolean) => void;
  onOpenBgDrawer: () => void;
  onOpenSettings: () => void;
  
  // Newly added variables to fully expose all menus
  isPanelOpen: boolean;
  setIsPanelOpen: (val: boolean) => void;
  showChatFeed: boolean;
  setShowChatFeed: (val: boolean) => void;
  isMicEnabled: boolean;
  setIsMicEnabled: (val: boolean) => void;
  handleToggleMic: () => void;
}

export const RightDockActions: React.FC<RightDockActionsProps> = ({
  showInfoCard,
  setShowInfoCard,
  showConversations,
  setShowConversations,
  showSubtitles,
  setShowSubtitles,
  isSleeping,
  setIsSleeping,
  onOpenBgDrawer,
  onOpenSettings,
  isPanelOpen,
  setIsPanelOpen,
  showChatFeed,
  setShowChatFeed,
  isMicEnabled,
  setIsMicEnabled,
  handleToggleMic
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(true);

  const saveCollapsedToStorage = (val: boolean) => {
    try {
      localStorage.setItem('yuihime_right_dock_collapsed', val ? 'true' : 'false');
    } catch (e) {}
  };

  return (
    <div className="absolute right-4 md:right-6 top-[40%] md:top-[50%] -translate-y-1/2 z-[42] pointer-events-auto flex flex-col gap-2.5 select-none max-h-[48vh] md:max-h-[65vh] overflow-y-auto pr-1 py-1 scrollbar-none">
      {/* Button 0: Collapse Toggle */}
      <button
        type="button"
        id="right-dock-collapse-btn"
        onClick={() => {
          const nextVal = !isCollapsed;
          setIsCollapsed(nextVal);
          saveCollapsedToStorage(nextVal);
        }}
        title={isCollapsed ? "Tampilkan semua tombol menu" : "Ciutkan menu cepat"}
        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 backdrop-blur-xl border shadow-lg cursor-pointer active:scale-95 ${
          isCollapsed 
            ? 'bg-amber-500/20 border-amber-500/50 text-amber-500 font-bold shadow-[0_0_12px_rgba(245,158,11,0.25)] hover:bg-amber-500/30' 
            : 'bg-[#0a0a0f]/60 hover:bg-white/10 hover:text-white border-white/5 text-zinc-400'
        }`}
      >
        {isCollapsed ? <ChevronsLeft size={16} className="animate-pulse" /> : <ChevronsRight size={16} />}
      </button>

      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            initial={{ opacity: 0, x: 40, height: 0 }}
            animate={{ opacity: 1, x: 0, height: 'auto' }}
            exit={{ opacity: 0, x: 40, height: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 20 }}
            className="flex flex-col gap-2.5 pr-0.5 py-0.5"
          >
            {/* Button 1: Info (Bio Card) */}
            <button
              type="button"
              id="dock-info-card-btn"
              onClick={() => setShowInfoCard(!showInfoCard)}
              title="Yuihime Bio Info"
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 backdrop-blur-xl border shadow-lg cursor-pointer active:scale-95 ${
                showInfoCard 
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-500 font-bold shadow-[0_0_12px_rgba(245,158,11,0.25)]' 
                  : 'bg-[#0a0a0f]/60 hover:bg-white/10 hover:text-white border-white/5 text-zinc-400'
              }`}
            >
              <Info size={16} />
            </button>

            {/* Button 2: Stage Control Panel Dock */}
            <button
              type="button"
              id="dock-control-panel-btn"
              onClick={() => setIsPanelOpen(!isPanelOpen)}
              title="Yuihime Stage Control Panel Dock"
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 backdrop-blur-xl border shadow-lg cursor-pointer active:scale-95 ${
                isPanelOpen 
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-550 font-bold shadow-[0_0_12px_rgba(245,158,11,0.25)]' 
                  : 'bg-[#0a0a0f]/60 hover:bg-white/10 hover:text-white border-white/5 text-zinc-400'
              }`}
            >
              <Sliders size={16} />
            </button>

            {/* Button 3: Conversations (Sessions lists) */}
            <button
              type="button"
              id="dock-conversations-btn"
              onClick={() => setShowConversations(!showConversations)}
              title="Open Conversation History Sessions"
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 backdrop-blur-xl border shadow-lg cursor-pointer active:scale-95 ${
                showConversations 
                  ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-400 font-bold shadow-[0_0_12px_rgba(34,211,238,0.2)]' 
                  : 'bg-[#0a0a0f]/60 hover:bg-white/10 hover:text-white border-white/5 text-zinc-400'
              }`}
            >
              <MessageSquare size={16} />
            </button>

            {/* Button 4: Live Stream Chat Feed Toggle */}
            <button
              type="button"
              id="dock-chat-feed-btn"
              onClick={() => setShowChatFeed(!showChatFeed)}
              title={showChatFeed ? "Sembunyikan Live Chat Feed" : "Tampilkan Live Chat Feed"}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 backdrop-blur-xl border shadow-lg cursor-pointer active:scale-95 ${
                showChatFeed 
                  ? 'bg-pink-500/15 border-pink-500/35 text-pink-400 font-bold shadow-[0_0_12px_rgba(236,72,153,0.2)]' 
                  : 'bg-[#0a0a0f]/60 hover:bg-white/10 hover:text-white border-white/5 text-zinc-400'
              }`}
            >
              {showChatFeed ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>

            {/* Button 5: Live Mic Listening Toggle */}
            <button
              type="button"
              id="dock-mic-btn"
              onClick={handleToggleMic}
              title={isMicEnabled ? "Matikan Mikrofon" : "Aktifkan Mikrofon"}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 backdrop-blur-xl border shadow-lg cursor-pointer active:scale-95 ${
                isMicEnabled 
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 animate-pulse font-bold shadow-[0_0_12px_rgba(16,185,129,0.25)]' 
                  : 'bg-[#0a0a0f]/60 hover:bg-white/10 hover:text-white border-white/5 text-zinc-400'
              }`}
            >
              {isMicEnabled ? <Mic size={16} /> : <MicOff size={16} />}
            </button>

            {/* Button 6: Subtitles Toggle */}
            <button
              type="button"
              id="dock-subtitles-btn"
              onClick={() => setShowSubtitles(!showSubtitles)}
              title="Toggle HUD Spoken Subtitles"
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 backdrop-blur-xl border shadow-lg cursor-pointer active:scale-95 ${
                showSubtitles 
                  ? 'bg-violet-500/15 border-violet-500/30 text-violet-400 font-bold shadow-[0_0_12px_rgba(139,92,246,0.2)]' 
                  : 'bg-[#0a0a0f]/60 hover:bg-white/10 hover:text-white border-white/5 text-zinc-400'
              }`}
            >
              <Smile size={16} />
            </button>

            {/* Button 7: Sleeping State Toggle */}
            <button
              type="button"
              id="dock-sleep-btn"
              onClick={() => setIsSleeping(!isSleeping)}
              title={isSleeping ? "Membangunkan Yuihime" : "Tidurkan (Zzz...)"}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 backdrop-blur-xl border shadow-lg cursor-pointer active:scale-95 ${
                isSleeping 
                  ? 'bg-purple-500/20 border-purple-500/40 text-purple-400 animate-pulse shadow-[0_0_12px_rgba(168,85,247,0.2)]' 
                  : 'bg-[#0a0a0f]/60 hover:bg-white/10 hover:text-white border-white/5 text-zinc-400'
              }`}
            >
              {isSleeping ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {/* Button 8: Change Backdrop Selector Sheet */}
            <button
              type="button"
              id="dock-backdrop-btn"
              onClick={onOpenBgDrawer}
              title="Ubah Background Layar"
              className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 backdrop-blur-xl border shadow-lg cursor-pointer active:scale-95 bg-[#0a0a0f]/60 hover:bg-white/10 hover:text-white border-white/5 text-zinc-400"
            >
              <ImageIcon size={16} />
            </button>

            {/* Button 10: Central Settings Dashboard (Gear icon) */}
            <button
              type="button"
              id="dock-settings-btn"
              onClick={onOpenSettings}
              title="Settings & Penyesuaian"
              className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 backdrop-blur-xl border shadow-lg cursor-pointer active:scale-95 bg-[#0a0a0f]/60 hover:bg-white/10 hover:text-white border-white/5 text-zinc-400"
            >
              <Settings size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
