import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Eye, EyeOff, Sparkle, Brain, Cpu, ChevronDown, ChevronUp, Paperclip, X, Image, FileText, Music, Film, Copy, Check, Volume2 } from 'lucide-react';
import { SpeechService } from '@web/core/speech';

interface LiveChatFeedProps {
  showChatFeed: boolean;
  setShowChatFeed: (val: boolean) => void;
  uniqueLogs: any[];
  hiddenLogIds: string[];
  isThinking: boolean;
  input: string;
  setInput: (val: string) => void;
  attachments?: any[];
  setAttachments?: React.Dispatch<React.SetStateAction<any[]>>;
  handleThink: (e: React.FormEvent) => void;
  showSubtitles: boolean;
  activeSubtitle: string | null;
  typedSubtitle: string;
  activeAlert: any; // Renders floating alerts
}

const cleanDisplayContent = (text: any) => {
  if (text && typeof text === 'object') {
    if (text.content !== undefined) {
      text = text.content;
    } else {
      try {
        text = JSON.stringify(text);
      } catch {
        text = String(text || '');
      }
    }
  }
  const str = String(text || '');
  return str
    .replace(/\[PRE-PROCESS: ENFORCE_JSON_ONLY\]/g, '')
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
    .replace(/<\/?final_answer>/gi, '')
    .trim();
};

export const LiveChatFeed: React.FC<LiveChatFeedProps> = ({
  showChatFeed,
  setShowChatFeed,
  uniqueLogs = [],
  hiddenLogIds = [],
  isThinking,
  input,
  setInput,
  attachments = [],
  setAttachments = () => {},
  handleThink,
  showSubtitles,
  activeSubtitle,
  typedSubtitle,
  activeAlert
}) => {
  const [expandedLogId, setExpandedLogId] = React.useState<string | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const chatFeedContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastLogsCountRef = useRef(uniqueLogs.length);
  const isNearBottomRef = useRef(true);
  const lastShowChatFeedRef = useRef(showChatFeed);

  const handleScroll = () => {
    const el = chatFeedContainerRef.current;
    if (el) {
      const isClose = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
      isNearBottomRef.current = isClose;
    }
  };

  useEffect(() => {
    const el = chatFeedContainerRef.current;
    if (!el) return;

    const hasNewMessage = uniqueLogs.length > lastLogsCountRef.current;
    const lastLog = uniqueLogs[uniqueLogs.length - 1];
    const isNewUserMessage = hasNewMessage && lastLog?.type === 'user';
    const showChatFeedToggledOn = showChatFeed && !lastShowChatFeedRef.current;

    if (isNearBottomRef.current || isNewUserMessage || showChatFeedToggledOn || uniqueLogs.length === 0) {
      el.scrollTop = el.scrollHeight;
      isNearBottomRef.current = true;
    }

    lastLogsCountRef.current = uniqueLogs.length;
    lastShowChatFeedRef.current = showChatFeed;
  }, [uniqueLogs, isThinking, showChatFeed]);

  // Drag and Drop Event Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const processFiles = (files: FileList) => {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      const mimeType = file.type || "application/octet-stream";
      
      const isTextFile = file.name.endsWith('.txt') || file.name.endsWith('.md') || file.name.endsWith('.json') || file.name.endsWith('.js') || file.name.endsWith('.ts') || file.name.endsWith('.csv') || file.name.endsWith('.html');
      
      if (isTextFile) {
        reader.onload = (event) => {
          const text = event.target?.result as string;
          setAttachments(prev => [...prev, {
            name: file.name,
            size: file.size,
            mimeType: mimeType,
            text: text,
            base64: `data:${mimeType};base64,` + btoa(unescape(encodeURIComponent(text)))
          }]);
        };
        reader.readAsText(file);
      } else {
        reader.onload = (event) => {
          const base64 = event.target?.result as string;
          setAttachments(prev => [...prev, {
            name: file.name,
            size: file.size,
            mimeType: mimeType,
            base64: base64
          }]);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  return (
    <div 
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="absolute inset-0 z-30 pointer-events-none"
    >
      {/* 1. Overlay Alerts (Superchats / Subscriptions) floating on top center of the screen */}
      <AnimatePresence>
        {activeAlert && (
          <div className="absolute top-[80px] left-1/2 -translate-x-1/2 z-[100] w-full max-w-sm px-4 select-none pointer-events-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.85, y: -50 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85, y: -20 }}
              transition={{ type: 'spring', damping: 25 }}
              className={`p-4 rounded-3xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.8)] text-white overflow-hidden bg-gradient-to-r relative ${activeAlert.color}`}
            >
              <div className="absolute top-2 right-2 animate-spin-slow text-white/20">
                <Sparkle size={16} />
              </div>
              <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-white/5 rounded-full blur-xl pointer-events-none" />
              
              <div className="relative z-10 flex flex-col gap-1 text-center">
                <div className="text-[9px] uppercase tracking-[0.3em] text-white/60 font-mono font-black">
                  {activeAlert.title}
                </div>
                <div className="text-sm font-black tracking-wide truncate">
                  {activeAlert.type === 'superchat' ? `💸 ${(activeAlert as any).donor}` : `⭐ NEW FAMILY_SUBSCRIBER`}
                </div>
                <div className="text-[11px] font-sans text-white/95 leading-normal mt-1 px-1">
                  {activeAlert.subtitle}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 2. Real-time Fluid Interactive Chat Feed */}
      <div className={`absolute left-1/2 -translate-x-1/2 z-30 w-full max-w-[560px] px-4 pointer-events-none flex flex-col justify-end overflow-hidden p-2 transition-all duration-300 ${showChatFeed ? 'opacity-100 translate-y-0' : 'opacity-0 pointer-events-none translate-y-[20px]'} ${attachments.length > 0 ? 'bottom-[150px]' : 'bottom-[72px]'}`}>
        <div ref={chatFeedContainerRef} onScroll={handleScroll} className="flex flex-col gap-2.5 overflow-y-auto max-h-[42vh] scrollbar-hide pointer-events-auto pr-14 md:pr-1 py-1">
          {(() => {
            const visibleLogs = uniqueLogs
              .map((log, origIndex) => ({ log, id: `${log.timestamp}-${origIndex}` }))
              .filter(item => !item.log.isSystem && !hiddenLogIds.includes(item.id));
              
            return visibleLogs.slice(-50).map((item) => {
              const { log, id } = item;
              const isUser = log.type === 'user';
              const cleanText = cleanDisplayContent(log.content);

              if (!cleanText) return null;

              const isCopied = copiedId === id;

              return (
                <div
                  key={id}
                  className={`p-3 px-4 rounded-2xl border backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.65)] flex flex-col relative group transition-all duration-250 w-auto max-w-[94%] ${
                    isUser
                      ? 'bg-gradient-to-br from-[#0c1624]/95 to-[#122338]/95 border-cyan-500/20 text-[#e2e8f0] rounded-br-none self-end text-left'
                      : 'bg-gradient-to-br from-[#25101f]/95 to-[#1c1124]/95 border-pink-500/30 text-rose-50 rounded-bl-none self-start text-left shadow-[0_8px_32px_rgba(244,63,94,0.15)]'
                  }`}
                >
                  <p className="text-[12px] leading-relaxed font-sans font-medium tracking-normal break-words selection:bg-pink-500/30 selection:text-white text-left whitespace-pre-wrap pr-6">
                    {cleanText}
                    {log.isStreaming && (
                      <span className="inline-block w-1.5 h-3 ml-1 bg-pink-500 rounded-sm animate-pulse shadow-[0_0_8px_#ec4899] align-middle" />
                    )}
                  </p>

                  {!isUser && (log as any).toolCalls && (log as any).toolCalls.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1">
                      {(log as any).toolCalls.map((tc: any, idx: number) => {
                        const toolName = tc.function?.name || tc.name || tc.tool || 'unknown';
                        const args = tc.function?.arguments || tc.args || {};
                        const argStr = typeof args === 'string' ? args : JSON.stringify(args, null, 1);
                        return (
                          <div
                            key={tc.id || idx}
                            className="flex items-start gap-2 bg-pink-500/8 border border-pink-500/15 rounded-lg p-2 text-[9px] font-mono text-pink-200/70"
                          >
                            <Cpu size={10} className="mt-0.5 shrink-0 text-pink-400" />
                            <div className="flex flex-col min-w-0">
                              <span className="text-pink-300 font-bold tracking-wide uppercase">
                                ⚡ {toolName}
                              </span>
                              <span className="truncate text-pink-200/50 mt-0.5 leading-relaxed">
                                {typeof args === 'object' ? (args.prompt || args.query || args.command || argStr) : argStr}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Speech Button (only for Yui/AI messages) */}
                  {!isUser && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        SpeechService.speak(cleanText, undefined, undefined, true);
                      }}
                      className="absolute top-2 right-9 opacity-15 md:opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1.5 rounded-lg bg-black/40 hover:bg-black/60 border border-white/5 cursor-pointer flex items-center justify-center text-pink-400 hover:text-pink-300"
                      title="Putar suara Yui"
                    >
                      <Volume2 size={11} />
                    </button>
                  )}

                  {/* Copy Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(cleanText);
                      setCopiedId(id);
                      setTimeout(() => setCopiedId(null), 2000);
                    }}
                    className={`absolute top-2 right-2 opacity-15 md:opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1.5 rounded-lg bg-black/40 hover:bg-black/60 border border-white/5 cursor-pointer flex items-center justify-center ${
                      isUser ? 'text-cyan-400 hover:text-cyan-300' : 'text-pink-400 hover:text-pink-300'
                    }`}
                    title="Salin pesan"
                  >
                    {isCopied ? <Check size={11} className="scale-110" /> : <Copy size={11} />}
                  </button>

                  {!isUser && log.thoughts && (
                    <div className="mt-2 pt-1.5 border-t border-pink-500/10 flex flex-col">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedLogId(expandedLogId === id ? null : id);
                        }}
                        className="flex items-center gap-1 text-[8.5px] font-mono tracking-wider font-extrabold text-pink-400 hover:text-pink-300 transition-colors uppercase self-start cursor-pointer"
                      >
                        <Brain size={10} className={expandedLogId === id ? "animate-pulse" : ""} />
                        <span>{expandedLogId === id ? 'Sembunyikan Nalar' : 'Nalar Kognitif AGI'}</span>
                        {expandedLogId === id ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
                      </button>
                      
                      <AnimatePresence>
                        {expandedLogId === id && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden mt-1 bg-pink-950/20 border border-pink-500/10 rounded-lg p-2.5 text-[9.5px] font-mono text-pink-200/90 leading-relaxed shadow-inner"
                          >
                            <div className="flex items-center gap-1 text-[8px] tracking-widest text-[#f472b6] font-black uppercase mb-1">
                              <Cpu size={9} /> YUIHIME REASONING PROTOCOL
                            </div>
                            <div className="whitespace-pre-wrap select-text selection:bg-pink-500/40 selection:text-white">
                              {log.thoughts}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              );
            });
          })()}
          
          {isThinking && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="p-2.5 px-3.5 bg-gradient-to-r from-[#25101f]/95 to-[#1c1124]/95 border border-pink-500/20 rounded-2xl rounded-bl-none self-start flex items-center gap-2.5 backdrop-blur-md shadow-md shadow-pink-500/5 text-left"
            >
              <div className="flex space-x-1.5 items-center">
                <span className="w-1.5 h-1.5 bg-pink-400 rounded-full animate-ping" />
                <span className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-ping [animation-delay:0.15s]" />
                <span className="w-1.5 h-1.5 bg-pink-300 rounded-full animate-ping [animation-delay:0.3s]" />
              </div>
              <span className="text-[8.5px] font-mono uppercase tracking-widest text-[#f472b6] font-extrabold flex items-center gap-1">
                🌸 YUIHIME SEDANG MERENUNG...
              </span>
              <button 
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('force_unlock_thinking'));
                }}
                className="ml-2 px-1.5 py-0.5 rounded bg-pink-500/20 hover:bg-pink-500/40 border border-pink-500/30 text-[8px] font-mono uppercase tracking-wider text-pink-300 hover:text-white transition-all cursor-pointer font-bold"
                title="Force unlock input if server/API is lagging or stuck"
              >
                Force Stop
              </button>
            </motion.div>
          )}
        </div>
      </div>

      {/* 2.5 Active Attachment Previews just above input bar */}
      {attachments.length > 0 && (
        <div className="absolute bottom-[72px] left-1/2 -translate-x-1/2 z-40 w-full max-w-[560px] px-4 select-none pointer-events-auto flex flex-wrap gap-1.5 p-2 bg-[#0d0e12]/80 backdrop-blur-xl border border-white/5 rounded-2xl max-h-[85px] overflow-y-auto">
          {attachments.map((att, idx) => {
            const isImage = att.mimeType.startsWith('image/');
            const isAudio = att.mimeType.startsWith('audio/');
            const isVideo = att.mimeType.startsWith('video/');
            
            return (
              <div key={idx} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-950/80 border border-white/5 text-[10px] text-zinc-300 font-medium">
                {isImage && <Image size={10} className="text-cyan-400" />}
                {isAudio && <Music size={10} className="text-emerald-400" />}
                {isVideo && <Film size={10} className="text-rose-400" />}
                {!isImage && !isAudio && !isVideo && <FileText size={10} className="text-amber-400" />}
                <span className="truncate max-w-[120px]" title={att.name}>{att.name}</span>
                <span className="text-[8px] opacity-50">({(att.size / 1024).toFixed(1)} KB)</span>
                <button
                  type="button"
                  onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                  className="hover:text-rose-400 transition-colors cursor-pointer font-bold ml-1 flex items-center justify-center p-0.5"
                >
                  <X size={10} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 3. Center-Bottom Floating Glass-morphic Chat Input */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 w-full max-w-[560px] px-4 pointer-events-auto flex items-center gap-2 select-none">
        <form onSubmit={handleThink} className="relative flex-1 flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isThinking ? "Yuihime sedang merenung..." : "Say something..."}
            className="w-full pl-12 pr-6 py-3 bg-[#0e0e14]/75 backdrop-blur-xl border border-white/5 rounded-full text-xs text-white/90 placeholder-white/30 focus:outline-none focus:border-pink-500/30 focus:shadow-[0_0_20px_rgba(236,72,153,0.15)] transition-all"
          />
          {/* Paperclip Button inside Input on the left */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Unggah media atau teks batin..."
            className="absolute left-3.5 p-1.5 rounded-full text-zinc-400 hover:text-pink-400 hover:bg-white/5 transition-all cursor-pointer flex items-center justify-center"
          >
            <Paperclip size={13} />
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => e.target.files && processFiles(e.target.files)}
            multiple
            className="hidden"
          />
        </form>
        
        {/* Toggle Chat Balloon Feed Global Button */}
        <button
          type="button"
          onClick={() => setShowChatFeed(!showChatFeed)}
          title={showChatFeed ? "Sembunyikan semua balon percakapan" : "Tampilkan balon percakapan"}
          className={`shrink-0 p-3 rounded-full border backdrop-blur-xl transition-all duration-300 cursor-pointer shadow-[0_8px_25px_rgba(0,0,0,0.5)] flex items-center justify-center ${
            showChatFeed 
              ? 'bg-pink-500/10 border-pink-500/30 text-pink-400 hover:bg-pink-500/20 hover:border-pink-500/50' 
              : 'bg-[#181d29]/60 border-cyan-500/20 text-cyan-400 hover:text-white hover:bg-[#181d29]/80 shadow-[0_8px_16px_rgba(6,182,212,0.15)] animate-pulse'
          }`}
        >
          {showChatFeed ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>

      {/* 4. Subtitles Overlay */}
      {showSubtitles && activeSubtitle && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-[110px] w-full max-w-sm md:max-w-xl z-30 pointer-events-none px-4 md:px-0 text-center select-none">
          <div className="inline-block px-4 py-2 rounded-lg bg-black/80 backdrop-blur-sm shadow-[0_8px_32px_rgba(0,0,0,0.6)] border border-white/5">
            <p className="text-white text-[13.5px] md:text-[14px] font-sans font-semibold tracking-wide break-words text-center leading-relaxed [text-shadow:_0_1px_4px_rgba(0,0,0,0.95)]">
              {typedSubtitle}
            </p>
          </div>
        </div>
      )}

      {/* 2.6 Full-screen Drag & Drop Zone Backdrop */}
      {isDragging && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className="absolute inset-0 bg-[#070b13]/90 backdrop-blur-md z-[99] m-2 border-2 border-dashed border-pink-500/40 rounded-3xl flex flex-col items-center justify-center gap-3 text-white select-none pointer-events-auto"
        >
          <div className="p-4 bg-pink-500/10 rounded-full border border-pink-500/20 text-pink-400 animate-pulse">
            <Paperclip size={32} />
          </div>
          <div className="text-center">
            <p className="text-sm font-bold tracking-wide text-zinc-100 font-sans">Kirim Berkas Batin untuk Mengunggah</p>
            <p className="text-[10px] text-zinc-400 mt-1 uppercase tracking-widest font-mono">Mendukung Gambar, Audio, Video, & Teks Dokumen</p>
          </div>
        </div>
      )}
    </div>
  );
};
