import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, Trash2 } from 'lucide-react';

interface Session {
  id: string;
  title?: string;
  updatedAt: number;
}

interface BottomConversationDrawerProps {
  showConversations: boolean;
  setShowConversations: (show: boolean) => void;
  sessions: Session[];
  activeSessionId: string;
  onCreateSession: () => void;
  onSwitchSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string, e: React.MouseEvent) => void;
}

export const BottomConversationDrawer: React.FC<BottomConversationDrawerProps> = ({
  showConversations,
  setShowConversations,
  sessions = [],
  activeSessionId,
  onCreateSession,
  onSwitchSession,
  onDeleteSession
}) => {
  return (
    <AnimatePresence>
      {showConversations && (
        <>
          {/* Backdrop cover overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowConversations(false)}
            className="absolute inset-0 bg-[#000]/65 backdrop-blur-sm z-[45] pointer-events-auto"
          />

          {/* Sliding Panel */}
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            className="absolute inset-x-4 bottom-20 md:bottom-24 md:left-1/2 md:-translate-x-1/2 md:max-w-md bg-[#0f141c]/95 backdrop-blur-2xl border border-white/10 rounded-3xl z-[46] pointer-events-auto flex flex-col p-5 shadow-2xl max-h-[80%] text-white"
          >
            {/* Top notch indicator sliding design handle */}
            <div className="w-10 h-1 bg-white/15 rounded-full mx-auto mb-4 cursor-pointer" onClick={() => setShowConversations(false)} />

            {/* Drawer Toolbar */}
            <div className="flex items-center justify-between mb-4 text-left">
              <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-cyan-400" />
                <h3 className="text-sm font-bold tracking-wide text-white font-sans">Conversations</h3>
              </div>
              
              <button
                type="button"
                onClick={() => {
                  onCreateSession();
                  setShowConversations(false);
                }}
                className="px-3.5 py-1.5 bg-[#005f73]/90 border border-[#0a9396]/30 hover:bg-[#005f73] hover:border-[#0a9396]/50 text-white rounded-full text-[10.5px] font-bold transition-all active:scale-95 flex items-center gap-1 cursor-pointer shadow-md"
              >
                <span className="text-xs font-bold">+</span> New
              </button>
            </div>

            {/* Sessions List Scroll Pane */}
            <div className="flex flex-col gap-2 overflow-y-auto pr-1 pb-2 scrollbar-hide max-h-[300px]">
              {sessions.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-xs">
                  Belum ada obrolan baru. Tekan "+ New" untuk memulai sesi percakapan.
                </div>
              ) : (
                sessions.map((session) => {
                  const isActive = session.id === activeSessionId;
                  
                  // Indonesian relative timeline formatting
                  let relativeTime = 'sekarang';
                  const diffMs = Date.now() - session.updatedAt;
                  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                  if (diffDays > 0) {
                    relativeTime = `${diffDays} hari yang lalu`;
                  } else if (diffMs > 1000 * 60 * 60) {
                    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
                    relativeTime = `${diffHrs} jam yang lalu`;
                  } else if (diffMs > 1000 * 60) {
                    const diffMins = Math.floor(diffMs / (1000 * 60));
                    relativeTime = `${diffMins} menit yang lalu`;
                  }

                  return (
                    <motion.div
                      key={session.id}
                      onClick={() => {
                        onSwitchSession(session.id);
                        setShowConversations(false);
                      }}
                      className={`p-3 rounded-2xl transition-all border cursor-pointer select-none flex items-center justify-between group ${
                        isActive 
                          ? 'bg-[#0f2a35]/70 border-cyan-500/25 text-white shadow-[0_0_15px_rgba(6,182,212,0.1)]' 
                          : 'bg-[#181d29]/40 border-white/5 hover:border-white/10 hover:bg-[#202737]/40 text-zinc-400'
                      }`}
                    >
                      <div className="flex flex-col gap-0.5 truncate flex-1 pr-3 text-left">
                        <span className={`text-xs font-bold font-sans truncate ${isActive ? 'text-cyan-300' : 'text-zinc-200 group-hover:text-white'}`}>
                          {session.title || 'New Conversation'}
                        </span>
                        <span className="text-[9px] text-zinc-500 font-mono">
                          {relativeTime}
                        </span>
                      </div>

                      {/* Relative Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-mono tracking-wider font-extrabold bg-[#0d2a33]/60 text-cyan-400 border border-cyan-500/10 select-none">
                          CLOUD
                        </span>
                        
                        <button
                          type="button"
                          onClick={(e) => onDeleteSession(session.id, e)}
                          title="Delete session"
                          className="p-1 rounded-md hover:bg-rose-500/10 text-zinc-500 hover:text-rose-400 active:scale-95 transition-all animate-none-on-hover"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
